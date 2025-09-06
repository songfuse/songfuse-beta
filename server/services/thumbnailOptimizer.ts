/**
 * Thumbnail Optimizer Service
 * 
 * This service creates optimized thumbnail versions of cover images
 * for faster loading in sidebar and other small UI elements.
 */

import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface ThumbnailResult {
  thumbnailUrl: string;
  size: number;
}

/**
 * Generate optimized thumbnail from cover image
 */
async function generateThumbnail(
  sourceImageUrl: string,
  targetSize: number = 64,
  quality: number = 80
): Promise<ThumbnailResult | null> {
  try {
    console.log(`Generating thumbnail (${targetSize}px) from:`, sourceImageUrl);

    // Fetch the source image
    const response = await fetch(sourceImageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    const imageBuffer = await response.buffer();

    // Generate optimized thumbnail using Sharp
    const thumbnailBuffer = await sharp(imageBuffer)
      .resize(targetSize, targetSize, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({
        quality,
        progressive: true,
        optimizeScans: true
      })
      .toBuffer();

    // Generate unique filename for thumbnail
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const filename = `thumb-${targetSize}-${timestamp}-${randomString}.jpg`;

    // Upload to Supabase storage
    const { data, error } = await supabase.storage
      .from('playlist-covers')
      .upload(filename, thumbnailBuffer, {
        contentType: 'image/jpeg',
        cacheControl: '31536000' // 1 year cache
      });

    if (error) {
      throw new Error(`Failed to upload thumbnail: ${error.message}`);
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('playlist-covers')
      .getPublicUrl(filename);

    const thumbnailUrl = `${publicUrlData.publicUrl}?timestamp=${timestamp}`;

    console.log(`✅ Thumbnail generated successfully: ${thumbnailUrl}`);
    
    return {
      thumbnailUrl,
      size: thumbnailBuffer.length
    };

  } catch (error) {
    console.error('Error generating thumbnail:', error);
    return null;
  }
}

/**
 * Generate multiple thumbnail sizes for a cover image
 */
async function generateMultipleThumbnails(sourceImageUrl: string): Promise<{
  xs: string | null;    // 32px for collapsed sidebar
  sm: string | null;    // 64px for normal sidebar
  md: string | null;    // 128px for cards
}> {
  const results = await Promise.allSettled([
    generateThumbnail(sourceImageUrl, 32, 85),   // xs - very small, higher quality
    generateThumbnail(sourceImageUrl, 64, 80),   // sm - sidebar default
    generateThumbnail(sourceImageUrl, 128, 75),  // md - card thumbnails
  ]);

  return {
    xs: results[0].status === 'fulfilled' ? results[0].value?.thumbnailUrl || null : null,
    sm: results[1].status === 'fulfilled' ? results[1].value?.thumbnailUrl || null : null,
    md: results[2].status === 'fulfilled' ? results[2].value?.thumbnailUrl || null : null,
  };
}

/**
 * Get optimized thumbnail URL for a given size
 */
function getThumbnailUrl(baseUrl: string, size: 'xs' | 'sm' | 'md'): string {
  // For now, return the base URL with size parameter
  // This can be enhanced later to use pre-generated thumbnails
  const sizeMap = {
    xs: 32,
    sm: 64,
    md: 128
  };
  
  // If it's a Supabase URL, we can add transformation parameters
  if (baseUrl.includes('supabase.co')) {
    return `${baseUrl}&width=${sizeMap[size]}&height=${sizeMap[size]}&resize=cover&quality=80`;
  }
  
  // For other URLs, return as-is for now
  return baseUrl;
}

export const thumbnailOptimizer = {
  generateThumbnail,
  generateMultipleThumbnails,
  getThumbnailUrl
};