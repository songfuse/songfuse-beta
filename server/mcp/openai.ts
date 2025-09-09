/**
 * OpenAI integration for the MCP service
 * This file provides a specific interface for AI operations needed by the MCP service
 */

// Ensure environment variables are loaded
import 'dotenv/config';

import OpenAI from 'openai';
import type { SpotifyTrack } from '@shared/schema';
import type { SearchCriteria } from './index';

// Initialize OpenAI client with proper production/development key selection
function initializeOpenAI() {
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Select appropriate API key based on environment
  let apiKey;
  
  if (isProduction && process.env.OPENAI_API_KEY_PROD) {
    apiKey = process.env.OPENAI_API_KEY_PROD.trim();
    console.log("[MCP] 🔐 Using PRODUCTION OpenAI API key");
  } else {
    apiKey = process.env.OPENAI_API_KEY;
    console.log("[MCP] 🔑 Using default OpenAI API key");
  }
  
  if (!apiKey) {
    console.error("[MCP] ⚠️ No OpenAI API key found");
    throw new Error("Missing OpenAI API key");
  }
  
  return new OpenAI({
    apiKey,
    dangerouslyAllowBrowser: true,
  });
}

export const openai = initializeOpenAI();

/**
 * Get playlist recommendations based on the track data and criteria
 * This optimized version focuses on getting precise recommendations
 * for tracks already in our database
 */
export async function getSmartRecommendations(
  tracks: SpotifyTrack[],
  criteria: SearchCriteria,
  limit: number = 24
): Promise<SpotifyTrack[]> {
  try {
    // Extract track information for context
    const trackInfo = tracks.slice(0, 5).map(track => {
      return `"${track.name}" by ${track.artists.map((a: { name: string }) => a.name).join(', ')}`;
    }).join(', ');
    
    // Build a context prompt based on search criteria
    let contextPrompt = `Based on the user's request for ${criteria.query || 'music'}`;
    
    if (criteria.genreNames && criteria.genreNames.length > 0) {
      contextPrompt += ` in the ${criteria.genreNames.join(', ')} genre(s)`;
    }
    
    if (criteria.mood) {
      contextPrompt += ` with a ${criteria.mood} mood`;
    }
    
    if (criteria.tempo) {
      contextPrompt += ` at a ${criteria.tempo} tempo`;
    }
    
    if (criteria.era) {
      contextPrompt += ` from the ${criteria.era} era`;
    }
    
    // Use the system prompt to guide the AI
    const systemPrompt = `You are an expert music recommendation system with access to a large database of songs.
    Your task is to analyze a playlist's tracks and suggest additional songs that would fit perfectly with them.
    
    Consider factors like genre coherence, mood consistency, tempo/energy alignment, and artist diversity.
    Focus on recommending songs that feel like natural additions to this playlist.
    
    Only suggest songs that could realistically exist in our music database - no made-up tracks or obscure bootlegs.`;
    
    // Create a user prompt with the track list and recommendations request
    const userPrompt = `${contextPrompt}

    Here are some tracks already in the playlist: ${trackInfo}
    
    Recommend ${limit} additional tracks that would fit perfectly with these, focusing on maintaining genre cohesion 
    while ensuring artist diversity. For each recommendation, provide the song title and artist name.
    
    Format your response as a numbered list of songs in the format "Artist - Title".
    For example:
    1. Arctic Monkeys - 505
    2. The Strokes - Reptilia`;
    
    // Call OpenAI with our carefully constructed prompts
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7, // Slightly increased for more variety
      max_tokens: 1000 // Increased to ensure complete recommendations
    });
    
    const content = response.choices[0].message.content || '';
    
    // Parse the response into song recommendations
    const recommendations: { artist: string, title: string }[] = [];
    
    // Parse the numbered list response format
    const lines = content.split('\n');
    for (const line of lines) {
      // Match patterns like "1. Artist - Title" or "1. Title by Artist"
      const dashMatch = line.match(/\d+\.\s+(.+)\s+-\s+(.+)/);
      const byMatch = line.match(/\d+\.\s+(.+)\s+by\s+(.+)/);
      
      if (dashMatch) {
        recommendations.push({
          artist: dashMatch[1].trim(),
          title: dashMatch[2].trim()
        });
      } else if (byMatch) {
        recommendations.push({
          title: byMatch[1].trim(),
          artist: byMatch[2].trim()
        });
      }
    }
    
    console.log(`Parsed ${recommendations.length} smart recommendations from OpenAI response`);
    
    // This would ideally be extended to search for these tracks in our database
    // For now, returning the raw recommendations
    return recommendations.map((rec, index) => ({
      id: `rec-${index}`,
      name: rec.title,
      artists: [{ name: rec.artist }],
      album: { name: '', images: [] },
      duration_ms: 0,
      explicit: false,
      popularity: 50,
      uri: ''
    }));
  } catch (error) {
    console.error('Error in getSmartRecommendations:', error);
    return [];
  }
}

/**
 * Generate vector embeddings for a track
 * This will be used for similarity search in the database
 */
export async function generateTrackEmbedding(track: SpotifyTrack): Promise<number[]> {
  try {
    // Create a textual representation of the track
    const trackText = `${track.name} by ${track.artists.map((a: { name: string }) => a.name).join(', ')}. `;
    
    // Call OpenAI's embedding API
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: trackText,
      encoding_format: "float"
    });
    
    // Return the embedding vector
    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating track embedding:', error);
    // Return a zero vector as fallback
    return new Array(1536).fill(0);
  }
}
