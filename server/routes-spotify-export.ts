/**
 * Spotify Export API Routes
 * 
 * These routes handle the export of playlists to Spotify.
 * They use direct database access to avoid ORM-related issues
 * and bypass any potential routing conflicts.
 */

import express, { Request, Response } from 'express';
import { pool } from './db';
import * as spotify from './spotify-fixed';
import { storage } from './storage';
import { imageUrlToBase64 } from './services/imageUtils';

// Simple in-memory cache for Spotify playlist data
const spotifyPlaylistCache: {
  [spotifyId: string]: {
    data: any;
    timestamp: number;
    expiresAt: number;
  }
} = {};

// Cache TTL in milliseconds (10 minutes)
const CACHE_TTL = 10 * 60 * 1000;

/**
 * Throttle API requests to prevent rate limiting
 * This ensures we don't make too many requests too quickly
 * 
 * @param fn The async function to throttle
 * @param delay Milliseconds to wait between calls
 * @returns A throttled version of the function
 */
function throttle<T extends (...args: any[]) => Promise<any>>(fn: T, delay: number = 300): T {
  return (async function(...args: any[]) {
    // Add a delay before executing the function
    await new Promise(resolve => setTimeout(resolve, delay));
    return fn(...args);
  }) as T;
}

/**
 * Process items in batches with throttling between each batch
 * 
 * @param items Array of items to process
 * @param batchSize Number of items to process in each batch
 * @param batchDelay Milliseconds to wait between batches
 * @param processFn Function to process a single item
 * @returns Array of processed results
 */
async function processBatches<T, R>(
  items: T[],
  batchSize: number,
  batchDelay: number,
  processFn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  
  // Process items in batches
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    console.log(`Processing batch ${i/batchSize + 1}/${Math.ceil(items.length/batchSize)} (${batch.length} items)`);
    
    // Process all items in the current batch
    const batchResults = await Promise.all(
      batch.map(async (item) => {
        try {
          return await processFn(item);
        } catch (error) {
          console.error('Error processing batch item:', error);
          return null;
        }
      })
    );
    
    // Add results from this batch
    results.push(...batchResults);
    
    // Wait before processing the next batch (but not after the last batch)
    if (i + batchSize < items.length) {
      console.log(`Waiting ${batchDelay}ms before processing next batch...`);
      await new Promise(resolve => setTimeout(resolve, batchDelay));
    }
  }
  
  return results;
}

/**
 * Get Spotify playlist data with caching
 * This reduces duplicate API calls for the same playlist
 */
async function getCachedSpotifyPlaylist(accessToken: string, spotifyId: string): Promise<any> {
  const now = Date.now();
  const cacheKey = spotifyId;
  
  // Check if we have a valid cached response
  if (
    spotifyPlaylistCache[cacheKey] && 
    spotifyPlaylistCache[cacheKey].expiresAt > now
  ) {
    console.log(`Using cached Spotify playlist data for ${spotifyId}`);
    return spotifyPlaylistCache[cacheKey].data;
  }
  
  // Otherwise make the API call
  try {
    console.log(`Fetching Spotify playlist data for ${spotifyId}`);
    const spotifyPlaylist = await spotify.getPlaylist(accessToken, spotifyId);
    
    // Cache the response
    spotifyPlaylistCache[cacheKey] = {
      data: spotifyPlaylist,
      timestamp: now,
      expiresAt: now + CACHE_TTL
    };
    
    return spotifyPlaylist;
  } catch (error) {
    // If we got a 429 rate limit error, but have a cached version (even expired),
    // return the cached version as a fallback
    if (
      spotifyPlaylistCache[cacheKey] && 
      error instanceof Error && 
      error.message.includes('429')
    ) {
      console.log(`Rate limited, using expired cache for ${spotifyId}`);
      return spotifyPlaylistCache[cacheKey].data;
    }
    
    // Otherwise, throw the error
    throw error;
  }
}

/**
 * Export a playlist to Spotify
 * 
 * This route uses direct SQL queries to avoid ORM-related issues
 * and ensure reliable export functionality.
 */
export async function exportPlaylistToSpotify(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    
    if (!id) {
      return res.status(400).json({ error: 'Playlist ID is required' });
    }
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    console.log(`Exporting playlist ID ${id} to Spotify for user ID ${userId}`);
    
    // Get the user with the Spotify token
    const user = await storage.getUser(parseInt(userId));
    if (!user || !user.spotifyAccessToken) {
      return res.status(401).json({ error: 'User not authenticated with Spotify' });
    }
    
    // Check if token is expired
    if (user.tokenExpiresAt && user.tokenExpiresAt < new Date()) {
      if (user.spotifyRefreshToken) {
        try {
          console.log('Token expired, refreshing...');
          const refreshData = await spotify.refreshAccessToken(user.spotifyRefreshToken);
          await storage.updateUser(user.id, {
            spotifyAccessToken: refreshData.access_token,
            tokenExpiresAt: new Date(Date.now() + refreshData.expires_in * 1000)
          });
          user.spotifyAccessToken = refreshData.access_token;
          console.log('Token refreshed successfully');
        } catch (error) {
          console.error('Failed to refresh token:', error);
          return res.status(401).json({ error: 'Failed to refresh Spotify token' });
        }
      } else {
        return res.status(401).json({ error: 'Token expired and no refresh token available' });
      }
    }
    
    // Get the playlist directly from the database with SQL
    const playlistResult = await pool.query(`
      SELECT p.* 
      FROM playlists p
      WHERE p.id = $1
    `, [id]);
    
    if (playlistResult.rows.length === 0) {
      return res.status(404).json({ error: `Playlist with ID ${id} not found` });
    }
    
    const playlist = playlistResult.rows[0];
    console.log(`Found playlist: "${playlist.title}" (ID: ${id})`);
    
    // Get the tracks for this playlist with SQL
    const tracksResult = await pool.query(`
      SELECT DISTINCT
        pt.position,
        t.title as track_title,
        tpi.platform_id as spotify_id,
        (
          SELECT a.name
          FROM tracks_to_artists tta 
          JOIN artists a ON tta.artist_id = a.id
          WHERE tta.track_id = t.id AND tta.is_primary = true
          LIMIT 1
        ) as artist_name
      FROM playlist_tracks pt 
      JOIN tracks t ON pt.track_id = t.id
      JOIN track_platform_ids tpi ON t.id = tpi.track_id
      WHERE pt.playlist_id = $1
        AND tpi.platform = 'spotify'
      ORDER BY pt.position
    `, [id]);
    
    console.log(`Found ${tracksResult.rows.length} tracks for playlist ID ${id}`);
    
    if (tracksResult.rows.length === 0) {
      return res.status(400).json({ error: 'Playlist has no tracks with Spotify IDs' });
    }
    
    // Make sure spotifyId is valid
    if (!user.spotifyId) {
      return res.status(400).json({ error: 'User does not have a valid Spotify ID' });
    }
    
    // Sanitize playlist data for Spotify API
    const safeTitle = playlist.title || "Songfuse Playlist";
    
    // Sanitize description to avoid API errors
    let safeDescription = playlist.description || 'Created with Songfuse';
    safeDescription = safeDescription
      .replace(/[^\x00-\x7F]/g, "") // Remove non-ASCII chars
      .replace(/[\\'"]/g, ""); // Remove quotes and backslashes
    
    // Truncate to avoid Spotify's limit
    const truncatedDescription = safeDescription.length > 300 
      ? safeDescription.substring(0, 297) + '...' 
      : safeDescription;
    
    // Format the Spotify user ID correctly
    const safeUserId = user.spotifyId.replace(/[^a-zA-Z0-9]/g, "");
    
    console.log('Creating playlist on Spotify...');
    console.log(`User Spotify ID (safe): ${safeUserId}`);
    console.log(`Playlist Title: ${safeTitle}`);
    console.log(`Playlist Description: ${truncatedDescription}`);
    
    try {
      // Create playlist on Spotify (note: we pass safeUserId for backward compatibility but it's not used anymore)
      console.log('Creating playlist on Spotify with the improved implementation...');
      const spotifyPlaylist = await spotify.createPlaylist(
        user.spotifyAccessToken,
        safeUserId, // Not used in the new implementation but kept for compatibility
        safeTitle,
        truncatedDescription,
        playlist.is_public !== false
      );
      
      console.log(`Created Spotify playlist with ID: ${spotifyPlaylist.id}`);
      console.log(`Spotify playlist URL: ${spotifyPlaylist.external_urls.spotify}`);
    
      // Add tracks to the playlist
      const trackUris = tracksResult.rows.map(track => `spotify:track:${track.spotify_id}`);
      if (trackUris.length > 0) {
        console.log(`Adding ${trackUris.length} tracks to Spotify playlist...`);
        await spotify.addTracksToPlaylist(
          user.spotifyAccessToken,
          spotifyPlaylist.id,
          trackUris
        );
        console.log(`Successfully added ${trackUris.length} tracks to Spotify playlist`);
      }
      
      // Upload a custom cover image if available
      let coverImageUploaded = false;
      if (playlist.cover_image_url) {
        try {
          console.log('Exporting to Spotify - Attempting to upload custom cover image from URL:', playlist.cover_image_url);
          
          // Check if URL is accessible and not expired
          const isTemporaryDallEUrl = playlist.cover_image_url.includes('oaidalleapiprodscus.blob.core.windows.net');
          const isSupabaseUrl = playlist.cover_image_url.includes('supabase.co');
          
          if (isTemporaryDallEUrl) {
            console.log('Detected DALL-E temporary URL, these often expire quickly');
          }
          
          let imageUrl = playlist.cover_image_url.trim();
          
          // Remove query parameters for cleaner URL processing but preserve for actual fetch
          const cleanImageUrl = imageUrl.includes('?') ? imageUrl.split('?')[0] : imageUrl;
          console.log('Processing cover image URL:', cleanImageUrl);
          
          try {
            const base64Image = await imageUrlToBase64(imageUrl); // Use full URL with auth params
            
            if (base64Image && base64Image.length > 100) {
              console.log('Image converted to base64 successfully, length:', base64Image.length);
              
              // Add a delay before uploading the cover image to give Spotify's API more time
              console.log('Adding a 2 second delay before uploading cover image...');
              await new Promise(resolve => setTimeout(resolve, 2000));
              
              await spotify.uploadPlaylistCoverImage(
                user.spotifyAccessToken,
                spotifyPlaylist.id,
                base64Image
              );
              console.log('✅ Successfully uploaded custom cover image to Spotify');
              coverImageUploaded = true;
            } else {
              console.warn('Image conversion resulted in empty or too-short base64 data');
            }
          } catch (imageError) {
            console.warn('Failed to process cover image:', imageError.message);
            // Continue to mosaic fallback
          }
        } catch (coverError) {
          console.warn('Error during cover image upload process:', coverError.message);
          // Continue without cover image rather than failing the entire export
        }
      }
      
      if (!coverImageUploaded) {
        console.log(playlist.cover_image_url ? 
          'Custom cover upload failed, will use Spotify-generated mosaic cover' : 
          'No custom cover image available, will use Spotify-generated mosaic cover'
        );
      }
      
      // Fetch the Spotify-generated mosaic cover if no custom cover was uploaded successfully
      if (!coverImageUploaded) {
        try {
          console.log('Fetching Spotify-generated mosaic cover as fallback...');
          
          // Add a delay to give Spotify time to generate the cover
          console.log('Waiting 3 seconds for Spotify to generate the mosaic cover...');
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Fetch the playlist details from Spotify to get the generated cover image
          const spotifyPlaylistDetails = await spotify.getPlaylistDetails(
            user.spotifyAccessToken,
            spotifyPlaylist.id,
            false // no need to include tracks
          );
          
          // Check if Spotify has generated a cover image
          if (spotifyPlaylistDetails.images && spotifyPlaylistDetails.images.length > 0) {
            const spotifyGeneratedCover = spotifyPlaylistDetails.images[0].url;
            console.log('Found Spotify-generated mosaic cover:', spotifyGeneratedCover);
            
            // Update the playlist in our database with both Spotify ID and the mosaic cover image
            await pool.query(`
              UPDATE playlists
              SET spotify_id = $1, spotify_url = $2, cover_image_url = $3
              WHERE id = $4
            `, [spotifyPlaylist.id, spotifyPlaylist.external_urls.spotify, spotifyGeneratedCover, id]);
            
            console.log('Updated playlist in database with Spotify ID and mosaic cover image');
            
            // Return success response with the cover image URL
            return res.json({
              success: true,
              spotifyId: spotifyPlaylist.id,
              spotifyUrl: spotifyPlaylist.external_urls.spotify,
              coverImageUrl: spotifyGeneratedCover,
              message: 'Playlist successfully exported to Spotify with mosaic cover'
            });
          } else {
            console.log('No Spotify-generated mosaic cover found');
          }
        } catch (coverError) {
          console.error('Error fetching Spotify-generated mosaic cover:', coverError);
          // Continue without the mosaic cover rather than failing the entire export
        }
      }
      
      // If we couldn't get a Spotify mosaic cover or if there was a custom cover, just update the Spotify ID
      await pool.query(`
        UPDATE playlists
        SET spotify_id = $1, spotify_url = $2
        WHERE id = $3
      `, [spotifyPlaylist.id, spotifyPlaylist.external_urls.spotify, id]);
      
      console.log('Updated playlist in database with Spotify ID');
      
      // Return success response
      return res.json({
        success: true,
        spotifyId: spotifyPlaylist.id,
        spotifyUrl: spotifyPlaylist.external_urls.spotify,
        message: 'Playlist successfully exported to Spotify'
      });
    } catch (spotifyError) {
      console.error('Error with Spotify API:', spotifyError);
      
      // Check if it's a rate limit error (429)
      const errorMsg = spotifyError instanceof Error ? spotifyError.message : String(spotifyError);
      
      if (errorMsg.includes('429 Too Many Requests')) {
        // Extract retry-after time if available
        const retryAfterMatch = errorMsg.match(/retry-after['":\s]+(\d+)/i);
        const retrySeconds = retryAfterMatch ? parseInt(retryAfterMatch[1], 10) : null;
        
        let friendlyMessage = 'Spotify API rate limit reached. ';
        if (retrySeconds) {
          const minutes = Math.ceil(retrySeconds / 60);
          friendlyMessage += `Please try again in about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;
        } else {
          friendlyMessage += 'Please try again later.';
        }
        
        return res.status(429).json({ 
          error: 'Rate limit exceeded',
          details: friendlyMessage,
          retryAfter: retrySeconds
        });
      }
      
      return res.status(400).json({ 
        error: 'Failed to create playlist on Spotify',
        details: errorMsg
      });
    }
  } catch (error) {
    console.error('General error exporting playlist:', error);
    // Use explicit type check for error handling
    const errorMsg = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ 
      error: 'Failed to export playlist to Spotify',
      details: errorMsg
    });
  }
}

/**
 * Get Spotify playlist information
 * 
 * This route retrieves detailed information about a Spotify playlist,
 * including cover images, which can be used as fallbacks when our
 * own cover images are unavailable.
 */
export async function getSpotifyPlaylistInfo(req: Request, res: Response) {
  try {
    const { spotifyId } = req.params;
    
    if (!spotifyId) {
      return res.status(400).json({ error: 'Spotify playlist ID is required' });
    }
    
    // Get a user with Spotify credentials
    // We'll use our main app user for this
    const user = await storage.getUser(1);
    if (!user || !user.spotifyAccessToken) {
      return res.status(401).json({ error: 'No user with Spotify credentials found' });
    }
    
    // Check if token is expired
    if (user.tokenExpiresAt && user.tokenExpiresAt < new Date()) {
      if (user.spotifyRefreshToken) {
        try {
          console.log('Token expired, refreshing...');
          const refreshData = await spotify.refreshAccessToken(user.spotifyRefreshToken);
          await storage.updateUser(user.id, {
            spotifyAccessToken: refreshData.access_token,
            tokenExpiresAt: new Date(Date.now() + refreshData.expires_in * 1000)
          });
          user.spotifyAccessToken = refreshData.access_token;
          console.log('Token refreshed successfully');
        } catch (error) {
          console.error('Failed to refresh token:', error);
          return res.status(401).json({ error: 'Failed to refresh Spotify token' });
        }
      } else {
        return res.status(401).json({ error: 'Token expired and no refresh token available' });
      }
    }
    
    // Get playlist details from Spotify
    const playlistData = await spotify.getPlaylist(user.spotifyAccessToken, spotifyId);
    
    // Return the playlist information (specifically images)
    return res.json({
      id: playlistData.id,
      name: playlistData.name,
      description: playlistData.description,
      images: playlistData.images,
      external_urls: playlistData.external_urls
    });
    
  } catch (error) {
    console.error('Error getting Spotify playlist info:', error);
    return res.status(500).json({ 
      error: 'Failed to get Spotify playlist information',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Delete a track from a playlist with Spotify synchronization
 * 
 * This route deletes a track from a playlist in our database
 * and also removes it from the corresponding Spotify playlist if present.
 */
export async function deleteTrackFromPlaylist(req: Request, res: Response) {
  try {
    const { id, position } = req.params;
    const userId = req.query.userId as string;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    const playlistId = parseInt(id);
    const trackPosition = parseInt(position);
    
    if (isNaN(playlistId) || isNaN(trackPosition)) {
      return res.status(400).json({ error: 'Invalid playlist ID or track position' });
    }
    
    console.log(`Deleting track at position ${trackPosition} from playlist ${playlistId} for user ${userId}`);
    
    // Get the user with the Spotify token
    const user = await storage.getUser(parseInt(userId));
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get the playlist
    const playlistResult = await pool.query(`
      SELECT p.* 
      FROM playlists p
      WHERE p.id = $1
    `, [playlistId]);
    
    if (playlistResult.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    
    const playlist = playlistResult.rows[0];
    
    // Verify that the user has permission to modify this playlist
    if (playlist.user_id !== parseInt(userId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Get all tracks for this playlist
    const tracksResult = await pool.query(`
      SELECT 
        pt.position,
        pt.track_id,
        t.title as track_title,
        tpi.platform_id as spotify_id
      FROM playlist_tracks pt 
      JOIN tracks t ON pt.track_id = t.id
      LEFT JOIN track_platform_ids tpi ON t.id = tpi.track_id AND tpi.platform = 'spotify'
      WHERE pt.playlist_id = $1
      ORDER BY pt.position
    `, [playlistId]);
    
    if (tracksResult.rows.length === 0) {
      return res.status(400).json({ error: 'Playlist has no tracks' });
    }
    
    // The UI index vs database position issue
    // From the logs, we can see there are gaps in the database positions
    // The UI shows tracks in order (0, 1, 2...) regardless of actual database positions
    
    console.log(`Looking for track at UI index ${trackPosition} from database rows:`, 
      tracksResult.rows.map(t => ({ position: t.position, title: t.track_title })));
    
    // Sort rows by position to match the UI order
    const sortedTracks = [...tracksResult.rows].sort((a, b) => a.position - b.position);
    
    // Get the track by UI index rather than database position
    // UI index 0 = first track in sorted order, UI index 1 = second track, etc.
    const trackToDelete = trackPosition >= 0 && trackPosition < sortedTracks.length 
      ? sortedTracks[trackPosition]
      : null;
    
    console.log(`UI index ${trackPosition} maps to track:`, 
      trackToDelete ? `${trackToDelete.track_title} at DB position ${trackToDelete.position}` : 'Not found');
    
    if (!trackToDelete) {
      return res.status(404).json({ error: 'Track not found at this position' });
    }
    
    // If the playlist has been exported to Spotify and we have a token, delete from Spotify too
    if (playlist.spotify_id && user.spotifyAccessToken && trackToDelete.spotify_id) {
      // Check if token is expired and refresh if needed
      if (user.tokenExpiresAt && user.tokenExpiresAt < new Date()) {
        if (user.spotifyRefreshToken) {
          try {
            console.log('Token expired, refreshing...');
            const refreshData = await spotify.refreshAccessToken(user.spotifyRefreshToken);
            await storage.updateUser(user.id, {
              spotifyAccessToken: refreshData.access_token,
              tokenExpiresAt: new Date(Date.now() + refreshData.expires_in * 1000)
            });
            user.spotifyAccessToken = refreshData.access_token;
            console.log('Token refreshed successfully');
          } catch (error) {
            console.error('Failed to refresh token:', error);
            // Continue deletion in our database even if Spotify token refresh fails
          }
        }
      }
      
      // Try to remove from Spotify
      if (user.spotifyAccessToken) {
        try {
          await spotify.removeTrackFromPlaylist(
            user.spotifyAccessToken,
            playlist.spotify_id,
            trackToDelete.spotify_id
          );
          console.log(`Track removed from Spotify playlist ${playlist.spotify_id}`);
        } catch (error) {
          // Check if it's a rate limit error
          const errorMsg = error instanceof Error ? error.message : String(error);
          if (errorMsg.includes('429') || errorMsg.includes('rate limit')) {
            console.error('Rate limit hit when removing track from Spotify:', errorMsg);
          } else {
            console.error('Failed to remove track from Spotify:', error);
          }
          // Continue deletion in our database even if Spotify deletion fails
        }
      }
    }
    
    // Delete the track from our database
    // Use the position from the found track, not the input position
    const positionToDelete = trackToDelete.position;
    console.log(`Deleting track at actual position ${positionToDelete} from database`);
    
    await pool.query(`
      DELETE FROM playlist_tracks
      WHERE playlist_id = $1 AND position = $2
    `, [playlistId, positionToDelete]);
    
    // Update the positions of the remaining tracks
    await pool.query(`
      UPDATE playlist_tracks
      SET position = position - 1
      WHERE playlist_id = $1 AND position > $2
    `, [playlistId, positionToDelete]);
    
    return res.json({
      success: true,
      message: 'Track removed from playlist',
      track: {
        id: trackToDelete.track_id,
        title: trackToDelete.track_title,
        position: trackPosition
      }
    });
    
  } catch (error) {
    console.error('Error deleting track from playlist:', error);
    
    // Check if it's a rate limit error
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes('429') || errorMsg.includes('rate limit')) {
      // Extract retry-after time if available
      const retryAfterMatch = errorMsg.match(/retry-after['":\s]+(\d+)/i);
      const retrySeconds = retryAfterMatch ? parseInt(retryAfterMatch[1], 10) : null;
      
      let friendlyMessage = 'Spotify API rate limit reached. ';
      if (retrySeconds) {
        const minutes = Math.ceil(retrySeconds / 60);
        friendlyMessage += `Please try again in about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;
      } else {
        friendlyMessage += 'Please try again later.';
      }
      
      return res.status(429).json({ 
        error: 'Rate limit exceeded',
        details: friendlyMessage,
        retryAfter: retrySeconds
      });
    }
    
    return res.status(500).json({ 
      error: 'Failed to delete track from playlist',
      details: errorMsg
    });
  }
}

/**
 * Get a list of user playlists with accurate track counts
 * This is a direct database implementation to ensure proper track counts
 */
export async function getPlaylists(req: Request, res: Response) {
  try {
    console.log("getPlaylists with counts endpoint called with:", {
      query: req.query,
      method: req.method,
      url: req.originalUrl,
      headers: req.headers
    });
    
    const userId = req.query.userId as string;
    
    if (!userId) {
      console.log("getPlaylists error: userId is required");
      return res.status(400).json({ error: 'userId is required' });
    }
    
    console.log(`getPlaylists with counts: Retrieving playlists for user ${userId}`);
    
    // Get user data
    const user = await storage.getUser(parseInt(userId));
    if (!user) {
      console.log(`getPlaylists error: User ${userId} not found`);
      return res.status(404).json({ error: 'User not found' });
    }
    
    console.log(`getPlaylists with counts: Found user ${userId}, fetching playlists`);
    
    // Get playlists from database
    const playlistsResult = await pool.query(`
      SELECT p.* 
      FROM playlists p
      WHERE p.user_id = $1
      ORDER BY p.created_at DESC
    `, [parseInt(userId)]);
    
    // Debug: Log the raw playlists to examine cover_image_url values
    console.log('Raw playlists from database:');
    playlistsResult.rows.forEach(playlist => {
      console.log(`Playlist ID ${playlist.id}: title="${playlist.title}", cover_image_url=${playlist.cover_image_url ? '"' + playlist.cover_image_url + '"' : 'null'}`);
    });
    
    // Get track counts for each playlist
    const playlistsWithCounts = await Promise.all(playlistsResult.rows.map(async (playlist) => {
      // Get track count directly from database
      const trackCountResult = await pool.query(`
        SELECT COUNT(*) as count
        FROM playlist_tracks
        WHERE playlist_id = $1
      `, [playlist.id]);
      
      const trackCount = parseInt(trackCountResult.rows[0].count) || 0;
      
      // We've removed Spotify cover image URL fetching to prioritize our database images
      // User requirement: Generated cover images must always be loaded from our database, not Spotify
      const spotifyImageUrl = null;
      
      // Log database cover image
      if (playlist.cover_image_url) {
        console.log(`Mapping playlist ${playlist.id}: cover_image_url="${playlist.cover_image_url}"`);
      } else {
        console.log(`No cover image found in database for playlist ${playlist.id}`);
      }
      
      // Prepare the response format
      
      const result = {
        id: playlist.id,
        spotifyId: playlist.spotify_id || null,
        title: playlist.title,
        description: playlist.description || '',
        coverImage: playlist.cover_image_url || null,
        trackCount: trackCount,
        spotifyUrl: playlist.spotify_id ? `https://open.spotify.com/playlist/${playlist.spotify_id}` : null,
        spotifyImageUrl: spotifyImageUrl
      };
      
      // Debug: Verify the result object has the coverImage property set correctly
      console.log(`Result for playlist ${playlist.id}: coverImage=${result.coverImage ? '"' + result.coverImage + '"' : 'null'}`);
      
      return result;
    }));
    
    console.log(`getPlaylists with counts: Successfully processed ${playlistsWithCounts.length} playlists with accurate track counts`);
    console.log("First playlist processed:", playlistsWithCounts.length > 0 ? {
      id: playlistsWithCounts[0].id,
      title: playlistsWithCounts[0].title,
      coverImage: playlistsWithCounts[0].coverImage,
      trackCount: playlistsWithCounts[0].trackCount
    } : "No playlists found");
    
    // Set proper CORS headers to ensure browser can access the response
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    return res.json(playlistsWithCounts);
  } catch (error) {
    console.error('Error fetching playlists:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch playlists',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Update track order in Spotify playlist
 */
async function updateSpotifyPlaylistOrder(
  accessToken: string, 
  spotifyPlaylistId: string, 
  spotifyTrackUris: string[]
): Promise<boolean> {
  try {
    console.log(`Updating Spotify playlist ${spotifyPlaylistId} with ${spotifyTrackUris.length} tracks in new order`);
    
    // First, get current tracks to replace them completely
    const currentTracksResponse = await fetch(`https://api.spotify.com/v1/playlists/${spotifyPlaylistId}/tracks`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!currentTracksResponse.ok) {
      throw new Error(`Failed to get current tracks: ${currentTracksResponse.status}`);
    }
    
    const currentTracksData = await currentTracksResponse.json();
    const currentTrackCount = currentTracksData.total || 0;
    
    // If playlist has tracks, clear them first
    if (currentTrackCount > 0) {
      console.log(`Clearing ${currentTrackCount} existing tracks from Spotify playlist...`);
      
      // Remove all current tracks (Spotify API requires us to specify which tracks to remove)
      const tracksToRemove = currentTracksData.items.map((item: any) => ({
        uri: item.track.uri
      }));
      
      // Remove tracks in batches (Spotify allows max 100 tracks per request)
      const batchSize = 100;
      for (let i = 0; i < tracksToRemove.length; i += batchSize) {
        const batch = tracksToRemove.slice(i, i + batchSize);
        
        const removeResponse = await fetch(`https://api.spotify.com/v1/playlists/${spotifyPlaylistId}/tracks`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            tracks: batch
          })
        });
        
        if (!removeResponse.ok) {
          console.warn(`Failed to remove batch starting at ${i}: ${removeResponse.status}`);
        } else {
          console.log(`Removed batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(tracksToRemove.length/batchSize)}`);
        }
        
        // Add delay between requests to avoid rate limiting
        if (i + batchSize < tracksToRemove.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
    
    // Add tracks in the new order in batches
    const addBatchSize = 100;
    for (let i = 0; i < spotifyTrackUris.length; i += addBatchSize) {
      const batch = spotifyTrackUris.slice(i, i + addBatchSize);
      
      console.log(`Adding batch ${Math.floor(i/addBatchSize) + 1}/${Math.ceil(spotifyTrackUris.length/addBatchSize)} (${batch.length} tracks)`);
      
      const addResponse = await fetch(`https://api.spotify.com/v1/playlists/${spotifyPlaylistId}/tracks`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          uris: batch
        })
      });
      
      if (!addResponse.ok) {
        throw new Error(`Failed to add batch starting at ${i}: ${addResponse.status}`);
      }
      
      // Add delay between requests to avoid rate limiting
      if (i + addBatchSize < spotifyTrackUris.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    console.log(`✅ Successfully updated Spotify playlist ${spotifyPlaylistId} with ${spotifyTrackUris.length} tracks in new order`);
    return true;
    
  } catch (error) {
    console.error('Error updating Spotify playlist order:', error);
    return false;
  }
}

/**
 * Sync track order with Spotify playlist
 */
async function syncSpotifyPlaylistOrder(req: Request, res: Response) {
  try {
    const playlistId = parseInt(req.params.id);
    const userId = req.query.userId as string;
    
    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }
    
    // Get the playlist to check if it has been exported to Spotify
    const playlistResult = await pool.query(
      'SELECT spotify_id, title, user_id FROM playlists WHERE id = $1',
      [playlistId]
    );
    
    if (playlistResult.rows.length === 0) {
      return res.status(404).json({ message: "Playlist not found" });
    }
    
    const playlist = playlistResult.rows[0];
    
    // Verify ownership
    if (playlist.user_id !== parseInt(userId)) {
      return res.status(403).json({ message: "Access denied: You don't own this playlist" });
    }
    
    // Check if playlist has been exported to Spotify
    if (!playlist.spotify_id) {
      return res.status(400).json({ message: "Playlist has not been exported to Spotify yet" });
    }
    
    // Get user's Spotify access token
    const spotifyAuth = await spotify.getSpotifyAuth(userId);
    if (!spotifyAuth) {
      return res.status(401).json({ message: "Spotify authentication required" });
    }
    
    // Get current track order from database
    const tracksResult = await pool.query(`
      SELECT pt.track_id, pt.position, t.spotify_id
      FROM playlist_tracks pt
      JOIN tracks t ON pt.track_id = t.id
      WHERE pt.playlist_id = $1 AND t.spotify_id IS NOT NULL
      ORDER BY pt.position ASC
    `, [playlistId]);
    
    const tracks = tracksResult.rows;
    
    if (tracks.length === 0) {
      return res.status(400).json({ message: "No valid Spotify tracks found in playlist" });
    }
    
    // Convert to Spotify URIs
    const spotifyTrackUris = tracks.map(track => `spotify:track:${track.spotify_id}`);
    
    // Update Spotify playlist order
    const success = await updateSpotifyPlaylistOrder(
      spotifyAuth.access_token,
      playlist.spotify_id,
      spotifyTrackUris
    );
    
    if (!success) {
      return res.status(500).json({ message: "Failed to update Spotify playlist order" });
    }
    
    res.json({ 
      success: true, 
      message: "Spotify playlist order updated successfully",
      tracksUpdated: tracks.length
    });
    
  } catch (error) {
    console.error("Error syncing Spotify playlist order:", error);
    res.status(500).json({ message: "Failed to sync Spotify playlist order" });
  }
}

/**
 * Add these API routes to the Express application
 */
export function addSpotifyExportRoutes(app: express.Express) {
  app.post('/api/playlist/:id/export-to-spotify', exportPlaylistToSpotify);
  
  // Add as a direct endpoint for diagnostic testing
  app.post('/api/playlist/:id/direct-export-to-spotify', exportPlaylistToSpotify);
  
  // Add endpoint to get Spotify playlist info (mainly for cover images)
  app.get('/api/spotify-playlist-info/:spotifyId', getSpotifyPlaylistInfo);
  
  // Add synchronized track deletion endpoint
  app.delete('/api/playlist/:id/track/:position', deleteTrackFromPlaylist);
  
  // Add direct playlist listing endpoint with accurate track counts
  app.get('/api/playlists-with-counts', getPlaylists);
  
  // Add Spotify sync endpoint for track reordering
  app.post('/api/playlist/:id/sync-spotify-order', syncSpotifyPlaylistOrder);
  
  console.log('Spotify export routes registered');
}