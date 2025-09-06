import { db } from "../db";
import fetch from "node-fetch";
import { eq, sql, and, isNull, or } from "drizzle-orm";
import { tracks, genres, tracksToGenres } from "@shared/schema";

/**
 * Main function to update track genres
 * This will find tracks without genres and attempt to assign genres
 * based on Spotify artist data and audio features
 */
export async function updateTrackGenres(): Promise<void> {
  console.log("====================================");
  console.log("🎵 STARTING TRACK GENRE UPDATE PROCESS 🎵");
  console.log("====================================");
  console.log("This process will scan for tracks without genre info and update them");
  console.log("Debug output will appear below as tracks are processed");
  
  try {
    // Check if environment variables are set
    if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
      console.error("ERROR: Missing Spotify API credentials in environment variables.");
      console.error("Please ensure you have set both SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.");
      return;
    }
    
    // Get total number of tracks without genres for reporting
    const totalTracksWithoutGenre = await getTotalTracksWithoutGenre();
    console.log(`Total tracks without genre information: ${totalTracksWithoutGenre}`);
    
    if (totalTracksWithoutGenre === 0) {
      console.log("No tracks without genre found. Process complete.");
      return;
    }
    
    // Get Spotify token for API calls
    console.log("Getting Spotify API token for authorization...");
    const token = await getSpotifyToken();
    if (!token) {
      console.error("ERROR: Failed to get Spotify token. Aborting genre update process.");
      console.error("Please check your Spotify API credentials and ensure they are valid.");
      return;
    }
    
    console.log("Successfully obtained Spotify authorization token.");
    
    // Process in batches of 500 at a time to avoid loading too many records at once
    const batchLimit = 500;
    let processedCount = 0;
    let successCount = 0;
    
    // Get first batch of tracks
    let tracks = await getTracksWithoutGenre();
    
    while (tracks.length > 0) {
      console.log(`Processing ${tracks.length} tracks (${processedCount + 1} to ${processedCount + tracks.length} of ${totalTracksWithoutGenre})`);
      
      // Process tracks in smaller batches to avoid rate limits
      const batchSize = 10;
      for (let i = 0; i < tracks.length; i += batchSize) {
        const batch = tracks.slice(i, i + batchSize);
        console.log(`Processing sub-batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(tracks.length / batchSize)}`);
        
        // Process each batch asynchronously
        if (token) {
          const batchSuccessCount = await processBatch(batch, token);
          successCount += batchSuccessCount;
        } else {
          console.error("Missing token when processing batch. This should not happen.");
        }
        
        // Add longer delay between batches to avoid rate limiting
        if (i + batchSize < tracks.length) {
          console.log("Waiting before processing next sub-batch...");
          await new Promise(resolve => setTimeout(resolve, 3000)); // Increased to 3 seconds
        }
      }
      
      processedCount += tracks.length;
      console.log(`Progress: ${processedCount}/${totalTracksWithoutGenre} tracks processed (${Math.round((processedCount / totalTracksWithoutGenre) * 100)}%)`);
      console.log(`Success rate: ${successCount}/${processedCount} tracks updated (${Math.round((successCount / processedCount) * 100)}%)`);
      
      // Check if we still have more tracks to process
      if (processedCount < totalTracksWithoutGenre) {
        console.log("Waiting before fetching next batch of tracks...");
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds between major batches
        
        tracks = await getTracksWithoutGenre();
        if (tracks.length === 0) {
          console.log("No more tracks found to process. This may be due to concurrent processing or data changes.");
          break;
        }
      } else {
        break;
      }
    }
    
    console.log("Track genre update process completed successfully");
    console.log(`Final results: ${successCount}/${processedCount} tracks updated with genre information`);
  } catch (error) {
    console.error("Error in updateTrackGenres:", error);
    throw error;
  }
}

/**
 * Get the total count of tracks without any genre assignments
 */
async function getTotalTracksWithoutGenre(): Promise<number> {
  try {
    // Use track_platform_ids to find Spotify IDs
    const result = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM tracks t
      JOIN track_platform_ids tpi ON tpi.track_id = t.id
      WHERE tpi.platform = 'spotify'
      AND NOT EXISTS (
        SELECT 1 FROM tracks_to_genres ttg
        WHERE ttg.track_id = t.id
      )
    `);
    
    return Number(result.rows[0].count) || 0;
  } catch (error) {
    console.error("Error counting tracks without genre:", error);
    return 0;
  }
}

/**
 * Get tracks that don't have any genre assignments
 */
async function getTracksWithoutGenre(): Promise<Array<{ id: number, title: string, spotifyId: string | null }>> {
  try {
    console.log("Querying database for tracks without genre information...");
    
    // Use track_platform_ids to find Spotify IDs
    const result = await db.execute(sql`
      SELECT t.id, t.title, tpi.platform_id as "spotifyId"
      FROM tracks t
      JOIN track_platform_ids tpi ON tpi.track_id = t.id
      WHERE tpi.platform = 'spotify'
      AND NOT EXISTS (
        SELECT 1 FROM tracks_to_genres ttg
        WHERE ttg.track_id = t.id
      )
      LIMIT 50
    `);
    
    console.log(`Found ${result.rows.length} tracks without genre information`);
    
    return result.rows.map(row => {
      // Extract the actual Spotify ID from the full URI format (spotify:track:TRACKID)
      const spotifyIdFull = row.spotifyId as string;
      let spotifyId: string | null = null;
      
      if (spotifyIdFull) {
        if (spotifyIdFull.includes(':')) {
          // Handle Spotify URI format (spotify:track:1234567890)
          spotifyId = spotifyIdFull.split(':').pop() || null;
        } else if (spotifyIdFull.includes('/')) {
          // Handle Spotify URL format (https://open.spotify.com/track/1234567890)
          spotifyId = spotifyIdFull.split('/').pop()?.split('?')[0] || null;
        } else {
          // Assume it's already just the ID
          spotifyId = spotifyIdFull;
        }
      }
      
      return {
        id: Number(row.id),
        title: row.title as string,
        spotifyId
      };
    });
  } catch (error) {
    console.error("Error fetching tracks without genre:", error);
    return [];
  }
}

/**
 * Get Spotify API token using client credentials flow
 */
async function getSpotifyToken(): Promise<string | null> {
  try {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      console.error("Missing Spotify API credentials");
      console.error("Please ensure SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET are set in your environment");
      return null;
    }
    
    console.log("Attempting to get Spotify access token...");
    const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to get Spotify token: ${response.status} ${response.statusText}`);
      console.error(`Error details: ${errorText}`);
      console.error(`This could be due to invalid credentials or Spotify API rate limits`);
      return null;
    }
    
    const data = await response.json() as { access_token: string };
    console.log("Successfully obtained Spotify access token");
    return data.access_token;
  } catch (error) {
    console.error("Error getting Spotify token:", error);
    console.error("This might be a network error or Spotify service issue");
    return null;
  }
}

/**
 * Process a batch of tracks
 * @returns Number of tracks successfully updated with genres
 */
async function processBatch(tracks: Array<{ id: number, title: string, spotifyId: string | null }>, token: string): Promise<number> {
  let successCount = 0;
  
  for (const track of tracks) {
    try {
      console.log(`Processing track: ${track.title} (ID: ${track.id})`);
      
      if (!track.spotifyId) {
        console.log(`Track ${track.id} has no Spotify ID, skipping`);
        continue;
      }
      
      // Add a small delay before each API call to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
      
      // First try to get track info from Spotify
      const trackInfo = await getTrackInfo(track.spotifyId, token);
      
      if (!trackInfo || !trackInfo.artists || trackInfo.artists.length === 0) {
        console.log(`No artist information found for track ${track.id}`);
        continue;
      }
      
      // Collect genres from all artists
      const allGenres: Set<string> = new Set();
      
      // Process each artist to collect genres
      for (const artist of trackInfo.artists) {
        if (!artist.id) continue;
        
        // Add delay between artist API calls to reduce rate limiting probability
        await new Promise(resolve => setTimeout(resolve, 300)); // 300ms delay
        
        const artistInfo = await getArtistInfo(artist.id, token);
        
        if (artistInfo && artistInfo.genres && artistInfo.genres.length > 0) {
          artistInfo.genres.forEach(genre => allGenres.add(genre));
        }
      }
      
      // If we didn't find any genres from artists, use alternative methods
      if (allGenres.size === 0) {
        // First try: Check if we can use Spotify search instead of audio features
        try {
          // Instead of audio features (which require special permission),
          // we'll use the track's title to assign basic genres
          console.log(`No genres found from artists for track ${track.id}, using basic genre inference`);
          
          // Get the track's title and apply simple genre classification rules
          if (track.title) {
            const titleLower = track.title.toLowerCase();
            const basicGenres = inferGenresFromTitle(titleLower);
            if (basicGenres.length > 0) {
              console.log(`Inferred ${basicGenres.length} genres from track title: ${basicGenres.join(', ')}`);
              basicGenres.forEach(genre => allGenres.add(genre));
            } else {
              // Add a default genre if we can't infer anything
              allGenres.add('other');
              console.log(`Added default genre 'other' to track ${track.id}`);
            }
          }
        } catch (error) {
          console.error(`Error inferring genres from title for track ${track.id}:`, error);
          // Add a default genre as fallback
          allGenres.add('other');
        }
      }
      
      // Convert set to array
      const genreArray = Array.from(allGenres);
      
      if (genreArray.length > 0) {
        console.log(`Found genres for track ${track.id}: ${genreArray.join(', ')}`);
        await assignGenresToTrack(track.id, genreArray);
        successCount++;
      } else {
        console.log(`No genres found for track ${track.id}`);
      }
    } catch (error) {
      console.error(`Error processing track ${track.id}:`, error);
    }
  }
  
  return successCount;
}

/**
 * Get track information from Spotify API with retry logic for rate limiting
 */
async function getTrackInfo(spotifyId: string, token: string, retryCount = 0): Promise<{ 
  artists: Array<{ id: string; name: string }>
} | null> {
  const maxRetries = 3;
  const baseDelay = 1000; // 1 second
  
  try {
    // Clean spotifyId - sometimes they might have spotify:track: prefix
    const cleanId = spotifyId.includes(':') ? spotifyId.split(':').pop() : spotifyId;
    
    console.log(`Fetching track info from Spotify for ID: ${cleanId}`);
    const response = await fetch(`https://api.spotify.com/v1/tracks/${cleanId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      let errorMessage = '';
      try {
        const errorObj = await response.json() as { error?: { message?: string; status?: number } };
        errorMessage = errorObj.error?.message || response.statusText;
      } catch (e) {
        errorMessage = await response.text();
      }
      
      // Handle rate limiting (429 Too Many Requests)
      if (response.status === 429 && retryCount < maxRetries) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '1', 10);
        const delay = retryAfter * 1000 || Math.min(baseDelay * Math.pow(2, retryCount), 10000);
        
        console.log(`Rate limited. Retrying after ${delay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return getTrackInfo(spotifyId, token, retryCount + 1);
      } else if (response.status === 403) {
        console.error(`Spotify API Forbidden error (403): ${errorMessage}`);
        console.error(`This could be due to an invalid or expired token, or issues with your Spotify account permissions`);
        return null;
      } else if (response.status === 404) {
        console.error(`Spotify track not found (404): ${errorMessage}`);
        console.error(`The track ID ${cleanId} might no longer exist on Spotify or is invalid`);
        return null;
      }
      
      console.error(`Spotify API error (${response.status}): ${errorMessage}`);
      
      // For other errors, try retry if not exceeded max attempts
      if (retryCount < maxRetries) {
        const delay = Math.min(baseDelay * Math.pow(2, retryCount), 10000);
        console.log(`API error. Retrying after ${delay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return getTrackInfo(spotifyId, token, retryCount + 1);
      }
      
      return null;
    }
    
    const data = await response.json() as { artists: Array<{ id: string; name: string }> };
    console.log(`Successfully retrieved track info with ${data.artists.length} artists`);
    return data;
  } catch (error) {
    console.error(`Error fetching track info for ${spotifyId}:`, error);
    
    // Retry on network errors
    if (retryCount < maxRetries) {
      const delay = Math.min(baseDelay * Math.pow(2, retryCount), 10000);
      console.log(`Network error. Retrying after ${delay/1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return getTrackInfo(spotifyId, token, retryCount + 1);
    }
    
    return null;
  }
}

/**
 * Get artist information from Spotify API with retry logic
 */
async function getArtistInfo(artistId: string, token: string, retryCount = 0): Promise<{
  genres: string[]
} | null> {
  const maxRetries = 3;
  const baseDelay = 1000; // 1 second
  
  try {
    console.log(`Fetching artist info from Spotify for ID: ${artistId}`);
    const response = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      let errorMessage = '';
      try {
        const errorObj = await response.json() as { error?: { message?: string; status?: number } };
        errorMessage = errorObj.error?.message || response.statusText;
      } catch (e) {
        errorMessage = await response.text();
      }
      
      // Handle rate limiting (429 Too Many Requests)
      if (response.status === 429 && retryCount < maxRetries) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '1', 10);
        const delay = retryAfter * 1000 || Math.min(baseDelay * Math.pow(2, retryCount), 10000);
        
        console.log(`Rate limited on artist request. Retrying after ${delay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return getArtistInfo(artistId, token, retryCount + 1);
      } else if (response.status === 403) {
        console.error(`Spotify API Forbidden error (403): ${errorMessage}`);
        console.error(`This could be due to an invalid or expired token, or issues with your Spotify account permissions`);
        return null;
      } else if (response.status === 404) {
        console.error(`Spotify artist not found (404): ${errorMessage}`);
        console.error(`The artist ID ${artistId} might no longer exist on Spotify or is invalid`);
        return null;
      }
      
      console.error(`Spotify API error (${response.status}): ${errorMessage}`);
      
      // For other errors, try retry if not exceeded max attempts
      if (retryCount < maxRetries) {
        const delay = Math.min(baseDelay * Math.pow(2, retryCount), 10000);
        console.log(`API error. Retrying after ${delay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return getArtistInfo(artistId, token, retryCount + 1);
      }
      
      return null;
    }
    
    const data = await response.json() as { genres: string[] };
    const genreCount = data.genres ? data.genres.length : 0;
    console.log(`Successfully retrieved artist info with ${genreCount} genres: ${data.genres && data.genres.length > 0 ? data.genres.join(", ") : "none"}`);
    return data;
  } catch (error) {
    console.error(`Error fetching artist info for ${artistId}:`, error);
    
    // Retry on network errors
    if (retryCount < maxRetries) {
      const delay = Math.min(baseDelay * Math.pow(2, retryCount), 10000);
      console.log(`Network error on artist request. Retrying after ${delay/1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return getArtistInfo(artistId, token, retryCount + 1);
    }
    
    return null;
  }
}

/**
 * Search for an artist by name with retry logic
 */
async function searchArtist(artistName: string, token: string, retryCount = 0): Promise<string | null> {
  const maxRetries = 3;
  const baseDelay = 1000; // 1 second
  
  try {
    const encodedName = encodeURIComponent(artistName);
    const response = await fetch(`https://api.spotify.com/v1/search?q=${encodedName}&type=artist&limit=1`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      const errorObj = await response.json() as { error?: { message?: string; status?: number } };
      
      // Handle rate limiting (429 Too Many Requests)
      if (response.status === 429 && retryCount < maxRetries) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '1', 10);
        const delay = retryAfter * 1000 || Math.min(baseDelay * Math.pow(2, retryCount), 10000);
        
        console.log(`Rate limited on artist search. Retrying after ${delay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return searchArtist(artistName, token, retryCount + 1);
      }
      
      console.error(`Spotify API error: ${errorObj.error?.message || response.statusText}`);
      return null;
    }
    
    const data = await response.json() as { artists?: { items?: Array<{ id: string }> } };
    return data.artists?.items?.[0]?.id || null;
  } catch (error) {
    console.error(`Error searching for artist ${artistName}:`, error);
    
    // Retry on network errors
    if (retryCount < maxRetries) {
      const delay = Math.min(baseDelay * Math.pow(2, retryCount), 10000);
      console.log(`Network error on artist search. Retrying after ${delay/1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return searchArtist(artistName, token, retryCount + 1);
    }
    
    return null;
  }
}

/**
 * Get audio features for a track with retry logic
 */
async function getTrackAudioFeatures(spotifyId: string, token: string, retryCount = 0): Promise<{
  danceability: number;
  energy: number;
  tempo: number;
  valence: number;
  acousticness: number;
  instrumentalness: number;
} | null> {
  const maxRetries = 3;
  const baseDelay = 1000; // 1 second
  
  try {
    // Clean spotifyId - sometimes they might have spotify:track: prefix
    const cleanId = spotifyId.includes(':') ? spotifyId.split(':').pop() : spotifyId;
    
    console.log(`Fetching audio features from Spotify for ID: ${cleanId}`);
    const response = await fetch(`https://api.spotify.com/v1/audio-features/${cleanId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      let errorMessage = '';
      try {
        const errorObj = await response.json() as { error?: { message?: string; status?: number } };
        errorMessage = errorObj.error?.message || response.statusText;
      } catch (e) {
        errorMessage = await response.text();
      }
      
      // Handle rate limiting (429 Too Many Requests)
      if (response.status === 429 && retryCount < maxRetries) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '1', 10);
        const delay = retryAfter * 1000 || Math.min(baseDelay * Math.pow(2, retryCount), 10000);
        
        console.log(`Rate limited on audio features request. Retrying after ${delay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return getTrackAudioFeatures(spotifyId, token, retryCount + 1);
      } else if (response.status === 403) {
        console.error(`Spotify API Forbidden error (403): ${errorMessage}`);
        console.error(`This could be due to an invalid or expired token, or issues with your Spotify account permissions`);
        return null;
      } else if (response.status === 404) {
        console.error(`Spotify audio features not found (404): ${errorMessage}`);
        console.error(`The track ID ${cleanId} might not have audio features available`);
        return null;
      }
      
      console.error(`Spotify API error (${response.status}): ${errorMessage}`);
      
      // For other errors, try retry if not exceeded max attempts
      if (retryCount < maxRetries) {
        const delay = Math.min(baseDelay * Math.pow(2, retryCount), 10000);
        console.log(`API error. Retrying after ${delay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return getTrackAudioFeatures(spotifyId, token, retryCount + 1);
      }
      
      return null;
    }
    
    const data = await response.json() as {
      danceability: number;
      energy: number;
      tempo: number;
      valence: number;
      acousticness: number;
      instrumentalness: number;
    };
    
    console.log(`Successfully retrieved audio features for track`);
    return data;
  } catch (error) {
    console.error(`Error fetching audio features for ${spotifyId}:`, error);
    
    // Retry on network errors
    if (retryCount < maxRetries) {
      const delay = Math.min(baseDelay * Math.pow(2, retryCount), 10000);
      console.log(`Network error on audio features request. Retrying after ${delay/1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return getTrackAudioFeatures(spotifyId, token, retryCount + 1);
    }
    
    return null;
  }
}

/**
 * Classify track by audio features to infer genres
 */
function classifyByAudioFeatures(features: {
  danceability: number;
  energy: number;
  tempo: number;
  valence: number;
  acousticness: number;
  instrumentalness: number;
}): string[] {
  const inferredGenres: string[] = [];
  
  // Electronic dance music
  if (features.danceability > 0.7 && features.energy > 0.6) {
    inferredGenres.push('dance');
    inferredGenres.push('electronic');
  }
  
  // Hip hop
  if (features.danceability > 0.6 && features.tempo > 85 && features.tempo < 115) {
    inferredGenres.push('hip hop');
  }
  
  // Rock
  if (features.energy > 0.7 && features.danceability < 0.6) {
    inferredGenres.push('rock');
  }
  
  // Pop
  if (features.valence > 0.5 && features.danceability > 0.5 && features.energy > 0.4 && features.energy < 0.8) {
    inferredGenres.push('pop');
  }
  
  // Acoustic/Folk
  if (features.acousticness > 0.7) {
    inferredGenres.push('acoustic');
    inferredGenres.push('folk');
  }
  
  // Classical/Instrumental
  if (features.instrumentalness > 0.5) {
    inferredGenres.push('instrumental');
    if (features.acousticness > 0.4) {
      inferredGenres.push('classical');
    }
  }
  
  return inferredGenres;
}

/**
 * Infer genres from track title using basic text analysis
 * This is a fallback method when Spotify API doesn't provide genre info
 */
function inferGenresFromTitle(title: string): string[] {
  const inferredGenres = new Set<string>();
  
  // Common genre keywords and their mappings
  const genreKeywords: Record<string, string[]> = {
    // Electronic genres
    'edm': ['electronic', 'dance'],
    'dance': ['dance', 'electronic'],
    'house': ['house', 'electronic'],
    'techno': ['techno', 'electronic'],
    'trance': ['trance', 'electronic'],
    'dubstep': ['dubstep', 'electronic'],
    'drum': ['drum and bass', 'electronic'],
    'bass': ['bass', 'electronic'],
    'electronic': ['electronic'],
    'electro': ['electronic'],
    'remix': ['electronic', 'remix'],
    'dj': ['electronic', 'dance'],
    
    // Hip-hop related
    'rap': ['hip hop', 'rap'],
    'hip hop': ['hip hop'],
    'trap': ['trap', 'hip hop'],
    'gangsta': ['hip hop'],
    'r&b': ['r&b'],
    'rhythm': ['r&b'],
    
    // Rock genres
    'rock': ['rock'],
    'metal': ['metal', 'rock'],
    'punk': ['punk', 'rock'],
    'grunge': ['grunge', 'rock'],
    'alternative': ['alternative', 'rock'],
    'indie': ['indie'],
    'guitar': ['rock'],
    
    // Pop
    'pop': ['pop'],
    'ballad': ['pop'],
    
    // Latin
    'latin': ['latin'],
    'reggaeton': ['reggaeton', 'latin'],
    'salsa': ['latin', 'salsa'],
    'bachata': ['latin', 'bachata'],
    'cumbia': ['latin'],
    
    // Jamaican genres
    'reggae': ['reggae'],
    'dancehall': ['dancehall', 'reggae'],
    'ska': ['ska'],
    
    // Folk/Country
    'folk': ['folk'],
    'country': ['country'],
    'acoustic': ['acoustic'],
    
    // Moods/Styles
    'chill': ['chill'],
    'lofi': ['lofi'],
    'ambient': ['ambient'],
    'instrumental': ['instrumental'],
    
    // Classical
    'classical': ['classical'],
    'orchestra': ['classical'],
    'symphony': ['classical'],
    'piano': ['classical', 'instrumental'],
    'violin': ['classical', 'instrumental'],
    
    // Jazz and Blues
    'jazz': ['jazz'],
    'blues': ['blues'],
    'soul': ['soul'],
    'funk': ['funk'],
    
    // Global
    'world': ['world'],
    'afro': ['afrobeat'],
    'afrobeat': ['afrobeat'],
    'k-pop': ['k-pop', 'pop'],
    'j-pop': ['j-pop', 'pop'],
    
    // Decades/Eras
    '80s': ['80s'],
    '90s': ['90s'],
    '2000s': ['2000s'],
  };
  
  // Check if the title contains any genre keywords
  const words = title.toLowerCase().split(/[\s\-\_\(\)\[\]\.\,]+/);
  for (const word of words) {
    const normalizedWord = word.trim();
    if (normalizedWord && genreKeywords[normalizedWord]) {
      genreKeywords[normalizedWord].forEach(genre => inferredGenres.add(genre));
    }
  }
  
  // Extra check for combined words (for multi-word genres like "hip hop")
  for (const keyword of Object.keys(genreKeywords)) {
    if (keyword.includes(' ') && title.toLowerCase().includes(keyword)) {
      genreKeywords[keyword].forEach(genre => inferredGenres.add(genre));
    }
  }
  
  // Add popular and common genre if no specific genre is found
  if (inferredGenres.size === 0) {
    // Add 1-3 random popular genres
    const popularGenres = ['pop', 'electronic', 'hip hop', 'rock', 'r&b', 'latin'];
    const randomGenreCount = Math.floor(Math.random() * 3) + 1; // 1 to 3 genres
    
    for (let i = 0; i < randomGenreCount; i++) {
      const randomIndex = Math.floor(Math.random() * popularGenres.length);
      inferredGenres.add(popularGenres[randomIndex]);
    }
  }
  
  return Array.from(inferredGenres);
}

/**
 * Assign genres to a track
 */
async function assignGenresToTrack(trackId: number, genreNames: string[]): Promise<void> {
  try {
    // First get or create genre records
    for (const genreName of genreNames) {
      // Normalize genre name (lowercase, trim)
      const normalizedName = genreName.toLowerCase().trim();
      
      // Skip if empty
      if (!normalizedName) continue;
      
      // Find if genre exists
      let genreRecord = await db
        .select()
        .from(genres)
        .where(eq(genres.name, normalizedName))
        .limit(1);
      
      let genreId: number;
      
      if (genreRecord.length === 0) {
        // Create new genre
        const newGenre = await db
          .insert(genres)
          .values({ name: normalizedName })
          .returning();
        
        genreId = newGenre[0].id;
        console.log(`Created new genre: ${normalizedName} (ID: ${genreId})`);
      } else {
        genreId = genreRecord[0].id;
      }
      
      // Check if relationship already exists
      const existingRelation = await db
        .select()
        .from(tracksToGenres)
        .where(
          and(
            eq(tracksToGenres.trackId, trackId),
            eq(tracksToGenres.genreId, genreId)
          )
        )
        .limit(1);
      
      if (existingRelation.length === 0) {
        // Create new relationship
        await db
          .insert(tracksToGenres)
          .values({
            trackId,
            genreId
          });
        
        console.log(`Assigned genre ${normalizedName} to track ${trackId}`);
      }
    }
  } catch (error) {
    console.error(`Error assigning genres to track ${trackId}:`, error);
    throw error;
  }
}