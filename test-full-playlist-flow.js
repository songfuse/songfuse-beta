import { generateSongRecommendations } from './server/openai.js';
import { getAllDatabaseGenres } from './server/db.js';
import { findTracksByTitleArtist } from './server/db.js';

async function testFullPlaylistFlow() {
  try {
    console.log('Testing full playlist generation flow...');
    
    // Step 1: Get genres
    const genres = await getAllDatabaseGenres();
    console.log('Step 1 - Available genres:', genres.slice(0, 5));
    
    // Step 2: Get AI recommendations
    console.log('Step 2 - Getting AI recommendations...');
    const recommendations = await generateSongRecommendations(
      "create a happy pop playlist", 
      genres
    );
    
    console.log('AI Recommendations:', {
      songsCount: recommendations.songs.length,
      genresCount: recommendations.genres.length,
      firstFewSongs: recommendations.songs.slice(0, 5).map(s => ({ title: s.title, artist: s.artist }))
    });
    
    // Step 3: Search for tracks
    console.log('Step 3 - Searching for tracks in database...');
    const trackResult = await findTracksByTitleArtist(
      recommendations.songs.slice(0, 10),
      24,
      false
    );
    
    console.log('Track Search Result:', {
      tracksFound: trackResult.tracks.length,
      dbTracksFound: trackResult.dbTracks.length,
      firstFewTracks: trackResult.tracks.slice(0, 3).map(t => ({ 
        title: t.name, 
        artist: t.artists[0]?.name,
        id: t.id 
      }))
    });
    
  } catch (error) {
    console.error('Error in full playlist flow:', error);
  }
}

testFullPlaylistFlow();

