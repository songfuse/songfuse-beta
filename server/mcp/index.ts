/**
 * MCP (Multi-platform Connection Proxy) Server - DISABLED
 * 
 * This module has been disabled by user request.
 * All functions will throw errors if called.
 */

// Importing types only - no actual database operations
import type { SpotifyTrack } from '@shared/schema';
import type OpenAI from 'openai';

// Log that MCP is disabled
console.log("⚠️ MCP module has been disabled by user request");

// Create a dummy OpenAI client that throws errors if used
const dummyOpenAI = {
  chat: {
    completions: {
      create: () => {
        throw new Error("MCP is disabled by user request");
      }
    }
  }
} as unknown as OpenAI;

// Export the dummy client instead of initializing a real one
export const openai = dummyOpenAI;

// Basic type definition for SearchCriteria
export type SearchCriteria = {
  query?: string;
  genreNames?: string[];
  genreImportance?: 'low' | 'medium' | 'high';
  mood?: string;
  tempo?: 'slow' | 'medium' | 'fast';
  era?: string;
  excludeArtists?: string[];
  maxResults?: number;
  avoidExplicit?: boolean;
  explicitArtists?: string[];
  decades?: number[];
  energyLevel?: number;
  diversityPreference?: number;
};

export type MoodMapping = {
  [key: string]: {
    genres?: string[];
    keywords?: string[];
  }
};

// Create dummy implementations for all exported functions

// Mock analyzeUserPrompt
export const analyzeUserPrompt = () => {
  console.error("MCP analyzeUserPrompt is disabled");
  throw new Error("MCP functionality has been disabled by user request");
};

// Mock prompt to search criteria
export async function promptToSearchCriteria(prompt: string): Promise<SearchCriteria> {
  console.error("MCP promptToSearchCriteria is disabled");
  throw new Error("MCP functionality has been disabled by user request");
}

// Mock find tracks by criteria
export async function findTracksByCriteria(criteria: SearchCriteria): Promise<SpotifyTrack[]> {
  console.error("MCP findTracksByCriteria is disabled");
  throw new Error("MCP functionality has been disabled by user request");
}

// Mock generate database playlist
export async function generateDatabasePlaylist(prompt: string, trackCount: number = 24): Promise<{
  tracks: SpotifyTrack[];
  searchCriteria?: SearchCriteria;
}> {
  console.error("MCP generateDatabasePlaylist is disabled");
  throw new Error("MCP functionality has been disabled by user request");
}

// Mock generate prompt suggestions
export async function generatePromptSuggestions(): Promise<string[]> {
  console.error("MCP generatePromptSuggestions is disabled");
  throw new Error("MCP functionality has been disabled by user request");
}

// Mock analyze tracks for playlist
export async function analyzeTracksForPlaylist(
  tracks: SpotifyTrack[],
  originalPrompt: string
): Promise<{ 
  title: string;
  description: string;
  coverImageDescription?: string;
}> {
  console.error("MCP analyzeTracksForPlaylist is disabled");
  throw new Error("MCP functionality has been disabled by user request");
}

// Mock select diverse tracks function
export function selectDiverseTracks(tracks: SpotifyTrack[], count: number, searchCriteria?: SearchCriteria): SpotifyTrack[] {
  console.error("MCP selectDiverseTracks is disabled");
  throw new Error("MCP functionality has been disabled by user request");
}

// Mock normalize genre name
export function normalizeGenreName(genreName: string): string {
  console.error("MCP normalizeGenreName is disabled");
  throw new Error("MCP functionality has been disabled by user request");
}