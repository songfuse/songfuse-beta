# Spotify Service Account Setup

This guide explains how to set up a Spotify service account for transparent playlist imports.

## Why Use a Service Account?

Instead of requiring users to connect their own Spotify accounts, we use a dedicated service account that's always connected to Spotify. This makes the import process seamless for users.

## Setup Steps

### 1. Create a Spotify App

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click "Create App"
3. Fill in the details:
   - App name: "SongFuse Service Account"
   - App description: "Service account for playlist imports"
   - Website: Your website URL
   - Redirect URI: `http://localhost:5000/api/auth/callback` (for development)
4. Note down your `Client ID` and `Client Secret`

### 2. Get User Authorization

Since we need user-level access (not just client credentials), we need to get authorization for a dedicated service account:

1. Create a Spotify account for your service (e.g., `songfuse-service@yourdomain.com`)
2. Use the Authorization Code flow to get tokens for this account

### 3. Get Access and Refresh Tokens

You can use this simple script to get the tokens:

```bash
# Replace CLIENT_ID and CLIENT_SECRET with your app credentials
# Replace REDIRECT_URI with your redirect URI
# Replace SCOPE with the required scopes

CLIENT_ID="your_client_id"
CLIENT_SECRET="your_client_secret"
REDIRECT_URI="http://localhost:5000/api/auth/callback"
SCOPE="playlist-read-private playlist-read-collaborative"

# Generate the authorization URL
AUTH_URL="https://accounts.spotify.com/authorize?response_type=code&client_id=${CLIENT_ID}&scope=${SCOPE}&redirect_uri=${REDIRECT_URI}"

echo "1. Open this URL in your browser:"
echo "$AUTH_URL"
echo ""
echo "2. Log in with your service account"
echo "3. Copy the 'code' parameter from the redirect URL"
echo "4. Run the token exchange script below"
```

### 4. Token Exchange Script

Create a file called `get-service-tokens.js`:

```javascript
const CLIENT_ID = 'your_client_id';
const CLIENT_SECRET = 'your_client_secret';
const REDIRECT_URI = 'http://localhost:5000/api/auth/callback';
const CODE = 'your_authorization_code'; // From step 3

async function getTokens() {
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

  const data = await response.json();
  console.log('Access Token:', data.access_token);
  console.log('Refresh Token:', data.refresh_token);
  console.log('Expires In:', data.expires_in, 'seconds');
}

getTokens().catch(console.error);
```

### 5. Update Environment Variables

Add these to your `.env` file:

```env
# Spotify Service Account (for transparent playlist imports)
SPOTIFY_SERVICE_ACCESS_TOKEN=your_access_token_here
SPOTIFY_SERVICE_REFRESH_TOKEN=your_refresh_token_here
```

### 6. Test the Setup

Restart your server and try importing a playlist. The service account will handle the authentication transparently.

## Required Scopes

The service account needs these scopes:
- `playlist-read-private` - Read private playlists
- `playlist-read-collaborative` - Read collaborative playlists

## Token Refresh

The service account automatically refreshes its tokens when they expire. The refresh token is long-lived and should work for months.

## Security Notes

- Keep the service account credentials secure
- Don't commit the `.env` file to version control
- Consider rotating the tokens periodically
- Monitor the service account usage in Spotify Developer Dashboard

## Troubleshooting

If you get "service account not configured" errors:
1. Check that the environment variables are set correctly
2. Verify the tokens are valid by testing them manually
3. Check the server logs for detailed error messages

If tokens expire and refresh fails:
1. Re-run the authorization flow to get new tokens
2. Update the environment variables
3. Restart the server
