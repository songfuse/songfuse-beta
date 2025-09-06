/**
 * Social Image Manager Service
 * 
 * Comprehensive service for managing optimized social media images for playlists.
 * Automatically generates lightweight versions for messaging apps and social sharing.
 */

import { db } from '../db.js';
import { playlists } from '../../shared/schema.js';
import { eq, sql, isNull, isNotNull, and } from 'drizzle-orm';
import { socialImageOptimizer } from './socialImageOptimizer.js';

export interface SocialImageUrls {
  socialUrl: string;      // 800x800, under 100KB for messaging apps
  openGraphUrl: string;   // 1200x630 for social media cards
}

export class SocialImageManager {
  /**
   * Generate and store optimized social images for a playlist
   * This is called automatically when a new cover image is uploaded
   */
  async generateSocialImages(playlistId: number, coverImageUrl: string): Promise<SocialImageUrls | null> {
    try {
      console.log(`🖼️ Generating social images for playlist ${playlistId}`);
      
      // Generate optimized versions using the existing service
      const optimizedImages = await socialImageOptimizer.createOptimizedSocialImages(
        coverImageUrl, 
        playlistId
      );
      
      // Update the playlist record with the optimized image URLs
      await db.update(playlists)
        .set({
          socialImageUrl: optimizedImages.socialUrl,
          ogImageUrl: optimizedImages.openGraphUrl
        })
        .where(eq(playlists.id, playlistId));
      
      console.log(`✅ Social images generated and stored for playlist ${playlistId}`);
      console.log(`   Social URL: ${optimizedImages.socialUrl}`);
      console.log(`   OG URL: ${optimizedImages.openGraphUrl}`);
      
      return optimizedImages;
    } catch (error) {
      console.error(`❌ Failed to generate social images for playlist ${playlistId}:`, error);
      return null;
    }
  }
  
  /**
   * Get existing social images for a playlist, generating them if they don't exist
   */
  async getSocialImages(playlistId: number): Promise<SocialImageUrls | null> {
    try {
      // First check if we already have social images in the database
      const playlist = await db.select({
        socialImageUrl: playlists.socialImageUrl,
        ogImageUrl: playlists.ogImageUrl,
        coverImageUrl: playlists.coverImageUrl
      })
      .from(playlists)
      .where(eq(playlists.id, playlistId))
      .limit(1);
      
      if (!playlist || playlist.length === 0) {
        console.warn(`Playlist ${playlistId} not found`);
        return null;
      }
      
      const playlistData = playlist[0];
      
      // If we already have social images, return them
      if (playlistData.socialImageUrl && playlistData.ogImageUrl) {
        return {
          socialUrl: playlistData.socialImageUrl,
          openGraphUrl: playlistData.ogImageUrl
        };
      }
      
      // If we don't have social images but have a cover image, generate them
      if (playlistData.coverImageUrl) {
        console.log(`📸 Social images missing for playlist ${playlistId}, generating...`);
        return await this.generateSocialImages(playlistId, playlistData.coverImageUrl);
      }
      
      console.warn(`No cover image available for playlist ${playlistId}`);
      return null;
    } catch (error) {
      console.error(`Error getting social images for playlist ${playlistId}:`, error);
      return null;
    }
  }
  
  /**
   * Bulk process all playlists to ensure they have social images
   * This can be run as a maintenance script
   */
  async processMissingSocialImages(limit: number = 50): Promise<number> {
    try {
      console.log('🔍 Checking for playlists missing social images...');
      
      // Find playlists that have cover images but no social images
      const playlistsToProcess = await db.select({
        id: playlists.id,
        coverImageUrl: playlists.coverImageUrl
      })
      .from(playlists)
      .where(
        and(
          isNull(playlists.socialImageUrl),
          isNotNull(playlists.coverImageUrl)
        )
      )
      .limit(limit);
      
      console.log(`Found ${playlistsToProcess.length} playlists needing social images`);
      
      let processedCount = 0;
      
      for (const playlist of playlistsToProcess) {
        if (playlist.coverImageUrl) {
          const result = await this.generateSocialImages(playlist.id, playlist.coverImageUrl);
          if (result) {
            processedCount++;
          }
          
          // Add a small delay to avoid overwhelming the system
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      console.log(`✅ Processed ${processedCount} playlists for social images`);
      return processedCount;
    } catch (error) {
      console.error('Error processing missing social images:', error);
      return 0;
    }
  }
  
  /**
   * Get the appropriate image URL for different contexts
   */
  getContextualImageUrl(
    playlist: { coverImageUrl?: string | null; socialImageUrl?: string | null; ogImageUrl?: string | null },
    context: 'social' | 'og' | 'original' = 'social'
  ): string | null {
    switch (context) {
      case 'social':
        return playlist.socialImageUrl || playlist.coverImageUrl || null;
      case 'og':
        return playlist.ogImageUrl || playlist.socialImageUrl || playlist.coverImageUrl || null;
      case 'original':
        return playlist.coverImageUrl || null;
      default:
        return playlist.coverImageUrl || null;
    }
  }
  
  /**
   * Clean up old optimized images to save storage space
   */
  async cleanupOldImages(olderThanDays: number = 30): Promise<void> {
    try {
      await socialImageOptimizer.cleanupOldImages(olderThanDays);
      console.log(`🧹 Cleaned up social images older than ${olderThanDays} days`);
    } catch (error) {
      console.error('Error cleaning up old social images:', error);
    }
  }
}

export const socialImageManager = new SocialImageManager();