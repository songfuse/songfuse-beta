import { db } from './db';

/**
 * This script fixes the track-song relationships for the latest playlist
 * by matching the Spotify IDs in the songs table with track_platform_ids
 */
async function fixLatestPlaylist() {
  try {
    // Target the latest playlist (ID: 229)
    const playlistId = 229;
    
    console.log(`Fixing playlist #${playlistId}...`);
    
    // Get all songs for this playlist
    const songs = await db.execute(`
      SELECT id, title, spotify_id
      FROM songs
      WHERE playlist_id = ${playlistId}
      ORDER BY position
    `);
    
    if (!songs.rows || songs.rows.length === 0) {
      console.log(`No songs found for playlist #${playlistId}`);
      return;
    }
    
    console.log(`Found ${songs.rows.length} songs in playlist`);
    
    // For each song, find corresponding track and create relationship
    let relationshipsCreated = 0;
    
    for (const song of songs.rows) {
      console.log(`\nProcessing song #${song.id}: "${song.title}"`);
      console.log(`  Spotify ID: ${song.spotify_id}`);
      
      // Find corresponding track ID for this Spotify ID
      const trackResult = await db.execute(`
        SELECT track_id, platform_id
        FROM track_platform_ids
        WHERE platform = 'spotify' AND platform_id = '${song.spotify_id}'
        LIMIT 1
      `);
      
      if (!trackResult.rows || trackResult.rows.length === 0) {
        console.log(`  ⚠ No matching track found for Spotify ID: ${song.spotify_id}`);
        continue;
      }
      
      const trackId = trackResult.rows[0].track_id;
      console.log(`  ✓ Match found! Internal track ID: ${trackId}`);
      
      // Create relationship between song and track
      try {
        await db.execute(`
          INSERT INTO tracks_songs (song_id, track_id)
          VALUES (${song.id}, ${trackId})
          ON CONFLICT DO NOTHING
        `);
        
        console.log(`  ✓ Added relation between song and track`);
        relationshipsCreated++;
      } catch (error) {
        console.error(`  ❌ Failed to create relationship:`, error);
      }
    }
    
    console.log(`\nSummary: Created ${relationshipsCreated} song-track relationships`);
    
    // Verify the fix worked
    const verification = await db.execute(`
      SELECT ts.song_id, ts.track_id, s.title as song_title, t.title as track_title
      FROM tracks_songs ts
      JOIN songs s ON ts.song_id = s.id
      JOIN tracks t ON ts.track_id = t.id
      WHERE s.playlist_id = ${playlistId}
    `);
    
    if (!verification.rows || verification.rows.length === 0) {
      console.log(`❌ Verification failed - no relationships found after fix`);
    } else {
      console.log(`\n✅ Fix verified! Found ${verification.rows.length} relationships:`);
      
      verification.rows.forEach((row, index) => {
        console.log(`${index + 1}. Song "${row.song_title}" (ID: ${row.song_id}) → Track "${row.track_title}" (ID: ${row.track_id})`);
      });
    }
    
  } catch (error) {
    console.error('Error fixing playlist:', error);
  }
}

// Fix the playlist
fixLatestPlaylist().then(() => process.exit(0));