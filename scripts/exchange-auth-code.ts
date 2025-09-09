#!/usr/bin/env tsx

/**
 * Script to exchange authorization code for tokens with updated scopes
 */

import 'dotenv/config';

async function exchangeAuthCode() {
  try {
    console.log('🔄 Exchanging authorization code for tokens...');
    
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    const redirectUri = process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:5000/api/auth/callback';
    
    if (!clientId || !clientSecret) {
      console.error('❌ Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET');
      return;
    }
    
    // Get the authorization code from command line arguments
    const authCode = process.argv[2];
    if (!authCode) {
      console.error('❌ Please provide the authorization code as an argument');
      console.log('Usage: npx tsx scripts/exchange-auth-code.ts <AUTH_CODE>');
      return;
    }
    
    console.log('Exchanging code for tokens...');
    
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code: authCode,
      redirect_uri: redirectUri,
    });
    
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: params.toString(),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Token exchange failed:', errorText);
      return;
    }
    
    const data = await response.json();
    
    console.log('✅ Tokens obtained successfully!');
    console.log('\n📋 New tokens:');
    console.log(`SPOTIFY_SERVICE_ACCESS_TOKEN=${data.access_token}`);
    console.log(`SPOTIFY_SERVICE_REFRESH_TOKEN=${data.refresh_token}`);
    console.log(`Token expires in: ${data.expires_in} seconds`);
    console.log(`Scopes: ${data.scope}`);
    
    // Check if ugc-image-upload scope is present
    const scopes = data.scope ? data.scope.split(' ') : [];
    const hasImageUpload = scopes.includes('ugc-image-upload');
    
    console.log('\n🔍 Scope verification:');
    console.log('Has ugc-image-upload scope:', hasImageUpload ? '✅' : '❌');
    
    if (hasImageUpload) {
      console.log('\n🎉 Success! The service account now has image upload permissions.');
      console.log('Update your .env file with the new tokens above.');
    } else {
      console.log('\n⚠️  Warning: The token still does not have ugc-image-upload scope.');
      console.log('Make sure to grant all permissions during the authorization step.');
    }
    
  } catch (error) {
    console.error('❌ Error exchanging authorization code:', error);
  }
}

// Run the script
exchangeAuthCode().catch(console.error);
