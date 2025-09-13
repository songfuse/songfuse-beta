import { storage } from './server/storage';

async function updateSpotifyToken() {
  try {
    console.log('Updating Spotify token for test user...');
    
    // Get the test user
    const user = await storage.getUser(14);
    if (!user) {
      console.log('Test user not found, creating one...');
      const newUser = await storage.createUser({
        username: 'testuser',
        password: 'testpassword',
        name: 'Test User',
        spotifyAccessToken: 'test-token',
        spotifyRefreshToken: 'test-refresh',
        tokenExpiresAt: new Date(Date.now() + 3600000)
      });
      console.log('Created test user:', newUser.id);
    }
    
    // Update with a more realistic token using updateUser instead
    const updatedUser = await storage.updateUser(14, {
      spotifyAccessToken: 'BQC...fake_token_for_testing',
      spotifyRefreshToken: 'AQC...fake_refresh_token_for_testing',
      tokenExpiresAt: new Date(Date.now() + 3600000) // 1 hour from now
    });
    
    console.log('Updated user tokens:', {
      id: updatedUser.id,
      hasAccessToken: !!updatedUser.spotifyAccessToken,
      hasRefreshToken: !!updatedUser.spotifyRefreshToken,
      tokenExpiresAt: updatedUser.tokenExpiresAt
    });
    
  } catch (error) {
    console.error('Error updating Spotify token:', error);
  }
}

updateSpotifyToken();
