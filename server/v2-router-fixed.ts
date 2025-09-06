import express, { Request, Response } from 'express';
import { playlistStorage } from './playlist_storage_simplified';
import { savePlaylist, getPlaylistDetails } from './routes-playlist-simplified';
import { db } from './db';
import { eq, and } from 'drizzle-orm';
import * as schema from '@shared/schema';

// Create a dedicated router for v2 API endpoints
const v2Router = express.Router();

// Middleware to ensure JSON content type for all v2 endpoints
v2Router.use((req, res, next) => {
  console.log(`V2 Router processing ${req.method} ${req.url}`);
  // Force JSON Content-Type
  res.setHeader('Content-Type', 'application/json');
  next();
});

// Get all playlists endpoint
v2Router.get('/playlists', async (req: Request, res: Response) => {
  try {
    console.log('V2 Router: handling get playlists request');
    const userId = req.query.userId ? parseInt(req.query.userId as string) : null;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    const playlists = await playlistStorage.getPlaylistsByUserId(userId);
    
    // Format the playlists for the frontend
    const formattedPlaylists = playlists.map(playlist => ({
      id: playlist.id,
      spotifyId: playlist.spotifyId,
      title: playlist.title,
      description: playlist.description,
      coverImage: playlist.coverImageUrl,
      trackCount: 0, // We'll calculate this separately if needed
      spotifyUrl: playlist.spotifyUrl || ''
    }));
    
    return res.json(formattedPlaylists);
  } catch (error) {
    console.error('Error getting playlists:', error);
    return res.status(500).json({ error: 'Failed to get playlists' });
  }
});

// Delete playlist endpoint
v2Router.delete('/playlist/:id', async (req: Request, res: Response) => {
  try {
    console.log('V2 Router: handling delete playlist request');
    const playlistId = parseInt(req.params.id);
    
    if (!playlistId) {
      return res.status(400).json({ error: 'Playlist ID is required' });
    }
    
    // Get the playlist first to check ownership
    const playlist = await playlistStorage.getPlaylist(playlistId);
    
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    
    // Delete the playlist
    await playlistStorage.deletePlaylist(playlistId);
    
    return res.json({ success: true });
  } catch (error) {
    console.error('Error deleting playlist:', error);
    return res.status(500).json({ error: 'Failed to delete playlist' });
  }
});

// Add playlist-related endpoints
v2Router.post('/playlist/save', (req, res) => {
  console.log('V2 Router: handling playlist save request');
  savePlaylist(req, res);
});

v2Router.get('/playlist/:idOrSpotifyId', (req, res) => {
  console.log('V2 Router: handling playlist details request');
  getPlaylistDetails(req, res);
});

// Direct test endpoint for debugging
v2Router.post('/direct-test', async (req: Request, res: Response) => {
  try {
    console.log("V2 direct test endpoint called with body:", req.body);
    
    // Create a test response
    return res.json({
      success: true,
      message: "V2 API is working correctly!",
      timestamp: new Date().toISOString(),
      body: req.body
    });
  } catch (error) {
    console.error("Error in V2 direct test:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// Find track by exact title match
v2Router.get('/track/find-by-title', async (req: Request, res: Response) => {
  try {
    const { title } = req.query;
    
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'Title parameter is required' });
    }
    
    console.log(`V2 Router: searching for track with exact title: "${title}"`);
    
    // Search for tracks with exact title match
    const exactMatches = await db
      .select()
      .from(schema.tracks)
      .where(eq(schema.tracks.title, title))
      .limit(10);
    
    if (exactMatches.length === 0) {
      console.log(`No tracks found with exact title: "${title}"`);
      return res.json({ found: false, message: 'No tracks found with this title' });
    }
    
    console.log(`Found ${exactMatches.length} tracks with exact title: "${title}"`);
    
    // Get track details including artists and platforms
    const tracksWithDetails = await Promise.all(
      exactMatches.map(async (track) => {
        // Get artists for this track
        const artistsResult = await db
          .select({ 
            artist: schema.artists 
          })
          .from(schema.tracksToArtists)
          .innerJoin(
            schema.artists, 
            eq(schema.tracksToArtists.artistId, schema.artists.id)
          )
          .where(eq(schema.tracksToArtists.trackId, track.id));
        
        const artists = artistsResult.map(result => ({
          id: result.artist.id,
          name: result.artist.name
        }));
        
        // Get platforms for this track
        const platformsResult = await db
          .select()
          .from(schema.trackPlatformIds)
          .where(eq(schema.trackPlatformIds.trackId, track.id));
        
        const platforms = platformsResult.reduce((acc, platform) => {
          acc[platform.platform] = { 
            id: platform.platformId,
            url: platform.url || ''
          };
          return acc;
        }, {} as Record<string, { id: string, url: string }>);
        
        return {
          ...track,
          artists,
          platforms
        };
      })
    );
    
    return res.json({ 
      found: true, 
      tracks: tracksWithDetails,
      count: tracksWithDetails.length
    });
  } catch (error) {
    console.error('Error finding track by title:', error);
    return res.status(500).json({ 
      error: 'Failed to find tracks',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Find tracks by exact title match - simple version
v2Router.post('/exact-title-matches', async (req: Request, res: Response) => {
  try {
    const { titles } = req.body;
    
    if (!titles || !Array.isArray(titles) || titles.length === 0) {
      return res.status(400).json({ error: 'Array of track titles is required' });
    }
    
    // Import the simple exact matcher
    const { findTracksByExactTitles } = await import('./simple-exact-matcher');
    
    // Find tracks with exact title matches
    const tracks = await findTracksByExactTitles(titles);
    
    return res.json({
      success: true,
      tracks,
      count: tracks.length,
      requested: titles.length
    });
  } catch (error) {
    console.error('Error finding exact title matches:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default v2Router;