/**
 * Script to refresh the existing Spotify service account token
 */

import fetch from 'node-fetch';
import { config } from 'dotenv';

// Load environment variables
config();

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.SPOTIFY_SERVICE_REFRESH_TOKEN;

if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
  console.error('❌ Missing required environment variables');
  console.error('Need: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_SERVICE_REFRESH_TOKEN');
  process.exit(1);
}

console.log('🔄 Refreshing Spotify service account token...');

try {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: REFRESH_TOKEN
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('❌ Failed to refresh token:', error);
    console.error('');
    console.error('The refresh token may be expired. You need to get a new token using:');
    console.error('node scripts/get-spotify-service-token.js');
    process.exit(1);
  }

  const tokens = await response.json();
  
  console.log('✅ Successfully refreshed token!');
  console.log('');
  console.log('Update your .env file with:');
  console.log('');
  console.log(`SPOTIFY_SERVICE_ACCESS_TOKEN=${tokens.access_token}`);
  if (tokens.refresh_token) {
    console.log(`SPOTIFY_SERVICE_REFRESH_TOKEN=${tokens.refresh_token}`);
  }
  console.log('');
  console.log('Then restart your server with: npm run dev');
  
} catch (error) {
  console.error('❌ Error refreshing token:', error);
  process.exit(1);
}
