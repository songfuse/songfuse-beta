/**
 * Cover Image Storage Service
 * 
 * This service handles saving AI-generated cover images to cloud storage (Supabase)
 * with local filesystem fallback for reliability.
 */

import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import crypto from 'crypto';
import { promisify } from 'util';
import { db } from '../db';
import { playlists } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { 
  uploadCoverImage, 
  generateCoverFilename, 
  coverImageExists, 
  getPublicUrl,
  storeAiGeneratedCoverWithOptimization 
} from './supabaseStorage';

// Convert callbacks to promises
const writeFileAsync = promisify(fs.writeFile);
const mkdirAsync = promisify(fs.mkdir);
const existsAsync = promisify(fs.exists);

// Configuration
const IMAGES_DIR = path.join(process.cwd(), 'public', 'images');
const COVERS_DIR = path.join(IMAGES_DIR, 'covers');
const PUBLIC_PATH_PREFIX = '/images/covers';
const DEFAULT_COVER_PATH = '/images/covers/default-cover.png';

/**
 * Ensure the necessary directories exist for storing images
 */
export async function ensureCoverDirectories(): Promise<boolean> {
  try {
    // Create the images directory if it doesn't exist
    if (!await existsAsync(IMAGES_DIR)) {
      await mkdirAsync(IMAGES_DIR, { recursive: true });
      console.log(`Created directory: ${IMAGES_DIR}`);
    }
    
    // Create the covers directory if it doesn't exist
    if (!await existsAsync(COVERS_DIR)) {
      await mkdirAsync(COVERS_DIR, { recursive: true });
      console.log(`Created directory: ${COVERS_DIR}`);
    }
    
    // Verify the directories exist
    const imagesExists = await existsAsync(IMAGES_DIR);
    const coversExists = await existsAsync(COVERS_DIR);
    
    if (!imagesExists || !coversExists) {
      console.error(`Failed to verify directories: images=${imagesExists}, covers=${coversExists}`);
      return false;
    }
    
    console.log('Cover image directories verified');
    return true;
  } catch (error) {
    console.error('Error ensuring cover directories exist:', error);
    return false;
  }
}

/**
 * Generate a unique filename for a cover image
 */
export function generateUniqueFilename(): string {
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString('hex');
  return `cover-${timestamp}-${randomString}.png`;
}

/**
 * Store an AI-generated image to cloud storage (Supabase) with local fallback
 * 
 * @param imageUrl The URL of the image to store (can be external or data URL)
 * @param playlistId Optional playlist ID to update in the database
 * @returns The cloud storage URL or local path to the stored image
 */
export async function storeAiGeneratedCover(
  imageUrl: string,
  playlistId?: number
): Promise<string> {
  console.log(`🔄 Storing AI-generated cover image with optimization from ${imageUrl.substring(0, 50)}...`);
  
  try {
    // If the image URL is already a cloud URL, return it
    if (imageUrl.includes('supabase') || imageUrl.includes('amazonaws.com')) {
      console.log(`✅ Image is already in cloud storage: ${imageUrl}`);
      if (playlistId) {
        await updatePlaylistCoverInDatabase(playlistId, imageUrl);
      }
      return imageUrl;
    }
    
    // Use the new optimization system for AI-generated images
    if (imageUrl.startsWith('http') && (
      imageUrl.includes('oaidalleapiprodscus') || 
      imageUrl.includes('api.openai.com') ||
      imageUrl.includes('dalle')
    )) {
      console.log('🎨 Processing DALL-E image with full optimization...');
      const { storeAiGeneratedCoverWithOptimization } = await import('./supabaseStorage');
      const optimizedImages = await storeAiGeneratedCoverWithOptimization(imageUrl, playlistId);
      
      // Update the database with ALL optimized image URLs
      if (playlistId) {
        await updatePlaylistWithAllImageSizes(playlistId, optimizedImages);
      }
      
      console.log(`✅ AI-generated cover stored with optimization: ${optimizedImages.original}`);
      return optimizedImages.original;
    }

    let imageBuffer: Buffer;
    let contentType = 'image/png';

    // Handle data URLs (base64 encoded images)
    if (imageUrl.startsWith('data:image')) {
      console.log(`📷 Processing base64 image data...`);
      const result = await processBase64Image(imageUrl);
      imageBuffer = result.buffer;
      contentType = result.contentType;
    } 
    // Handle external URLs
    else if (imageUrl.startsWith('http')) {
      console.log(`🔄 Downloading image from: ${imageUrl.substring(0, 100)}...`);
      const response = await fetch(imageUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'SongFuse/1.0',
          'Accept': 'image/*',
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
      }
      
      console.log(`📥 Image downloaded. Content-Type: ${response.headers.get('content-type')}`);
      const arrayBuffer = await response.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
      contentType = response.headers.get('content-type') || 'image/png';
    }
    // Handle local paths
    else if (imageUrl.startsWith('/')) {
      const absolutePath = path.join(process.cwd(), 'public', imageUrl.replace(/^\//, '').split('?')[0]);
      
      if (await existsAsync(absolutePath)) {
        console.log(`📁 Reading existing local image: ${absolutePath}`);
        imageBuffer = await fs.promises.readFile(absolutePath);
        contentType = absolutePath.endsWith('.jpg') || absolutePath.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
      } else {
        throw new Error(`Local image file not found: ${absolutePath}`);
      }
    } else {
      throw new Error(`Unsupported image URL format: ${imageUrl}`);
    }

    console.log(`✅ Image processed successfully: ${imageBuffer.length} bytes`);

    // Try to upload to Supabase cloud storage first
    try {
      const extension = contentType.includes('jpeg') ? 'jpg' : 'png';
      const cloudFilename = playlistId 
        ? generateCoverFilename(playlistId, extension)
        : `cover-${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${extension}`;
      
      console.log(`☁️ Uploading to cloud storage as: ${cloudFilename}`);
      const cloudUrl = await uploadCoverImage(imageBuffer, cloudFilename, contentType);
      
      console.log(`✅ Successfully uploaded to cloud storage: ${cloudUrl}`);
      
      // Update database with cloud URL
      if (playlistId) {
        await updatePlaylistCoverInDatabase(playlistId, cloudUrl);
        console.log(`📝 Database updated for playlist ${playlistId} with cloud URL`);
        
        // Generate optimized social images in the background
        try {
          const { socialImageOptimizer } = await import('./socialImageOptimizer');
          console.log(`🔄 Generating optimized social images for playlist ${playlistId}...`);
          
          const optimizedImages = await socialImageOptimizer.createOptimizedSocialImages(cloudUrl, playlistId);
          console.log(`✅ Generated social images: social (${optimizedImages.socialUrl ? 'created' : 'failed'}), OG (${optimizedImages.openGraphUrl ? 'created' : 'failed'})`);
          
          // Update database with social image URLs
          await updatePlaylistSocialImages(playlistId, optimizedImages.socialUrl, optimizedImages.openGraphUrl);
          
        } catch (socialError) {
          console.warn(`⚠️ Failed to generate social images for playlist ${playlistId}:`, socialError.message);
          // Don't fail the main operation if social image generation fails
        }
      }
      
      return cloudUrl;
      
    } catch (cloudError) {
      console.warn(`⚠️ Cloud storage upload failed, falling back to local storage:`, cloudError);
      
      // Fallback to local storage
      return await saveToLocalStorage(imageBuffer, contentType, playlistId);
    }
    
  } catch (error) {
    console.error('❌ Error storing AI-generated cover:', error);
    return DEFAULT_COVER_PATH;
  }
}

/**
 * Process a base64-encoded image and return buffer and content type
 */
async function processBase64Image(dataUrl: string): Promise<{ buffer: Buffer; contentType: string }> {
  const matches = dataUrl.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
  
  if (!matches || matches.length !== 3) {
    throw new Error('Invalid data URL format');
  }
  
  const imageFormat = matches[1];
  const base64Data = matches[2];
  const buffer = Buffer.from(base64Data, 'base64');
  const contentType = `image/${imageFormat}`;
  
  return { buffer, contentType };
}

/**
 * Save image to local storage as fallback
 */
async function saveToLocalStorage(
  imageBuffer: Buffer,
  contentType: string,
  playlistId?: number
): Promise<string> {
  console.log(`💾 Saving to local storage as fallback...`);
  
  // Ensure the directories exist
  const directoriesExist = await ensureCoverDirectories();
  if (!directoriesExist) {
    throw new Error('Failed to ensure cover directories exist');
  }
  
  // Generate a unique filename
  const filename = generateUniqueFilename();
  const filePath = path.join(COVERS_DIR, filename);
  
  // Save the image to the filesystem
  await writeFileAsync(filePath, imageBuffer);
  
  // Create the public URL path for the image
  const publicPath = `${PUBLIC_PATH_PREFIX}/${filename}`;
  const timestampedPath = `${publicPath}?timestamp=${Date.now()}`;
  
  console.log(`✅ Saved to local storage: ${filePath}`);
  
  // If we have a playlist ID, update the database
  if (playlistId) {
    await updatePlaylistCoverInDatabase(playlistId, timestampedPath);
  }
  
  return timestampedPath;
}

/**
 * Update a playlist's cover image URL in the database
 * 
 * @param playlistId The ID of the playlist to update
 * @param coverImageUrl The new cover image URL
 * @returns Whether the update was successful
 */
export async function updatePlaylistCoverInDatabase(
  playlistId: number,
  coverImageUrl: string
): Promise<boolean> {
  try {
    // Update the playlist in the database
    await db.update(playlists)
      .set({ coverImageUrl })
      .where(eq(playlists.id, playlistId));
    
    console.log(`Updated playlist ${playlistId} with cover image: ${coverImageUrl}`);
    return true;
  } catch (error) {
    console.error(`Error updating playlist ${playlistId} with cover image:`, error);
    return false;
  }
}

/**
 * Update the playlist's social image URLs in the database
 */
export async function updatePlaylistSocialImages(playlistId: number, socialImageUrl: string, openGraphImageUrl: string): Promise<void> {
  try {
    await db.update(playlists)
      .set({ 
        socialImageUrl,
        ogImageUrl: openGraphImageUrl
      })
      .where(eq(playlists.id, playlistId));
    
    console.log(`📝 Updated playlist ${playlistId} with social image URLs`);
  } catch (error) {
    console.error(`Error updating playlist ${playlistId} social images in database:`, error);
    // Don't throw - this is not critical for the main operation
  }
}

/**
 * Update playlist with all optimized image sizes
 */
export async function updatePlaylistWithAllImageSizes(
  playlistId: number, 
  optimizedImages: {
    original: string;
    thumbnail: string;
    small: string;
    social: string;
    openGraph: string;
  }
): Promise<void> {
  try {
    await db.update(playlists)
      .set({ 
        coverImageUrl: optimizedImages.original,
        thumbnailImageUrl: optimizedImages.thumbnail,
        smallImageUrl: optimizedImages.small,
        socialImageUrl: optimizedImages.social,
        ogImageUrl: optimizedImages.openGraph
      })
      .where(eq(playlists.id, playlistId));
    
    console.log(`📝 Updated playlist ${playlistId} with all optimized image URLs`);
  } catch (error) {
    console.error(`Error updating playlist ${playlistId} with all image sizes:`, error);
    throw error;
  }
}

/**
 * Verify that a cover image file exists and is accessible
 * 
 * @param coverImageUrl The URL of the cover image to verify
 * @returns Whether the cover image exists
 */
export async function verifyCoverImageExists(coverImageUrl: string): Promise<boolean> {
  try {
    // If the URL is external, we assume it exists
    if (coverImageUrl.startsWith('http')) {
      return true;
    }
    
    // Remove any query parameters
    const cleanUrl = coverImageUrl.split('?')[0];
    
    // Convert the URL to an absolute path
    const absolutePath = path.join(
      process.cwd(),
      'public',
      cleanUrl.replace(/^\//, '')
    );
    
    // Check if the file exists
    return await existsAsync(absolutePath);
  } catch (error) {
    console.error('Error verifying cover image exists:', error);
    return false;
  }
}