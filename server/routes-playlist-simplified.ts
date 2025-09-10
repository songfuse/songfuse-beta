import { Request as ExpressRequest, Response } from 'express';
import { playlistStorage } from './playlist_storage_simplified';
import { db } from './db';
import { tracks, trackPlatformIds } from '../shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { storage } from './storage';
import { updatePlaylistCover, syncSessionCoverWithPlaylist } from './services/playlistCoverService';
import { SpotifyServiceAccount } from './services/spotifyServiceAccount';

// Add a type declaration for our extended request object
interface Request extends ExpressRequest {
  dbTrackMap?: {
    [spotifyId: string]: number; // Maps Spotify IDs to database track IDs (using dbId standard)
  };
}

/**
 * Helper function to ensure a playlist has a cover image
 * Checks sources in this order:
 * 1. Directly provided URL (highest priority)
 * 2. Session storage
 * 3. Existing playlist (if updating)
 * 4. Default cover image (lowest priority)
 */
async function ensurePlaylistCoverImage(
  providedCoverUrl: string | null, 
  sessionId?: string,
  existingPlaylistId?: number
): Promise<string | null> {
  try {
    console.log(`V2 API COVER IMAGE CHECK - Provided: ${providedCoverUrl}, Session: ${sessionId}, Existing ID: ${existingPlaylistId}`);
    
    // 1. If a cover image was directly provided, use it
    if (providedCoverUrl) {
      console.log(`V2 API COVER IMAGE CHECK [1/4] - Using directly provided cover: ${providedCoverUrl}`);
      // Add timestamp for cache busting
      const timestamp = Date.now();
      return providedCoverUrl.includes('?') 
        ? `${providedCoverUrl}&timestamp=${timestamp}` 
        : `${providedCoverUrl}?timestamp=${timestamp}`;
    }
    
    // 2. If we have a session ID, check if there's a cover image stored for it
    if (sessionId) {
      console.log(`V2 API COVER IMAGE CHECK [2/4] - Checking for cover image in session: ${sessionId}`);
      const sessionCoverUrl = await storage.getCoverImageForSession(sessionId);
      
      if (sessionCoverUrl) {
        console.log(`V2 API COVER IMAGE CHECK [2/4] - Found cover image in session: ${sessionCoverUrl}`);
        // Add timestamp for cache busting
        const timestamp = Date.now();
        return sessionCoverUrl.includes('?') 
          ? `${sessionCoverUrl}&timestamp=${timestamp}` 
          : `${sessionCoverUrl}?timestamp=${timestamp}`;
      }
    }
    
    // 3. If we have an existing playlist ID, check if it already has a cover image
    if (existingPlaylistId) {
      console.log(`V2 API COVER IMAGE CHECK [3/4] - Checking existing playlist ${existingPlaylistId} for cover image`);
      try {
        const existingPlaylist = await playlistStorage.getPlaylist(existingPlaylistId);
        
        if (existingPlaylist?.coverImageUrl) {
          console.log(`V2 API COVER IMAGE CHECK [3/4] - Using existing cover image: ${existingPlaylist.coverImageUrl}`);
          // Add timestamp for cache busting
          const timestamp = Date.now();
          return existingPlaylist.coverImageUrl.includes('?') 
            ? `${existingPlaylist.coverImageUrl}&timestamp=${timestamp}` 
            : `${existingPlaylist.coverImageUrl}?timestamp=${timestamp}`;
        }
      } catch (error) {
        console.error(`V2 API COVER IMAGE CHECK [3/4] - Error getting existing playlist: ${error}`);
      }
    }
    
    // 4. Return null instead of a default cover image
    console.log(`V2 API COVER IMAGE CHECK [4/4] - No cover image found, returning null`);
    return null;
  } catch (error) {
    console.error("V2 API COVER IMAGE CHECK - Error ensuring cover image:", error);
    return null;
  }
}

/**
 * Get a playlist by ID including its tracks
 * Uses the simplified playlist storage service
 */
export async function getPlaylistDetails(req: Request, res: Response) {
  try {
    const playlistId = parseInt(req.params.idOrSpotifyId);
    let playlist;
    
    if (isNaN(playlistId)) {
      // If not a number, assume it's a Spotify ID
      playlist = await playlistStorage.getPlaylistBySpotifyId(req.params.idOrSpotifyId);
    } else {
      // Otherwise it's a local ID
      playlist = await playlistStorage.getPlaylist(playlistId);
    }
    
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    
    // DIRECT DATABASE CONNECTION APPROACH
    console.log(`Fetching tracks for playlist ${playlist.id} using direct database connection`);
    
    // Import the modules we need for direct database access
    const { Pool } = require('@neondatabase/serverless');
    const ws = require('ws');
    
    // Configure Neon for WebSocket support
    const neonConfig = require('@neondatabase/serverless');
    neonConfig.webSocketConstructor = ws;
    
    // Create a new connection pool for this specific request
    const pool = new Pool({ 
      connectionString: process.env.DATABASE_URL,
    });
    
    let client = null;
    try {
      // Get a client from the pool
      client = await pool.connect();
      console.log(`Direct DB connection established for playlist ${playlist.id}`);
      
      // First, verify if tracks exist for this playlist
      const countResult = await client.query(
        'SELECT COUNT(*) as track_count FROM playlist_tracks WHERE playlist_id = $1',
        [playlist.id]
      );
      
      const trackCount = parseInt(countResult.rows[0].track_count);
      console.log(`Direct SQL COUNT query found ${trackCount} tracks for playlist ${playlist.id}`);

      if (trackCount === 0) {
        return res.json({
          ...playlist,
          tracks: [],
          isCurrentUserOwner: req.query.userId ? parseInt(req.query.userId as string) === playlist.userId : false
        });
      }
      
      // Get all tracks with details
      const tracksResult = await client.query(`
        SELECT pt.position, t.id as track_id, t.title, t.duration, 
               t.preview_url, t.explicit, t.popularity
        FROM playlist_tracks pt 
        JOIN tracks t ON pt.track_id = t.id 
        WHERE pt.playlist_id = $1
        ORDER BY pt.position ASC
      `, [playlist.id]);
      
      console.log(`Direct query returned ${tracksResult.rows.length} tracks`);
      
      // Sample the first few tracks for debugging
      if (tracksResult.rows.length > 0) {
        console.log('Sample track:', JSON.stringify(tracksResult.rows[0]));
      }
      
      // Format tracks with minimal information
      const simpleTracks = tracksResult.rows.map((row: any) => {
        // Create a basic track object with the essential information
        return {
          id: row.track_id.toString(),
          name: row.title || 'Unknown Track',
          artists: [{ name: 'Artist' }],
          album: { 
            name: 'Album', 
            images: [] 
          },
          duration_ms: row.duration || 0,
          preview_url: row.preview_url || null,
          explicit: row.explicit || false,
          popularity: row.popularity || 0,
          position: row.position,
          has_preview: !!row.preview_url
        };
      });
      
      // Get creator info
      const userId = req.query.userId ? parseInt(req.query.userId as string) : null;
      
      return res.json({
        ...playlist,
        tracks: simpleTracks,
        isCurrentUserOwner: userId ? userId === playlist.userId : false,
        _direct_connection: true
      });
    } catch (dbError) {
      console.error(`Direct DB connection error for playlist ${playlist.id}:`, dbError);
      
      // Fall back to the original ORM approach if direct connection fails
      console.log(`Falling back to ORM approach for playlist ${playlist.id}`);
      
      // Get playlist tracks using the ORM
      const playlistTracks = await playlistStorage.getPlaylistTracks(playlist.id);
      console.log(`ORM found ${playlistTracks.length} tracks for playlist ${playlist.id}`);
      
      // Format tracks from ORM result
      const ormTracks = playlistTracks.map(({ track, position }) => ({
        id: track.id.toString(),
        name: track.title || 'Unknown Track',
        artists: [{ name: 'Artist' }],
        album: { name: 'Album', images: [] },
        duration_ms: track.duration ? track.duration * 1000 : 0,
        preview_url: track.previewUrl || null,
        explicit: track.explicit || false,
        popularity: track.popularity || 0,
        position: position,
        has_preview: !!track.previewUrl
      }));
      
      // Get creator info
      const userId = req.query.userId ? parseInt(req.query.userId as string) : null;
      
      return res.json({
        ...playlist,
        tracks: ormTracks,
        isCurrentUserOwner: userId ? userId === playlist.userId : false,
        _orm_fallback: true
      });
    } finally {
      // Always release the client back to the pool
      if (client) {
        try {
          client.release();
          console.log(`Released database client for playlist ${playlist.id}`);
        } catch (releaseError) {
          console.error('Error releasing client:', releaseError);
        }
      }
    }
  // This function return is handled in the try/catch blocks above
  } catch (error) {
    console.error("Error fetching playlist details:", error);
    return res.status(500).json({ error: 'Error fetching playlist details' });
  }
}

/**
 * Save a playlist with its tracks
 * Uses the simplified playlist storage service
 */
export async function savePlaylist(req: Request, res: Response) {
  try {
    console.log("=== V2 API - SAVE PLAYLIST ENDPOINT CALLED ===");
    console.log("V2 API - Save playlist request received:", req.body);
    console.log("V2 API - Request method:", req.method);
    console.log("V2 API - Request URL:", req.url);
    
    // Force JSON response instead of HTML
    res.setHeader('Content-Type', 'application/json');
    
    // Check if we're using the direct database track ID method
    if (req.body.dbTrackIds && Array.isArray(req.body.dbTrackIds)) {
      console.log('Detected dbTrackIds in request, using direct database track ID method');
      return savePlaylistWithDbIds(req, res);
    }
    
    const { 
      title, 
      description, 
      tracks: trackList = [], 
      coverImageUrl, 
      userId, 
      isPublic = true, 
      sessionId,
      articleTitle,
      articleLink 
    } = req.body;
    
    if (!title) {
      console.log("V2 API - Title missing");
      return res.status(400).json({ error: 'Title is required' });
    }
    
    if (!userId) {
      console.log("V2 API - User ID missing");
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    // Check if a playlist with this title already exists for this user
    const existingPlaylists = await playlistStorage.getPlaylistsByTitle(userId, title);
    
    let playlist;
    const existingPlaylistId = existingPlaylists.length > 0 ? existingPlaylists[0].id : undefined;
    
    // Get the preliminary cover image from session or provided URL
    const preliminaryCoverUrl = await ensurePlaylistCoverImage(coverImageUrl, sessionId, existingPlaylistId);
    console.log(`V2 API - Preliminary cover image URL: ${preliminaryCoverUrl}`);
    
    if (existingPlaylists.length > 0) {
      // Update existing playlist instead of creating a new one
      const existingPlaylist = existingPlaylists[0];
      console.log(`Found existing playlist with ID ${existingPlaylist.id}, updating instead of creating new`);
      
      // First create basic playlist update without cover
      // FIXED: Always explicitly set article metadata to what was provided in the request
      // If not provided, clear any existing article metadata to prevent inheritance from previous playlists
      playlist = await playlistStorage.updatePlaylist(existingPlaylist.id, { 
        description: description || null, 
        isPublic: isPublic,
        articleTitle: articleTitle || null,  // Only use if explicitly provided, otherwise clear
        articleLink: articleLink || null     // Only use if explicitly provided, otherwise clear
      });
      
      if (!playlist) {
        return res.status(500).json({ error: 'Failed to update existing playlist' });
      }
      
      // Then handle the cover image update with robust verification if we have a cover
      if (preliminaryCoverUrl) {
        console.log(`V2 API - Updating cover image for playlist ${existingPlaylist.id}`);
        const coverResult = await updatePlaylistCover(existingPlaylist.id, preliminaryCoverUrl);
        
        if (coverResult.success) {
          console.log(`V2 API - Cover image updated successfully: ${coverResult.resultUrl}`);
          playlist.coverImageUrl = coverResult.resultUrl;
        } else {
          console.warn(`V2 API - Cover image update failed, using preliminary URL without verification`);
          // Fall back to the standard method (without verification) as last resort
          await playlistStorage.updatePlaylist(existingPlaylist.id, { 
            coverImageUrl: preliminaryCoverUrl 
          });
          playlist.coverImageUrl = preliminaryCoverUrl;
        }
      } else if (sessionId) {
        // Try to sync with any session cover image as a backup
        const syncResult = await syncSessionCoverWithPlaylist(sessionId, existingPlaylist.id);
        if (syncResult.success) {
          console.log(`V2 API - Synced session cover image: ${syncResult.resultUrl}`);
          playlist.coverImageUrl = syncResult.resultUrl;
        }
      }
      
      // Clear existing tracks
      await playlistStorage.clearPlaylistTracks(existingPlaylist.id);
    } else {
      // Create the playlist initially without cover image
      // FIXED: Only use article metadata if explicitly provided, otherwise clear it
      playlist = await playlistStorage.createPlaylist({
        userId,
        title,
        description: description || null,
        coverImageUrl: null, // Start with null, we'll update after
        isPublic,
        articleTitle: articleTitle || null,  // Only use if explicitly provided, otherwise clear
        articleLink: articleLink || null     // Only use if explicitly provided, otherwise clear
      });
      
      // Then handle the cover image update with robust verification if we have a cover or session
      if (playlist) {
        if (preliminaryCoverUrl) {
          console.log(`V2 API - Setting cover image for new playlist ${playlist.id}`);
          const coverResult = await updatePlaylistCover(playlist.id, preliminaryCoverUrl);
          
          if (coverResult.success) {
            console.log(`V2 API - Cover image set successfully for new playlist: ${coverResult.resultUrl}`);
            playlist.coverImageUrl = coverResult.resultUrl;
          } else {
            console.warn(`V2 API - Cover image update failed for new playlist, using preliminary URL without verification`);
            // Fall back to the standard method (without verification) as last resort
            await playlistStorage.updatePlaylist(playlist.id, { 
              coverImageUrl: preliminaryCoverUrl 
            });
            playlist.coverImageUrl = preliminaryCoverUrl;
          }
        } else if (sessionId) {
          // Try to sync with any session cover image
          const syncResult = await syncSessionCoverWithPlaylist(sessionId, playlist.id);
          if (syncResult.success) {
            console.log(`V2 API - Synced session cover image for new playlist: ${syncResult.resultUrl}`);
            playlist.coverImageUrl = syncResult.resultUrl;
          }
        }
      }
    }
    
    // Add tracks to the playlist
    if (trackList.length > 0) {
      // Process each track and add to the playlist
      for (let i = 0; i < trackList.length; i++) {
        const track = trackList[i];
        
        // Make sure we have at least a Spotify ID
        if (!track?.id) {
          console.error(`Track at position ${i} is missing an id, skipping`);
          continue;
        }
        
        // Check if we have a direct database ID mapping for this track
        // This happens when we found tracks by title in the playlist creation process
        let dbTrackId = null;
        
        // Check if track has dbId (preferred) or databaseId (legacy) directly attached to it
        // @ts-ignore - dbId is the standard property we use for database IDs
        if (track.dbId) {
          // @ts-ignore
          dbTrackId = track.dbId;
          console.log(`Found DB track ID ${dbTrackId} directly on track with Spotify ID ${track.id}`);
          
          // Add the track to the playlist using the database ID directly
          await playlistStorage.addTrackToPlaylist(playlist.id, dbTrackId, i);
          continue;
        }
        // @ts-ignore - databaseId is the legacy property name for backward compatibility
        else if (track.databaseId) {
          // @ts-ignore
          dbTrackId = track.databaseId;
          console.log(`Found legacy databaseId ${dbTrackId} (should be using dbId) for track with Spotify ID ${track.id}`);
          
          // Add the track to the playlist using the database ID directly
          await playlistStorage.addTrackToPlaylist(playlist.id, dbTrackId, i);
          continue;
        }
        
        // Check if we have a mapping from a previous step stored in the request
        if (req.dbTrackMap && req.dbTrackMap[track.id]) {
          dbTrackId = req.dbTrackMap[track.id];
          console.log(`Found DB track ID ${dbTrackId} for Spotify ID ${track.id} in track map`);
          
          // Add the track to the playlist using the database ID directly
          await playlistStorage.addTrackToPlaylist(playlist.id, dbTrackId, i);
          continue;
        }
        
        // If we don't have a direct mapping, try to find the track in our database by Spotify ID
        console.log(`No direct database ID mapping for Spotify ID ${track.id}, searching in database`);
        const [dbTrack] = await db
          .select()
          .from(tracks)
          .innerJoin(trackPlatformIds, eq(tracks.id, trackPlatformIds.trackId))
          .where(
            and(
              eq(trackPlatformIds.platform, 'spotify'),
              eq(trackPlatformIds.platformId, track.id)
            )
          );
        
        if (!dbTrack) {
          console.error(`Track with Spotify ID ${track.id} not found in database, trying alternative methods`);
          
          // Try a different approach - search just by platform ID
          const trackEntryResults = await db
            .select()
            .from(trackPlatformIds)
            .where(eq(trackPlatformIds.platformId, track.id));
            
          if (trackEntryResults.length > 0) {
            console.log(`Found track platform entry by ID only:`, trackEntryResults[0]);
            // Get track using the found trackId
            const trackResult = await db
              .select()
              .from(tracks)
              .where(eq(tracks.id, trackEntryResults[0].trackId));
            
            if (trackResult.length > 0) {
              console.log(`Successfully found track:`, trackResult[0]);
              // Add the track we found to the playlist
              await playlistStorage.addTrackToPlaylist(playlist.id, trackResult[0].id, i);
              continue;
            }
          }
          
          // As a last resort, try to find by title
          if (track.name) {
            console.log(`Trying to find track by title: "${track.name}"`);
            const titleQuery = await db.execute(sql`
              SELECT * FROM "tracks" 
              WHERE title = ${track.name} 
              ORDER BY popularity DESC LIMIT 1
            `);
            
            if (titleQuery.length > 0) {
              const foundTrack = titleQuery[0];
              console.log(`✓ Found track with title "${track.name}", id: ${foundTrack.id}`);
              await playlistStorage.addTrackToPlaylist(playlist.id, foundTrack.id, i);
              continue;
            }
          }
          
          console.error(`All methods failed to find track "${track.name}", skipping`);
          continue;
        }
        
        // Add the track to the playlist using the database ID
        console.log(`Adding track with DB ID ${dbTrack.tracks.id} to playlist at position ${i}`);
        await playlistStorage.addTrackToPlaylist(playlist.id, dbTrack.tracks.id, i);
      }
    }
    
    // 🎯 PROCESS COVER IMAGE WITH OPTIMIZATION
    // Process the cover image to create resized versions for different use cases
    if (playlist && playlist.coverImageUrl) {
      console.log(`🔧 PROCESSING: Creating optimized cover image versions for playlist ${playlist.id}`);
      try {
        const { storeAiGeneratedCoverWithOptimization } = await import('./services/supabaseStorage');
        const optimizedImages = await storeAiGeneratedCoverWithOptimization(playlist.coverImageUrl, playlist.id);
        
        console.log(`✅ PROCESSING: Successfully created optimized cover image versions`);
        console.log(`- Original: ${optimizedImages.original}`);
        console.log(`- Thumbnail: ${optimizedImages.thumbnail}`);
        console.log(`- Small: ${optimizedImages.small}`);
        console.log(`- Social: ${optimizedImages.social}`);
        console.log(`- Open Graph: ${optimizedImages.openGraph}`);
        
        // Update the playlist object with the social image URL for Spotify upload
        playlist.socialImageUrl = optimizedImages.social;
        
      } catch (error) {
        console.error(`❌ PROCESSING: Error creating optimized cover image versions:`, error);
        // Don't fail the whole operation if cover processing fails
      }
    }
    
    // Handle Spotify saving if not skipped
    let spotifyId = null;
    let spotifyUrl = null;
    let savedToSpotify = false;
    
    console.log("V2 API - Spotify save check - skipSpotify:", req.body.skipSpotify, "type:", typeof req.body.skipSpotify);
    
    if (!req.body.skipSpotify) {
      try {
        console.log("V2 API - Attempting to save to Spotify, skipSpotify:", req.body.skipSpotify);
        console.log("V2 API - Using static import for SpotifyServiceAccount");
        
        // Set a flag to prevent duplicate saves - use a simple approach with existing fields
        // We'll use the description field to mark that Spotify save is in progress
        const originalDescription = playlist.description;
        const spotifySavingFlag = `[SPOTIFY_SAVING_IN_PROGRESS_${Date.now()}]`;
        await playlistStorage.updatePlaylist(playlist.id, {
          description: spotifySavingFlag + (originalDescription || '')
        });
        
        // Initialize SpotifyServiceAccount if not already initialized
        SpotifyServiceAccount.initialize();
        
        const isConfigured = SpotifyServiceAccount.isConfigured();
        console.log("V2 API - SpotifyServiceAccount.isConfigured():", isConfigured);
        
        if (isConfigured) {
          console.log("V2 API - Creating playlist on Songfuse Spotify account");
          
          // Get service account access token
          const serviceAccessToken = await SpotifyServiceAccount.getAccessToken();
          
          // Import spotify functions
          const spotify = await import('./spotify-fixed');
          
          // Truncate description to comply with Spotify limits (300 characters max)
          const truncatedDesc = description ? description.substring(0, 300) : "";
          
          // Create playlist on Songfuse Spotify account
          const spotifyPlaylist = await spotify.createPlaylist(
            serviceAccessToken,
            "songfuse-service", // Use service account
            title,
            truncatedDesc,
            isPublic !== false
          );
          
          console.log("V2 API - Playlist created successfully on Songfuse account:", spotifyPlaylist.id);
          
          // Set values for response
          spotifyId = spotifyPlaylist.id;
          spotifyUrl = spotifyPlaylist.external_urls.spotify;
          savedToSpotify = true;

          // Add tracks to the playlist
          const trackUris = trackList.map(track => {
            // Ensure track ID is valid and in correct format
            if (!track.id) {
              console.error("Missing track ID:", track);
              return null;
            }
            // Clean up ID to ensure proper format
            const cleanId = track.id.replace('spotify:track:', '');
            return `spotify:track:${cleanId}`;
          }).filter(uri => uri !== null) as string[];
          
          await spotify.addTracksToPlaylist(serviceAccessToken, spotifyPlaylist.id, trackUris);
          console.log("V2 API - Added tracks to Songfuse playlist");

          // Upload custom cover if provided
          if (playlist.coverImageUrl) {
            try {
              console.log("V2 API - Preparing to upload cover image for Songfuse playlist:", spotifyPlaylist.id);
              
              // Use the social image URL (400x400) for Spotify upload if available
              let imageUrlToUse = playlist.coverImageUrl;
              if (playlist.socialImageUrl) {
                imageUrlToUse = playlist.socialImageUrl;
                console.log("V2 API - Using social image URL (400x400) for Spotify upload:", imageUrlToUse);
              } else {
                console.log("V2 API - Using original cover image URL for Spotify upload:", imageUrlToUse);
              }
              
              // Convert image URL to base64 for Spotify API
              const { imageUrlToBase64 } = await import('./services/utils');
              const base64Image = await imageUrlToBase64(imageUrlToUse);
              
              if (base64Image) {
                // Add a short delay to ensure the playlist is fully created before uploading image
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                await spotify.uploadPlaylistCoverImage(serviceAccessToken, spotifyPlaylist.id, base64Image);
                console.log("V2 API - Successfully uploaded cover image to Songfuse playlist");
              }
            } catch (imgError) {
              console.error("V2 API - Failed to upload cover image:", imgError);
              // Don't fail the whole request if image upload fails
            }
          }
          
          // Update the playlist in database with Spotify information and clean up the flag
          await playlistStorage.updatePlaylist(playlist.id, {
            spotifyId,
            spotifyUrl,
            description: originalDescription // Restore original description
          });
          
        } else {
          console.log("V2 API - Songfuse Spotify service account not configured, skipping Spotify save");
        }
      } catch (spotifyError) {
        console.error("V2 API - Songfuse Spotify API error:", spotifyError);
        // Clean up the flag in case of error
        await playlistStorage.updatePlaylist(playlist.id, {
          description: originalDescription // Restore original description
        });
        // Continue with database-only approach
        console.log("V2 API - Songfuse Spotify save failed, continuing with database-only save");
      }
    } else {
      console.log("V2 API - Skipping Spotify save due to skipSpotify=true");
    }

    return res.json({ 
      success: true, 
      message: 'Playlist saved successfully', 
      playlist: {
        ...playlist,
        spotifyId,
        spotifyUrl
      },
      spotifyId,
      spotifyUrl,
      savedToSpotify
    });
  } catch (error) {
    console.error("Error saving playlist:", error);
    
    // Add more detailed error information for debugging
    if (error instanceof Error) {
      console.error("Error name:", error.name);
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    } else {
      console.error("Unknown error type:", typeof error);
    }

    // Return more detailed error information to help with debugging
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return res.status(500).json({ 
      error: 'Error saving playlist',
      details: errorMessage,
      type: error instanceof Error ? error.name : typeof error
    });
  }
}

/**
 * Save a playlist directly using database track IDs
 * This avoids Spotify ID lookup issues completely
 */
/**
 * Save a playlist using direct database track IDs (dbId) without Spotify lookup
 * This is the most direct and efficient method for saving playlists when we already
 * have the internal database IDs for tracks.
 */
export async function savePlaylistWithDbIds(req: Request, res: Response) {
  try {
    console.log('Saving playlist using direct database track IDs (dbId)');
    const { 
      title, 
      description, 
      dbTrackIds, 
      userId, 
      isPublic = true, 
      playlistId, 
      coverImageUrl, 
      sessionId,
      articleTitle,
      articleLink
    } = req.body;
    
    // Log article data for debugging
    console.log('Article data received:', { articleTitle, articleLink });
    
    if (!title || !userId || !dbTrackIds) {
      return res.status(400).json({ error: 'Title, userId, and dbTrackIds are required' });
    }
    
    if (!Array.isArray(dbTrackIds)) {
      return res.status(400).json({ error: 'dbTrackIds must be an array of database track IDs' });
    }
    
    // First check if the playlist exists
    let playlist;
    const existingPlaylist = playlistId ? await playlistStorage.getPlaylist(playlistId) : null;
    
    // Get the best cover image available
    const finalCoverImageUrl = await ensurePlaylistCoverImage(coverImageUrl, sessionId, existingPlaylist?.id);
    console.log(`V2 API (DbIds) - Final cover image URL: ${finalCoverImageUrl}`);
    
    if (existingPlaylist) {
      // Update the existing playlist
      console.log(`Updating existing playlist ${existingPlaylist.id}`);
      playlist = await playlistStorage.updatePlaylist(existingPlaylist.id, {
        title,
        description: description || null,
        coverImageUrl: finalCoverImageUrl,
        isPublic,
        articleTitle: articleTitle || null,  // Only use if explicitly provided, otherwise clear
        articleLink: articleLink || null     // Only use if explicitly provided, otherwise clear
      });
      
      if (!playlist) {
        return res.status(500).json({ error: 'Failed to update existing playlist' });
      }
      
      // Clear existing tracks
      await playlistStorage.clearPlaylistTracks(existingPlaylist.id);
    } else {
      // Create the playlist with the resolved cover image URL
      playlist = await playlistStorage.createPlaylist({
        userId: typeof userId === 'string' ? parseInt(userId) : userId,
        title,
        description: description || null,
        coverImageUrl: finalCoverImageUrl,
        isPublic,
        articleTitle: articleTitle || null,  // Only use if explicitly provided, otherwise clear
        articleLink: articleLink || null     // Only use if explicitly provided, otherwise clear
      });
    }
    
    // Add tracks to the playlist
    if (dbTrackIds.length > 0) {
      // Log all database IDs for debugging
      console.log('Database track IDs received:', dbTrackIds);
      
      // Check if we received string IDs instead of numbers and convert them
      const normalizedTrackIds = dbTrackIds.map(id => {
        if (typeof id === 'string') {
          // If it's a string but looks like a number, convert it
          if (/^[0-9]+$/.test(id)) {
            console.log(`Converting string track ID "${id}" to number`);
            return parseInt(id);
          }
          // If it's a string and doesn't look like a number, warn
          console.warn(`Received non-numeric track ID string: "${id}"`);
          return parseInt(id) || null;
        }
        return id;
      }).filter(id => id !== null);
      
      console.log(`After normalization: ${normalizedTrackIds.length} valid track IDs`);
      
      for (let i = 0; i < normalizedTrackIds.length; i++) {
        const trackId = normalizedTrackIds[i];
        
        try {
          console.log(`Adding track ${trackId} to playlist ${playlist.id} at position ${i}`);
          await playlistStorage.addTrackToPlaylist(playlist.id, trackId, i);
          console.log(`Successfully added track ${trackId} to playlist ${playlist.id}`);
        } catch (error) {
          console.error(`Failed to add track ${trackId} to playlist:`, error);
          
          // Try to get more information about this track
          try {
            const trackInfo = await db
              .select()
              .from(tracks)
              .where(eq(tracks.id, trackId));
              
            if (trackInfo.length > 0) {
              console.log(`Track ${trackId} exists in database:`, trackInfo[0].title);
            } else {
              console.error(`Track ${trackId} does not exist in database!`);
            }
          } catch (trackError) {
            console.error(`Error checking track ${trackId}:`, trackError);
          }
        }
      }
    }
    
    return res.json({ 
      success: true, 
      message: 'Playlist saved successfully with database track IDs', 
      playlist 
    });
  } catch (error) {
    console.error("Error saving playlist with DB IDs:", error);
    
    // Add more detailed error information for debugging
    if (error instanceof Error) {
      console.error("Error name:", error.name);
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    } else {
      console.error("Unknown error type:", typeof error);
    }
    
    // Return more detailed error information to help with debugging
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return res.status(500).json({ 
      error: 'Error saving playlist',
      details: errorMessage,
      type: error instanceof Error ? error.name : typeof error
    });
  }
}