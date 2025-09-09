/**
 * Enhanced OpenAI Service
 * 
 * This module enhances the OpenAI service with our improved track matching.
 * It's meant to be a drop-in replacement for specific functions in openai.ts
 * that handle playlist generation.
 */

// Ensure environment variables are loaded
import 'dotenv/config';

import { OpenAI } from 'openai';
import { findRecommendedTracks } from './improved-song-matcher';
import { SpotifyTrack } from '@shared/schema';
// Import MCP generator dynamically to avoid circular dependencies
async function getMcpGenerator() {
  try {
    // Try to import from mcp/generator
    return await import('../mcp/generator').then(module => module.generatePlaylistWithMCP);
  } catch (error) {
    console.error('Error importing MCP generator:', error);
    return null;
  }
} 

// OpenAI client initialization with environment-specific key selection
let openai: OpenAI;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    const isProduction = process.env.NODE_ENV === 'production';
    
    // Select appropriate API key based on environment
    let apiKey;
    
    if (isProduction && process.env.OPENAI_API_KEY_PROD) {
      apiKey = process.env.OPENAI_API_KEY_PROD.trim();
      console.log("[Enhanced] 🔐 Using PRODUCTION OpenAI API key");
    } else {
      apiKey = process.env.OPENAI_API_KEY;
      console.log("[Enhanced] 🔑 Using default OpenAI API key");
    }
    
    if (!apiKey) {
      throw new Error('OpenAI API key not found in environment variables');
    }
    
    openai = new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true,
    });
  }
  
  return openai;
}

/**
 * Generate song recommendations based on the user's prompt using OpenAI
 * Enhanced version with improved track matching
 */
export async function generateSongRecommendations(
  prompt: string,
  genres: string[] = [],
  excludeExplicit: boolean = false,
  limit: number = 24,
  mcpOptions = { enabled: true, fallbackToStandard: true }
): Promise<{
  songs: SpotifyTrack[];
  description: string;
  title: string;
  coverDescription: string;
  usedMcpMethod: boolean;
}> {
  console.log('Enhanced song recommendation function called with MCP options:', mcpOptions);
  
  let usedMcpMethod = false;
  let result: any = null;
  
  // First try the MCP method if enabled
  if (mcpOptions.enabled) {
    try {
      console.log('Attempting to use MCP method for playlist generation');
      
      // Dynamically import the MCP generator to avoid circular dependencies
      const generatePlaylistWithMCPFn = await getMcpGenerator();
      
      if (generatePlaylistWithMCPFn) {
        result = await generatePlaylistWithMCPFn(prompt, genres, excludeExplicit);
        
        if (result && result.songs && result.songs.length > 0) {
          console.log(`MCP method successfully generated ${result.songs.length} songs`);
          usedMcpMethod = true;
        } else {
          console.log('MCP method did not return any songs, falling back to standard method');
        }
      } else {
        console.log('MCP generator not available, falling back to standard method');
      }
    } catch (mcpError) {
      console.error('Error using MCP method:', mcpError);
      console.log('Falling back to standard method due to MCP error');
      result = null;
    }
  }
  
  // Fall back to standard method if needed
  if (!result && mcpOptions.fallbackToStandard) {
    console.log('Using standard method for playlist generation');
    
    // Generate recommendations from OpenAI
    const client = getOpenAIClient();
    
    // Prepare context about available genres
    let genreContext = "Use diverse genres, but prefer from these available genres: ";
    genreContext += genres.slice(0, 30).join(", ");
    genreContext += ".";
    
    // Construct system message with marketing focus
    const systemMessage = `You are a professional music marketing expert who creates viral, shareable playlists optimized for social media, streaming platforms, and SEO.

For the given prompt, recommend 24 specific songs that match the request.
${genreContext}
Focus on creating a cohesive playlist with good flow and pacing.
Ensure song variety across artists (don't recommend more than 2 songs from the same artist).
Recommend real songs that exist.

TITLE GUIDELINES - MARKETING OPTIMIZED:
- Create titles that are SHAREABLE and CLICKABLE (2-5 words max)
- Use POWER WORDS that create urgency, emotion, or curiosity
- Include trending music terms when relevant (vibes, feels, hits, energy, mood, anthems, bangers)
- Make titles that people want to screenshot and share
- Examples: "Viral TikTok Hits", "Late Night Feels", "Summer Anthems 2024", "Chill Vibes Only", "Throwback Energy", "Indie Gold", "Hip-Hop Heat"
- Avoid generic terms - be specific and memorable
- Consider seasonal relevance and trending topics
- Use alliteration and catchy phrases when possible

DESCRIPTION GUIDELINES - SEO & SHARING OPTIMIZED:
- Write 15-25 words that are highly shareable and searchable
- Include relevant genre keywords naturally
- Use emotional triggers and social proof language
- Include trending hashtags and emojis strategically (2-3 max)
- Make it sound like a must-listen playlist
- Examples: "The ultimate collection of indie hits that'll have you hitting repeat all day 🎵 #IndieVibes #NewMusic", "Perfect for your morning commute - these tracks will start your day right ☀️ #MorningPlaylist #GoodVibes"
- Include call-to-action language that encourages sharing
- Reference popular artists or trending sounds when relevant
- Use words like "ultimate", "essential", "must-listen", "viral", "trending"

Your response should be in JSON format:
{
  "songs": [
    {"title": "Song Title", "artist": "Artist Name", "genre": "Genre"},
    ...
  ],
  "genres": ["genre1", "genre2", ...],
  "title": "trending title",
  "description": "shareable description with hashtags and emojis",
  "coverDescription": "Visual description for generating a playlist cover image."
}`;

    // Call the OpenAI API
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 1.0,
      max_tokens: 2048
    });
    
    // Parse the response
    const responseText = response.choices[0].message.content;
    if (!responseText) {
      throw new Error('OpenAI returned an empty response');
    }
    
    try {
      const parsedResponse = JSON.parse(responseText);
      
      // Ensure the response has the expected structure
      if (!parsedResponse.songs || !Array.isArray(parsedResponse.songs)) {
        throw new Error('OpenAI response missing songs array');
      }
      
      // Now find matching tracks in our database
      const songRecommendations = parsedResponse.songs;
      console.log(`OpenAI recommended ${songRecommendations.length} songs`);
      
      // Use our improved track matcher
      const { tracks: matchedTracks } = await findRecommendedTracks(
        songRecommendations,
        limit,
        excludeExplicit
      );
      
      console.log(`Found ${matchedTracks.length} matching tracks in database`);
      
      // Return the complete result
      result = {
        songs: matchedTracks,
        description: parsedResponse.description || 'The ultimate collection of tracks that\'ll have you hitting repeat all day 🎵 #ViralHits #NewMusic',
        title: parsedResponse.title || 'Viral Hits',
        coverDescription: parsedResponse.coverDescription || '',
        usedMcpMethod: false
      };
    } catch (parseError) {
      console.error('Error parsing OpenAI response:', parseError);
      throw new Error('Failed to parse OpenAI response');
    }
  }
  
  // Check if we got a valid result
  if (!result || !result.songs || result.songs.length === 0) {
    throw new Error('Could not generate any song recommendations');
  }
  
  return {
    ...result,
    usedMcpMethod
  };
}