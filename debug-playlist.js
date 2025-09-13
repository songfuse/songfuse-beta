import { generateSongRecommendations } from './server/openai.js';
import { getAllDatabaseGenres } from './server/db.js';
import { findTracksByTitleArtist } from './server/db.js';

async function debugPlaylist() {
  try {
    console.log('=== DEBUGGING PLAYLIST CREATION ===');
    
    // Step 1: Get AI recommendations
    console.log('Step 1: Getting AI recommendations...');
    const genres = await getAllDatabaseGenres();
    const recommendations = await generateSongRecommendations(
      "create a test playlist", 
      genres
    );
    
    console.log('AI generated', recommendations.songs.length, 'songs');
    console.log('First 5 songs:', recommendations.songs.slice(0, 5).map(s => s.title));
    
    // Step 2: Search for tracks
    console.log('\nStep 2: Searching for tracks...');
    const trackResult = await findTracksByTitleArtist(
      recommendations.songs.slice(0, 10),
      24,
      false
    );
    
    console.log('Track search result:');
    console.log('- tracks.length:', trackResult.tracks.length);
    console.log('- dbTracks.length:', trackResult.dbTracks.length);
    console.log('- First track:', trackResult.tracks[0] ? {
      name: trackResult.tracks[0].name,
      id: trackResult.tracks[0].id,
      artists: trackResult.tracks[0].artists,
      duration_ms: trackResult.tracks[0].duration_ms
    } : 'No tracks found');
    
    // Step 3: Simulate the playlist creation logic
    console.log('\nStep 3: Simulating playlist creation...');
    let initialTracks = trackResult.tracks;
    console.log('initialTracks.length:', initialTracks.length);
    
    let tracks = initialTracks.slice(0, 24);
    console.log('tracks after slice:', tracks.length);
    
    if (tracks.length === 0) {
      console.log('❌ PROBLEM: No tracks found!');
      console.log('This explains why the API returns 0 tracks.');
    } else {
      console.log('✅ Tracks found:', tracks.length);
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

debugPlaylist();
