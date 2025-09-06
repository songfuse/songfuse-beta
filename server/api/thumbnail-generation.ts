/**
 * Thumbnail Generation API
 * 
 * Handles creation of optimized image thumbnails and social media images
 * for playlist covers using Sharp image processing library.
 */

import { Request, Response } from 'express';
import { 
  storeAiGeneratedCoverWithOptimization,
  generateThumbnailsForExistingCover,
  getThumbnailUrl 
} from '../services/supabaseStorage';

/**
 * Generate thumbnails for all existing playlists that don't have them
 * This endpoint processes all playlists and creates missing thumbnail versions
 */
export async function generateMissingThumbnails(req: Request, res: Response) {
  try {
    console.log('🔄 Starting bulk thumbnail generation for existing playlists...');
    
    const { pool } = await import('../db');
    
    // Get all playlists that have cover images but might be missing thumbnails
    const playlistsResult = await pool.query(`
      SELECT id, title, cover_image_url 
      FROM playlists 
      WHERE cover_image_url IS NOT NULL 
        AND cover_image_url != ''
        AND cover_image_url LIKE '%supabase.co%'
      ORDER BY id DESC
      LIMIT 50
    `);
    
    const playlists = playlistsResult.rows;
    console.log(`Found ${playlists.length} playlists with cover images`);
    
    if (playlists.length === 0) {
      return res.json({
        success: true,
        message: 'No playlists found that need thumbnail generation',
        processed: 0
      });
    }
    
    let successCount = 0;
    let errorCount = 0;
    const results = [];
    
    // Process playlists in batches to avoid overwhelming the system
    for (const playlist of playlists) {
      try {
        console.log(`Processing playlist ${playlist.id}: ${playlist.title}`);
        
        // Check if thumbnails already exist by testing for thumb version
        const thumbnailUrl = getThumbnailUrl(playlist.cover_image_url, 'thumb');
        
        // Try to fetch the thumbnail to see if it exists
        const thumbnailTest = await fetch(thumbnailUrl);
        if (thumbnailTest.ok) {
          console.log(`Thumbnails already exist for playlist ${playlist.id}, skipping`);
          results.push({
            playlistId: playlist.id,
            title: playlist.title,
            status: 'skipped',
            reason: 'thumbnails_exist'
          });
          continue;
        }
        
        // Generate thumbnails for this playlist
        const thumbnails = await generateThumbnailsForExistingCover(
          playlist.cover_image_url, 
          playlist.id
        );
        
        if (thumbnails) {
          successCount++;
          results.push({
            playlistId: playlist.id,
            title: playlist.title,
            status: 'success',
            thumbnails: thumbnails
          });
          console.log(`✅ Generated thumbnails for playlist ${playlist.id}`);
        } else {
          errorCount++;
          results.push({
            playlistId: playlist.id,
            title: playlist.title,
            status: 'error',
            reason: 'generation_failed'
          });
          console.log(`❌ Failed to generate thumbnails for playlist ${playlist.id}`);
        }
        
        // Add a small delay to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        errorCount++;
        console.error(`Error processing playlist ${playlist.id}:`, error);
        results.push({
          playlistId: playlist.id,
          title: playlist.title,
          status: 'error',
          reason: error instanceof Error ? error.message : 'unknown_error'
        });
      }
    }
    
    console.log(`✅ Thumbnail generation completed: ${successCount} success, ${errorCount} errors`);
    
    return res.json({
      success: true,
      message: `Processed ${playlists.length} playlists`,
      processed: playlists.length,
      successCount,
      errorCount,
      results
    });
    
  } catch (error) {
    console.error('Error in bulk thumbnail generation:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate thumbnails',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Generate thumbnails for a specific playlist
 */
export async function generatePlaylistThumbnails(req: Request, res: Response) {
  try {
    const playlistId = parseInt(req.params.playlistId);
    
    if (!playlistId) {
      return res.status(400).json({
        success: false,
        message: 'Valid playlist ID is required'
      });
    }
    
    const { pool } = await import('../db');
    
    // Get the playlist
    const playlistResult = await pool.query(`
      SELECT id, title, cover_image_url 
      FROM playlists 
      WHERE id = $1
    `, [playlistId]);
    
    if (playlistResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Playlist not found'
      });
    }
    
    const playlist = playlistResult.rows[0];
    
    if (!playlist.cover_image_url) {
      return res.status(400).json({
        success: false,
        message: 'Playlist has no cover image'
      });
    }
    
    console.log(`Generating thumbnails for playlist ${playlistId}: ${playlist.title}`);
    
    const thumbnails = await generateThumbnailsForExistingCover(
      playlist.cover_image_url, 
      playlistId
    );
    
    if (thumbnails) {
      return res.json({
        success: true,
        message: `Thumbnails generated for playlist ${playlistId}`,
        playlist: {
          id: playlistId,
          title: playlist.title,
          original: playlist.cover_image_url
        },
        thumbnails
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate thumbnails'
      });
    }
    
  } catch (error) {
    console.error('Error generating playlist thumbnails:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate thumbnails',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get thumbnail URLs for a playlist cover image
 */
export async function getPlaylistThumbnails(req: Request, res: Response) {
  try {
    const playlistId = parseInt(req.params.playlistId);
    
    if (!playlistId) {
      return res.status(400).json({
        success: false,
        message: 'Valid playlist ID is required'
      });
    }
    
    const { pool } = await import('../db');
    
    // Get the playlist
    const playlistResult = await pool.query(`
      SELECT id, title, cover_image_url 
      FROM playlists 
      WHERE id = $1
    `, [playlistId]);
    
    if (playlistResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Playlist not found'
      });
    }
    
    const playlist = playlistResult.rows[0];
    
    if (!playlist.cover_image_url) {
      return res.json({
        success: true,
        playlist: {
          id: playlistId,
          title: playlist.title,
          original: null
        },
        thumbnails: null
      });
    }
    
    // Generate thumbnail URLs based on the original
    const thumbnails = {
      original: playlist.cover_image_url,
      thumbnail: getThumbnailUrl(playlist.cover_image_url, 'thumb'),
      small: getThumbnailUrl(playlist.cover_image_url, 'small'),
      social: getThumbnailUrl(playlist.cover_image_url, 'social'),
      openGraph: getThumbnailUrl(playlist.cover_image_url, 'og')
    };
    
    return res.json({
      success: true,
      playlist: {
        id: playlistId,
        title: playlist.title,
        original: playlist.cover_image_url
      },
      thumbnails
    });
    
  } catch (error) {
    console.error('Error getting playlist thumbnails:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get thumbnails',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Add thumbnail generation routes to Express app
 */
export function addThumbnailRoutes(app: any) {
  // Generate thumbnails for all playlists
  app.post('/api/admin/generate-thumbnails', generateMissingThumbnails);
  
  // Generate thumbnails for specific playlist
  app.post('/api/playlists/:playlistId/generate-thumbnails', generatePlaylistThumbnails);
  
  // Get thumbnail URLs for a playlist
  app.get('/api/playlists/:playlistId/thumbnails', getPlaylistThumbnails);
  
  console.log('✅ Thumbnail generation routes registered');
}