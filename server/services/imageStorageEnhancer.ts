/**
 * Image Storage Enhancer
 * 
 * This service ensures that all image URLs in the database actually exist in the filesystem.
 * It provides functions to verify and recreate missing images, and can be run as a background process.
 */

import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import fetch from 'node-fetch';
import { db } from '../db';
import { playlists } from '@shared/schema';
import { eq } from 'drizzle-orm';

// Convert callbacks to promises
const existsAsync = promisify(fs.exists);
const writeFileAsync = promisify(fs.writeFile);
const mkdirAsync = promisify(fs.mkdir);

// Configuration
const IMAGES_DIR = path.join(process.cwd(), 'public', 'images');
const COVERS_DIR = path.join(IMAGES_DIR, 'covers');
const DEFAULT_COVER_PATH = '/images/default-cover.png';

/**
 * Ensure the image directories exist
 */
async function ensureDirectories(): Promise<void> {
  if (!await existsAsync(IMAGES_DIR)) {
    await mkdirAsync(IMAGES_DIR, { recursive: true });
  }
  
  if (!await existsAsync(COVERS_DIR)) {
    await mkdirAsync(COVERS_DIR, { recursive: true });
  }
}

/**
 * Convert a public URL path to an absolute file path
 */
function getAbsolutePathFromUrl(url: string): string {
  // Remove any query parameters
  const cleanUrl = url.split('?')[0];
  
  // Convert to absolute path
  return path.join(process.cwd(), 'public', cleanUrl.replace(/^\//, ''));
}

/**
 * Check if a file exists at the given path
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    return await existsAsync(filePath);
  } catch (error) {
    console.error(`Error checking if file exists: ${filePath}`, error);
    return false;
  }
}

/**
 * Download an image from a URL
 */
async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
    }
    
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    console.error(`Error downloading image from ${url}:`, error);
    return null;
  }
}

/**
 * Create a default placeholder image
 */
async function createDefaultImage(filePath: string): Promise<boolean> {
  try {
    // Check if we have a default image to copy
    const defaultImagePath = path.join(process.cwd(), 'public', 'images', 'default-cover.png');
    
    if (await fileExists(defaultImagePath)) {
      // Copy the default image
      const defaultImageData = await fs.promises.readFile(defaultImagePath);
      await writeFileAsync(filePath, defaultImageData);
      return true;
    }
    
    // If we don't have a default image, create a simple one
    // This is a 250x250 black square as a fallback (very small file)
    const simpleImageBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAPoAAAD6CAYAAACI7Fo9AAAABmJLR0QA/wD/AP+gvaeTAAAAu0lEQVR4nO3BAQEAAACCIP+vbkhAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMCjAYcQAAGDh2lQAAAAAElFTkSuQmCC', 'base64');
    
    await writeFileAsync(filePath, simpleImageBuffer);
    return true;
  } catch (error) {
    console.error(`Error creating default image at ${filePath}:`, error);
    return false;
  }
}

/**
 * Verify and fix a single image URL
 */
export async function verifyAndFixImage(imageUrl: string): Promise<string> {
  if (!imageUrl) {
    return DEFAULT_COVER_PATH;
  }
  
  try {
    // Ensure directories exist
    await ensureDirectories();
    
    // For external URLs, download and save locally
    if (imageUrl.startsWith('http')) {
      console.log(`Converting external URL to local: ${imageUrl}`);
      
      // Download the image
      const imageData = await downloadImage(imageUrl);
      
      if (!imageData) {
        console.error(`Failed to download image from ${imageUrl}`);
        return DEFAULT_COVER_PATH;
      }
      
      // Generate a unique filename
      const timestamp = Date.now();
      const filename = `cover-${timestamp}.jpg`;
      const filePath = path.join(COVERS_DIR, filename);
      
      // Save the image
      await writeFileAsync(filePath, imageData);
      
      // Return the new local URL
      return `/images/covers/${filename}`;
    }
    
    // For local URLs, verify the file exists
    const absolutePath = getAbsolutePathFromUrl(imageUrl);
    const exists = await fileExists(absolutePath);
    
    if (exists) {
      return imageUrl; // File exists, nothing to fix
    }
    
    // File doesn't exist, create it
    console.log(`Image file doesn't exist: ${absolutePath}, recreating it`);
    
    // Create the directory if needed
    const dir = path.dirname(absolutePath);
    if (!await fileExists(dir)) {
      await mkdirAsync(dir, { recursive: true });
    }
    
    // Create a default image
    const created = await createDefaultImage(absolutePath);
    
    if (created) {
      return imageUrl; // Return the original URL as the file now exists
    }
    
    // If we couldn't create the file, return the default path
    return DEFAULT_COVER_PATH;
  } catch (error) {
    console.error(`Error verifying/fixing image ${imageUrl}:`, error);
    return DEFAULT_COVER_PATH;
  }
}

/**
 * Process and fix image URLs for all playlists
 */
export async function processAllPlaylistImages(): Promise<void> {
  try {
    // Get all playlists
    const allPlaylists = await db.query.playlists.findMany();
    console.log(`Found ${allPlaylists.length} playlists to process`);
    
    let total = 0;
    let fixed = 0;
    
    for (const playlist of allPlaylists) {
      total++;
      
      if (!playlist.coverImageUrl) {
        console.log(`Playlist ${playlist.id} has no cover image`);
        continue;
      }
      
      // Check if the image file needs fixing
      const absolutePath = getAbsolutePathFromUrl(playlist.coverImageUrl);
      const exists = await fileExists(absolutePath);
      
      if (exists) {
        console.log(`Cover for playlist ${playlist.id} exists: ${playlist.coverImageUrl}`);
        continue;
      }
      
      // Fix the image
      console.log(`Fixing missing cover for playlist ${playlist.id}: ${playlist.coverImageUrl}`);
      const newUrl = await verifyAndFixImage(playlist.coverImageUrl);
      
      // Update the database if the URL changed
      if (newUrl !== playlist.coverImageUrl) {
        await db.update(playlists)
          .set({ coverImageUrl: newUrl })
          .where(eq(playlists.id, playlist.id));
        
        fixed++;
        console.log(`Updated playlist ${playlist.id} with new cover URL: ${newUrl}`);
      }
    }
    
    console.log(`Processed ${total} playlists, fixed ${fixed} cover images`);
  } catch (error) {
    console.error('Error processing playlist images:', error);
  }
}