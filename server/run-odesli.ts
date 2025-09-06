/**
 * Run the Odesli platform resolution process
 * This script can be executed to resolve platform IDs for all tracks or a specific track
 * 
 * Usage:
 * - Run for all tracks: ts-node server/run-odesli.ts
 * - Run for a specific track: ts-node server/run-odesli.ts <trackId>
 */
import { queueExistingTracks } from './scripts/resolve-track-platforms';
import { db } from './db';
import { sql } from 'drizzle-orm';

async function runOdesliResolution() {
  try {
    // Check if a specific track ID was provided
    const trackId = process.argv[2];
    
    if (trackId) {
      // If track ID is provided, process just that track
      console.log(`Processing platform resolution for track ID: ${trackId}`);
      
      // First verify the track exists
      const [track] = await db.execute(sql`
        SELECT id, title FROM tracks WHERE id = ${trackId}
      `).then(result => result.rows);
      
      if (!track) {
        console.error(`Error: Track with ID ${trackId} not found`);
        process.exit(1);
      }
      
      console.log(`Found track: ${track.title}`);
      
      // Get the Spotify ID for this track
      const [spotifyLink] = await db.execute(sql`
        SELECT "platformId" FROM track_platform_ids
        WHERE "trackId" = ${trackId} AND platform = 'spotify'
      `).then(result => result.rows);
      
      if (!spotifyLink) {
        console.error(`Error: No Spotify ID found for track ${trackId}`);
        process.exit(1);
      }
      
      console.log(`Found Spotify ID: ${spotifyLink.platformId}`);
      
      // Call the specific function to resolve this track
      // This would need to be added to the resolve-track-platforms module
      console.log("Individual track resolution not implemented yet");
      console.log("Please use the queue process for all tracks instead");
      
    } else {
      // Otherwise, queue all tracks for processing
      console.log("Starting platform resolution for all tracks");
      
      const result = await queueExistingTracks();
      console.log(`Started Odesli resolution task: ${result.taskId} (${result.status})`);
      console.log("Process is running in the background. Check the logs for updates.");
    }
  } catch (error) {
    console.error("Error running Odesli resolution:", error);
    process.exit(1);
  }
}

runOdesliResolution();