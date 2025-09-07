#!/usr/bin/env tsx

/**
 * Standalone script to create OpenAI Assistant with database access
 * This avoids the database import issue by creating the assistant directly
 */

import { config } from 'dotenv';
import OpenAI from 'openai';

// Load environment variables
config();

async function createAssistantWithDB(): Promise<string> {
  try {
    console.log("Creating new OpenAI Assistant with database access...");
    
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      dangerouslyAllowBrowser: true,
    });
    
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
- **ALWAYS return ONLY a JSON object** with this exact structure:
\`\`\`json
{
  "songs": [
    "id1",
    "id2",
    "id3",
    ...
    "id24"
  ]
}
\`\`\`

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

Remember: You are designed exclusively for playlist creation using the Songfuse database. Always return only the JSON response format.`,
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

async function main() {
  try {
    console.log('🚀 Creating OpenAI Assistant with database access...');
    console.log('OpenAI API Key:', process.env.OPENAI_API_KEY ? 'Set' : 'Not set');
    
    const assistantId = await createAssistantWithDB();
    
    console.log('\n✅ Assistant created successfully!');
    console.log(`📋 Assistant ID: ${assistantId}`);
    console.log('\n📝 Add this to your environment variables:');
    console.log(`OPENAI_ASSISTANT_ID_DB=${assistantId}`);
    console.log('\n🔧 You can now use the new database-enabled assistant by:');
    console.log('1. Setting the OPENAI_ASSISTANT_ID_DB environment variable');
    console.log('2. Using the /_songfuse_api/playlist/db-assistant endpoint');
    console.log('3. Or calling generatePlaylistWithDBAssistant() directly');
    
  } catch (error) {
    console.error('❌ Error creating assistant:', error);
    process.exit(1);
  }
}

main();
