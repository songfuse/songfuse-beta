/**
 * Cover Storage Manager API
 * 
 * This module provides API endpoints to manage and fix cover image storage issues.
 * It ensures that all cover images referenced in the database actually exist in file storage.
 */

import { Request, Response } from 'express';
import { db } from '../db';
import { playlists } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { bulletproofSaveCoverImage } from '../services/bulletproofCoverStorage';
import { generateCoverImageDescription, generateCoverImage } from '../openai';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const existsAsync = promisify(fs.exists);

/**
 * Check all playlists for missing cover images and provide a detailed report
 */
export async function checkCoverImageStatus(req: Request, res: Response) {
  try {
    console.log('[COVER MANAGER] Starting comprehensive cover image audit...');
    
    const allPlaylists = await db.select().from(playlists);
    
    const report = {
      totalPlaylists: allPlaylists.length,
      withCoverUrls: 0,
      missingFiles: [] as any[],
      validFiles: 0,
      externalUrls: 0,
      noCoverUrl: 0
    };
    
    for (const playlist of allPlaylists) {
      if (!playlist.coverImageUrl) {
        report.noCoverUrl++;
        continue;
      }
      
      report.withCoverUrls++;
      const cleanUrl = playlist.coverImageUrl.split('?')[0];
      
      // Skip external URLs
      if (cleanUrl.startsWith('http')) {
        report.externalUrls++;
        continue;
      }
      
      // Check if local file exists
      const absolutePath = path.join(process.cwd(), 'public', cleanUrl.replace(/^\//, ''));
      const exists = await existsAsync(absolutePath);
      
      if (!exists) {
        report.missingFiles.push({
          id: playlist.id,
          title: playlist.title,
          coverUrl: playlist.coverImageUrl,
          expectedPath: absolutePath
        });
      } else {
        report.validFiles++;
      }
    }
    
    console.log('[COVER MANAGER] Audit complete:', {
      total: report.totalPlaylists,
      missing: report.missingFiles.length,
      valid: report.validFiles
    });
    
    res.json({
      success: true,
      report,
      needsAttention: report.missingFiles.length > 0
    });
    
  } catch (error: any) {
    console.error('[COVER MANAGER] Error during audit:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Fix missing cover images by regenerating them
 */
export async function fixMissingCoverImages(req: Request, res: Response) {
  try {
    const { playlistIds } = req.body;
    
    if (!Array.isArray(playlistIds)) {
      return res.status(400).json({
        success: false,
        error: 'playlistIds must be an array'
      });
    }
    
    console.log(`[COVER MANAGER] Starting repair for ${playlistIds.length} playlists...`);
    
    const results = [];
    
    for (const playlistId of playlistIds) {
      try {
        const [playlist] = await db.select().from(playlists).where(eq(playlists.id, playlistId));
        
        if (!playlist) {
          results.push({
            playlistId,
            success: false,
            error: 'Playlist not found'
          });
          continue;
        }
        
        // Generate new cover description and image
        const description = await generateCoverImageDescription(
          playlist.title || 'Untitled Playlist',
          playlist.description || 'A curated music collection'
        );
        
        const newCoverUrl = await generateCoverImage(description, playlistId);
        
        results.push({
          playlistId,
          success: true,
          title: playlist.title,
          newCoverUrl
        });
        
        console.log(`[COVER MANAGER] ✅ Fixed cover for playlist ${playlistId}: "${playlist.title}"`);
        
      } catch (error: any) {
        console.error(`[COVER MANAGER] ❌ Failed to fix playlist ${playlistId}:`, error);
        results.push({
          playlistId,
          success: false,
          error: error.message
        });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    console.log(`[COVER MANAGER] Repair complete: ${successCount} fixed, ${failCount} failed`);
    
    res.json({
      success: true,
      message: `Fixed ${successCount} covers, ${failCount} failed`,
      results
    });
    
  } catch (error: any) {
    console.error('[COVER MANAGER] Error during repair:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Regenerate a single playlist cover
 */
export async function regeneratePlaylistCover(req: Request, res: Response) {
  try {
    const playlistId = parseInt(req.params.playlistId);
    
    if (isNaN(playlistId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid playlist ID'
      });
    }
    
    const [playlist] = await db.select().from(playlists).where(eq(playlists.id, playlistId));
    
    if (!playlist) {
      return res.status(404).json({
        success: false,
        error: 'Playlist not found'
      });
    }
    
    console.log(`[COVER MANAGER] Regenerating cover for playlist ${playlistId}: "${playlist.title}"`);
    
    // Generate new cover
    const description = await generateCoverImageDescription(
      playlist.title || 'Untitled Playlist',
      playlist.description || 'A curated music collection'
    );
    
    const newCoverUrl = await generateCoverImage(description, playlistId);
    
    console.log(`[COVER MANAGER] ✅ Successfully regenerated cover: ${newCoverUrl}`);
    
    res.json({
      success: true,
      playlistId,
      title: playlist.title,
      newCoverUrl,
      message: 'Cover regenerated successfully'
    });
    
  } catch (error: any) {
    console.error('[COVER MANAGER] Error regenerating cover:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}