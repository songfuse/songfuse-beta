import OpenAI from "openai";
import { db } from "../db";
import { eq, like, and, or } from "drizzle-orm";
import { tracks, tracksToArtists, artists, tracksToGenres, genres } from "@shared/schema";
import { SpotifyTrack } from "@shared/schema";
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user

// Initialize OpenAI client with proper production/development key selection
function initializeOpenAI() {
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Select appropriate API key based on environment
  let apiKey;
  
  if (isProduction && process.env.OPENAI_API_KEY_PROD) {
    apiKey = process.env.OPENAI_API_KEY_PROD.trim();
    console.log("[Assistant] 🔐 Using PRODUCTION OpenAI API key");
  } else {
    apiKey = process.env.OPENAI_API_KEY;
    console.log("[Assistant] 🔑 Using default OpenAI API key");
  }
  
  if (!apiKey) {
    console.error("[Assistant] ⚠️ No OpenAI API key found");
    throw new Error("Missing OpenAI API key");
  }
  
  return new OpenAI({
    apiKey,
    dangerouslyAllowBrowser: true,
  });
}

const openai = initializeOpenAI();

// Configure Neon for WebSocket support
neonConfig.webSocketConstructor = ws;

export type AssistantPlaylistRequest = {
  prompt: string;
  assistantId?: string; // Now optional as we'll use the environment variable by default
};

export type AssistantPlaylistResponse = {
  title: string;
  description: string;
  tracks: SpotifyTrack[];
  songStats: {
    found: number;
    notFound: string[];
  };
};

/**
 * Process a prompt with an OpenAI Assistant to generate a playlist
 */
export async function generatePlaylistWithAssistant(
  request: AssistantPlaylistRequest,
  maxRetries: number = 2 // Allow up to 2 retries (total 3 attempts)
): Promise<AssistantPlaylistResponse> {
  let lastError: Error | null = null;
  
  console.log(`⚡ ASSISTANT SERVICE: Function called with prompt: "${request.prompt?.substring(0, 30)}..."`);
  console.log(`⚡ ASSISTANT SERVICE: Max retries: ${maxRetries}`);
  console.log(`⚡ ASSISTANT SERVICE: OpenAI API Key status: ${process.env.OPENAI_API_KEY ? 'Available' : 'Missing'}`);
  console.log(`⚡ ASSISTANT SERVICE: Assistant ID status: ${process.env.OPENAI_ASSISTANT_ID ? 'Available' : 'Missing'}`);
  
  // Check if the OpenAI API key is available
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI API key is missing (OPENAI_API_KEY environment variable is not set)");
  }
  
  // Check if the OpenAI Assistant ID is available
  if (!process.env.OPENAI_ASSISTANT_ID && !request.assistantId) {
    throw new Error("OpenAI Assistant ID is missing (OPENAI_ASSISTANT_ID environment variable is not set and no assistantId was provided)");
  }
  
  // Retry loop
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      console.log(`⚡ ASSISTANT SERVICE: RETRY ATTEMPT ${attempt}/${maxRetries} for assistant playlist generation`);
      // Delay before retry to allow API to recover
      await new Promise(resolve => setTimeout(resolve, attempt * 3000)); // Increase delay with each retry
    }

    try {
      console.log(`=== ASSISTANT PLAYLIST GENERATION STARTED (Attempt ${attempt + 1}/${maxRetries + 1}) ===`);
      console.log(`⚡ ASSISTANT SERVICE: Generating playlist with prompt: ${request.prompt} (using assistant from environment variable)`);
      console.log(`⚡ ASSISTANT SERVICE: Assistant ID from environment: ${process.env.OPENAI_ASSISTANT_ID}`);
      console.log(`⚡ ASSISTANT SERVICE: OpenAI API key prefix: ${process.env.OPENAI_API_KEY?.substring(0, 10)}...`);
      
      // 1. Create a Thread
      const thread = await openai.beta.threads.create();
      console.log(`Created thread ${thread.id}`);
      
      // 2. Add a Message to the Thread - send only the user's prompt
      // The Assistant should already be trained to respond with JSON
      await openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: request.prompt,
      });
      
      console.log(`Added user prompt to thread`);
      
      // 3. Run the Assistant on the Thread (no additional instructions needed)
      const assistantId = request.assistantId || process.env.OPENAI_ASSISTANT_ID;
      
      if (!assistantId) {
        throw new Error("No assistant ID provided and OPENAI_ASSISTANT_ID environment variable is not set");
      }
      
      // TypeScript needs reassurance that this is definitely a string
      const validAssistantId: string = assistantId;
      
      console.log(`Using assistant ID: ${validAssistantId}`);
      // Run the Assistant without additional instructions - it should already be configured properly
      const run = await openai.beta.threads.runs.create(thread.id, {
        assistant_id: validAssistantId
      });
      console.log(`Started run ${run.id} using configured Assistant`);
      
      // 4. Periodically check the Run status
      let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      console.log(`Initial run status: ${runStatus.status}`);
      
      // Poll for completion with timeout
      let pollCount = 0;
      const maxPolls = 30; // Maximum number of polls (90 seconds with 3s delay)
      const pollInterval = 3000; // 3 seconds between polls
      const startTime = Date.now();
      let earlyCompletionDetected = false;
      
      while (!earlyCompletionDetected && runStatus.status !== "completed") {
        pollCount++;
        console.log(`Polling for completion (${pollCount}/${maxPolls})...`);
        
        if (["failed", "cancelled", "expired"].includes(runStatus.status)) {
          throw new Error(`Assistant run failed with status: ${runStatus.status}`);
        }
        
        // Check for timeout
        if (pollCount >= maxPolls) {
          // Before giving up, do a final check for messages - the run might be "in_progress"
          // but messages might already exist
          const messages = await openai.beta.threads.messages.list(thread.id);
          const assistantMessages = messages.data.filter(msg => msg.role === "assistant");
          
          if (assistantMessages.length > 0) {
            console.log(`Found assistant messages despite run status ${runStatus.status} - proceeding with processing`);
            earlyCompletionDetected = true;
            break;
          }
          
          // If we've reached here, it's a genuine timeout
          const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
          console.error(`Assistant run timed out after ${elapsedSeconds} seconds (${pollCount} polls)`);
          throw new Error(`Assistant run timed out after ${elapsedSeconds} seconds`);
        }
        
        // Wait before checking again
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
        // Get messages first to see if any exist before checking run status
        const messages = await openai.beta.threads.messages.list(thread.id);
        const assistantMessages = messages.data.filter(msg => msg.role === "assistant");
        
        if (assistantMessages.length > 0) {
          // Messages exist, so we can proceed regardless of run.status
          console.log(`Assistant messages found before run completion - early success detection`);
          console.log(`Messages created at: ${new Date(assistantMessages[0].created_at * 1000).toISOString()}`);
          earlyCompletionDetected = true;
          break;
        }
        
        // Check run status
        runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
        console.log(`Run status: ${runStatus.status} (poll ${pollCount}/${maxPolls}, elapsed: ${Math.floor((Date.now() - startTime) / 1000)}s)`);
      }
      
      console.log(`Polling complete: ${earlyCompletionDetected ? "Early completion detected" : "Run status is completed"}`);
      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      console.log(`Total polling time: ${elapsedSeconds} seconds (${pollCount} polls)`);
      
      
      // 5. Get the Messages from the Thread
      const messages = await openai.beta.threads.messages.list(thread.id);
      console.log(`Retrieved ${messages.data.length} messages`);
      
      // Find the latest assistant message
      const lastAssistantMessage = messages.data.find(message => message.role === "assistant");
      if (!lastAssistantMessage) {
        throw new Error("No assistant response found");
      }
      
      // 6. Parse the JSON from the assistant's message
      const messageContent = lastAssistantMessage.content[0];
      if (messageContent.type !== "text") {
        throw new Error("Expected text response from assistant");
      }
      
      // Extract JSON from the response
      const textContent = messageContent.text.value;
      console.log("Raw assistant response:", textContent.substring(0, 200) + "...");

      // Try different strategies to extract JSON
      let jsonString = "";
      let playlistData;
      
      try {
        // Strategy 1: Try to parse the entire text as JSON
        playlistData = JSON.parse(textContent);
        console.log("Successfully parsed entire response as JSON");
      } catch (e) {
        // Strategy 2: Look for code blocks with JSON
        const codeBlockMatch = textContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (codeBlockMatch && codeBlockMatch[1]) {
          try {
            playlistData = JSON.parse(codeBlockMatch[1].trim());
            console.log("Successfully parsed JSON from code block");
          } catch (e2) {
            // Strategy 3: Try to extract anything that looks like a JSON object
            const jsonMatch = textContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              try {
                playlistData = JSON.parse(jsonMatch[0]);
                console.log("Successfully parsed JSON using regex pattern");
              } catch (e3) {
                console.error("Failed to parse JSON with all strategies:", e3);
                throw new Error("Could not parse JSON from assistant response");
              }
            } else {
              throw new Error("No JSON found in assistant response");
            }
          }
        } else {
          // Strategy 3: Try to extract anything that looks like a JSON object
          const jsonMatch = textContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              playlistData = JSON.parse(jsonMatch[0]);
              console.log("Successfully parsed JSON using regex pattern");
            } catch (e3) {
              console.error("Failed to parse JSON with all strategies:", e3);
              throw new Error("Could not parse JSON from assistant response");
            }
          } else {
            throw new Error("No JSON found in assistant response");
          }
        }
      }
      console.log(`Successfully parsed playlist data: title=${playlistData.title}`);
      
      // 7. Search for songs in our database
      const songsToFind = playlistData.songs || [];
      const foundTracks: SpotifyTrack[] = [];
      const notFoundSongs: string[] = [];
      
      console.log(`Got ${songsToFind.length} songs to find in database`);
      
      // Create a clean list of song suggestions with proper structure
      const songSuggestions: Array<{title: string, artist: string, genre?: string}> = [];
      
      // Extract title and artist from various formats
      for (const song of songsToFind) {
        let title = "";
        let artist = "";
        let genre = "";
        
        // Handle multiple possible formats for song data
        if (typeof song === 'string') {
          // Format: Simple string like "Song Title"
          title = song;
        } else if (song && typeof song === 'object') {
          if ('title' in song && song.title) {
            // Format: { title: "Song Title", artist: "Artist Name" }
            title = String(song.title);
            artist = song.artist ? String(song.artist) : '';
            genre = song.genre ? String(song.genre) : '';
          } else if ('name' in song && song.name) {
            // Format: { name: "Song Title", artist: "Artist Name" }
            title = String(song.name);
            artist = song.artist ? String(song.artist) : '';
            genre = song.genre ? String(song.genre) : '';
          }
        }
        
        // Special case: handle strings with format "Title:>Artist:>DatabaseID" or "Title:>Artist:>SpotifyID"
        if (typeof song === 'string' && song.includes(':>')) {
          const parts = song.split(':>');
          title = parts[0] || '';
          artist = parts[1] || '';
          
          // Check if the third part is a database ID (numeric value)
          if (parts.length >= 3 && parts[2] && !isNaN(Number(parts[2]))) {
            // Store the database ID in the genre field temporarily
            // We'll use this later to fetch the track directly instead of searching
            genre = `db_id:${parts[2]}`;
            console.log(`Found direct database ID ${parts[2]} for track "${title}" by "${artist}"`);
          }
          // Otherwise, we ignore the third part as we don't need it for search
        }
        
        // Skip empty titles
        if (!title.trim()) {
          console.log(`Skipping empty song title`);
          continue;
        }
        
        // Add to our collection of songs to search
        songSuggestions.push({
          title: title.trim(),
          artist: artist.trim(),
          genre: genre.trim() || undefined
        });
      }
      
      console.log(`Prepared ${songSuggestions.length} song suggestions for database search`);
      
      // Use our improved search function to find all matches at once
      if (songSuggestions.length > 0) {
        try {
          console.log("Using direct exact title matching for reliable database IDs");
          
          // Use the same direct track finder approach as in the /assistant-matcher-test endpoint
          // This ensures we get the same database track IDs across all parts of the application
          const processedSuggestions = new Set<string>(); // To avoid duplicate processing
          const databaseTrackIds = []; // To keep track of which db IDs we're using
          const notFound: {title: string, artist?: string, genre?: string}[] = [];
          
          // DETAILED DIAGNOSTIC LOGGING
          console.log("Song suggestions from AI:", JSON.stringify(songSuggestions, null, 2));
          
          // Process each song suggestion individually - first try direct DB ID lookup, then fallback to title/artist matching
          for (const suggestion of songSuggestions) {
            // Skip duplicates in the suggestions
            const key = `${suggestion.title}::${suggestion.artist}`;
            if (processedSuggestions.has(key)) {
              console.log(`Skipping duplicate suggestion: ${key}`);
              continue;
            }
            
            processedSuggestions.add(key);
            
            let dbTrack: SpotifyTrack | null = null;
            
            // First check if we have a direct database ID from the assistant
            // We stored it in the genre field with prefix "db_id:"
            if (suggestion.genre && suggestion.genre.startsWith('db_id:')) {
              const dbId = Number(suggestion.genre.replace('db_id:', ''));
              console.log(`🎯 Found direct database ID (${dbId}) for "${suggestion.title}" - Using direct lookup`);
              
              // Use direct database ID lookup (much faster and more reliable)
              dbTrack = await findTrackByDatabaseId(dbId);
              
              if (dbTrack) {
                console.log(`✅ Successfully retrieved track with direct database ID: ${dbId}`);
              } else {
                console.log(`⚠️ Failed to retrieve track with direct database ID: ${dbId}, falling back to title search`);
              }
            }
            
            // If we don't have a direct database ID or the lookup failed, fall back to title/artist search
            if (!dbTrack) {
              // Log each attempt for tracing
              console.log(`Trying to find: "${suggestion.title}" by "${suggestion.artist || 'Unknown'}" using title search`);
              
              // Use our exact matching function
              dbTrack = await findTrackInDatabase(suggestion.title, suggestion.artist);
            }
            
            if (dbTrack) {
              // We found an exact match!
              foundTracks.push(dbTrack);
              
              // Track which database ID we're using for debugging
              let trackDbId = null;
              // @ts-ignore - for type compatibility
              if (dbTrack.dbId) {
                // @ts-ignore - for type compatibility
                trackDbId = dbTrack.dbId;
                // @ts-ignore - for type compatibility
                databaseTrackIds.push(dbTrack.dbId);
              } else if ('databaseId' in dbTrack) {
                // For backward compatibility, check old property name
                // @ts-ignore - for backward compatibility
                trackDbId = dbTrack.databaseId;
                // @ts-ignore - for backward compatibility
                databaseTrackIds.push(dbTrack.databaseId);
              }
              
              console.log(`✅ MATCHED: "${suggestion.title}" → Database ID: ${trackDbId}`);
              
              // If we have enough tracks, stop processing
              if (foundTracks.length >= 24) break;
            } else {
              // Track not found songs
              console.log(`❌ NO MATCH: "${suggestion.title}" by "${suggestion.artist || 'Unknown'}"`);
              notFound.push(suggestion);
            }
          }
          
          console.log("Database track IDs found:", databaseTrackIds);
          
          // Log stats
          console.log(`Added ${foundTracks.length} unique tracks to playlist`);
          
          // Add to notFoundSongs array
          notFoundSongs.push(...notFound.map(s => `${s.title}${s.artist ? ` by ${s.artist}` : ''}`));
          
          console.log(`Could not find ${notFoundSongs.length} suggested songs`);
        } catch (searchError) {
          console.error("Error using enhanced search:", searchError);
          
          // Fallback to old search method if enhanced search fails
          console.log("Falling back to individual track search");
          
          for (const suggestion of songSuggestions) {
            if (foundTracks.length >= 24) break;
            
            const { title, artist } = suggestion;
            
            console.log(`Searching for track: "${title}"${artist ? ` by "${artist}"` : ''}`);
            const dbTrack = await findTrackInDatabase(title, artist);
            
            if (dbTrack) {
              console.log(`✅ Found match in database for "${title}"`);
              foundTracks.push(dbTrack);
            } else {
              console.log(`❌ No match found for "${title}"`);
              notFoundSongs.push(`${title}${artist ? ` by ${artist}` : ''}`);
            }
          }
        }
      }
      
      // 8. Return the response
      return {
        title: playlistData.title || "Assistant Generated Playlist",
        description: playlistData.description || "Created with OpenAI Assistant",
        tracks: foundTracks,
        songStats: {
          found: foundTracks.length,
          notFound: notFoundSongs
        }
      };
      
    } catch (error) {
      console.error("=== DETAILED ASSISTANT GENERATION ERROR ===");
      console.error("Error generating playlist with assistant:", error);
      if (error instanceof Error) {
        console.error("Error name:", error.name);
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
      }
      console.error("=== END ASSISTANT GENERATION ERROR ===");
      
      // Provide more context about what might have failed
      if (error instanceof Error && error.message.includes("No assistant ID")) {
        console.error("Assistant ID issue - check OPENAI_ASSISTANT_ID env variable");
      } else if (error instanceof Error && error.message.includes("No JSON found")) {
        console.error("Assistant response format issue - assistant needs to respond with JSON");
      } else if (error instanceof Error && error.message.includes("authentication")) {
        console.error("Authentication error - check OPENAI_API_KEY env variable");
      }
      
      // Store the error for potential throw after all retries
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // If this wasn't the last retry attempt, continue to next iteration
      if (attempt < maxRetries) {
        console.log(`Will retry in ${(attempt + 1) * 3} seconds...`);
        continue;
      }
      
      // If we've exhausted all retries, throw the last error
      throw lastError;
    }
  }
  
  // This code should never be reached (we either return or throw)
  throw new Error("Unexpected error in assistant playlist generation");
}

/**
 * Search for a track in the database by title and artist
 * This function uses a simple text-based search without any audio feature filtering
 * to avoid decimal-to-integer conversion errors
 */
// Helper function to process track results
async function processTrackResults(results: any[]): Promise<SpotifyTrack | null> {
  if (results.length === 0) return null;
  
  // Group by track ID to consolidate artists
  const trackMap = new Map<number, {
    track: any,
    artists: string[]
  }>();
  
  for (const result of results) {
    if (!result.track) continue;
    
    const trackId = result.track.id;
    
    if (!trackMap.has(trackId)) {
      trackMap.set(trackId, {
        track: result.track,
        artists: []
      });
    }
    
    if (result.artistName) {
      const existingTrack = trackMap.get(trackId);
      if (existingTrack) {
        existingTrack.artists.push(result.artistName);
      }
    }
  }
  
  // If we found any tracks, take the first one
  if (trackMap.size > 0) {
    // Convert the first entry to a SpotifyTrack
    const entries = Array.from(trackMap.entries());
    const firstTrackEntry = entries[0];
    const trackData = firstTrackEntry[1];
    
    console.log(`Using best match: "${trackData.track.title}" (ID: ${firstTrackEntry[0]})`);
    return await createSpotifyTrackFromData(firstTrackEntry[0], trackData);
  }
  
  return null;
}

/**
 * Find a track directly by its database ID
 * This is the fastest and most reliable method when we have the database ID
 */
export async function findTrackByDatabaseId(
  dbId: number
): Promise<SpotifyTrack | null> {
  try {
    console.log(`🔍 DIRECT ID FINDER: Looking for track with database ID: ${dbId}`);
    
    // Import the required functions from db.ts
    const { execute, dbTrackToSpotifyTrack } = await import('../db');
    
    // Direct ID lookup query
    const trackQuery = 'SELECT * FROM "tracks" WHERE id = $1 LIMIT 1';
    const trackResult = await execute(trackQuery, [dbId]);
    
    if (trackResult.rows.length > 0) {
      const foundTrack = trackResult.rows[0];
      console.log(`✅ DIRECT ID FINDER: Found track with ID: ${foundTrack.id}, title: "${foundTrack.title}"`);
      
      // Get the Spotify ID for this track
      const spotifyIdQuery = 'SELECT platform_id FROM "track_platform_ids" WHERE track_id = $1 AND platform = $2 LIMIT 1';
      const spotifyIdResult = await execute(spotifyIdQuery, [foundTrack.id, 'spotify']);
      
      const spotifyId = spotifyIdResult.rows.length > 0 ? spotifyIdResult.rows[0].platform_id : undefined;
      
      // Convert to Spotify track format and explicitly store the database ID
      const spotifyTrack = await dbTrackToSpotifyTrack(foundTrack);
      
      // Ensure database ID is stored for consistent access
      if (spotifyTrack) {
        // @ts-ignore - adding database ID to the track
        spotifyTrack.dbId = foundTrack.id;
        // @ts-ignore - adding alternate field name for compatibility
        spotifyTrack.databaseId = foundTrack.id;
      }
      
      return spotifyTrack;
    } else {
      console.log(`⚠️ DIRECT ID FINDER: No track found with ID: ${dbId}`);
      return null;
    }
  } catch (error) {
    console.error(`DIRECT ID FINDER: Error finding track with ID ${dbId}:`, error);
    return null;
  }
}

/**
 * Find a track in our database by title using the same logic as the DirectTrackFinder
 * This uses direct SQL for maximum consistency with the /direct-track-finder endpoint
 * 
 * This function is exported so it can be tested directly through the test endpoint
 */
export async function findTrackInDatabase(
  title: string,
  artist?: string
): Promise<SpotifyTrack | null> {
  try {
    console.log(`☑️ DIRECT FINDER: Looking for exact title match: "${title}"`);
    
    // This version uses the existing db import rather than creating a new connection
    // to avoid CommonJS/ESM compatibility issues
    
    // Import the required functions from db.ts
    const { execute, dbTrackToSpotifyTrack } = await import('../db');
    
    // EXACT MATCH QUERY - identical to the one in direct-track-finder.ts
    const tracksQuery = 'SELECT * FROM "tracks" WHERE title = $1 LIMIT 1';
    const tracksResult = await execute(tracksQuery, [title]);
    
    if (tracksResult.rows.length > 0) {
      const foundTrack = tracksResult.rows[0];
      console.log(`✓ DIRECT FINDER: Found exact match for "${title}", ID: ${foundTrack.id}`);
      
      // Get the Spotify ID for this track
      const spotifyIdQuery = 'SELECT platform_id FROM "track_platform_ids" WHERE track_id = $1 AND platform = $2 LIMIT 1';
      const spotifyIdResult = await execute(spotifyIdQuery, [foundTrack.id, 'spotify']);
      
      const spotifyId = spotifyIdResult.rows.length > 0 ? spotifyIdResult.rows[0].platform_id : undefined;
      
      // Convert to Spotify track format and explicitly store the database ID
      const spotifyTrack = await dbTrackToSpotifyTrack(foundTrack);
      
      // Ensure database ID is stored for consistent access
      if (spotifyTrack) {
        // @ts-ignore - adding database ID to the track
        spotifyTrack.dbId = foundTrack.id;
        // @ts-ignore - adding alternate field name for compatibility
        spotifyTrack.databaseId = foundTrack.id;
      }
      
      return spotifyTrack;
    } else {
      console.log(`⚠️ DIRECT FINDER: No exact match found for "${title}"`);
      return null;
    }
  } catch (error) {
    console.error("DIRECT FINDER: Error finding track in database:", error);
    return null;
  }
}

/**
 * Convert database track data to SpotifyTrack format
 * This function handles the conversion carefully to avoid any errors or type issues
 */
async function createSpotifyTrackFromData(
  trackId: number, 
  trackData: { track: any; artists: string[] }
): Promise<SpotifyTrack> {
  try {
    console.log(`Converting track ID ${trackId} to SpotifyTrack format`);
    
    // Get genres for this track
    const genreResults = await db
      .select({ genreName: genres.name })
      .from(tracksToGenres)
      .leftJoin(genres, eq(tracksToGenres.genreId, genres.id))
      .where(eq(tracksToGenres.trackId, trackId));
    
    const trackGenres = genreResults
      .map(g => g.genreName)
      .filter((name): name is string => name !== null);
    
    // IMPORTANT: Carefully extract data and ensure all values have appropriate types
    // to prevent any type conversion errors
    const spotifyTrack: SpotifyTrack = {
      id: String(trackId), // Ensure ID is a string
      name: trackData.track.title || "Unknown Track",
      artists: trackData.artists.map(name => ({ name: String(name) })), // Ensure all names are strings
      album: {
        name: trackData.track.albumName || "Unknown Album",
        images: trackData.track.albumCoverUrl 
          ? [{ url: String(trackData.track.albumCoverUrl) }] 
          : [{ url: "" }]
      },
      // Ensure numeric values are properly converted to numbers
      duration_ms: typeof trackData.track.duration === 'number' 
        ? Math.floor(trackData.track.duration * 1000) 
        : 0,
      // Handle optional values
      preview_url: trackData.track.previewUrl ? String(trackData.track.previewUrl) : undefined,
      // Boolean values
      explicit: Boolean(trackData.track.explicit),
      // Ensure popularity is a number
      popularity: typeof trackData.track.popularity === 'number' 
        ? Math.floor(trackData.track.popularity) 
        : 0
    };
    
    return spotifyTrack;
  } catch (error) {
    console.error("Error creating SpotifyTrack format from database data:", error);
    
    // Return a minimal valid track to avoid breaking the client
    return {
      id: String(trackId),
      name: trackData.track?.title || "Unknown Track",
      artists: trackData.artists?.length > 0
        ? trackData.artists.map(name => ({ name: String(name) }))
        : [{ name: "Unknown Artist" }],
      album: {
        name: "Unknown Album",
        images: [{ url: "" }]
      },
      duration_ms: 0,
      preview_url: undefined,
      explicit: false,
      popularity: 0
    };
  }
}