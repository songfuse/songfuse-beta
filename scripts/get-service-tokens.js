#!/usr/bin/env node

/**
 * Spotify Service Account Token Exchange Script
 * 
 * This script helps you get access and refresh tokens for the Spotify service account.
 * 
 * Usage:
 * 1. Update the CLIENT_ID, CLIENT_SECRET, and CODE variables below
 * 2. Run: node scripts/get-service-tokens.js
 * 3. Copy the tokens to your .env file
 */

const CLIENT_ID = '7372fb360aa24fdcaa22d847163cd18f'; // Your Spotify app client ID
const CLIENT_SECRET = 'd03809cc0b2a4edaa57f87d2ab60dc77'; // Your Spotify app client secret
const REDIRECT_URI = 'https://beta.songfuse.app/api/auth/callback';
const CODE = 'AQADADVZyC9sPHHo3cZrd_fntSFaV8Hm3e8KnuFpyq99vAiWWHaURiX__pmpnkoEA2-9hI0S1ez0EWj-lyMLkoWKDZ5IW_AjqCUvXWn-9iUII7Olg4At-bdZTssymB9uzyN9v4ZzJxTdWI05HfdBnOhv2-nsyKkMikXxycxfZmGxKqkRWLNrXbHdby-HpcKTGNXXh55umNC2DS78ndTfi6JUevYjndMBraXFlw3IiM4OdqGok7RYtKFChRoovAiYaehe'; // Replace with the code from the auth URL

async function getTokens() {
  if (CODE === 'YOUR_AUTHORIZATION_CODE_HERE') {
    console.log('❌ Please update the CODE variable with your authorization code');
    console.log('');
    console.log('To get the authorization code:');
    console.log('1. Open this URL in your browser:');
    console.log(`https://accounts.spotify.com/authorize?response_type=code&client_id=${CLIENT_ID}&scope=playlist-read-private%20playlist-read-collaborative&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`);
    console.log('');
    console.log('2. Log in with your service account');
    console.log('3. Copy the "code" parameter from the redirect URL');
    console.log('4. Update the CODE variable in this script and run it again');
    return;
  }

  try {
    console.log('🔄 Exchanging authorization code for tokens...');
    
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: CODE,
        redirect_uri: REDIRECT_URI
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token exchange failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    
    console.log('✅ Tokens received successfully!');
    console.log('');
    console.log('Add these to your .env file:');
    console.log('');
    console.log(`SPOTIFY_SERVICE_ACCESS_TOKEN=${data.access_token}`);
    console.log(`SPOTIFY_SERVICE_REFRESH_TOKEN=${data.refresh_token}`);
    console.log('');
    console.log('Token expires in:', data.expires_in, 'seconds');
    console.log('Scope:', data.scope);
    
  } catch (error) {
    console.error('❌ Error getting tokens:', error.message);
  }
}

getTokens();
