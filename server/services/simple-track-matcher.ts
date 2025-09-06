/**
 * Simple Track Matcher Service
 * 
 * This service uses direct SQL queries to find exact matches for tracks by title.
 * No fuzzy matching, no complex logic - just direct database lookups.
 */
import { pool } from '../db';

/**
 * Find tracks by their exact titles
 * If a track isn't found, it's excluded from the results
 */
export async function findTracksByExactTitles(titles: string[]): Promise<any[]> {
  try {
    // Simple, direct query - title must match exactly
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
    return result.rows;
  } catch (error) {
    console.error('Error in findTracksByExactTitles:', error);
    return [];
  }
}

/**
 * Find tracks from a list of AI recommendations using strict exact title matching
 * If a track isn't found, it's skipped - no substitutions
 */
export async function findRecommendedTracks(
  recommendations: Array<{ title: string; artist: string }>,
  limit = 24
): Promise<{ tracks: any[]; matchedCount: number; totalRequested: number }> {
  try {
    console.log('Finding tracks with simple exact title matching');
    
    // Extract titles from recommendations
    const titles = recommendations.map(rec => rec.title);
    console.log(`Looking for these exact titles:`, titles);
    
    // Get tracks with exact title matches
    const matchedTracks = await findTracksByExactTitles(titles);
    console.log(`Found ${matchedTracks.length} exact matches out of ${titles.length} requested titles`);
    
    // Map matches to their original recommendations by matching titles
    const foundTracks = matchedTracks.slice(0, limit);
    
    return {
      tracks: foundTracks,
      matchedCount: foundTracks.length,
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