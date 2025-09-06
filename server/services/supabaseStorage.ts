/**
 * Supabase Storage Service for Cover Images
 * 
 * This service handles uploading, retrieving, and managing cover images
 * in Supabase Storage instead of local filesystem.
 */

import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase credentials: SUPABASE_URL and SUPABASE_ANON_KEY are required');
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const BUCKET_NAME = 'playlist-covers';

/**
 * Initialize connection to existing storage bucket
 */
export async function initializeStorageBucket(): Promise<void> {
  try {
    console.log('🔄 Testing Supabase storage connection...');
    
    // Test upload permission directly with a small test file
    const testData = Buffer.from('test');
    const testFilename = `test-${Date.now()}.txt`;
    
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(testFilename, testData, { upsert: true });
    
    if (uploadError) {
      console.error('❌ Upload test failed:', uploadError);
      throw new Error(`Cannot upload to bucket '${BUCKET_NAME}': ${uploadError.message}`);
    }
    
    console.log('✅ Supabase storage upload test successful');
    
    // Clean up test file
    const { error: deleteError } = await supabase.storage.from(BUCKET_NAME).remove([testFilename]);
    if (deleteError) {
      console.warn('⚠️ Test file cleanup failed, but storage is working:', deleteError.message);
    }
    
    console.log('✅ Supabase storage initialized and ready for cover images');
    
  } catch (error) {
    console.error('❌ Error connecting to Supabase storage:', error);
    throw error;
  }
}

/**
 * Upload a cover image to Supabase Storage
 * 
 * @param buffer Image buffer data
 * @param filename Unique filename for the image
 * @param contentType MIME type (e.g., 'image/png')
 * @returns Public URL of the uploaded image
 */
export async function uploadCoverImage(
  buffer: Buffer, 
  filename: string, 
  contentType: string = 'image/png'
): Promise<string> {
  try {
    console.log(`📤 Uploading cover image to Supabase: ${filename}`);

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filename, buffer, {
        contentType,
        upsert: true // Replace if exists
      });

    if (error) {
      console.error('❌ Failed to upload to Supabase:', error);
      throw error;
    }

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filename);

    const publicUrl = urlData.publicUrl;
    console.log(`✅ Cover image uploaded successfully: ${publicUrl}`);
    
    return publicUrl;
  } catch (error) {
    console.error('❌ Error uploading cover image:', error);
    throw error;
  }
}

/**
 * Upload cover image with automatic thumbnail generation
 * Creates multiple optimized sizes for different UI components
 * 
 * @param buffer Original image buffer data
 * @param baseFilename Base filename (without extension)
 * @param contentType MIME type (e.g., 'image/png')
 * @returns Object with URLs for original and thumbnail versions
 */
export async function uploadCoverImageWithThumbnails(
  buffer: Buffer, 
  baseFilename: string, 
  contentType: string = 'image/png'
): Promise<{
  original: string;
  thumbnail: string;
  small: string;
  social: string;
  openGraph: string;
}> {
  const Sharp = await import('sharp');
  
  try {
    console.log(`📤 Uploading cover image with multiple sizes: ${baseFilename}`);

    // Create multiple optimized versions
    const versions = await Promise.all([
      // Original size (640x640, high quality)
      Sharp.default(buffer)
        .resize(640, 640, { fit: 'cover' })
        .png({ quality: 95 })
        .toBuffer(),
      
      // Thumbnail (64x64, very small for UI previews)
      Sharp.default(buffer)
        .resize(64, 64, { fit: 'cover' })
        .png({ quality: 80, compressionLevel: 9 })
        .toBuffer(),
      
      // Small (150x150, for cards and listings)
      Sharp.default(buffer)
        .resize(150, 150, { fit: 'cover' })
        .png({ quality: 85, compressionLevel: 8 })
        .toBuffer(),
      
      // Social (400x400, optimized for messaging apps, under 100KB)
      Sharp.default(buffer)
        .resize(400, 400, { fit: 'cover' })
        .jpeg({ quality: 75, progressive: true })
        .toBuffer(),
      
      // Open Graph (1200x630, for social media cards)
      Sharp.default(buffer)
        .resize(1200, 630, { fit: 'cover' })
        .jpeg({ quality: 80, progressive: true })
        .toBuffer()
    ]);

    const [originalBuffer, thumbnailBuffer, smallBuffer, socialBuffer, ogBuffer] = versions;

    // Upload all versions in parallel
    const uploads = await Promise.all([
      uploadCoverImage(originalBuffer, `${baseFilename}.png`, 'image/png'),
      uploadCoverImage(thumbnailBuffer, `${baseFilename}-thumb.png`, 'image/png'),
      uploadCoverImage(smallBuffer, `${baseFilename}-small.png`, 'image/png'),
      uploadCoverImage(socialBuffer, `${baseFilename}-social.jpg`, 'image/jpeg'),
      uploadCoverImage(ogBuffer, `${baseFilename}-og.jpg`, 'image/jpeg')
    ]);

    const [originalUrl, thumbnailUrl, smallUrl, socialUrl, ogUrl] = uploads;

    console.log(`✅ All image versions uploaded successfully for ${baseFilename}`);
    console.log(`- Original (640x640): ${originalUrl}`);
    console.log(`- Thumbnail (64x64): ${thumbnailUrl}`);
    console.log(`- Small (150x150): ${smallUrl}`);
    console.log(`- Social (400x400): ${socialUrl}`);
    console.log(`- Open Graph (1200x630): ${ogUrl}`);

    return {
      original: originalUrl,
      thumbnail: thumbnailUrl,
      small: smallUrl,
      social: socialUrl,
      openGraph: ogUrl
    };
  } catch (error) {
    console.error('❌ Error uploading cover image with thumbnails:', error);
    throw error;
  }
}

/**
 * Generate a unique filename for cover images
 */
export function generateCoverFilename(playlistId?: number): string {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 15);
  return playlistId ? `cover-${timestamp}-${playlistId}-${randomId}` : `cover-${timestamp}-${randomId}`;
}

/**
 * Store AI-generated cover image with automatic optimization
 * Processes DALL-E or external image URLs and creates multiple optimized versions
 */
export async function storeAiGeneratedCoverWithOptimization(
  imageUrl: string, 
  playlistId?: number
): Promise<{
  original: string;
  thumbnail: string;
  small: string;
  social: string;
  openGraph: string;
}> {
  try {
    console.log(`🎨 Processing AI-generated cover image: ${imageUrl}`);
    
    // Download the image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    console.log(`📥 Downloaded image: ${buffer.length} bytes`);
    
    // Generate a unique filename
    const baseFilename = generateCoverFilename(playlistId);
    
    // Upload with multiple optimized versions
    const result = await uploadCoverImageWithThumbnails(buffer, baseFilename);
    
    console.log(`✅ AI cover image stored with optimization for playlist ${playlistId}`);
    return result;
    
  } catch (error) {
    console.error('❌ Error storing AI-generated cover:', error);
    throw error;
  }
}

/**
 * Get thumbnail URL from an original Supabase URL
 * Converts original URLs to their thumbnail equivalents
 */
export function getThumbnailUrl(originalUrl: string, size: 'thumb' | 'small' | 'social' | 'og' = 'thumb'): string {
  if (!originalUrl || !originalUrl.includes('supabase.co')) {
    return originalUrl; // Return as-is if not a Supabase URL
  }
  
  // Replace the filename extension and add size suffix
  const baseUrl = originalUrl.replace(/\.(png|jpg|jpeg)(\?.*)?$/, '');
  const extension = size === 'thumb' || size === 'small' ? 'png' : 'jpg';
  
  let suffix = '';
  switch (size) {
    case 'thumb':
      suffix = '-thumb';
      break;
    case 'small':
      suffix = '-small';
      break;
    case 'social':
      suffix = '-social';
      break;
    case 'og':
      suffix = '-og';
      break;
  }
  
  return `${baseUrl}${suffix}.${extension}`;
}

/**
 * Delete a cover image from Supabase Storage
 * 
 * @param filename The filename to delete
 */
export async function deleteCoverImage(filename: string): Promise<void> {
  try {
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([filename]);

    if (error) {
      console.error('❌ Failed to delete from Supabase:', error);
      throw error;
    }

    console.log(`🗑️ Cover image deleted successfully: ${filename}`);
  } catch (error) {
    console.error('❌ Error deleting cover image:', error);
    throw error;
  }
}

/**
 * Check if an image exists in Supabase Storage
 * 
 * @param filename The filename to check
 * @returns True if the image exists
 */
export async function coverImageExists(filename: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .list('', {
        search: filename
      });

    if (error) {
      console.error('❌ Error checking image existence:', error);
      return false;
    }

    return data?.some(file => file.name === filename) || false;
  } catch (error) {
    console.error('❌ Error checking cover image existence:', error);
    return false;
  }
}

/**
 * Generate optimized thumbnails for existing cover images
 * Takes an existing cover image URL and generates all missing thumbnail versions
 */
export async function generateThumbnailsForExistingCover(
  originalUrl: string, 
  playlistId: number
): Promise<{
  thumbnail: string;
  small: string;
  social: string;
  openGraph: string;
} | null> {
  try {
    console.log(`🔄 Generating thumbnails for existing cover: ${originalUrl}`);
    
    // Download the original image
    const response = await fetch(originalUrl);
    if (!response.ok) {
      console.error(`Failed to download original image: ${response.status}`);
      return null;
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    
    // Extract base filename from URL
    const filename = extractFilenameFromUrl(originalUrl);
    const baseFilename = filename ? filename.replace(/\.(png|jpg|jpeg)$/, '') : generateCoverFilename(playlistId);
    
    const Sharp = await import('sharp');
    
    // Generate thumbnail versions (skip original since it exists)
    const versions = await Promise.all([
      // Thumbnail (64x64)
      Sharp.default(buffer)
        .resize(64, 64, { fit: 'cover' })
        .png({ quality: 80, compressionLevel: 9 })
        .toBuffer(),
      
      // Small (150x150)
      Sharp.default(buffer)
        .resize(150, 150, { fit: 'cover' })
        .png({ quality: 85, compressionLevel: 8 })
        .toBuffer(),
      
      // Social (400x400)
      Sharp.default(buffer)
        .resize(400, 400, { fit: 'cover' })
        .jpeg({ quality: 75, progressive: true })
        .toBuffer(),
      
      // Open Graph (1200x630)
      Sharp.default(buffer)
        .resize(1200, 630, { fit: 'cover' })
        .jpeg({ quality: 80, progressive: true })
        .toBuffer()
    ]);

    const [thumbnailBuffer, smallBuffer, socialBuffer, ogBuffer] = versions;

    // Upload thumbnail versions
    const uploads = await Promise.all([
      uploadCoverImage(thumbnailBuffer, `${baseFilename}-thumb.png`, 'image/png'),
      uploadCoverImage(smallBuffer, `${baseFilename}-small.png`, 'image/png'),
      uploadCoverImage(socialBuffer, `${baseFilename}-social.jpg`, 'image/jpeg'),
      uploadCoverImage(ogBuffer, `${baseFilename}-og.jpg`, 'image/jpeg')
    ]);

    const [thumbnailUrl, smallUrl, socialUrl, ogUrl] = uploads;

    console.log(`✅ Thumbnails generated for playlist ${playlistId}`);
    
    return {
      thumbnail: thumbnailUrl,
      small: smallUrl,
      social: socialUrl,
      openGraph: ogUrl
    };
    
  } catch (error) {
    console.error('❌ Error generating thumbnails for existing cover:', error);
    return null;
  }
}

/**
 * Extract filename from a Supabase URL
 * 
 * @param url The Supabase public URL
 * @returns The filename or null if not a valid Supabase URL
 */
export function extractFilenameFromUrl(url: string): string | null {
  try {
    const urlParts = url.split('/');
    return urlParts[urlParts.length - 1] || null;
  } catch {
    return null;
  }
}

/**
 * Get the public URL for a filename
 * 
 * @param filename The filename
 * @returns The public URL
 */
export function getPublicUrl(filename: string): string {
  const { data } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(filename);
  
  return data.publicUrl;
}