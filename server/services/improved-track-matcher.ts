/**
 * Improved Track Matcher Service
 * 
 * This service provides more reliable track matching capabilities
 * with direct SQL queries to ensure we find matches consistently.
 */
import { pool } from '../db';

/**
 * Find tracks by their exact titles using a direct SQL query.
 * This approach bypasses any ORM layers that might be causing issues.
 * 
 * @param titles Array of track titles to search for
 * @returns Array of matching tracks with Spotify IDs
 */
export async function findTracksByExactTitles(titles: string[]): Promise<any[]> {
  try {
    console.log(`Searching for ${titles.length} tracks by exact title`);
    console.log(`Titles: ${titles.join(', ')}`);
    
    // Direct SQL query that looks for exact title matches
    // and includes the Spotify ID if available
    const query = `
      SELECT t.*, 
             p.platform_id AS spotify_id,
             p.platform_url AS spotify_url
      FROM tracks t
      LEFT JOIN track_platform_ids p ON t.id = p.track_id AND p.platform = 'spotify'
      WHERE t.title = ANY($1)
      ORDER BY t.popularity DESC
    `;
    
    const result = await pool.query(query, [titles]);
    console.log(`Found ${result.rows.length} tracks with exact title matches`);
    
    return result.rows;
  } catch (error) {
    console.error('Error running exact title track search:', error);
    return [];
  }
}

/**
 * Find tracks by multiple titles and artists at once.
 * Useful for batch processing of song recommendations from AI.
 * 
 * @param songs Array of song objects with title and artist
 * @returns Object mapping song IDs to track info
 */
export async function findTracksByTitlesAndArtists(
  songs: Array<{ id: string; title: string; artist: string }>
): Promise<Record<string, { track: any; spotifyId: string | null }>> {
  try {
    console.log(`Searching for ${songs.length} songs by title and artist`);
    
    // Extract titles for direct exact match search
    const titles = songs.map(song => song.title);
    const exactMatches = await findTracksByExactTitles(titles);
    
    // Build a map of title -> tracks for fast lookups
    const titleToTracks: Record<string, any[]> = {};
    exactMatches.forEach(track => {
      if (!titleToTracks[track.title]) {
        titleToTracks[track.title] = [];
      }
      titleToTracks[track.title].push(track);
    });
    
    // Map each song to a matched track
    const result: Record<string, { track: any; spotifyId: string | null }> = {};
    
    for (const song of songs) {
      const matchedTracks = titleToTracks[song.title] || [];
      
      // Use exact title match for now - later we can extend this to filter by artist too
      const match = matchedTracks.length > 0 ? matchedTracks[0] : null;
      
      if (match) {
        result[song.id] = {
          track: match,
          spotifyId: match.spotify_id || null
        };
      }
    }
    
    console.log(`Matched ${Object.keys(result).length} of ${songs.length} songs`);
    return result;
  } catch (error) {
    console.error('Error finding tracks by titles and artists:', error);
    return {};
  }
}

/**
 * Get track IDs for songs recommended by OpenAI.
 * This function is used in the main playlist creation flow.
 * 
 * @param songs Array of songs from OpenAI
 * @returns Array of track IDs with Spotify IDs
 */
export async function getTrackIdsForSongs(
  songs: Array<{ id: string; title: string; artist: string }>
): Promise<Array<{ songId: string; trackId: number | null; spotifyId: string | null }>> {
  try {
    // Find tracks for all songs at once
    const songToTrackMap = await findTracksByTitlesAndArtists(songs);
    
    // Map each song to a track ID
    return songs.map(song => {
      const match = songToTrackMap[song.id];
      return {
        songId: song.id,
        trackId: match?.track?.id || null,
        spotifyId: match?.spotifyId || null
      };
    });
  } catch (error) {
    console.error('Error getting track IDs for songs:', error);
    return songs.map(song => ({
      songId: song.id,
      trackId: null,
      spotifyId: null
    }));
  }
}