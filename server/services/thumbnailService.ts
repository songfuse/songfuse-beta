/**
 * Thumbnail Service
 * 
 * This service generates and manages lightweight thumbnail versions of playlist covers
 * stored in Supabase for faster loading times in UI components.
 */

import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { db } from '../db';
import { playlists } from '../../shared/schema';
import { eq } from 'drizzle-orm';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

interface ThumbnailSizes {
  xs: { width: 64, height: 64 };   // For small cards and lists
  sm: { width: 128, height: 128 }; // For medium cards
  md: { width: 256, height: 256 }; // For large cards
}

const THUMBNAIL_SIZES: ThumbnailSizes = {
  xs: { width: 64, height: 64 },
  sm: { width: 128, height: 128 },
  md: { width: 256, height: 256 }
};

/**
 * Generate thumbnails for a given image buffer
 */
export async function generateThumbnails(
  imageBuffer: Buffer,
  baseFilename: string
): Promise<{ [key in keyof ThumbnailSizes]: string }> {
  const thumbnailUrls: { [key in keyof ThumbnailSizes]: string } = {} as any;
  
  for (const [size, dimensions] of Object.entries(THUMBNAIL_SIZES)) {
    try {
      // Generate optimized thumbnail
      const thumbnailBuffer = await sharp(imageBuffer)
        .resize(dimensions.width, dimensions.height, {
          fit: 'cover',
          position: 'center'
        })
        .jpeg({
          quality: 80,
          progressive: true,
          mozjpeg: true
        })
        .toBuffer();

      // Upload to Supabase
      const thumbnailPath = `thumbnails/${baseFilename}-${size}.jpg`;
      const { data, error } = await supabase.storage
        .from('playlist-covers')
        .upload(thumbnailPath, thumbnailBuffer, {
          contentType: 'image/jpeg',
          upsert: true
        });

      if (error) {
        console.error(`Failed to upload ${size} thumbnail:`, error);
        continue;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('playlist-covers')
        .getPublicUrl(thumbnailPath);

      thumbnailUrls[size as keyof ThumbnailSizes] = urlData.publicUrl;
      
    } catch (error) {
      console.error(`Failed to generate ${size} thumbnail:`, error);
    }
  }

  return thumbnailUrls;
}

/**
 * Download image from URL and generate thumbnails
 */
export async function generateThumbnailsFromUrl(
  imageUrl: string,
  baseFilename: string
): Promise<{ [key in keyof ThumbnailSizes]: string }> {
  try {
    // Download the original image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    return await generateThumbnails(imageBuffer, baseFilename);
  } catch (error) {
    console.error('Failed to generate thumbnails from URL:', error);
    return {} as any;
  }
}

/**
 * Process all existing playlist covers to generate thumbnails
 */
export async function generateThumbnailsForAllPlaylists(): Promise<void> {
  console.log('Starting thumbnail generation for all playlists...');
  
  try {
    const allPlaylists = await db.select().from(playlists);
    let processed = 0;
    let successful = 0;

    for (const playlist of allPlaylists) {
      if (!playlist.coverImageUrl) {
        console.log(`Skipping playlist ${playlist.id} - no cover image`);
        continue;
      }

      try {
        const baseFilename = `playlist-${playlist.id}-${Date.now()}`;
        const thumbnailUrls = await generateThumbnailsFromUrl(
          playlist.coverImageUrl,
          baseFilename
        );

        // Update playlist with thumbnail URLs
        if (Object.keys(thumbnailUrls).length > 0) {
          await db.update(playlists)
            .set({
              thumbnailUrls: JSON.stringify(thumbnailUrls),
              createdAt: new Date()
            })
            .where(eq(playlists.id, playlist.id));

          successful++;
          console.log(`✓ Generated thumbnails for playlist ${playlist.id}: ${playlist.title}`);
        }
      } catch (error) {
        console.error(`Failed to process playlist ${playlist.id}:`, error);
      }

      processed++;
      if (processed % 10 === 0) {
        console.log(`Progress: ${processed}/${allPlaylists.length} playlists processed`);
      }
    }

    console.log(`Thumbnail generation complete: ${successful}/${processed} successful`);
  } catch (error) {
    console.error('Failed to generate thumbnails for all playlists:', error);
  }
}

/**
 * Generate thumbnails for a single playlist cover
 */
export async function generateThumbnailsForPlaylist(
  playlistId: number,
  imageUrl: string
): Promise<{ [key in keyof ThumbnailSizes]: string }> {
  const baseFilename = `playlist-${playlistId}-${Date.now()}`;
  const thumbnailUrls = await generateThumbnailsFromUrl(imageUrl, baseFilename);

  // Update the playlist with thumbnail URLs
  if (Object.keys(thumbnailUrls).length > 0) {
    await db.update(playlists)
      .set({
        thumbnailUrls: JSON.stringify(thumbnailUrls),
        createdAt: new Date()
      })
      .where(eq(playlists.id, playlistId));
  }

  return thumbnailUrls;
}

/**
 * Get thumbnail URL for a specific size
 */
export function getThumbnailUrl(
  thumbnailUrls: string | null,
  size: keyof ThumbnailSizes = 'sm'
): string | null {
  if (!thumbnailUrls) return null;
  
  try {
    const urls = JSON.parse(thumbnailUrls);
    return urls[size] || urls.sm || urls.md || urls.xs || null;
  } catch {
    return null;
  }
}