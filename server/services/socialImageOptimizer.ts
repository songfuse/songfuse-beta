import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';

/**
 * Social Media Image Optimizer
 * 
 * Creates optimized cover images for social sharing and stores them in Supabase
 * - Social sharing: 800x800, under 100KB for universal compatibility
 * - Open Graph: 1200x630 for Facebook/Twitter cards
 */

interface OptimizedSocialImages {
  socialUrl: string;      // 800x800, under 100KB for messaging apps
  openGraphUrl: string;   // 1200x630 for Facebook/Twitter
}

export class SocialImageOptimizer {
  private supabase;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!
    );
  }

  /**
   * Create optimized social sharing images and store them in Supabase
   */
  async createOptimizedSocialImages(
    sourceImageUrl: string, 
    playlistId: number
  ): Promise<OptimizedSocialImages> {
    try {
      // Download the source image
      let imageBuffer: Buffer;
      
      if (sourceImageUrl.startsWith('http')) {
        // Remote image (Supabase or external)
        const response = await fetch(sourceImageUrl);
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
        imageBuffer = Buffer.from(await response.arrayBuffer());
      } else {
        throw new Error('Only remote image URLs are supported');
      }

      const results: OptimizedSocialImages = {
        socialUrl: '',
        openGraphUrl: ''
      };

      // Create social sharing version (800x800, under 100KB)
      let socialBuffer = await sharp(imageBuffer)
        .resize(800, 800, { fit: 'cover', position: 'center' })
        .jpeg({ quality: 80, progressive: true })
        .toBuffer();

      // Reduce quality if over 100KB - more aggressive reduction for better messaging app compatibility
      let quality = 80;
      while (socialBuffer.length > 95000 && quality > 25) { // Slightly under 100KB for safety margin
        quality -= 5; // Smaller increments for better quality control
        socialBuffer = await sharp(imageBuffer)
          .resize(800, 800, { fit: 'cover', position: 'center' })
          .jpeg({ quality, progressive: true })
          .toBuffer();
      }
      
      // If still too large, try smaller dimensions
      if (socialBuffer.length > 95000) {
        socialBuffer = await sharp(imageBuffer)
          .resize(600, 600, { fit: 'cover', position: 'center' })
          .jpeg({ quality: 75, progressive: true })
          .toBuffer();
      }

      // Create Open Graph version (1200x630)
      const ogBuffer = await sharp(imageBuffer)
        .resize(1200, 630, { fit: 'cover', position: 'center' })
        .jpeg({ quality: 85, progressive: true })
        .toBuffer();

      // Upload to Supabase
      const timestamp = Date.now();
      const socialFileName = `social-${playlistId}-${timestamp}.jpg`;
      const ogFileName = `og-${playlistId}-${timestamp}.jpg`;

      // Upload social version
      const { data: socialData, error: socialError } = await this.supabase.storage
        .from('playlist-covers')
        .upload(socialFileName, socialBuffer, {
          contentType: 'image/jpeg',
          upsert: true
        });

      if (socialError) throw socialError;

      // Upload Open Graph version
      const { data: ogData, error: ogError } = await this.supabase.storage
        .from('playlist-covers')
        .upload(ogFileName, ogBuffer, {
          contentType: 'image/jpeg',
          upsert: true
        });

      if (ogError) throw ogError;

      // Get public URLs
      const { data: socialPublicData } = this.supabase.storage
        .from('playlist-covers')
        .getPublicUrl(socialFileName);

      const { data: ogPublicData } = this.supabase.storage
        .from('playlist-covers')
        .getPublicUrl(ogFileName);

      results.socialUrl = socialPublicData.publicUrl;
      results.openGraphUrl = ogPublicData.publicUrl;

      console.log(`✅ Generated optimized social images for playlist ${playlistId}`);
      console.log(`   Social: ${Math.round(socialBuffer.length / 1024)}KB (800x800)`);
      console.log(`   Open Graph: ${Math.round(ogBuffer.length / 1024)}KB (1200x630)`);
      
      return results;
    } catch (error) {
      console.error('Error creating optimized social images:', error);
      throw error;
    }
  }

  /**
   * Get existing optimized images for a playlist
   */
  async getOptimizedImages(playlistId: number): Promise<OptimizedSocialImages | null> {
    try {
      // List files in the bucket for this playlist
      const { data: files, error } = await this.supabase.storage
        .from('playlist-covers')
        .list('', {
          search: `social-${playlistId}-`,
          sortBy: { column: 'created_at', order: 'desc' },
          limit: 1
        });

      if (error || !files || files.length === 0) return null;

      const socialFile = files[0];
      const ogFile = files.find(f => f.name.startsWith(`og-${playlistId}-`));

      if (!socialFile || !ogFile) return null;

      const { data: socialPublicData } = this.supabase.storage
        .from('playlist-covers')
        .getPublicUrl(socialFile.name);

      const { data: ogPublicData } = this.supabase.storage
        .from('playlist-covers')
        .getPublicUrl(ogFile.name);

      return {
        socialUrl: socialPublicData.publicUrl,
        openGraphUrl: ogPublicData.publicUrl
      };
    } catch (error) {
      console.error('Error fetching optimized images:', error);
      return null;
    }
  }

  /**
   * Clean up old optimized images
   */
  async cleanupOldImages(olderThanDays: number = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const { data: files, error } = await this.supabase.storage
        .from('playlist-covers')
        .list('', {
          search: 'social-',
          sortBy: { column: 'created_at', order: 'asc' }
        });

      if (error || !files) return;

      const filesToDelete = files
        .filter(file => new Date(file.created_at) < cutoffDate)
        .map(file => file.name);

      if (filesToDelete.length > 0) {
        await this.supabase.storage
          .from('playlist-covers')
          .remove(filesToDelete);
        
        console.log(`🧹 Cleaned up ${filesToDelete.length} old social images`);
      }
    } catch (error) {
      console.error('Error cleaning up old images:', error);
    }
  }
}

export const socialImageOptimizer = new SocialImageOptimizer();