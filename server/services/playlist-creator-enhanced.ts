/**
 * Enhanced Playlist Creator Service
 * 
 * This service provides an enhanced version of the playlist creation flow
 * that uses our improved track matcher for more reliable results.
 */
import * as schema from '@shared/schema';
import { findRecommendedTracks } from './improved-song-matcher';
import { generateSongRecommendations } from './openai-enhanced';
import * as db from '../db';

/**
 * Create a playlist from user prompt
 * @param prompt User's playlist description
 * @param userId The user's ID
 * @param excludeExplicit Whether to exclude explicit content
 * @param sessionId Optional session ID for progress tracking
 * @returns Generated playlist information with songs and metadata
 */
export async function createPlaylistFromPrompt(
  prompt: string,
  userId: number,
  excludeExplicit: boolean = false,
  sessionId?: string
): Promise<{
  playlist: {
    title: string;
    description: string;
    coverImageUrl: string;
    tracks: schema.SpotifyTrack[];
    sourceMethod: string;
  };
  message: string;
  usedMcp: boolean;
}> {
  try {
    console.log(`Enhanced playlist creator: Creating playlist for user ${userId} with prompt: ${prompt}`);
    
    // Get database genres to help with recommendations
    const databaseGenres = await db.getAllDatabaseGenres();
    console.log(`Found ${databaseGenres.length} genres in database`);
    
    // Use the enhanced OpenAI service to generate recommendations
    const {
      songs: tracks,
      title,
      description,
      coverDescription,
      usedMcpMethod
    } = await generateSongRecommendations(
      prompt, 
      databaseGenres, 
      excludeExplicit
    );
    
    console.log(`Found ${tracks.length} tracks for playlist`);
    console.log(`Generated playlist title: "${title}"`);
    
    // Put it all together
    return {
      playlist: {
        title,
        description,
        coverImageUrl: "", // Empty string instead of null to avoid client-side issues
        tracks,
        sourceMethod: usedMcpMethod ? "vector" : "standard"
      },
      message: `Successfully created playlist "${title}" with ${tracks.length} tracks.`,
      usedMcp: usedMcpMethod
    };
  } catch (err) {
    const error = err as Error;
    console.error('Error creating playlist from prompt:', error);
    throw new Error(`Failed to create playlist: ${error.message || 'Unknown error'}`);
  }
}