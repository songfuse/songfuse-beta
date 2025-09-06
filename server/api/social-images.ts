/**
 * Social Images API Routes
 * 
 * Handles generation and retrieval of optimized social media images for playlists
 */

import { Request, Response } from 'express';
import { socialImageManager } from '../services/socialImageManager.js';
import { db } from '../db.js';
import { playlists } from '../../shared/schema.js';
import { eq } from 'drizzle-orm';

/**
 * Generate social images for a specific playlist
 * POST /api/playlists/:id/social-images
 */
export async function generatePlaylistSocialImages(req: Request, res: Response) {
  try {
    const playlistId = parseInt(req.params.id);
    
    if (isNaN(playlistId)) {
      return res.status(400).json({ error: 'Invalid playlist ID' });
    }
    
    // Get the playlist to check if it exists and has a cover image
    const playlist = await db.select({
      id: playlists.id,
      coverImageUrl: playlists.coverImageUrl,
      socialImageUrl: playlists.socialImageUrl,
      ogImageUrl: playlists.ogImageUrl
    })
    .from(playlists)
    .where(eq(playlists.id, playlistId))
    .limit(1);
    
    if (!playlist || playlist.length === 0) {
      return res.status(404).json({ error: 'Playlist not found' });
    }
    
    const playlistData = playlist[0];
    
    if (!playlistData.coverImageUrl) {
      return res.status(400).json({ error: 'Playlist has no cover image to optimize' });
    }
    
    // Generate social images
    const socialImages = await socialImageManager.generateSocialImages(
      playlistId, 
      playlistData.coverImageUrl
    );
    
    if (!socialImages) {
      return res.status(500).json({ error: 'Failed to generate social images' });
    }
    
    res.json({
      success: true,
      playlistId,
      socialImages
    });
  } catch (error) {
    console.error('Error generating playlist social images:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Get social images for a specific playlist
 * GET /api/playlists/:id/social-images
 */
export async function getPlaylistSocialImages(req: Request, res: Response) {
  try {
    const playlistId = parseInt(req.params.id);
    
    if (isNaN(playlistId)) {
      return res.status(400).json({ error: 'Invalid playlist ID' });
    }
    
    const socialImages = await socialImageManager.getSocialImages(playlistId);
    
    if (!socialImages) {
      return res.status(404).json({ error: 'No social images found for this playlist' });
    }
    
    res.json({
      success: true,
      playlistId,
      socialImages
    });
  } catch (error) {
    console.error('Error getting playlist social images:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Process missing social images for all playlists
 * POST /api/admin/process-social-images
 */
export async function processMissingSocialImages(req: Request, res: Response) {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    
    console.log(`🚀 Starting batch processing of missing social images (limit: ${limit})`);
    
    const processedCount = await socialImageManager.processMissingSocialImages(limit);
    
    res.json({
      success: true,
      processedCount,
      message: `Successfully processed ${processedCount} playlists`
    });
  } catch (error) {
    console.error('Error processing missing social images:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Get social image stats
 * GET /api/admin/social-images/stats
 */
export async function getSocialImageStats(req: Request, res: Response) {
  try {
    // Get counts of playlists with different image types
    const totalPlaylists = await db.select({ count: sql<number>`COUNT(*)::int` })
      .from(playlists);
    
    const playlistsWithCovers = await db.select({ count: sql<number>`COUNT(*)::int` })
      .from(playlists)
      .where(isNotNull(playlists.coverImageUrl));
    
    const playlistsWithSocialImages = await db.select({ count: sql<number>`COUNT(*)::int` })
      .from(playlists)
      .where(isNotNull(playlists.socialImageUrl));
    
    const playlistsWithOgImages = await db.select({ count: sql<number>`COUNT(*)::int` })
      .from(playlists)
      .where(isNotNull(playlists.ogImageUrl));
    
    const stats = {
      total: totalPlaylists[0]?.count || 0,
      withCoverImages: playlistsWithCovers[0]?.count || 0,
      withSocialImages: playlistsWithSocialImages[0]?.count || 0,
      withOgImages: playlistsWithOgImages[0]?.count || 0
    };
    
    const missingCount = stats.withCoverImages - stats.withSocialImages;
    
    res.json({
      success: true,
      stats: {
        ...stats,
        missingOptimizedImages: missingCount,
        optimizationComplete: missingCount === 0
      }
    });
  } catch (error) {
    console.error('Error getting social image stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Add the necessary imports for SQL functions
import { sql, isNotNull } from 'drizzle-orm';