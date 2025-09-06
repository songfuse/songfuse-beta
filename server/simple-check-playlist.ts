import { db } from './db';
import { playlistTracks, tracks } from "../shared/schema";
import { eq } from "drizzle-orm";

async function checkPlaylist(playlistId: number) {
  try {
    console.log(`\nChecking Playlist #${playlistId}`);
    console.log('================================');
    
    // Get all tracks in the playlist
    const results = await db
      .select({
        position: playlistTracks.position,
        trackId: playlistTracks.trackId,
        title: tracks.title,
      })
      .from(playlistTracks)
      .innerJoin(tracks, eq(playlistTracks.trackId, tracks.id))
      .where(eq(playlistTracks.playlistId, playlistId))
      .orderBy(playlistTracks.position);
    
    console.log(`Track count: ${results.length}`);
    
    if (results.length > 0) {
      console.log('\nTracks in playlist:');
      results.forEach((track, i) => {
        console.log(`${i+1}. ${track.title} (ID: ${track.trackId})`);
      });
      
      // Check if TOPLINE is in the list
      const toplineTrack = results.find(track => 
        track.title.includes('TOPLINE')
      );
      
      console.log('\nTOPLINE check:');
      if (toplineTrack) {
        console.log(`✓ Found: ${toplineTrack.title}`);
      } else {
        console.log('❌ TOPLINE not found in playlist');
      }
    }
  } catch (error) {
    console.error('Error checking playlist:', error);
  }
}

// Check playlist #224
checkPlaylist(224).then(() => process.exit(0));