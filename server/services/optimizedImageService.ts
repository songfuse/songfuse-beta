import sharp from 'sharp';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

/**
 * Optimized Image Service for Social Sharing
 * 
 * Creates lightweight, optimized versions of cover images specifically for social media sharing.
 * Ensures images are under 200KB for reliable display in messaging apps like WhatsApp.
 * Images are stored in Supabase for reliable public access.
 */

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

export class OptimizedImageService {
  private bucketName = 'playlist-covers';

  /**
   * Get or create an optimized version of an image for social sharing
   */
  async getOptimizedImage(originalImageUrl: string, shareId: string): Promise<string> {
    const fileName = `social-${shareId}.jpg`;

    try {
      // Check if optimized version already exists in Supabase
      const { data } = supabase.storage
        .from(this.bucketName)
        .getPublicUrl(fileName);
      
      if (data?.publicUrl) {
        // Verify the file actually exists by making a HEAD request
        const response = await fetch(data.publicUrl, { method: 'HEAD' });
        if (response.ok) {
          return data.publicUrl;
        }
      }
      
      // File doesn't exist, create optimized version
      return await this.createOptimizedImage(originalImageUrl, fileName);
    } catch (error) {
      console.error('Error accessing optimized image:', error);
      // Fall back to original image
      return originalImageUrl;
    }
  }

  private async createOptimizedImage(sourceUrl: string, fileName: string): Promise<string> {
    try {
      // Download the source image
      let imageBuffer: Buffer;
      
      if (sourceUrl.startsWith('http')) {
        const response = await fetch(sourceUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch image: ${response.statusText}`);
        }
        imageBuffer = Buffer.from(await response.arrayBuffer());
      } else {
        throw new Error('Local images not supported for social optimization');
      }

      // Create optimized version (1200x630 for Open Graph, under 200KB)
      let quality = 80;
      let optimizedBuffer: Buffer;

      do {
        optimizedBuffer = await sharp(imageBuffer)
          .resize(1200, 630, { 
            fit: 'cover', 
            position: 'center',
            withoutEnlargement: false 
          })
          .jpeg({ 
            quality,
            progressive: true,
            mozjpeg: true 
          })
          .toBuffer();

        // Reduce quality if file is still too large
        if (optimizedBuffer.length > 200000 && quality > 30) {
          quality -= 10;
        } else {
          break;
        }
      } while (quality > 30);

      // Upload to Supabase
      const { data, error } = await supabase.storage
        .from(this.bucketName)
        .upload(fileName, optimizedBuffer, {
          contentType: 'image/jpeg',
          upsert: true
        });

      if (error) {
        throw new Error(`Failed to upload optimized image: ${error.message}`);
      }

      // Get the public URL
      const { data: urlData } = supabase.storage
        .from(this.bucketName)
        .getPublicUrl(fileName);

      const fileSizeKB = Math.round(optimizedBuffer.length / 1024);
      console.log(`✅ Created optimized social image: ${fileSizeKB}KB (quality: ${quality}%)`);

      return urlData.publicUrl;
    } catch (error) {
      console.error('Error creating optimized image:', error);
      // Return original URL as fallback
      return sourceUrl;
    }
  }

}

export const optimizedImageService = new OptimizedImageService();