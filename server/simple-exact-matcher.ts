/**
 * Simple Exact Track Matcher
 * 
 * This file contains a direct, no-frills implementation of finding tracks by 
 * exact title match. No fuzzy matching, no substitution.
 */
import { pool } from './db';

/**
 * Find tracks by their exact titles using a direct SQL query
 * If a track isn't found, it won't be included in the results
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