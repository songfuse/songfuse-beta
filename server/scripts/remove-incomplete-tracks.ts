/**
 * Script to remove tracks missing essential information (duration or album_id)
 * 
 * This script:
 * 1. Identifies tracks that are missing duration or album_id
 * 2. Checks if these tracks are used in any playlists before removal
 * 3. Removes only tracks that are not associated with playlists
 * 4. Provides statistics on the cleanup operation
 */

import { db, pool } from "../db";
import { eq, isNull, or, inArray, sql } from "drizzle-orm";
import { tracks } from "@shared/schema";

async function removeIncompleteTracks() {
  console.log("🔍 Starting incomplete tracks cleanup process...");
  
  try {
    // Get count of all tracks using direct SQL for compatibility
    const totalTracksResult = await pool.query("SELECT COUNT(*) FROM tracks");
    const totalTracks = parseInt(totalTracksResult.rows[0].count);
    
    console.log(`📊 Total tracks in database: ${totalTracks}`);
    
    // Find tracks with missing essential information
    const incompleteTracksResult = await pool.query(`
      SELECT id, title 
      FROM tracks 
      WHERE duration IS NULL OR album_id IS NULL
    `);
    
    const incompleteTracks = incompleteTracksResult.rows;
    console.log(`🚫 Found ${incompleteTracks.length} tracks with missing duration or album information`);
    
    if (incompleteTracks.length === 0) {
      console.log("✅ No incomplete tracks found. Database is clean!");
      return;
    }

    // Get the IDs of incomplete tracks
    const incompleteTrackIds = incompleteTracks.map(track => track.id);
    
    // Check if any of these tracks are used in playlists
    const tracksInPlaylistsResult = await pool.query(`
      SELECT DISTINCT track_id
      FROM playlist_tracks
      WHERE track_id IN (${incompleteTrackIds.join(',')})
    `);
    
    // If no tracks are in playlists, rows might be undefined
    const tracksInPlaylists = tracksInPlaylistsResult.rows 
      ? tracksInPlaylistsResult.rows.map(row => row.track_id) 
      : [];
      
    console.log(`⚠️ ${tracksInPlaylists.length} incomplete tracks are currently used in playlists and will not be removed`);
    
    // Filter out tracks that are used in playlists
    const tracksToRemove = incompleteTrackIds.filter(id => !tracksInPlaylists.includes(id));
    console.log(`🗑️ Will remove ${tracksToRemove.length} tracks that are incomplete and not used in playlists`);
    
    if (tracksToRemove.length === 0) {
      console.log("⚠️ All incomplete tracks are used in playlists. No tracks will be removed.");
      return;
    }
    
    // Perform deletion in batches to avoid locking the database for too long
    const BATCH_SIZE = 500;
    let deletedCount = 0;
    
    for (let i = 0; i < tracksToRemove.length; i += BATCH_SIZE) {
      const batch = tracksToRemove.slice(i, i + BATCH_SIZE);
      
      // Execute deletion using direct SQL for better compatibility
      const deleteQuery = `
        DELETE FROM tracks
        WHERE id IN (${batch.join(',')})
      `;
      
      await pool.query(deleteQuery);
      deletedCount += batch.length;
      
      console.log(`🔄 Deleted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(tracksToRemove.length / BATCH_SIZE)} (${batch.length} tracks)`);
    }
    
    // Final statistics
    console.log(`\n✅ Cleanup complete!`);
    console.log(`📊 Summary:`);
    console.log(`   - Total tracks before cleanup: ${totalTracks}`);
    console.log(`   - Incomplete tracks found: ${incompleteTracks.length}`);
    console.log(`   - Tracks used in playlists (preserved): ${tracksInPlaylists.length}`);
    console.log(`   - Tracks removed: ${deletedCount}`);
    console.log(`   - Total tracks after cleanup: ${totalTracks - deletedCount}`);
    
  } catch (error) {
    console.error("❌ Error during incomplete tracks cleanup:", error);
    console.error(error);
  } finally {
    // Close the database connection
    await pool.end();
  }
}

// Execute the script
removeIncompleteTracks().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});