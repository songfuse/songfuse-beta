import { config } from 'dotenv';
import OpenAI from "openai";
import { db } from "../db";
import { 
  searchTracksByText, 
  searchTracksByCriteria, 
  searchTracksByGenre, 
  searchTracksByArtist, 
  getAllGenres, 
  getAllArtists, 
  getRandomTracks, 
  getTrackStatistics,
  TrackSearchParams 
} from "./assistant-db-tools";

// Load environment variables
config();

// Initialize OpenAI client with proper production/development key selection
function initializeOpenAI() {
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Select appropriate API key based on environment
  let apiKey;
  
  if (isProduction && process.env.OPENAI_API_KEY_PROD) {
    apiKey = process.env.OPENAI_API_KEY_PROD.trim();
    console.log("[Assistant-DB] 🔐 Using PRODUCTION OpenAI API key");
  } else {
    apiKey = process.env.OPENAI_API_KEY;
    console.log("[Assistant-DB] 🔑 Using default OpenAI API key");
  }
  
  if (!apiKey) {
    console.error("[Assistant-DB] ⚠️ No OpenAI API key found");
    throw new Error("Missing OpenAI API key");
  }
  
  return new OpenAI({
    apiKey,
    dangerouslyAllowBrowser: true,
  });
}

const openai = initializeOpenAI();

export interface AssistantPlaylistRequest {
  prompt: string;
  assistantId?: string;
  userId?: number;
  sessionId?: string;
}

export interface AssistantPlaylistResponse {
  success: boolean;
  songs?: string[];
  error?: string;
  message?: string;
  tracks?: any[];
}

/**
 * Create a new OpenAI Assistant with database access tools
 */
export async function createAssistantWithDB(): Promise<string> {
  try {
    console.log("Creating new OpenAI Assistant with database access...");
    
    const assistant = await openai.beta.assistants.create({
      name: "Songfuse Playlist Creator with DB Access",
      description: "AI assistant that creates 24-song playlists using direct database access to Songfuse's music library",
      instructions: `# System Instructions for Songfuse with Database Access
Your primary task is to create a **24-song playlist** based on the songs and information available in the **Songfuse database**. You have direct access to the database through function calls.

## Absolute Restrictions
- Use ONLY songs from the Songfuse database accessed through the provided functions
- Never make assumptions or fill in blanks based on general music knowledge
- If asked to include a specific track or artist not in the database, find the best alternative
- Always return ONLY the JSON response format specified below

## Available Database Functions
You have access to these functions to query the database:

1. **searchTracksByText(query, limit, avoidExplicit)** - Search tracks using text queries with vector similarity
2. **searchTracksByCriteria(params)** - Search tracks by specific criteria (genre, artist, audio features, year)
3. **searchTracksByGenre(genreName, limit)** - Search tracks by specific genre
4. **searchTracksByArtist(artistName, limit)** - Search tracks by specific artist
5. **getAllGenres()** - Get all available genres in the database
6. **getAllArtists()** - Get all available artists in the database
7. **getRandomTracks(limit, avoidExplicit)** - Get random tracks for playlist generation
8. **getTrackStatistics()** - Get database statistics (total tracks, artists, genres, averages)

## Workflow & Steps

### 1. Analyze User Prompt
- Extract key aspects: mood, tempo, genre preferences, specific artists, time period, energy level
- Group these details into relevant music genres or search criteria

### 2. Query Database
- Use the appropriate function(s) to search for tracks matching the user's request
- Start with broad searches and narrow down based on results
- Ensure you get at least 24 songs from unique artists (unless specified otherwise)

### 3. Build the Playlist
- Select exactly 24 songs from the database results
- Ensure each song is by a unique artist (unless duplicates are requested)
- Prioritize tracks that best match the user's criteria

### 4. Return Response
- **CRITICAL: Return ONLY the JSON object, no markdown, no explanations, no text**
- **Return this exact format with no additional text:**
{
  "songs": [
    "id1",
    "id2",
    "id3",
    ...
    "id24"
  ]
}

## Rules & Constraints
- **Database Only**: Use ONLY songs from the Songfuse database via function calls
- **Artist Uniqueness**: Each song must be by a unique artist (unless duplicates requested)
- **Playlist Size**: Always return exactly 24 songs unless user specifies otherwise
- **Output Format**: Always return the exact JSON format specified above
- **No External Knowledge**: Do not use any music knowledge outside the database

## Search Strategy
1. Start with text-based search for general mood/genre requests
2. Use genre-specific search for clear genre preferences
3. Use artist-specific search for artist-focused requests
4. Use criteria-based search for specific audio features (tempo, energy, etc.)
5. Combine multiple searches if needed to get 24 unique tracks
6. Use random tracks as fallback if specific searches don't yield enough results

Remember: You are designed exclusively for playlist creation using the Songfuse database. 

CRITICAL: Your response must be ONLY the JSON object with no markdown, no explanations, no additional text. Start your response with { and end with }.`,
      model: "gpt-4o",
      tools: [
        {
          type: "function",
          function: {
            name: "searchTracksByText",
            description: "Search tracks using text queries with vector similarity search",
            parameters: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Text query to search for tracks (e.g., 'happy summer dance music')"
                },
                limit: {
                  type: "number",
                  description: "Maximum number of tracks to return (default: 24)",
                  default: 24
                },
                avoidExplicit: {
                  type: "boolean",
                  description: "Whether to avoid explicit tracks (default: false)",
                  default: false
                }
              },
              required: ["query"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "searchTracksByCriteria",
            description: "Search tracks by specific criteria like genre, artist, audio features, year range",
            parameters: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Optional text query for additional context"
                },
                genre: {
                  type: "string",
                  description: "Genre name to filter by"
                },
                artist: {
                  type: "string",
                  description: "Artist name to filter by"
                },
                limit: {
                  type: "number",
                  description: "Maximum number of tracks to return (default: 24)",
                  default: 24
                },
                avoidExplicit: {
                  type: "boolean",
                  description: "Whether to avoid explicit tracks (default: false)",
                  default: false
                },
                minTempo: {
                  type: "number",
                  description: "Minimum tempo (BPM)"
                },
                maxTempo: {
                  type: "number",
                  description: "Maximum tempo (BPM)"
                },
                minEnergy: {
                  type: "number",
                  description: "Minimum energy level (0-100)"
                },
                maxEnergy: {
                  type: "number",
                  description: "Maximum energy level (0-100)"
                },
                minValence: {
                  type: "number",
                  description: "Minimum valence/positivity (0-100)"
                },
                maxValence: {
                  type: "number",
                  description: "Maximum valence/positivity (0-100)"
                },
                minDanceability: {
                  type: "number",
                  description: "Minimum danceability (0-100)"
                },
                maxDanceability: {
                  type: "number",
                  description: "Maximum danceability (0-100)"
                },
                yearFrom: {
                  type: "number",
                  description: "Start year for release date filter"
                },
                yearTo: {
                  type: "number",
                  description: "End year for release date filter"
                }
              }
            }
          }
        },
        {
          type: "function",
          function: {
            name: "searchTracksByGenre",
            description: "Search tracks by specific genre name",
            parameters: {
              type: "object",
              properties: {
                genreName: {
                  type: "string",
                  description: "Name of the genre to search for"
                },
                limit: {
                  type: "number",
                  description: "Maximum number of tracks to return (default: 24)",
                  default: 24
                }
              },
              required: ["genreName"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "searchTracksByArtist",
            description: "Search tracks by specific artist name",
            parameters: {
              type: "object",
              properties: {
                artistName: {
                  type: "string",
                  description: "Name of the artist to search for"
                },
                limit: {
                  type: "number",
                  description: "Maximum number of tracks to return (default: 24)",
                  default: 24
                }
              },
              required: ["artistName"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "getAllGenres",
            description: "Get all available genres in the database",
            parameters: {
              type: "object",
              properties: {}
            }
          }
        },
        {
          type: "function",
          function: {
            name: "getAllArtists",
            description: "Get all available artists in the database",
            parameters: {
              type: "object",
              properties: {}
            }
          }
        },
        {
          type: "function",
          function: {
            name: "getRandomTracks",
            description: "Get random tracks for playlist generation",
            parameters: {
              type: "object",
              properties: {
                limit: {
                  type: "number",
                  description: "Maximum number of tracks to return (default: 24)",
                  default: 24
                },
                avoidExplicit: {
                  type: "boolean",
                  description: "Whether to avoid explicit tracks (default: false)",
                  default: false
                }
              }
            }
          }
        },
        {
          type: "function",
          function: {
            name: "getTrackStatistics",
            description: "Get database statistics including total tracks, artists, genres, and audio feature averages",
            parameters: {
              type: "object",
              properties: {}
            }
          }
        }
      ]
    });
    
    console.log(`✅ Created assistant with ID: ${assistant.id}`);
    return assistant.id;
  } catch (error) {
    console.error("Error creating assistant with DB access:", error);
    throw error;
  }
}

/**
 * Generate playlist using the assistant with database access
 */
export async function generatePlaylistWithDBAssistant(
  request: AssistantPlaylistRequest,
  maxRetries: number = 2
): Promise<AssistantPlaylistResponse> {
  
  if (!request.prompt) {
    return {
      success: false,
      error: "Missing prompt",
      message: "A prompt is required to generate a playlist"
    };
  }
  
  // Retry loop
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      console.log(`⚡ ASSISTANT-DB SERVICE: RETRY ATTEMPT ${attempt}/${maxRetries} for assistant playlist generation`);
      await new Promise(resolve => setTimeout(resolve, attempt * 3000));
    }

    try {
      console.log(`=== ASSISTANT-DB PLAYLIST GENERATION STARTED (Attempt ${attempt + 1}/${maxRetries + 1}) ===`);
      console.log(`⚡ ASSISTANT-DB SERVICE: Generating playlist with prompt: ${request.prompt}`);
      
      // 1. Create a Thread
      const thread = await openai.beta.threads.create();
      console.log(`Created thread ${thread.id}`);
      
      // 2. Add a Message to the Thread
      await openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: request.prompt,
      });
      
      console.log(`Added user prompt to thread`);
      
      // 3. Run the Assistant on the Thread
      const assistantId = request.assistantId || process.env.OPENAI_ASSISTANT_ID_DB;
      
      if (!assistantId) {
        throw new Error("No assistant ID provided and OPENAI_ASSISTANT_ID_DB environment variable is not set");
      }
      
      console.log(`Using assistant ID: ${assistantId}`);
      
      const run = await openai.beta.threads.runs.create(thread.id, {
        assistant_id: assistantId
      });
      console.log(`Started run ${run.id} using configured Assistant`);
      
      // 4. Poll for completion
      let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      let attempts = 0;
      const maxPollingAttempts = 30; // 5 minutes max
      
      while (runStatus.status !== "completed" && attempts < maxPollingAttempts) {
        if (runStatus.status === "failed") {
          throw new Error(`Run failed: ${runStatus.last_error?.message || "Unknown error"}`);
        }
        
        if (runStatus.status === "requires_action") {
          console.log("Assistant requires action - processing function calls...");
          
          // Process function calls
          const toolCalls = runStatus.required_action?.submit_tool_outputs?.tool_calls || [];
          const toolOutputs = [];
          
          for (const toolCall of toolCalls) {
            const functionName = toolCall.function.name;
            const functionArgs = JSON.parse(toolCall.function.arguments);
            
            console.log(`Processing function call: ${functionName}`, functionArgs);
            
            let result;
            try {
              switch (functionName) {
                case "searchTracksByText":
                  result = await searchTracksByText({
                    query: functionArgs.query,
                    limit: functionArgs.limit || 24,
                    avoidExplicit: functionArgs.avoidExplicit || false
                  });
                  break;
                  
                case "searchTracksByCriteria":
                  result = await searchTracksByCriteria({
                    query: functionArgs.query,
                    genre: functionArgs.genre,
                    artist: functionArgs.artist,
                    limit: functionArgs.limit || 24,
                    avoidExplicit: functionArgs.avoidExplicit || false,
                    minTempo: functionArgs.minTempo,
                    maxTempo: functionArgs.maxTempo,
                    minEnergy: functionArgs.minEnergy,
                    maxEnergy: functionArgs.maxEnergy,
                    minValence: functionArgs.minValence,
                    maxValence: functionArgs.maxValence,
                    minDanceability: functionArgs.minDanceability,
                    maxDanceability: functionArgs.maxDanceability,
                    yearFrom: functionArgs.yearFrom,
                    yearTo: functionArgs.yearTo
                  });
                  break;
                  
                case "searchTracksByGenre":
                  result = await searchTracksByGenre(
                    functionArgs.genreName,
                    functionArgs.limit || 24
                  );
                  break;
                  
                case "searchTracksByArtist":
                  result = await searchTracksByArtist(
                    functionArgs.artistName,
                    functionArgs.limit || 24
                  );
                  break;
                  
                case "getAllGenres":
                  result = await getAllGenres();
                  break;
                  
                case "getAllArtists":
                  result = await getAllArtists();
                  break;
                  
                case "getRandomTracks":
                  result = await getRandomTracks(
                    functionArgs.limit || 24,
                    functionArgs.avoidExplicit || false
                  );
                  break;
                  
                case "getTrackStatistics":
                  result = await getTrackStatistics();
                  break;
                  
                default:
                  result = { error: `Unknown function: ${functionName}` };
              }
              
              toolOutputs.push({
                tool_call_id: toolCall.id,
                output: JSON.stringify(result)
              });
              
            } catch (error) {
              console.error(`Error executing function ${functionName}:`, error);
              toolOutputs.push({
                tool_call_id: toolCall.id,
                output: JSON.stringify({ error: error.message })
              });
            }
          }
          
          // Submit tool outputs
          await openai.beta.threads.runs.submitToolOutputs(thread.id, run.id, {
            tool_outputs: toolOutputs
          });
          
          console.log(`Submitted ${toolOutputs.length} tool outputs`);
        }
        
        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, 10000));
        runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
        attempts++;
      }
      
      if (runStatus.status !== "completed") {
        throw new Error(`Run did not complete within timeout. Status: ${runStatus.status}`);
      }
      
      // 5. Get the assistant's response
      const messages = await openai.beta.threads.messages.list(thread.id);
      const assistantMessage = messages.data.find(msg => msg.role === "assistant");
      
      if (!assistantMessage) {
        throw new Error("No response from assistant");
      }
      
      const responseContent = assistantMessage.content[0];
      if (responseContent.type !== "text") {
        throw new Error("Unexpected response type from assistant");
      }
      
      const responseText = responseContent.text.value;
      console.log(`Assistant response: ${responseText}`);
      
      // Parse the JSON response - handle markdown-wrapped JSON with enhanced robustness
      try {
        let jsonText = responseText.trim();
        
        // Strategy 1: Remove markdown code blocks if present
        if (jsonText.includes('```json')) {
          const jsonMatch = jsonText.match(/```json\s*([\s\S]*?)\s*```/);
          if (jsonMatch) {
            jsonText = jsonMatch[1].trim();
          }
        }
        
        // Strategy 2: Remove any leading/trailing text before/after JSON
        const jsonStart = jsonText.indexOf('{');
        const jsonEnd = jsonText.lastIndexOf('}') + 1;
        if (jsonStart !== -1 && jsonEnd > jsonStart) {
          jsonText = jsonText.substring(jsonStart, jsonEnd);
        }
        
        // Strategy 3: Try to find JSON array if object parsing fails
        let jsonResponse;
        try {
          jsonResponse = JSON.parse(jsonText);
        } catch (firstParseError) {
          // If object parsing fails, try to find a JSON array
          const arrayStart = jsonText.indexOf('[');
          const arrayEnd = jsonText.lastIndexOf(']') + 1;
          if (arrayStart !== -1 && arrayEnd > arrayStart) {
            const arrayText = jsonText.substring(arrayStart, arrayEnd);
            const songsArray = JSON.parse(arrayText);
            jsonResponse = { songs: songsArray };
          } else {
            throw firstParseError;
          }
        }
        
        // Strategy 4: Handle different response formats
        let songs = null;
        if (jsonResponse.songs && Array.isArray(jsonResponse.songs)) {
          songs = jsonResponse.songs;
        } else if (Array.isArray(jsonResponse)) {
          songs = jsonResponse;
        } else if (jsonResponse.tracks && Array.isArray(jsonResponse.tracks)) {
          songs = jsonResponse.tracks;
        } else if (jsonResponse.playlist && jsonResponse.playlist.songs) {
          songs = jsonResponse.playlist.songs;
        }
        
        if (songs && Array.isArray(songs) && songs.length > 0) {
          return {
            success: true,
            songs: songs,
            message: "Playlist generated successfully using database access"
          };
        } else {
          throw new Error("Invalid response format - no valid songs array found");
        }
      } catch (parseError) {
        console.error("Error parsing assistant response:", parseError);
        console.log("Raw response:", responseText);
        
        // Try one more fallback - look for any array-like structure
        try {
          const arrayMatch = responseText.match(/\[[\s\S]*?\]/);
          if (arrayMatch) {
            const songs = JSON.parse(arrayMatch[0]);
            if (Array.isArray(songs) && songs.length > 0) {
              return {
                success: true,
                songs: songs,
                message: "Playlist generated successfully using database access (fallback parsing)"
              };
            }
          }
        } catch (fallbackError) {
          console.error("Fallback parsing also failed:", fallbackError);
        }
        
        throw new Error(`Failed to parse assistant response: ${parseError.message}`);
      }
      
    } catch (error) {
      console.error(`Attempt ${attempt + 1} failed:`, error);
      
      if (attempt === maxRetries) {
        return {
          success: false,
          error: error.message,
          message: `Failed to generate playlist after ${maxRetries + 1} attempts`
        };
      }
    }
  }
  
  return {
    success: false,
    error: "Unexpected error",
    message: "Failed to generate playlist"
  };
}
