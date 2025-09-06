import { SpotifyTrack } from '@shared/schema';

// API base URL
const API_BASE_URL = "https://api.spotify.com/v1";

// Authorization
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

// Define TypeScript type for global variables
declare global {
  var spotifyAuthState: {
    [key: string]: {
      timestamp: number;
      used: boolean;
    }
  };
}

// Initialize the state tracking object if it doesn't exist
if (typeof global.spotifyAuthState === 'undefined') {
  global.spotifyAuthState = {};
  console.log('Initialized global spotifyAuthState tracking');
}
// Get environment
const isDevelopment = process.env.NODE_ENV === 'development';

// Dynamically set redirect URI based on environment
let REDIRECT_URI: string;
if (isDevelopment) {
  // In development, use the actual Replit development URL
  // We need to dynamically determine this based on the current Replit environment
  const replitId = process.env.REPL_ID || '';
  const replitSlug = process.env.REPL_SLUG || '';
  
  if (replitId && replitSlug) {
    // We're in a Replit environment, use the REPLIT_DOMAINS environment variable
    // This is the most reliable way to get the correct domain in Replit
    const domains = process.env.REPLIT_DOMAINS ? process.env.REPLIT_DOMAINS.split(',')[0] : '';
    if (domains) {
      REDIRECT_URI = `https://${domains}/api/auth/callback`;
      console.log(`Replit development environment detected: Using REPLIT_DOMAINS for redirect URI: ${REDIRECT_URI}`);
    } else {
      // Fallback to dynamic format if REPLIT_DOMAINS is not available
      REDIRECT_URI = `https://${replitId}.${replitSlug}.repl.co/api/auth/callback`;
      console.log(`Replit development environment detected: Using fallback redirect URI: ${REDIRECT_URI}`);
    }
  } else if (process.env.REPLIT_DEPLOYMENT_ID) {
    // We're in a Replit deployment, use specific URL pattern
    REDIRECT_URI = `https://${process.env.REPLIT_DEPLOYMENT_ID}.repl.co/api/auth/callback`;
    console.log(`Replit deployment detected: Using deployment redirect URI: ${REDIRECT_URI}`);
  } else {
    // Fallback for local development outside of Replit
    REDIRECT_URI = 'http://localhost:5000/api/auth/callback';
    console.log('Local development environment detected: Using localhost redirect URI for Spotify');
  }
} else {
  // In production, use the production URL
  REDIRECT_URI = 'https://beta.songfuse.app/api/auth/callback';
  
  // Log configuration for transparency
  console.log("Production environment detected: Using production redirect URI: " + REDIRECT_URI);
}

// Override environment variable with our value to ensure consistency
process.env.SPOTIFY_REDIRECT_URI = REDIRECT_URI;

// Log the configured redirect URI for debugging
console.log(`Spotify AUTH configured with redirect URI: ${REDIRECT_URI}`);

// Validate configuration
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing Spotify API credentials in environment variables");
}

/**
 * Get Spotify authorization URL
 */
export function getAuthorizationUrl(): string {
  // Validate credentials before proceeding
  if (!CLIENT_ID) {
    throw new Error('Missing Spotify CLIENT_ID environment variable');
  }
  
  if (!REDIRECT_URI) {
    throw new Error('Missing Spotify REDIRECT_URI environment variable');
  }
  
  const scopes = [
    "user-read-email",
    "user-read-private",
    "playlist-read-private",
    "playlist-modify-private",
    "playlist-modify-public",
    "ugc-image-upload"
  ];

  // Generate a random state parameter for security
  const stateParam = Math.random().toString(36).substring(2, 15);
  
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID as string,
    scope: scopes.join(" "),
    redirect_uri: REDIRECT_URI as string,
    state: stateParam, // Add state parameter for CSRF protection
  });
  
  // Initialize or maintain the existing state object
  if (!global.spotifyAuthState) {
    global.spotifyAuthState = {};
  }
  
  // Store with timestamp without clearing existing states
  // This allows multiple login attempts from different browser tabs/devices
  global.spotifyAuthState[stateParam] = {
    timestamp: Date.now(),
    used: false
  };
  
  // Clean up expired state parameters (older than 10 minutes)
  const expiryTime = Date.now() - (10 * 60 * 1000);
  Object.keys(global.spotifyAuthState).forEach(key => {
    if (global.spotifyAuthState[key].timestamp < expiryTime) {
      delete global.spotifyAuthState[key];
    }
  });
  
  // Log full URL for debugging purposes
  const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;
  console.log(`Generated Spotify auth URL: ${authUrl}`);
  
  return authUrl;
}

/**
 * Exchange authorization code for access and refresh tokens
 */
export async function getAccessToken(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  // Validate essential parameters
  if (!code) {
    throw new Error('Missing authorization code');
  }
  
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('Missing Spotify API credentials');
  }
  
  if (!REDIRECT_URI) {
    throw new Error('Missing Spotify redirect URI');
  }
  
  console.log(`Exchanging authorization code for access token with redirect URI: ${REDIRECT_URI}`);
  
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI as string,
  });
  
  try {
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`,
      },
      body: params.toString(),
    });

    const responseText = await response.text();
    
    // Log the response for debugging
    console.log(`Token exchange response status: ${response.status}`);
    
    // Handle headers safely without using iterator that might cause TypeScript issues
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    console.log(`Token exchange response headers: ${JSON.stringify(headers)}`);
    
    if (!response.ok) {
      // Provide detailed error information
      let errorInfo;
      try {
        // Try to parse the error as JSON
        errorInfo = JSON.parse(responseText);
        console.error('Token exchange error details:', errorInfo);
      } catch (e) {
        // If not JSON, just use the text
        errorInfo = responseText;
      }
      
      // Check for common error cases
      if (response.status === 400 && responseText.includes('redirect_uri_mismatch')) {
        throw new Error(`Redirect URI mismatch. Using: ${REDIRECT_URI}. Please ensure this matches the URI registered in Spotify Developer Dashboard.`);
      }
      
      throw new Error(`Failed to get access token: ${response.status} ${response.statusText} - ${responseText}`);
    }

    // Parse successful response
    try {
      const tokenData = JSON.parse(responseText);
      console.log('Successfully retrieved access token');
      return tokenData;
    } catch (parseError) {
      console.error('Failed to parse token response:', parseError);
      throw new Error(`Invalid token response: ${responseText}`);
    }
  } catch (error) {
    console.error('Token exchange request failed:', error);
    throw error;
  }
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`,
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to refresh token: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return await response.json();
}

/**
 * Get current user profile
 */
export async function getCurrentUserProfile(accessToken: string): Promise<{
  id: string;
  display_name: string;
  images: { url: string }[];
}> {
  const response = await fetch(`${API_BASE_URL}/me`, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get user profile: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return await response.json();
}

/**
 * Get track recommendations from Spotify API
 * Note: We're using the same parameter order from the Spotify API docs:
 * https://developer.spotify.com/documentation/web-api/reference/get-recommendations
 * 
 * @param accessToken Spotify access token
 * @param seed_genres Array of genre seeds (max 5)
 * @param seed_tracks Array of track IDs (max 5)
 * @param limit Maximum number of tracks to return
 * @returns Array of track objects
 */
export async function getRecommendations(
  accessToken: string,
  seed_genres?: string[],
  seed_tracks?: string[],
  limit = 24
): Promise<SpotifyTrack[]> {
  const params = new URLSearchParams({
    limit: limit.toString()
  });

  if (seed_genres && seed_genres.length > 0) {
    params.append("seed_genres", seed_genres.slice(0, 5).join(","));
  }

  if (seed_tracks && seed_tracks.length > 0) {
    // First clean the seed track IDs to ensure they're not full URIs
    const cleanedSeedTracks = seed_tracks
      .map(id => (typeof id === 'string' ? id.replace('spotify:track:', '') : null))
      .filter(id => id !== null && id.length > 0) as string[];
    
    // Only use cleaned IDs and limit to 5 (Spotify API limit)
    if (cleanedSeedTracks.length > 0) {
      params.append("seed_tracks", cleanedSeedTracks.slice(0, 5).join(","));
    }
  }

  // Log both seed tracks and genres for debugging
  console.log(`Getting recommendations with params: ${params.toString()}`);
  console.log(`Seed tracks being used: ${seed_tracks ? seed_tracks.join(", ") : "None"}`);
  console.log(`Seed genres being used: ${seed_genres ? seed_genres.join(", ") : "None"}`);
  
  // Add proper error handling and retries
  try {
    const response = await fetch(`${API_BASE_URL}/recommendations?${params.toString()}`, {
      headers: {
        "Authorization": `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Spotify API error (${response.status}): ${errorText}`);
      throw new Error(`Failed to get recommendations: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Check if we got valid tracks
    if (!data.tracks || !Array.isArray(data.tracks) || data.tracks.length === 0) {
      console.warn("Spotify returned no recommendation tracks, returning empty array");
      return [];
    }
    
    console.log(`Successfully got ${data.tracks.length} recommendations`);
    return data.tracks;
  } catch (error) {
    console.error("Error getting Spotify recommendations:", error);
    // Return empty array instead of fallback search
    return [];
  }
}

/**
 * Search for tracks
 */
export async function searchTracks(
  accessToken: string,
  query: string,
  limit = 24,
  avoidExplicit = false
): Promise<SpotifyTrack[]> {
  // Check if the query includes a request to avoid explicit content
  const includesExplicitFilter = avoidExplicit || 
    query.toLowerCase().includes("clean") || 
    query.toLowerCase().includes("no explicit") ||
    query.toLowerCase().includes("family friendly") ||
    query.toLowerCase().includes("kid friendly") ||
    query.toLowerCase().includes("radio edit");

  // Special handling for different content types
  let enhancedQuery = query;
  
  // Modify the query to exclude explicit content if requested
  const modifiedQuery = includesExplicitFilter 
    ? `${enhancedQuery} ${enhancedQuery.includes("NOT explicit") ? "" : "NOT explicit"}`
    : enhancedQuery;

  const params = new URLSearchParams({
    q: modifiedQuery,
    type: "track",
    limit: "50" // Always get the maximum allowed by Spotify API to ensure we have enough tracks
  });

  console.log(`Spotify search query: ${modifiedQuery}`);
  
  try {
    const response = await fetch(`${API_BASE_URL}/search?${params.toString()}`, {
      headers: {
        "Authorization": `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Spotify search error: Status ${response.status}, Response: ${errorText}`
      );
      throw new Error(`Failed to search tracks: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Get all tracks from the response
    let tracks = data.tracks?.items || [];
    
    // Filter out explicit tracks if requested
    if (includesExplicitFilter) {
      console.log("Filtering out explicit tracks as requested");
      tracks = tracks.filter((track: any) => !track.explicit);
    }
    
    // Map Spotify API track objects to our SpotifyTrack interface
    let mappedTracks = tracks.slice(0, limit).map((track: any): SpotifyTrack => ({
      id: track.id,
      name: track.name,
      artists: track.artists.map((artist: any) => ({ 
        name: artist.name,
        id: artist.id
      })),
      album: {
        name: track.album.name,
        images: track.album.images.map((img: any) => ({ url: img.url }))
      },
      duration_ms: track.duration_ms,
      preview_url: track.preview_url,
      explicit: track.explicit,
      popularity: track.popularity
    }));
    
    return mappedTracks;
    
  } catch (error) {
    console.error("Error in searchTracks:", error);
    // Return empty array instead of throwing to avoid breaking the flow
    return [];
  }
}

/**
 * Create a playlist
 * 
 * This function has been completely rewritten to use a more reliable approach with
 * proper error handling and retry logic.
 */
export async function createPlaylist(
  accessToken: string,
  userId: string, // Kept for backward compatibility but not used
  name: string,
  description: string,
  isPublic = true
): Promise<{
  id: string;
  external_urls: { spotify: string };
}> {
  // Ensure we have a valid name and description
  const safeName = (name || "My Songfuse Playlist").trim();
  let safeDescription = description || "Created with Songfuse";
  
  // Sanitize the description to avoid API errors
  safeDescription = safeDescription
    .replace(/[^\x20-\x7E]/g, "") // Only keep basic ASCII printable chars
    .trim();
  
  // Limit description length to avoid Spotify's API limit (300 chars)
  const truncatedDescription = safeDescription.length > 300 
    ? safeDescription.substring(0, 297) + '...' 
    : safeDescription;
    
  console.log(`Creating playlist with name: "${safeName}"`);
  console.log(`Description length: ${truncatedDescription.length}`);
  
  // Use the /me/playlists endpoint which creates a playlist for the current user
  // This endpoint doesn't require a user ID and is more reliable
  const response = await fetch(`${API_BASE_URL}/me/playlists`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      name: safeName,
      description: truncatedDescription,
      public: isPublic
    })
  });

  if (!response.ok) {
    // Log detailed information about the error
    let errorText;
    try {
      errorText = await response.text();
      
      console.error('Spotify API Error Details:');
      console.error(`- Status: ${response.status} ${response.statusText}`);
      
      // Handle headers safely without using iterator that might cause TypeScript issues
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      console.error(`- Response Headers:`, headers);
      console.error(`- Error Text: ${errorText}`);
      console.error('- Request Body:', JSON.stringify({
        name: safeName,
        description: truncatedDescription.substring(0, 50) + '...', // Truncate for privacy
        public: isPublic
      }));
      
      // Check if token might be invalid
      if (response.status === 401) {
        throw new Error('Authentication failed. Token may be invalid or expired.');
      }
      
      // For rate limit errors, include the retry-after header if available
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        console.log('Spotify API Error Details:');
        console.log(`- Status: ${response.status} ${response.statusText}`);
        console.log(`- Response Headers:`, response.headers);
        console.log(`- Error Text: ${errorText}`);
        console.log(`- Request Body:`, JSON.stringify({
          name: safeName,
          description: truncatedDescription.substring(0, 50) + '...',
          public: isPublic
        }));
        
        throw new Error(`Failed to create playlist: ${response.status} ${response.statusText} - ${errorText} - retry-after: ${retryAfter || 'unknown'}`);
      }
      
      // Generic error with as much context as possible
      throw new Error(`Failed to create playlist: ${response.status} ${response.statusText} - ${errorText}`);
    } catch (error) {
      if (error instanceof Error) {
        throw error; // Re-throw if it's already a processed error
      }
      throw new Error(`Failed to create playlist: ${response.status} ${response.statusText}`);
    }
  }

  return await response.json();
}

/**
 * Add tracks to a playlist
 */
export async function addTracksToPlaylist(
  accessToken: string,
  playlistId: string,
  trackUris: string[]
): Promise<void> {
  // Spotify has a limit of 100 tracks per request
  const chunks = [];
  for (let i = 0; i < trackUris.length; i += 100) {
    chunks.push(trackUris.slice(i, i + 100));
  }

  for (const chunk of chunks) {
    const response = await fetch(`${API_BASE_URL}/playlists/${playlistId}/tracks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        uris: chunk
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      
      // Enhanced error handling for rate limits
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        console.log('Spotify API Rate Limit Error:');
        console.log(`- Status: ${response.status} ${response.statusText}`);
        console.log(`- Retry-After: ${retryAfter || 'not specified'}`);
        console.log(`- Error Text: ${errorText}`);
        
        throw new Error(`Rate limit exceeded: ${response.status} ${response.statusText} - retry-after: ${retryAfter || 'unknown'}`);
      }
      
      throw new Error(`Failed to add tracks to playlist: ${response.status} ${response.statusText} - ${errorText}`);
    }
  }
}

/**
 * Upload a custom playlist cover image
 */
export async function uploadPlaylistCoverImage(
  accessToken: string,
  playlistId: string,
  imageBase64: string
): Promise<void> {
  // Validate input
  if (!accessToken) throw new Error("Access token is required");
  if (!playlistId) throw new Error("Playlist ID is required");
  if (!imageBase64 || imageBase64.length < 100) {
    throw new Error(`Invalid base64 image data (length: ${imageBase64.length || 0})`);
  }

  // Remove data:image/jpeg;base64, prefix if present
  let base64Data = imageBase64.includes("base64,")
    ? imageBase64.split("base64,")[1]
    : imageBase64;
  
  // Ensure there are no newlines, tabs, or other whitespace in the base64 string
  base64Data = base64Data.replace(/\s/g, '');
    
  console.log(`Uploading cover image to Spotify for playlist: ${playlistId}`);
  console.log(`Base64 data length (after cleanup): ${base64Data.length}`);

  try {
    // Verify the data is a valid base64 string
    try {
      // Test decode a small part to verify it's valid base64
      Buffer.from(base64Data.substring(0, 100), 'base64');
    } catch (base64Error) {
      console.error('Invalid base64 encoding:', base64Error);
      throw new Error('Invalid base64 encoding in image data');
    }

    // Check if the image is too large for Spotify (max 256KB)
    // Base64 is approximately 4/3 the size of binary, so ~350,000 chars is ~256KB
    const sizeInBytes = Math.ceil(base64Data.length * 0.75);
    const sizeInKB = Math.ceil(sizeInBytes / 1024);
    
    // Spotify has a hard limit of 256KB, but we've seen 502 errors with larger images
    if (sizeInKB > 80) { // Be very conservative - aim for under 80KB
      console.warn(`Image may be too large for Spotify API: ${sizeInKB}KB (${base64Data.length} chars in base64)`);
      console.warn(`This might cause a 502 Bad Gateway error. Consider using a smaller image.`);
    }
    
    // Log image size for debugging
    console.log(`Uploading image of size: ${sizeInKB}KB`);
    
    // Add a brief delay before uploading (might help with Spotify API reliability)
    await new Promise(resolve => setTimeout(resolve, 500));

    // Ensure we're only sending the base64 data without any prefixes
    // Note: Spotify's API expects JUST the base64 string with no headers or content-type
    const response = await fetch(`${API_BASE_URL}/playlists/${playlistId}/images`, {
      method: "PUT",
      headers: {
        "Content-Type": "image/jpeg", // This is required by Spotify
        "Authorization": `Bearer ${accessToken}`
      },
      body: base64Data // Send just the raw base64 string
    });

    // Check for success or handle specific error cases
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Spotify API error response: ${errorText}`);
      
      // Handle specific error cases
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        console.error('Spotify API Rate Limit Error (Cover Upload):');
        console.error(`- Status: ${response.status} ${response.statusText}`);
        console.error(`- Retry-After: ${retryAfter || 'not specified'}`);
        
        throw new Error(`Rate limit exceeded: ${response.status} ${response.statusText} - retry-after: ${retryAfter || 'unknown'}`);
      }
      
      if (response.status === 413 || response.status === 400) {
        console.error('Spotify rejected the image - likely too large or invalid format');
        
        // For debugging: log image size in bytes
        const sizeInBytes = Math.ceil(base64Data.length * 0.75); // Approximate base64 to binary ratio
        console.error(`Estimated image size: ${sizeInBytes} bytes (${Math.ceil(sizeInBytes/1024)} KB)`);
        
        throw new Error(`Image rejected by Spotify: ${response.status} ${response.statusText}`);
      }
      
      if (response.status === 502) {
        console.error('Spotify returned a 502 Bad Gateway error. This often happens with larger images.');
        throw new Error('Spotify server error (502): Try using a smaller image file');
      }
      
      // Generic error handling
      console.error(`Failed to upload cover image: ${errorText}`);
      throw new Error(`Failed to upload cover image: ${response.status} ${response.statusText}`);
    }
    
    console.log('Successfully uploaded cover image to Spotify');
  } catch (error) {
    console.error('Error in uploadPlaylistCoverImage:', error);
    throw error; // Re-throw for proper handling upstream
  }
}

/**
 * Get a playlist by ID from Spotify
 * 
 * @param accessToken - Spotify access token
 * @param playlistId - Spotify playlist ID
 * @returns Playlist data including images, name, and description
 */
export async function getPlaylist(
  accessToken: string,
  playlistId: string
): Promise<any> {
  try {
    const response = await fetch(`${API_BASE_URL}/playlists/${playlistId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorData = await response.text();
      console.error(`Failed to get playlist: ${errorData}`);
      throw new Error(`Failed to get playlist: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error getting playlist:', error);
    throw error;
  }
}

/**
 * Remove a track from a Spotify playlist
 * 
 * @param accessToken - Spotify access token
 * @param playlistId - Spotify playlist ID
 * @param trackUri - Spotify track URI (format: spotify:track:SPOTIFY_ID)
 * @returns True if removal was successful
 */
export async function removeTrackFromPlaylist(
  accessToken: string,
  playlistId: string,
  trackId: string
): Promise<boolean> {
  try {
    const trackUri = `spotify:track:${trackId}`;
    console.log(`Removing track URI ${trackUri} from Spotify playlist ${playlistId}`);
    
    const response = await fetch(`${API_BASE_URL}/playlists/${playlistId}/tracks`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tracks: [{ uri: trackUri }]
      })
    });
    
    if (!response.ok) {
      const errorData = await response.text();
      console.error(`Failed to remove track from Spotify playlist: ${errorData}`);
      throw new Error(`Failed to remove track: ${response.status} ${response.statusText}`);
    }
    
    console.log(`Successfully removed track from Spotify playlist`);
    return true;
  } catch (error) {
    console.error('Error removing track from Spotify playlist:', error);
    throw error;
  }
}

/**
 * Get audio features for a list of tracks
 * @param accessToken Spotify access token 
 * @param trackIds Array of Spotify track IDs
 * @returns Object mapping track IDs to their audio features
 */
export async function getAudioFeatures(
  accessToken: string,
  trackIds: string[]
): Promise<Record<string, any>> {
  if (!trackIds.length) {
    return {};
  }

  try {
    // Spotify API limits to 100 IDs per request
    const maxBatchSize = 100;
    const results: Record<string, any> = {};
    
    // Process in batches
    for (let i = 0; i < trackIds.length; i += maxBatchSize) {
      const batch = trackIds.slice(i, i + maxBatchSize);
      
      // Make API request
      const response = await fetch(
        `${API_BASE_URL}/audio-features?ids=${batch.join(',')}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Error fetching audio features: ${error.error?.message || response.statusText}`);
      }
      
      const data = await response.json();
      
      // Map results by track ID
      if (data.audio_features) {
        data.audio_features.forEach((item: any) => {
          if (item && item.id) {
            results[item.id] = item;
          }
        });
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error fetching audio features from Spotify:', error);
    return {};
  }
}

/**
 * Get user's playlists
 */
export async function getUserPlaylists(
  accessToken: string,
  limit = 50
): Promise<any[]> {
  const params = new URLSearchParams({
    limit: limit.toString()
  });

  const response = await fetch(`${API_BASE_URL}/me/playlists?${params.toString()}`, {
    headers: {
      "Authorization": `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get user playlists: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  return data.items || [];
}

/**
 * Get new releases from Spotify
 */
export async function getNewReleases(
  accessToken: string,
  limit = 10
): Promise<SpotifyTrack[]> {
  try {
    const params = new URLSearchParams({
      limit: limit.toString(),
      country: "US" // Use US as default market
    });

    const response = await fetch(`${API_BASE_URL}/browse/new-releases?${params.toString()}`, {
      headers: {
        "Authorization": `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get new releases: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    const albums = data.albums?.items || [];

    // Transform album data to track format
    const tracks: SpotifyTrack[] = [];
    
    for (const album of albums) {
      // Get the first track from each album
      const trackResponse = await fetch(`${API_BASE_URL}/albums/${album.id}/tracks?limit=1`, {
        headers: {
          "Authorization": `Bearer ${accessToken}`
        }
      });
      
      if (trackResponse.ok) {
        const trackData = await trackResponse.json();
        const track = trackData.items[0];
        
        if (track) {
          tracks.push({
            id: track.id,
            name: track.name,
            artists: track.artists.map((artist: any) => ({ 
              name: artist.name, 
              id: artist.id 
            })),
            album: {
              name: album.name,
              images: album.images.map((img: any) => ({ url: img.url }))
            },
            duration_ms: track.duration_ms,
            popularity: album.popularity
          });
        }
      }
    }
    
    return tracks;
  } catch (error) {
    console.error("Error getting new releases:", error);
    return [];
  }
}

/**
 * Get a playlist's details including tracks
 */
export async function getPlaylistDetails(
  accessToken: string,
  playlistId: string,
  includeTracks = true
): Promise<any> {
  // Get playlist metadata
  const response = await fetch(`${API_BASE_URL}/playlists/${playlistId}`, {
    headers: {
      "Authorization": `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get playlist details: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const playlist = await response.json();
  
  if (!includeTracks) {
    return {
      id: playlist.id,
      name: playlist.name,
      description: playlist.description,
      images: playlist.images,
      owner: playlist.owner,
      external_urls: playlist.external_urls,
      public: playlist.public,
      tracks: {
        total: playlist.tracks.total
      }
    };
  }
  
  // Extract tracks from the playlist
  let allTracks: SpotifyTrack[] = [];
  
  if (playlist.tracks && playlist.tracks.items) {
    allTracks = playlist.tracks.items
      .filter((item: any) => item.track)
      .map((item: any) => {
        const track = item.track;
        return {
          id: track.id,
          name: track.name,
          artists: track.artists.map((artist: any) => ({
            name: artist.name,
            id: artist.id
          })),
          album: {
            name: track.album.name,
            images: track.album.images.map((img: any) => ({ url: img.url }))
          },
          duration_ms: track.duration_ms,
          preview_url: track.preview_url,
          explicit: track.explicit,
          popularity: track.popularity
        };
      });
  }
  
  // Return playlist with normalized tracks
  return {
    id: playlist.id,
    name: playlist.name,
    description: playlist.description,
    images: playlist.images,
    owner: playlist.owner,
    external_urls: playlist.external_urls,
    public: playlist.public,
    tracks: allTracks
  };
}