import { generateSongRecommendations } from './server/openai.js';
import { getAllDatabaseGenres } from './server/db.js';

async function testAIRecommendations() {
  try {
    console.log('Testing AI song recommendations...');
    
    // Get genres from database
    const genres = await getAllDatabaseGenres();
    console.log('Available genres:', genres.slice(0, 10));
    
    // Test AI recommendations
    const recommendations = await generateSongRecommendations(
      "create a happy pop playlist", 
      genres
    );
    
    console.log('AI Recommendations:', {
      songsCount: recommendations.songs.length,
      genresCount: recommendations.genres.length,
      firstFewSongs: recommendations.songs.slice(0, 5).map(s => ({ title: s.title, artist: s.artist }))
    });
    
  } catch (error) {
    console.error('Error testing AI recommendations:', error);
  }
}

testAIRecommendations();
