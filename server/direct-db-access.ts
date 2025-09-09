/**
 * Direct database access API endpoints to bypass ORM for diagnostic purposes
 * These routes are used for emergency access when the regular ORM-based routes fail
 */

import { Request, Response } from 'express';
import { Pool } from '@neondatabase/serverless';
import ws from 'ws';
import * as spotify from "./spotify-fixed";
import { storage } from './storage';

// Configure Neon for WebSocket support
import { neonConfig } from '@neondatabase/serverless';
neonConfig.webSocketConstructor = ws;

// Create the connection pool
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL || ''
});

/**
 * Get a playlist directly from the database with its tracks
 * This function uses direct SQL queries without any ORM to fetch playlist data
 */
export async function getPlaylistByIdDirect(req: Request, res: Response) {
  console.log('[DIRECT DB] Getting playlist with direct SQL queries');
  const { id } = req.params;
  const playlistId = Number(id);
  
  if (isNaN(playlistId)) {
    return res.status(400).json({ error: 'Invalid playlist ID format' });
  }

  // Get a client from the pool
  let client = null;
  try {
    console.log('[DIRECT DB] Connecting to database...');
    client = await pool.connect();
    console.log('[DIRECT DB] Connected successfully');

    // First query: get the playlist
    const playlistQuery = `
      SELECT p.*
      FROM playlists p
      WHERE p.id = $1
    `;
    console.log('[DIRECT DB] Executing playlist query:', playlistQuery.replace(/\s+/g, ' ').trim());
    
    const playlistResult = await client.query(playlistQuery, [playlistId]);
    if (playlistResult.rows.length === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    
    const playlist = playlistResult.rows[0];
    console.log('[DIRECT DB] Found playlist:', playlist.title, 'ID:', playlist.id);

    // Second query: get the tracks for this playlist with Spotify IDs and join with albums
    const tracksQuery = `
      SELECT 
        t.id,
        t.title,
        t.preview_url,
        t.explicit,
        t.duration * 1000 AS duration_ms,
        t.danceability,
        t.energy,
        t.tempo,
        t.valence,
        t.acousticness,
        t.instrumentalness,
        t.liveness,
        t.speechiness,
        pt.position,
        (SELECT platform_id FROM track_platform_ids 
         WHERE track_id = t.id AND platform = 'spotify' 
         LIMIT 1) AS spotify_id,
        (SELECT platform_id FROM track_platform_ids 
         WHERE track_id = t.id AND platform = 'youtube' 
         LIMIT 1) AS youtube_id,
        alb.title AS album_name,
        alb.cover_image AS album_cover_image,
        COALESCE(
          (SELECT 
            json_agg(json_build_object('id', a.id, 'name', a.name))
            FROM tracks_to_artists tta 
            JOIN artists a ON tta.artist_id = a.id
            WHERE tta.track_id = t.id
          ), 
          '[]'::json
        ) AS artists_json
      FROM playlist_tracks pt
      JOIN tracks t ON pt.track_id = t.id
      LEFT JOIN albums alb ON t.album_id = alb.id
      WHERE pt.playlist_id = $1
      ORDER BY pt.position ASC
    `;
    console.log('[DIRECT DB] Executing tracks query:', tracksQuery.replace(/\s+/g, ' ').trim());
    
    const tracksResult = await client.query(tracksQuery, [playlistId]);
    const tracks = tracksResult.rows;
    console.log('[DIRECT DB] Found', tracks.length, 'tracks for playlist');

    // Format the tracks with correct properties to match UI expectations
    const formattedTracks = tracks.map(track => {
      // Get artists array from the JSON field or create a default one
      let artists = [];
      
      try {
        // If we have artists_json data, use it
        if (track.artists_json) {
          artists = track.artists_json;
        } else {
          // Fallback to single artist
          const artistName = track.artist_name || 'Unknown Artist';
          artists = [{ id: 0, name: artistName }];
        }
      } catch (e) {
        // Fallback to empty array with unknown artist
        artists = [{ id: 0, name: 'Unknown Artist' }];
        console.log('[DIRECT DB] Error parsing artists:', e);
      }
      
      // Format to match expected format in the front-end
      const spotifyId = track.spotify_id || null;
      
      // Format to match expected format in the front-end with ALL possible fields our UI needs
      return {
        // Primary identifiers
        id: spotifyId || `db-${track.id}`, // Use spotifyId as the main id for Spotify embed, or format db ID if no Spotify ID
        dbId: track.id, // Original database ID
        
        // Track metadata fields - include both .name (Spotify format) and .title (our DB format)
        name: track.title || 'Unknown Title',
        title: track.title || 'Unknown Title',
        position: track.position,
        
        // Artist information - include all formats to prevent UI errors
        artists: artists,
        artist: artists.map(a => a.name).join(", "), // Add artist field for compatibility
        artists_json: artists, // Keep original format too 
        
        // Spotify identifiers
        spotifyId: spotifyId,
        spotify_id: spotifyId, // Include both formats
        
        // Album data with multiple formats
        album: { 
          name: track.album_name || 'Unknown Album',
          images: [
            { 
              // Use the album cover image from our database if available, otherwise use a placeholder
              url: track.album_cover_image || 
                'https://i.scdn.co/image/ab67616d0000b273e319baafd16e84f0408af2a0'
            }
          ]
        },
        album_name: track.album_name || 'Unknown Album', // Direct property for easier access
        album_cover_image: track.album_cover_image || null, // Direct property for easier access
        
        // Add platforms for the SimpleSpotifyEmbed and SimpleYouTubeEmbed components
        platforms: {
          spotify: {
            id: spotifyId
          },
          ...(track.youtube_id ? {
            youtube: {
              id: track.youtube_id
            }
          } : {})
        },
        
        // Also add YouTube ID in alternate format for backwards compatibility
        youtube: track.youtube_id ? { id: track.youtube_id } : null,
        
        // Audio properties - duration is already in milliseconds from SQL query
        duration_ms: track.duration_ms || 0,
        explicit: track.explicit || false,
        preview_url: track.preview_url || null,
        
        // Include additional audio features if available
        audio_features: {
          danceability: track.danceability || 0,
          energy: track.energy || 0,
          tempo: track.tempo || 0,
          valence: track.valence || 0,
          acousticness: track.acousticness || 0,
          instrumentalness: track.instrumentalness || 0,
          liveness: track.liveness || 0,
          speechiness: track.speechiness || 0
        },
        
        // Add direct audio features for easier access
        danceability: track.danceability || 0,
        energy: track.energy || 0,
        tempo: track.tempo || 0,
        valence: track.valence || 0,
        acousticness: track.acousticness || 0,
        instrumentalness: track.instrumentalness || 0,
        liveness: track.liveness || 0,
        speechiness: track.speechiness || 0
      };
    });

    // We've removed Spotify cover image URL fetching to prioritize our database images
    // User requirement: Generated cover images must always be loaded from our database, not Spotify
    const spotifyImageUrl = null;
    
    // Log database cover image
    if (playlist.cover_image_url) {
      console.log(`[DIRECT DB] Using database cover image for playlist ${playlist.id}: ${playlist.cover_image_url}`);
    } else {
      console.log(`[DIRECT DB] No cover image found in database for playlist ${playlist.id}`);
    }

    // Enhanced article data logging for debugging
    if (playlist.article_title || playlist.article_link) {
      console.log(`[DIRECT DB] Playlist ${playlist.id} has article data:`, {
        article_title: playlist.article_title,
        article_link: playlist.article_link,
        title_type: typeof playlist.article_title,
        link_type: typeof playlist.article_link
      });
    } else {
      console.log(`[DIRECT DB] Playlist ${playlist.id} has no article data`);
    }

    // Get article data with proper null handling
    const articleTitle = playlist.article_title ? String(playlist.article_title) : null;
    const articleLink = playlist.article_link ? String(playlist.article_link) : null;

    // Log the processed article data
    console.log(`[DIRECT DB] Processed article data for playlist ${playlist.id}:`, { 
      articleTitle, 
      articleLink 
    });

    // Return the playlist with the formatted tracks
    const responsePlaylist = {
      id: playlist.id,
      title: playlist.title,
      description: playlist.description,
      coverImage: playlist.cover_image_url, // Match the actual column name in the DB
      spotifyId: playlist.spotify_id,
      spotifyUrl: playlist.spotify_url,
      spotifyImageUrl, // Add the spotifyImageUrl field
      userId: playlist.user_id,
      createdAt: playlist.created_at,
      isPublic: playlist.is_public || false,
      articleTitle, // Use the explicitly processed value
      articleLink, // Use the explicitly processed value
      tracks: formattedTracks,
      isCurrentUserOwner: req.query.userId ? Number(req.query.userId) === playlist.user_id : false
    };

    console.log('[DIRECT DB] Successfully returning playlist with', formattedTracks.length, 'tracks');
    return res.json(responsePlaylist);
  } catch (error) {
    console.error('[DIRECT DB] Database error:', error);
    return res.status(500).json({ 
      error: 'Database error occurred',
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  } finally {
    // Release the client back to the pool
    if (client) {
      client.release();
      console.log('[DIRECT DB] Database client released');
    }
  }
}

/**
 * Test database connection and return diagnostic information
 */
export async function testDatabaseConnection(req: Request, res: Response) {
  let client = null;
  try {
    console.log('[DIRECT DB] Testing database connection...');
    client = await pool.connect();
    console.log('[DIRECT DB] Connected successfully');
    
    // Get database version
    const versionResult = await client.query('SELECT version()');
    
    // Get some basic statistics
    const tableCountsQuery = `
      SELECT 
        (SELECT COUNT(*) FROM playlists) as playlist_count,
        (SELECT COUNT(*) FROM tracks) as track_count,
        (SELECT COUNT(*) FROM playlist_tracks) as playlist_track_count
    `;
    const statsResult = await client.query(tableCountsQuery);
    
    return res.json({
      status: 'connected',
      version: versionResult.rows[0].version,
      stats: statsResult.rows[0],
      connection: {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount
      }
    });
  } catch (error) {
    console.error('[DIRECT DB] Connection test failed:', error);
    return res.status(500).json({ 
      status: 'error',
      error: 'Failed to connect to the database',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    if (client) {
      client.release();
      console.log('[DIRECT DB] Test connection client released');
    }
  }
}

/**
 * Add these routes to the Express application
 */
export function addDirectDbRoutes(app: any) {
  app.get('/api/direct-db/playlist/:id', getPlaylistByIdDirect);
  app.get('/api/direct-db/test', testDatabaseConnection);
  
  // Add the main /api/playlist/:id route to use our direct DB access function
  // This will override any existing route with the same path
  app.get('/api/playlist/:id', getPlaylistByIdDirect);
  
  console.log('Direct DB access routes registered (including main playlist endpoint)');
  return app;
}