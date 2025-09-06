/**
 * API routes for the Multi-platform Connection Proxy (MCP)
 */

import { Router, Request, Response } from 'express';
import { generateDatabasePlaylist } from './index';
import { sql, eq } from 'drizzle-orm';

// Store the last MCP recommendation for debugging
let lastMcpRecommendation: any = null;

const router = Router();

/**
 * Generate a playlist directly from the database using natural language prompt
 * GET /api/mcp/generate?prompt=summer%20vibes&count=24
 */
router.get('/generate', async (req: Request, res: Response) => {
  try {
    const { prompt, count } = req.query;
    
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ 
        error: 'A text prompt is required' 
      });
    }
    
    const trackCount = count ? parseInt(count as string) : 24;
    
    console.log(`MCP generating playlist for prompt: "${prompt}" with ${trackCount} tracks`);
    
    const result = await generateDatabasePlaylist(prompt, trackCount);
    
    return res.json({
      success: true,
      tracks: result.tracks,
      searchCriteria: result.searchCriteria
    });
  } catch (error) {
    console.error('Error in MCP generate endpoint:', error);
    
    // Check if we have prompt suggestions to provide
    if (error instanceof Error && error.message === 'No tracks found matching the criteria' && (error as any).suggestions) {
      return res.status(404).json({
        success: false,
        error: 'No tracks found matching the criteria',
        suggestions: (error as any).suggestions
      });
    }
    
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Generate a complete playlist with title, description, and cover image description
 * POST /api/mcp/playlist
 */
router.post('/playlist', async (req: Request, res: Response) => {
  try {
    const { prompt, count = 24 } = req.body;
    
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ 
        error: 'A text prompt is required' 
      });
    }
    
    // Import the playlist generation function from openai.ts
    const { generatePlaylistWithMCP } = await import('../openai');
    
    console.log(`MCP generating complete playlist for prompt: "${prompt}" with ${count} tracks`);
    
    // Generate the playlist with all metadata
    const result = await generatePlaylistWithMCP(prompt, count);
    
    // Store the last recommendation for debugging
    lastMcpRecommendation = {
      prompt,
      tracks: result.tracks,
      title: result.title,
      description: result.description,
      timestamp: new Date().toISOString()
    };
    
    return res.json({
      success: true,
      tracks: result.tracks,
      title: result.title,
      description: result.description,
      coverImageDescription: result.coverImageDescription
    });
  } catch (error) {
    console.error('Error in MCP playlist endpoint:', error);
    
    // Check if we have prompt suggestions to provide
    if (error instanceof Error && error.message === 'No tracks found matching the criteria' && (error as any).suggestions) {
      return res.status(404).json({
        success: false,
        error: 'No tracks found matching the criteria',
        suggestions: (error as any).suggestions
      });
    }
    
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Search for tracks using MCP
 * GET /api/mcp/search?q=summer%20vibes&genre=pop&limit=10
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { q, genre, limit = '24', avoidExplicit = 'false' } = req.query;
    
    if (!q || typeof q !== 'string') {
      return res.status(400).json({
        error: 'A search query is required'
      });
    }
    
    // Build search criteria
    const searchCriteria = {
      query: q,
      genreNames: genre ? [genre as string] : undefined,
      maxResults: parseInt(limit as string),
      avoidExplicit: avoidExplicit === 'true'
    };
    
    // Import the search function
    const { findTracksByCriteria } = await import('./index');
    
    // Execute search
    const tracks = await findTracksByCriteria(searchCriteria);
    
    // If no tracks found, provide suggestions
    if (tracks.length === 0) {
      const { generatePromptSuggestions } = await import('./index');
      const suggestions = await generatePromptSuggestions();
      
      return res.json({
        success: true,
        tracks: [],
        count: 0,
        suggestions: suggestions
      });
    }
    
    return res.json({
      success: true,
      tracks,
      count: tracks.length
    });
  } catch (error) {
    console.error('Error in MCP search endpoint:', error);
    
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Search for tracks using vector embeddings for semantic similarity
 * GET /api/mcp/vector-search?q=happy%20summer%20dance&limit=24
 * POST /api/mcp/vector-search with { query: "happy summer dance", limit: 24 }
 */
async function handleVectorSearch(req: Request, res: Response) {
  try {
    // Handle both GET and POST requests
    let query, limit, avoidExplicit;
    
    if (req.method === 'POST') {
      // POST request with JSON body
      query = req.body.query;
      limit = req.body.limit || 24;
      avoidExplicit = req.body.avoidExplicit || false;
    } else {
      // GET request with query parameters
      query = req.query.q;
      limit = parseInt(req.query.limit as string || '24');
      avoidExplicit = req.query.avoidExplicit === 'true';
    }
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        error: 'A search query is required'
      });
    }
    
    // Import vector search function
    const { findTracksByVectorSimilarity } = await import('./vector-search');
    
    // Perform vector search
    const vectorResults = await findTracksByVectorSimilarity(
      { query, avoidExplicit },
      typeof limit === 'number' ? limit : parseInt(limit)
    );
    
    if (vectorResults.length === 0) {
      // Generate suggestions when no results are found
      const { generatePromptSuggestions } = await import('./index');
      const suggestions = await generatePromptSuggestions();
      
      return res.json({
        success: true,
        tracks: [],
        count: 0,
        suggestions: suggestions
      });
    }
    
    // Fetch full track details for results
    const { db } = await import('../db');
    const { dbTrackToSpotifyTrack } = await import('../db');
    const { tracks } = await import('@shared/schema');
    const trackIds = vectorResults.map(result => result.id);
    
    // Get full track details directly from DB using IDs
    const trackResults = [];
    
    // Fetch tracks individually to avoid SQL array issues
    for (const trackId of trackIds) {
      const [track] = await db
        .select()
        .from(tracks)
        .where(eq(tracks.id, trackId));
      
      if (track) {
        trackResults.push(track);
      }
    }

    // Map to full Spotify track format with artists, album, etc.
    const fullTracks = await Promise.all(
      trackResults.map(track => dbTrackToSpotifyTrack(track))
    );
    
    // Filter out null results
    const validTracks = fullTracks.filter(track => track !== null);
    
    return res.json({
      success: true,
      tracks: validTracks,
      count: validTracks.length,
      vector_info: vectorResults.map(result => ({
        id: result.id,
        similarity: result.similarity
      }))
    });
  } catch (error) {
    console.error('Error in MCP vector search endpoint:', error);
    
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Register the handler for both GET and POST requests
router.get('/vector-search', handleVectorSearch);
router.post('/vector-search', handleVectorSearch);

/**
 * Get the last MCP recommendation for debugging
 * GET /api/mcp/last-recommendation
 */
router.get('/last-recommendation', (req: Request, res: Response) => {
  if (!lastMcpRecommendation) {
    return res.status(404).json({
      success: false,
      error: 'No MCP recommendations have been generated yet'
    });
  }
  
  return res.json({
    success: true,
    recommendation: lastMcpRecommendation
  });
});

export default router;
