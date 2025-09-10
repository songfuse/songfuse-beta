/**
 * Script to get a fresh Spotify service account token
 * This will generate new access and refresh tokens for the service account
 */

import fetch from 'node-fetch';
import { config } from 'dotenv';

// Load environment variables
config();

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = 'https://beta.songfuse.app/api/auth/callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in .env file');
  process.exit(1);
}

console.log('🔑 Spotify Service Account Token Generator');
console.log('==========================================');
console.log('');
console.log('To get a fresh token for the Spotify service account:');
console.log('');
console.log('1. Go to this URL in your browser:');
console.log('');
console.log(`https://accounts.spotify.com/authorize?` + new URLSearchParams({
  client_id: CLIENT_ID,
  response_type: 'code',
  redirect_uri: REDIRECT_URI,
  scope: 'playlist-modify-public playlist-modify-private user-read-private user-read-email ugc-image-upload',
  show_dialog: 'true'
}));
console.log('');
console.log('2. Log in with your Spotify service account credentials');
console.log('3. Copy the authorization code from the redirect URL');
console.log('4. Run this script with the code:');
console.log('');
console.log('node scripts/get-spotify-service-token.js <AUTHORIZATION_CODE>');
console.log('');

// If authorization code is provided, exchange it for tokens
const authCode = process.argv[2];

if (authCode) {
  console.log('🔄 Exchanging authorization code for tokens...');
  
  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: REDIRECT_URI
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Failed to exchange code for tokens:', error);
      process.exit(1);
    }

    const tokens = await response.json();
    
    console.log('✅ Successfully obtained tokens!');
    console.log('');
    console.log('Add these to your .env file:');
    console.log('');
    console.log(`SPOTIFY_SERVICE_ACCESS_TOKEN=${tokens.access_token}`);
    console.log(`SPOTIFY_SERVICE_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log('');
    console.log('Then restart your server with: npm run dev');
    
  } catch (error) {
    console.error('❌ Error exchanging code for tokens:', error);
    process.exit(1);
  }
}
