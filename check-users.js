import { storage } from './server/storage';

async function checkUsers() {
  try {
    // Check if we can get a specific user first
    const user = await storage.getUser(1);
    console.log('User 1:', user);
    
    // Try to create a test user if none exists
    if (!user) {
      console.log('No user found, creating test user...');
      const newUser = await storage.createUser({
        username: 'testuser',
        password: 'testpassword',
        name: 'Test User',
        spotifyAccessToken: 'test-token',
        spotifyRefreshToken: 'test-refresh',
        tokenExpiresAt: new Date(Date.now() + 3600000)
      });
      console.log('Created test user:', newUser);
    }
  } catch (error) {
    console.error('Error checking users:', error);
  }
}

checkUsers();
