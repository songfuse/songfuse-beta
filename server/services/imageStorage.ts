/**
 * Image Storage Service
 * Handles saving and retrieving images from the server's filesystem
 */

import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import fetch from 'node-fetch';
import crypto from 'crypto';
import Sharp from 'sharp';

const writeFileAsync = promisify(fs.writeFile);
const mkdirAsync = promisify(fs.mkdir);
const existsAsync = promisify(fs.exists);

// Configuration
const IMAGES_DIR = path.join(process.cwd(), 'public', 'images');
const COVERS_DIR = path.join(IMAGES_DIR, 'covers');
const PUBLIC_PATH_PREFIX = '/images/covers';
const DEFAULT_COVER_PATH = '/images/covers/default-cover.png';

/**
 * Check if a URL is from Azure Blob Storage that we need to reject
 * We want to allow DALL-E images but reject other Azure blobs
 */
function isAzureBlobUrl(url: string): boolean {
  // First check if it's a DALL-E URL - we want to allow these
  if (url.includes('oaidalleapiprodscus') || url.includes('api.openai.com')) {
    console.log('Detected DALL-E image URL, processing normally');
    return false;
  }
  
  // Check for regular Azure Blob Storage URL, which we'll reject
  if (url.includes('.blob.core.windows.net')) {
    console.log('Detected non-DALL-E Azure blob URL, rejecting');
    return true;
  }
  
  // Not an Azure URL at all
  return false;
}

/**
 * Ensure the necessary directories exist
 */
export async function ensureDirectoriesExist(): Promise<void> {
  try {
    if (!await existsAsync(IMAGES_DIR)) {
      await mkdirAsync(IMAGES_DIR, { recursive: true });
    }
    
    if (!await existsAsync(COVERS_DIR)) {
      await mkdirAsync(COVERS_DIR, { recursive: true });
    }
    
    console.log('Image storage directories created or verified');
  } catch (error) {
    console.error('Error creating image storage directories:', error);
    throw error;
  }
}

/**
 * Generate a unique filename for an image
 */
function generateUniqueFilename(prefix: string = 'cover'): string {
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString('hex');
  return `${prefix}-${timestamp}-${randomString}.png`;
}

/**
 * Save an image from a data URL to the filesystem
 * @param dataUrl Data URL of the image (base64-encoded)
 * @returns Path to the saved image file
 */
export async function saveImageFromDataUrl(dataUrl: string): Promise<string> {
  await ensureDirectoriesExist();
  
  try {
    // Extract base64 content from data URL
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Process the image with Sharp to ensure it's valid and optimize it
    const processedImage = await Sharp(buffer)
      .resize(640, 640, { fit: 'cover' }) // Ensure square dimensions
      .png({ quality: 90 }) // Use PNG format with good quality
      .toBuffer();
    
    // Save the file
    const filename = generateUniqueFilename();
    const filePath = path.join(COVERS_DIR, filename);
    await writeFileAsync(filePath, processedImage);
    
    // Return the public URL path
    return `${PUBLIC_PATH_PREFIX}/${filename}`;
  } catch (error) {
    console.error('Error saving image from data URL:', error);
    throw error;
  }
}

/**
 * Save an image from an external URL to the filesystem
 * @param url URL of the image to download and save
 * @param playlistId Optional ID of the playlist to update with this cover image
 * @returns Path to the saved image file
 */
export async function saveImageFromUrl(url: string, playlistId?: number): Promise<string> {
  await ensureDirectoriesExist();
  
  try {
    // Check for empty or invalid URL
    if (!url || url.trim() === '') {
      console.log('Empty URL provided, using default cover image');
      return DEFAULT_COVER_PATH;
    }
    
    // Check if the URL is already a local path and verify if the file actually exists
    if (url.startsWith(PUBLIC_PATH_PREFIX)) {
      // Clean the URL by removing any query parameters or timestamps
      const cleanUrl = url.split('?')[0];
      const localFilePath = getAbsolutePathFromPublicPath(cleanUrl);
      
      // Verify if the file actually exists
      if (await existsAsync(localFilePath)) {
        console.log(`Local image verified at: ${localFilePath}`);
        return url; // The file exists, return the original URL with its parameters
      } else {
        console.warn(`Local image missing: ${localFilePath}, will attempt to restore`);
        // Continue with the process to download and save a new image
      }
    }
    
    // Log the URL for debugging, hiding sensitive parts
    const logUrl = url.length > 30 
      ? url.substring(0, 15) + '...' + url.substring(url.length - 15) 
      : url;
    console.log(`Attempting to download image from: ${logUrl}`);
    
    // Check for DALL-E URL and handle accordingly
    const isDalleUrl = url.includes('oaidalleapiprodscus') || url.includes('api.openai.com');
    if (isDalleUrl) {
      console.log('Processing DALL-E generated image URL');
      // Force DALL-E image URLs to be processed without rejection
    } 
    // For non-DALL-E URLs, check if they're Azure Blob Storage URLs which require authentication
    else if (isAzureBlobUrl(url)) {
      console.log('Detected Azure Blob Storage URL, using default cover image instead');
      return DEFAULT_COVER_PATH; 
    }
    
    // Download the image
    const response = await fetch(url);
    if (!response.ok) {
      console.log(`Failed to download image: ${response.status} ${response.statusText}, using default cover`);
      return DEFAULT_COVER_PATH;
    }
    
    const buffer = await response.buffer();
    console.log(`Successfully downloaded image: ${buffer.length} bytes`);
    
    // Process the image with Sharp
    const processedImage = await Sharp(buffer)
      .resize(1024, 1024, { fit: 'cover' }) // Ensure square dimensions at full resolution
      .png({ quality: 95, compressionLevel: 6 }) // Use PNG format with high quality
      .toBuffer();
    
    console.log(`Processed image to: ${processedImage.length} bytes`);
    
    // Save the file
    const filename = generateUniqueFilename();
    const filePath = path.join(COVERS_DIR, filename);
    await writeFileAsync(filePath, processedImage);
    
    const publicPath = `${PUBLIC_PATH_PREFIX}/${filename}`;
    console.log(`Saved image to permanent storage: ${publicPath}`);
    
    // Verify the file was actually saved
    if (await existsAsync(filePath)) {
      console.log(`Verified saved image exists at: ${filePath}`);
    } else {
      console.error(`Failed to verify saved image at: ${filePath}`);
      return DEFAULT_COVER_PATH;
    }
    
    // If playlistId is provided, update the database with the new cover image URL
    if (playlistId) {
      try {
        // Import the database module dynamically to avoid circular dependencies
        const { db } = await import('../db');
        const { playlists } = await import('../../shared/schema');
        const { eq } = await import('drizzle-orm');
        
        // Add timestamp for cache busting
        const timestampedPath = `${publicPath}?timestamp=${Date.now()}`;
        
        // Update the playlist with the new cover image URL
        await db.update(playlists)
          .set({ coverImageUrl: timestampedPath })
          .where(eq(playlists.id, playlistId));
        
        console.log(`Updated playlist ${playlistId} with new cover image: ${timestampedPath}`);
        
        // Return the timestamped path
        return timestampedPath;
      } catch (dbError) {
        console.error(`Error updating playlist ${playlistId} with cover image:`, dbError);
        // Even if the database update fails, we still return the image path
      }
    }
    
    // Return the public URL path
    return publicPath;
  } catch (error) {
    console.error('Error saving image from URL:', error);
    console.log('Using default cover image due to error');
    return DEFAULT_COVER_PATH;
  }
}

/**
 * Get the absolute file path from a public URL path
 * @param publicPath Public URL path of the image
 * @returns Absolute file path
 */
export function getAbsolutePathFromPublicPath(publicPath: string): string {
  // Handle the default cover path differently
  if (publicPath === DEFAULT_COVER_PATH || publicPath.endsWith('default-cover.png')) {
    return path.join(process.cwd(), 'public', 'images', 'covers', 'default-cover.png');
  }
  
  // Standard path replacement for cover images
  // First remove the PUBLIC_PATH_PREFIX if present
  let relativePath = publicPath;
  if (publicPath.startsWith(PUBLIC_PATH_PREFIX)) {
    relativePath = publicPath.replace(PUBLIC_PATH_PREFIX, '');
  }
  
  // Make sure the path doesn't start with a slash
  if (relativePath.startsWith('/')) {
    relativePath = relativePath.substring(1);
  }
  
  return path.join(COVERS_DIR, relativePath);
}