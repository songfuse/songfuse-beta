/**
 * Improved Song Matcher Service
 * 
 * This service provides more reliable matching for songs recommended by AI,
 * using direct SQL queries to ensure we find exact matches consistently.
 */
import * as schema from "@shared/schema";
import { findTracksByExactTitles, findTracksByTitlesAndArtists } from './improved-track-matcher';
import { pool } from '../db';

/**
 * Find tracks from a list of AI-recommended songs using reliable direct SQL queries
 * This is a drop-in replacement for the existing song-matcher functions
 */
export async function findRecommendedTracks(
  recommendations: Array<{ title: string; artist: string; genre?: string }>,
  limit = 24,
  avoidExplicit = false
): Promise<{ 
  tracks: schema.SpotifyTrack[];
  matchedCount: number;
  totalRequested: number;
}> {
  try {
    console.log('Finding tracks with improved SQL-based exact matcher');
    console.log(`Looking for ${recommendations.length} tracks, limit: ${limit}, avoidExplicit: ${avoidExplicit}`);
    
    // Log all recommendations for debugging
    recommendations.forEach((rec, i) => {
      console.log(`${i+1}. "${rec.title}" by ${rec.artist}${rec.genre ? ` (${rec.genre})` : ''}`);
    });
    
    // Step 1: Try to find tracks by exact titles first
    const titlesToFind = recommendations.map(rec => rec.title);
    const matchedTracksRaw = await findTracksByExactTitles(titlesToFind);
    
    console.log(`Found ${matchedTracksRaw.length} exact title matches out of ${titlesToFind.length} requested titles`);
    
    // Filter out explicit tracks if needed
    let filteredTracks = avoidExplicit 
      ? matchedTracksRaw.filter(track => !track.explicit)
      : matchedTracksRaw;
      
    if (avoidExplicit) {
      console.log(`Filtered out ${matchedTracksRaw.length - filteredTracks.length} explicit tracks`);
    }
    
    // Convert raw database tracks to Spotify-like format
    const spotifyTracks = await Promise.all(
      filteredTracks.slice(0, limit).map(track => dbTrackToSpotifyTrack(track))
    );
    
    return {
      tracks: spotifyTracks,
      matchedCount: spotifyTracks.length,
      totalRequested: recommendations.length
    };
  } catch (error) {
    console.error('Error finding recommended tracks:', error);
    return {
      tracks: [],
      matchedCount: 0,
      totalRequested: recommendations.length
    };
  }
}

/**
 * Convert a database track to a Spotify-like track format
 * This is a simplified version of the conversion function in db.ts
 */
async function dbTrackToSpotifyTrack(track: any): Promise<schema.SpotifyTrack> {
  try {
    // Get artist information
    const query = `
      SELECT a.name 
      FROM artists a
      JOIN tracks_to_artists ta ON a.id = ta.artist_id
      WHERE ta.track_id = $1
      ORDER BY ta.order
    `;
    
    const artistResult = await pool.query(query, [track.id]);
    const artists = artistResult.rows.map(row => ({
      name: row.name
    }));
    
    // Get platform urls
    const platformsQuery = `
      SELECT platform, platform_id, platform_url
      FROM track_platform_ids
      WHERE track_id = $1
    `;
    
    const platformsResult = await pool.query(platformsQuery, [track.id]);
    
    // Map to easier access format
    const platformUrls: Record<string, string> = {};
    const platformIds: Record<string, string> = {};
    
    platformsResult.rows.forEach(row => {
      if (row.platform_url) {
        platformUrls[row.platform] = row.platform_url;
      }
      if (row.platform_id) {
        platformIds[row.platform] = row.platform_id;
      }
    });
    
    // Create the Spotify-like track format
    return {
      id: track.id.toString(),
      name: track.title,
      artists: artists,
      album: {
        name: track.album_name || "",
        images: []
      },
      duration_ms: track.duration || 0,
      explicit: !!track.explicit,
      popularity: track.popularity || 0,
      preview_url: null,
      external_urls: {
        spotify: platformUrls.spotify || ""
      },
      uri: platformIds.spotify ? `spotify:track:${platformIds.spotify}` : "",
      platformUrls
    };
  } catch (error) {
    console.error('Error converting DB track to Spotify format:', error);
    
    // Return a basic placeholder track
    return {
      id: track.id.toString(),
      name: track.title,
      artists: [{ name: "Unknown Artist" }],
      album: {
        name: "",
        images: []
      },
      duration_ms: 0,
      explicit: false,
      popularity: 0,
      preview_url: null,
      external_urls: {
        spotify: ""
      },
      uri: "",
      platformUrls: {}
    };
  }
}