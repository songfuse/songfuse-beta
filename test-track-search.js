import { findTracksByTitleArtist } from './server/db.js';

async function testTrackSearch() {
  try {
    console.log('Testing track search...');
    
    // Test with some sample songs
    const testSongs = [
      { title: "Bohemian Rhapsody", artist: "Queen" },
      { title: "Imagine", artist: "John Lennon" },
      { title: "Hotel California", artist: "Eagles" }
    ];
    
    const result = await findTracksByTitleArtist(testSongs, 10, false);
    
    console.log('Search result:', {
      tracksFound: result.tracks.length,
      dbTracksFound: result.dbTracks.length,
      tracks: result.tracks.slice(0, 3).map(t => ({ title: t.name, artist: t.artists[0]?.name }))
    });
    
  } catch (error) {
    console.error('Error testing track search:', error);
  }
}

testTrackSearch();
