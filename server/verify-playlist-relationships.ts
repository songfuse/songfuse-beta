import { db, pool } from './db';

/**
 * This script verifies that song-track relationships are being properly created
 * for all songs in any given playlist, or for the most recent playlist if none is specified.
 */
async function verifyPlaylistRelationships(playlistId?: number) {
  try {
    // If no playlist ID was provided, get the most recent playlist
    if (!playlistId) {
      console.log("No playlist ID provided, checking the most recent playlist");
      
      const latestPlaylistResult = await pool.query(`
        SELECT id, title, created_at FROM playlists
        ORDER BY created_at DESC
        LIMIT 1
      `);
      
      if (!latestPlaylistResult.rows || latestPlaylistResult.rows.length === 0) {
        console.log("No playlists found in the database");
        return;
      }
      
      playlistId = latestPlaylistResult.rows[0].id;
      const title = latestPlaylistResult.rows[0].title;
      const createdAt = latestPlaylistResult.rows[0].created_at;
      
      console.log(`Latest playlist: #${playlistId} - "${title}" (created: ${createdAt})`);
    }
    
    // Get all songs for this playlist
    console.log(`\nGetting songs for playlist #${playlistId}...`);
    const songsResult = await pool.query(`
      SELECT id, title, spotify_id, position
      FROM songs
      WHERE playlist_id = ${playlistId}
      ORDER BY position
    `);
    
    if (!songsResult.rows || songsResult.rows.length === 0) {
      console.log(`No songs found for playlist #${playlistId}`);
      return;
    }
    
    console.log(`Found ${songsResult.rows.length} songs in playlist #${playlistId}`);
    
    // Check for song-track relationships
    let relationshipCount = 0;
    let missingRelationshipCount = 0;
    let fixedRelationshipCount = 0;
    
    for (const song of songsResult.rows) {
      console.log(`\nChecking song #${song.id}: "${song.title}" (position: ${song.position})`);
      console.log(`  Spotify ID: ${song.spotify_id}`);
      
      // Check if there's a track-song relationship
      const relationshipResult = await pool.query(`
        SELECT ts.track_id, t.title
        FROM tracks_songs ts
        JOIN tracks t ON ts.track_id = t.id
        WHERE ts.song_id = ${song.id}
      `);
      
      if (relationshipResult.rows && relationshipResult.rows.length > 0) {
        relationshipCount++;
        const trackId = relationshipResult.rows[0].track_id;
        const trackTitle = relationshipResult.rows[0].title;
        console.log(`  ✓ Relationship exists: Track #${trackId} - "${trackTitle}"`);
      } else {
        missingRelationshipCount++;
        console.log(`  ✗ No relationship found for this song`);
        
        // Try to fix by finding the corresponding track
        if (song.spotify_id) {
          console.log(`  Attempting to fix by creating relationship...`);
          const trackResult = await pool.query(`
            SELECT track_id
            FROM track_platform_ids
            WHERE platform = 'spotify' AND platform_id = '${song.spotify_id}'
            LIMIT 1
          `);
          
          if (trackResult.rows && trackResult.rows.length > 0) {
            const trackId = trackResult.rows[0].track_id;
            console.log(`  Found matching track #${trackId} for Spotify ID: ${song.spotify_id}`);
            
            // Create the relationship
            try {
              await pool.query(`
                INSERT INTO tracks_songs (song_id, track_id)
                VALUES (${song.id}, ${trackId})
                ON CONFLICT DO NOTHING
              `);
              
              console.log(`  ✓ Created missing relationship: song ${song.id} → track ${trackId}`);
              fixedRelationshipCount++;
            } catch (error) {
              console.error(`  ✗ Failed to create relationship:`, error);
            }
          } else {
            console.log(`  ✗ No matching track found for Spotify ID: ${song.spotify_id}`);
          }
        }
      }
    }
    
    // Summary
    console.log(`\nRelationship Summary for Playlist #${playlistId}:`);
    console.log(`  Total songs: ${songsResult.rows.length}`);
    console.log(`  Songs with track relationships: ${relationshipCount}`);
    console.log(`  Songs missing track relationships: ${missingRelationshipCount}`);
    console.log(`  Relationships fixed during verification: ${fixedRelationshipCount}`);
    
    // Calculate percentage
    const successPercentage = Math.round((relationshipCount / songsResult.rows.length) * 100);
    console.log(`  Success rate: ${successPercentage}%`);
    
    if (successPercentage === 100) {
      console.log(`\n✅ All songs have track relationships - the fix is working!`);
    } else if (fixedRelationshipCount > 0) {
      console.log(`\n⚠️ Some relationships were missing but have been fixed now.`);
    } else if (missingRelationshipCount > 0) {
      console.log(`\n❌ Some relationships are still missing - the fix may not be working.`);
    }
    
  } catch (error) {
    console.error("Error verifying playlist relationships:", error);
  }
}

// Run the verification for the latest playlist by default
verifyPlaylistRelationships().then(() => process.exit(0));