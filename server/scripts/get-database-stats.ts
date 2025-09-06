import { db } from '../db';

/**
 * Get and display database statistics
 * This is a standalone script that can be run from the command line
 */
async function getDatabaseStats() {
  try {
    // Get total tracks and release date statistics
    const releaseDateStatsQuery = `
      SELECT 
        COUNT(*) as total_tracks,
        COUNT(CASE WHEN release_date IS NOT NULL THEN 1 END) as tracks_with_dates,
        COUNT(CASE WHEN release_date IS NULL THEN 1 END) as tracks_without_dates,
        (COUNT(CASE WHEN release_date IS NOT NULL THEN 1 END) * 100.0 / COUNT(*))::numeric(5,2) as percent_complete
      FROM tracks
    `;
    
    const result = await db.execute(releaseDateStatsQuery);
    
    if (result.rows && result.rows.length > 0) {
      const stats = result.rows[0];
      console.log(`Total tracks: ${stats.total_tracks}`);
      console.log(`Tracks with dates: ${stats.tracks_with_dates} (${stats.percent_complete}%)`);
      console.log(`Tracks without dates: ${stats.tracks_without_dates} (${(100 - parseFloat(stats.percent_complete)).toFixed(2)}%)`);
      
      // Additional statistics for platforms and genres (if requested)
      if (process.argv.includes('--extended')) {
        // Get platform statistics
        const platformStatsQuery = `
          SELECT 
            platform, 
            COUNT(*) as count,
            (COUNT(*) * 100.0 / (SELECT COUNT(*) FROM track_platform_ids))::numeric(5,2) as percent
          FROM track_platform_ids
          GROUP BY platform
          ORDER BY count DESC
        `;
        
        const platformStats = await db.execute(platformStatsQuery);
        
        console.log("\nPlatform coverage:");
        platformStats.rows.forEach((platform: any) => {
          console.log(`- ${platform.platform}: ${platform.count} (${platform.percent}%)`);
        });
        
        // Get top genres
        const genreStatsQuery = `
          SELECT 
            g.name, 
            COUNT(*) as count
          FROM tracks_to_genres ttg
          JOIN genres g ON ttg.genre_id = g.id
          GROUP BY g.name
          ORDER BY count DESC
          LIMIT 10
        `;
        
        const genreStats = await db.execute(genreStatsQuery);
        
        console.log("\nTop 10 genres:");
        genreStats.rows.forEach((genre: any) => {
          console.log(`- ${genre.name}: ${genre.count} tracks`);
        });
      }
    } else {
      console.log('No statistics available');
    }
  } catch (error) {
    console.error('Error retrieving database statistics:', error);
  } finally {
    // End the database connection only if running as a standalone script
    if (process.argv[1].includes('get-database-stats.ts')) {
      console.log("\nClosing database connection...");
      try {
        const pool = db.$client;
        if (pool && typeof pool.end === 'function') {
          await pool.end();
        }
      } catch (err) {
        console.error("Error closing database connection:", err);
      }
      process.exit(0);
    }
  }
}

// Run the function if this script is executed directly
if (process.argv[1].includes('get-database-stats.ts')) {
  getDatabaseStats();
}

export { getDatabaseStats };