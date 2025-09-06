/**
 * Multi-platform Track Generator with Vector Search
 * 
 * This module provides functions to generate playlists using vector embeddings
 * for more accurate track matching.
 */
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { SearchResultItem, Song } from '@shared/schema';
import { SpotifyTrack } from '@shared/schema';
import { openai } from '../openai';
import { searchTracks } from '../db';
import { findTracksByTitleArtist } from '../services/track-matcher';

/**
 * Generate a playlist using vector search for better matching accuracy
 */
export async function generatePlaylistWithMCP(
  prompt: string,
  genres: string[] = [],
  excludeExplicit: boolean = false,
  limit: number = 24
): Promise<{
  title: string;
  description: string;
  songs: Song[];
} | null> {
  try {
    // Get song recommendations from OpenAI
    const songs = await getSongRecommendations(prompt, limit);
    
    // Match songs to our database
    const matchedTracks = await findMatchingTracks(songs, excludeExplicit);
    
    // Generate title and description
    const metadata = await generateTitleAndDescription(prompt, matchedTracks);
    
    return {
      title: metadata.title,
      description: metadata.description,
      songs: songs
    };
  } catch (error) {
    console.error('Error generating playlist with MCP:', error);
    return null;
  }
}

/**
 * Get song recommendations from OpenAI
 */
async function getSongRecommendations(prompt: string, limit: number = 24): Promise<Song[]> {
  const systemPrompt = `You are a music recommendation expert. Given a user's request, recommend exactly ${limit} songs that match their request.
Output ONLY a valid JSON array with this structure:
[
  { "title": "Song Title", "artist": "Artist Name" },
  ...
]
Each entry must have only title and artist fields. Do not add any additional fields, explanations, or surrounding text.`;

  const userPrompt = `Create a playlist with ${limit} songs based on this request: "${prompt}".
For best results, choose a diverse set of songs that match the criteria but represent different artists and styles within the genre/theme.
Return ONLY the JSON array.`;

  try {
    // Call OpenAI API to get song recommendations
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' }
    });

    // Extract and parse the response
    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    try {
      // The response format is supposed to be a JSON object containing a songs array
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        // Sometimes GPT returns a direct array instead of a wrapped object
        return parsed.map(song => ({
          title: song.title,
          artist: song.artist
        }));
      } else if (parsed && Array.isArray(parsed.songs)) {
        // Handle case where GPT wraps in a songs array property
        return parsed.songs.map(song => ({
          title: song.title,
          artist: song.artist
        }));
      } else if (parsed) {
        // If we can't find a songs array, try to extract from the object directly
        const extractedSongs = [];
        for (let i = 0; i < limit; i++) {
          const key = i.toString();
          if (parsed[key] && parsed[key].title && parsed[key].artist) {
            extractedSongs.push({
              title: parsed[key].title,
              artist: parsed[key].artist
            });
          }
        }
        if (extractedSongs.length > 0) {
          return extractedSongs;
        }
      }

      // If we couldn't parse or find songs in the expected format, throw an error
      throw new Error('Could not parse song recommendations from OpenAI response');
    } catch (parseError) {
      console.error('Error parsing OpenAI response:', parseError);
      console.log('Raw response:', content);
      throw new Error('Failed to parse OpenAI response');
    }
  } catch (error) {
    console.error('Error getting song recommendations from OpenAI:', error);
    throw error;
  }
}

/**
 * Find tracks in our database that match the recommended songs
 */
async function findMatchingTracks(songs: Song[], excludeExplicit: boolean = false): Promise<SearchResultItem[]> {
  const results: SearchResultItem[] = [];

  // Process each song recommendation
  for (const song of songs) {
    try {
      // First try exact title/artist matching
      const tracks = await findTracksByTitleArtist(
        song.title,
        song.artist,
        1,
        excludeExplicit
      );

      if (tracks && tracks.length > 0) {
        results.push({
          song,
          status: 'found',
          track: tracks[0]
        });
      } else {
        // If exact match fails, try search
        const searchQuery = `${song.title} ${song.artist}`.trim();
        const searchResults = await searchTracks(
          searchQuery,
          1,
          0,
          excludeExplicit
        );

        if (searchResults && searchResults.length > 0) {
          results.push({
            song,
            status: 'found',
            track: searchResults[0]
          });
        } else {
          // No match found
          results.push({
            song,
            status: 'not_found',
            track: null
          });
        }
      }
    } catch (error) {
      console.error(`Error finding match for song ${song.title} by ${song.artist}:`, error);
      results.push({
        song,
        status: 'error',
        track: null,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  return results;
}

/**
 * Generate title and description for the playlist
 */
async function generateTitleAndDescription(
  prompt: string,
  matchedTracks: SearchResultItem[]
): Promise<{ title: string; description: string }> {
  // Extract the tracks that were found
  const foundTracks = matchedTracks
    .filter(item => item.status === 'found' && item.track)
    .map(item => item.track);

  // Create a prompt with track information
  const trackInfo = foundTracks
    .slice(0, 10) // Use up to 10 tracks to avoid token limits
    .map(track => `"${track.name}" by ${track.artists.map(a => a.name).join(', ')}`)
    .join('\n- ');

  // Define creative title patterns for variety
  const titlePatterns = [
    "Alliterative pairs (e.g., 'Midnight Memories', 'Velvet Voyage')",
    "Question format (e.g., 'Where Does This Road Lead?')",
    "Metaphorical concepts (e.g., 'Ocean of Emotions', 'Sonic Tapestry')",
    "Unexpected word pairings (e.g., 'Electric Forest', 'Neon Heartache')",
    "Cultural references (e.g., 'Ghost in the Machine', 'Interstellar Highway')",
    "Emotional contrasts (e.g., 'Sweet Sorrow', 'Beautiful Chaos')",
    "Time or place evocation (e.g., 'Tokyo Twilight', 'Summer of '85')",
    "Action phrases (e.g., 'Running Through Memories', 'Chasing Shadows')",
    "Sensory experiences (e.g., 'Velvet Thunder', 'Whispered Echoes')",
    "Single powerful word + modifier (e.g., 'Reckless Abandon', 'Gentle Revolution')"
  ];
  
  // Define creative description styles for diversity
  const descriptionStyles = [
    "poetic with vivid imagery that paints a mental picture",
    "conversational as if recommending the playlist to a close friend",
    "cinematic describing a scene or mood the music creates",
    "nostalgic evoking memories and emotional connections",
    "playful with a touch of humor and lightheartedness",
    "mysterious with intriguing hints about the music journey",
    "sensory focusing on how the music makes you feel physically",
    "narrative telling a short story about what the playlist represents",
    "reflective with philosophical undertones about the music's meaning",
    "energetic with dynamic language that mirrors the playlist's tempo"
  ];
  
  // Opening phrases for variety
  const openingPhrases = [
    "Immerse yourself in",
    "Lose yourself among",
    "Journey through",
    "Discover",
    "Experience",
    "Step into",
    "Vibe with",
    "Embrace",
    "Feel the",
    "Explore",
    "Surrender to",
    "Unleash",
    "Drift through",
    "Dance with",
    "Celebrate"
  ];
  
  // Pick random patterns for variety
  const randomTitlePattern = titlePatterns[Math.floor(Math.random() * titlePatterns.length)];
  const randomDescStyle = descriptionStyles[Math.floor(Math.random() * descriptionStyles.length)];
  const randomOpening = openingPhrases[Math.floor(Math.random() * openingPhrases.length)];
  
  const systemPrompt = `You are a creative playlist curator with exceptional naming talent. Generate a unique title and engaging description that stands out from typical streaming platform playlists.

TITLE GUIDELINES:
- Create a title using this pattern: ${randomTitlePattern}
- Keep it concise (2-6 words) and memorable
- Make it reflect the unique mood, theme, or story of the music
- Avoid generic phrases like "Playlist for..." or overused terms
- Make your title intriguing enough that someone would want to click it
- Be original - avoid titles that sound like other popular playlists

DESCRIPTION GUIDELINES:
- Write in a style that is ${randomDescStyle}
- Keep it brief (2-3 short sentences maximum)
- Consider starting with "${randomOpening}..." if it fits well
- Use language that evokes specific feelings or creates vivid mental images
- Include subtle references to key artists, genres, or musical elements
- Make the description unique - not something that could apply to any playlist

Return your response as a JSON object with 'title' and 'description' fields.`;

  const userPrompt = `Create a unique playlist based on this prompt: "${prompt}"
  
Here are some of the tracks that were selected for the playlist:
- ${trackInfo}

IMPORTANT:
- Create a title using the pattern: ${randomTitlePattern}
- Write a description in a ${randomDescStyle} style
- Consider starting with "${randomOpening}..." if it fits
- Make both title and description feel fresh and distinctive

Return a JSON object with your creative title and description.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    try {
      const parsed = JSON.parse(content);
      return {
        title: parsed.title || 'Generated Playlist',
        description: parsed.description || `Playlist created from prompt: ${prompt}`
      };
    } catch (parseError) {
      console.error('Error parsing OpenAI response for title/description:', parseError);
      return {
        title: 'Generated Playlist',
        description: `Playlist created from prompt: ${prompt}`
      };
    }
  } catch (error) {
    console.error('Error generating title and description:', error);
    return {
      title: 'Generated Playlist',
      description: `Playlist created from prompt: ${prompt}`
    };
  }
}