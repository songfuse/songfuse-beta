/**
 * Top Albums API Routes
 * 
 * This module provides API endpoints for Apple Music Top 25 Albums
 * Used to replace the Latest News functionality with trending music discovery
 */

import { Router, Request, Response } from 'express';
import { getTopAlbums, generateAlbumPlaylistPrompt } from '../services/appleMusicService';

const router = Router();

/**
 * GET /api/top-albums
 * Returns Apple Music Top 25 Albums with caching
 */
router.get('/top-albums', async (req: Request, res: Response) => {
  try {
    console.log('📊 API request for top albums');
    
    const albums = await getTopAlbums();
    
    res.json({
      success: true,
      data: albums,
      count: albums.length,
      updated: new Date().toISOString(),
      message: 'Top 25 Albums from Apple Music'
    });
    
  } catch (error) {
    console.error('❌ Error fetching top albums:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch top albums',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * POST /api/albums/playlist-prompt
 * Generate a playlist creation prompt based on album information
 */
router.post('/albums/playlist-prompt', async (req: Request, res: Response) => {
  try {
    const { albumId, title, artist, genre, releaseDate, chartPosition, isExplicit } = req.body;
    
    if (!albumId || !title || !artist) {
      return res.status(400).json({
        success: false,
        error: 'Missing required album information'
      });
    }
    
    const album = {
      id: albumId,
      title,
      artist,
      genre: genre || 'Music',
      releaseDate: releaseDate || new Date().toISOString(),
      chartPosition: chartPosition || 1,
      isExplicit: isExplicit || false,
      coverImage: '',
      appleUrl: '',
      artistId: ''
    };
    
    const prompt = generateAlbumPlaylistPrompt(album);
    
    res.json({
      success: true,
      prompt,
      album: {
        title: album.title,
        artist: album.artist,
        genre: album.genre
      }
    });
    
  } catch (error) {
    console.error('❌ Error generating album playlist prompt:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to generate playlist prompt',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

export default router;