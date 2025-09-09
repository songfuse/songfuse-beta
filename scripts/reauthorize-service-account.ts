#!/usr/bin/env tsx

/**
 * Script to help re-authorize the Spotify service account with updated scopes
 */

import 'dotenv/config';

async function reauthorizeServiceAccount() {
  try {
    console.log('🔐 Re-authorizing Spotify service account with updated scopes...');
    
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const redirectUri = process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:5000/api/auth/callback';
    
    if (!clientId) {
      console.error('❌ SPOTIFY_CLIENT_ID not found in environment variables');
      return;
    }
    
    // Updated scopes including ugc-image-upload
    const scopes = [
      "user-read-email",
      "user-read-private",
      "playlist-read-private",
      "playlist-modify-private",
      "playlist-modify-public",
      "ugc-image-upload"
    ];
    
    const stateParam = Math.random().toString(36).substring(2, 15);
    
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      scope: scopes.join(" "),
      redirect_uri: redirectUri,
      state: stateParam,
    });
    
    const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;
    
    console.log('✅ Authorization URL generated:');
    console.log(authUrl);
    console.log('\n📋 Instructions:');
    console.log('1. Open the URL above in your browser');
    console.log('2. Log in with the Spotify service account credentials');
    console.log('3. Grant all the requested permissions (including image upload)');
    console.log('4. Copy the authorization code from the redirect URL');
    console.log('5. Run the next script to exchange the code for tokens');
    console.log('\n🔑 Required scopes:');
    scopes.forEach(scope => console.log(`  - ${scope}`));
    
  } catch (error) {
    console.error('❌ Error generating authorization URL:', error);
  }
}

// Run the script
reauthorizeServiceAccount().catch(console.error);
