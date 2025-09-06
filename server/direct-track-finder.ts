/**
 * Direct Track Finder - Simple and straightforward track lookup
 * No AI, no fancy matching, just direct exact database queries.
 */

import { Request, Response } from 'express';
import { pool } from './db';

/**
 * Find a track by exact title match
 * This is the simplest possible approach, no substitution, no AI
 */
export async function findTrackByExactTitle(req: Request, res: Response) {
  const { title } = req.query;
  
  if (!title || typeof title !== 'string') {
    return res.status(400).json({ 
      success: false, 
      error: 'Title parameter is required' 
    });
  }

  try {
    console.log(`[DIRECT FINDER] Looking for exact title match (case-insensitive): "${title}"`);
    
    // Case-insensitive exact title match query
    const result = await pool.query(
      'SELECT id, title FROM tracks WHERE LOWER(title) = LOWER($1) LIMIT 50',
      [title]
    );
    
    console.log(`[DIRECT FINDER] Found ${result.rows.length} exact matches`);
    
    return res.json({
      success: true,
      matches: result.rows,
      query: { title }
    });
  } catch (error) {
    console.error('[DIRECT FINDER] Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: `Database error: ${error.message}` 
    });
  }
}

/**
 * Get Spotify ID for a track by database ID
 */
export async function getTrackSpotifyId(req: Request, res: Response) {
  const { trackId } = req.query;
  
  if (!trackId) {
    return res.status(400).json({ 
      success: false, 
      error: 'trackId parameter is required' 
    });
  }

  try {
    console.log(`[DIRECT FINDER] Getting Spotify ID for track ID: ${trackId}`);
    
    // Get the Spotify ID using a direct query
    const result = await pool.query(
      'SELECT platform_id FROM track_platform_ids WHERE track_id = $1 AND platform = $2 LIMIT 1',
      [trackId, 'spotify']
    );
    
    if (result.rows.length === 0) {
      return res.json({
        success: false,
        error: 'No Spotify ID found for this track',
        trackId
      });
    }
    
    return res.json({
      success: true,
      trackId: Number(trackId),
      spotifyId: result.rows[0].platform_id
    });
  } catch (error) {
    console.error('[DIRECT FINDER] Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: `Database error: ${error.message}` 
    });
  }
}

/**
 * Find multiple tracks by titles
 * This is the bulk version of the title lookup
 */
export async function findTracksByTitles(req: Request, res: Response) {
  const { titles } = req.body;
  
  if (!titles || !Array.isArray(titles) || titles.length === 0) {
    return res.status(400).json({ 
      success: false, 
      error: 'Array of titles is required in request body' 
    });
  }

  try {
    console.log(`[DIRECT FINDER] Looking for ${titles.length} tracks by exact title match`);
    
    // Create a mapping to store results
    const results: Record<string, any[]> = {};
    
    // Process each title
    for (const title of titles) {
      // Skip empty titles
      if (!title || typeof title !== 'string') continue;
      
      // Execute query for this title using case-insensitive matching
      const result = await pool.query(
        'SELECT id, title FROM tracks WHERE LOWER(title) = LOWER($1) LIMIT 10',
        [title]
      );
      
      // Store the results
      results[title] = result.rows;
    }
    
    // Count how many titles had matches
    const matchCount = Object.values(results).filter(matches => matches.length > 0).length;
    
    return res.json({
      success: true,
      results,
      stats: {
        requested: titles.length,
        matched: matchCount,
        notMatched: titles.length - matchCount
      }
    });
  } catch (error) {
    console.error('[DIRECT FINDER] Error in bulk title search:', error);
    return res.status(500).json({ 
      success: false, 
      error: `Database error: ${error.message}` 
    });
  }
}

/**
 * Find tracks directly by their database IDs
 * This function retrieves full track details including Spotify IDs for a list of track IDs
 */
export async function findTracksByIds(req: Request, res: Response) {
  const { trackIds } = req.body;
  
  if (!trackIds || !Array.isArray(trackIds) || trackIds.length === 0) {
    return res.status(400).json({ 
      success: false, 
      error: 'Array of track IDs is required in request body' 
    });
  }

  try {
    console.log(`[DIRECT FINDER] Looking up ${trackIds.length} tracks by database IDs`);
    
    // Create placeholders for the first query
    const trackPlaceholders = trackIds.map((_, idx) => `$${idx + 1}`).join(',');
    
    // Query to get track details
    const trackQuery = `
      SELECT t.id, t.title, t.duration, t.explicit, t.popularity, t.album_id as "albumId", 
             t.release_date as "releaseDate", t.preview_url as "previewUrl", 
             t.created_at as "createdAt", t.updated_at as "updatedAt"
      FROM tracks t
      WHERE t.id IN (${trackPlaceholders})
    `;
    
    const trackResult = await pool.query(trackQuery, trackIds);
    
    // If no tracks found, return early
    if (trackResult.rows.length === 0) {
      return res.json({
        success: false,
        error: 'No tracks found with the provided IDs',
        trackIds
      });
    }
    
    // Get all track IDs that were found
    const foundTrackIds = trackResult.rows.map(row => row.id);
    
    // Create new placeholders for the Spotify query
    const spotifyPlaceholders = foundTrackIds.map((_, idx) => `$${idx + 1}`).join(',');
    
    // Get Spotify IDs for these tracks in a single query
    const spotifyQuery = `
      SELECT track_id, platform_id 
      FROM track_platform_ids 
      WHERE track_id IN (${spotifyPlaceholders}) AND platform = 'spotify'
    `;
    
    const spotifyResult = await pool.query(spotifyQuery, foundTrackIds);
    
    // Create a map of track ID to Spotify ID
    const spotifyIdMap = new Map();
    for (const row of spotifyResult.rows) {
      spotifyIdMap.set(row.track_id, row.platform_id);
    }
    
    // Create new placeholders for the artist query
    const artistPlaceholders = foundTrackIds.map((_, idx) => `$${idx + 1}`).join(',');
    
    // Get artists for these tracks
    const artistQuery = `
      SELECT ta.track_id, a.id as "artistId", a.name as "artistName", ta.is_primary as "isPrimary"
      FROM tracks_to_artists ta
      JOIN artists a ON ta.artist_id = a.id
      WHERE ta.track_id IN (${artistPlaceholders})
      ORDER BY ta.track_id, ta.is_primary DESC, a.name
    `;
    
    const artistResult = await pool.query(artistQuery, foundTrackIds);
    
    // Group artists by track ID
    const artistsMap = new Map();
    for (const row of artistResult.rows) {
      if (!artistsMap.has(row.track_id)) {
        artistsMap.set(row.track_id, []);
      }
      artistsMap.get(row.track_id).push({
        id: row.artistId,
        name: row.artistName,
        isPrimary: row.isPrimary
      });
    }
    
    // Get album information for track albums
    const albumIds = trackResult.rows
      .filter(track => track.albumId)
      .map(track => track.albumId);
    
    let albumMap = new Map();
    if (albumIds.length > 0) {
      // Create placeholders for the album query
      const albumPlaceholders = albumIds.map((_, idx) => `$${idx + 1}`).join(',');
      
      const albumQuery = `
        SELECT a.id, a.title, a.cover_image as "coverImage"
        FROM albums a
        WHERE a.id IN (${albumPlaceholders})
      `;
      
      const albumResult = await pool.query(albumQuery, albumIds);
      
      // Create a map of album ID to album details
      for (const row of albumResult.rows) {
        albumMap.set(row.id, {
          id: row.id,
          name: row.title,
          images: row.coverImage ? [{ url: row.coverImage }] : []
        });
      }
    }
    
    // Assemble the final track objects
    const tracks = trackResult.rows.map(track => {
      const artists = artistsMap.get(track.id) || [];
      const spotifyId = spotifyIdMap.get(track.id);
      const album = track.albumId ? albumMap.get(track.albumId) : null;
      
      return {
        ...track,
        dbId: track.id, // Add explicit dbId field
        id: spotifyId || `local-${track.id}`, // Use Spotify ID as primary ID if available
        spotifyId, // Include the Spotify ID separately as well
        name: track.title, // Include the name property for compatibility
        title: track.title, // Keep the title property
        album: album || undefined, // Include album information
        album_cover_image: album?.images?.[0]?.url, // Include album cover image directly
        artists,
        // Format artist string for display
        artist: artists.map(a => a.name).join(', ')
      };
    });
    
    // Return the complete track details
    return res.json({
      success: true,
      tracks,
      stats: {
        requested: trackIds.length,
        found: tracks.length,
        notFound: trackIds.length - tracks.length
      }
    });
  } catch (error) {
    console.error('[DIRECT FINDER] Error in tracks by IDs lookup:', error);
    return res.status(500).json({ 
      success: false, 
      error: `Database error: ${error.message}` 
    });
  }
}

/**
 * Add routes for direct track finder to the Express app
 */
export function addDirectFinderRoutes(app: any) {
  app.get('/api/direct/find-by-title', findTrackByExactTitle);
  app.get('/api/direct/get-spotify-id', getTrackSpotifyId);
  app.post('/api/direct/find-by-titles', findTracksByTitles);
  app.post('/api/direct/tracks-by-ids', findTracksByIds);
  console.log('Direct track finder routes registered');
}