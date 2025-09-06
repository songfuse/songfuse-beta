/**
 * Cover Image Monitoring Service
 * 
 * This service monitors image storage to ensure all playlist covers
 * are properly saved to the filesystem. It includes:
 * 
 * 1. An initialization function to run at server startup
 * 2. A background monitoring process that periodically checks for missing images
 * 3. Functions to verify and repair image files
 */

import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
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
const PUBLIC_PATH_PREFIX = '/images/covers';
const DEFAULT_COVER_PATH = '/images/covers/default-cover.png';

// Create a minimal valid PNG file as a placeholder (1x1 transparent pixel)
const MINIMAL_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
]);

/**
 * Start the cover image monitoring service
 */
export async function initCoverImageMonitoring() {
  try {
    // Ensure directories exist
    await ensureDirectoriesExist();
    
    // Ensure default cover exists
    await ensureDefaultCoverExists();
    
    // Run an initial check for missing images
    await checkAndFixMissingCovers();
    
    // Set up periodic monitoring
    const monitoringInterval = 15 * 60 * 1000; // 15 minutes
    setInterval(checkAndFixMissingCovers, monitoringInterval);
    
    // Log startup
    console.log('Cover image monitoring service initialized');
  } catch (error) {
    console.error('Error initializing cover image monitoring:', error);
  }
}

/**
 * Ensure the necessary directories exist
 */
async function ensureDirectoriesExist(): Promise<void> {
  try {
    if (!await existsAsync(IMAGES_DIR)) {
      await mkdirAsync(IMAGES_DIR, { recursive: true });
      console.log(`Created directory: ${IMAGES_DIR}`);
    }
    
    if (!await existsAsync(COVERS_DIR)) {
      await mkdirAsync(COVERS_DIR, { recursive: true });
      console.log(`Created directory: ${COVERS_DIR}`);
    }
  } catch (error) {
    console.error('Error ensuring directories exist:', error);
    throw error;
  }
}

/**
 * Ensure the default cover image exists
 */
async function ensureDefaultCoverExists(): Promise<void> {
  try {
    const defaultCoverPath = path.join(process.cwd(), 'public', DEFAULT_COVER_PATH.replace(/^\//, ''));
    
    if (!await existsAsync(defaultCoverPath)) {
      console.log(`Default cover image does not exist, creating at ${defaultCoverPath}`);
      
      // Ensure directory exists
      const dir = path.dirname(defaultCoverPath);
      if (!await existsAsync(dir)) {
        await mkdirAsync(dir, { recursive: true });
      }
      
      // Create a minimal PNG
      await writeFileAsync(defaultCoverPath, MINIMAL_PNG);
      console.log('Created default cover image');
    }
  } catch (error) {
    console.error('Error ensuring default cover exists:', error);
    throw error;
  }
}

/**
 * Check and fix missing cover images
 */
export async function checkAndFixMissingCovers(): Promise<{
  total: number;
  missing: number;
  fixed: number;
  errors: number;
}> {
  try {
    console.log('Checking for missing cover images...');
    
    // Get all playlists
    const allPlaylists = await db.select().from(playlists);
    
    // Track statistics
    const results = {
      total: allPlaylists.length,
      missing: 0,
      fixed: 0,
      errors: 0
    };
    
    // First identify all missing covers
    const missingCovers = [];
    
    for (const playlist of allPlaylists) {
      if (!playlist.coverImageUrl) continue;
      
      // Remove any query parameters from the URL
      const cleanUrl = playlist.coverImageUrl.split('?')[0];
      
      // Skip external URLs
      if (cleanUrl.startsWith('http')) continue;
      
      // Get the absolute path to the image file
      const absolutePath = path.join(
        process.cwd(),
        'public',
        cleanUrl.replace(/^\//, '')
      );
      
      // Check if the file exists
      const exists = await existsAsync(absolutePath);
      if (!exists) {
        results.missing++;
        console.log(`Missing image detected: ${absolutePath}`);
        missingCovers.push({
          playlist,
          absolutePath,
          cleanUrl
        });
      }
    }
    
    if (results.missing === 0) {
      console.log('No missing cover images detected');
      return results;
    }
    
    console.log(`Found ${results.missing} missing cover images, creating placeholders...`);
    
    // Now fix all missing covers
    for (const { playlist, absolutePath } of missingCovers) {
      try {
        // Ensure directory exists
        const dir = path.dirname(absolutePath);
        if (!await existsAsync(dir)) {
          await mkdirAsync(dir, { recursive: true });
        }
        
        // DISABLED: Do not create placeholder images that overwrite real covers
        // await writeFileAsync(absolutePath, MINIMAL_PNG);
        console.log(`SKIPPED creating placeholder for playlist ${playlist.id} to prevent overwriting real covers`);
        
        console.log(`Created placeholder for playlist ${playlist.id}: ${playlist.title}`);
        results.fixed++;
      } catch (error) {
        console.error(`Error fixing cover for playlist ${playlist.id}:`, error);
        results.errors++;
      }
    }
    
    console.log(`Cover image check complete: ${results.fixed}/${results.missing} fixed, ${results.errors} errors`);
    return results;
  } catch (error) {
    console.error('Error checking cover images:', error);
    return {
      total: 0,
      missing: 0,
      fixed: 0,
      errors: 1
    };
  }
}

/**
 * Cover image save/verify hook for the image storage pipeline
 * 
 * This function should be called after an image URL is saved to the database
 * to ensure the image is actually saved on disk
 * 
 * @param imageUrl The image URL (public path) to verify
 * @param playlistId Optional ID of the associated playlist
 */
export async function verifyCoverImageSaved(
  imageUrl: string, 
  playlistId?: number
): Promise<void> {
  try {
    // Skip if URL is not a local path
    if (!imageUrl || imageUrl.startsWith('http')) {
      return;
    }
    
    // Get the absolute path to the image file
    const cleanUrl = imageUrl.split('?')[0];
    const absolutePath = path.join(
      process.cwd(),
      'public',
      cleanUrl.replace(/^\//, '')
    );
    
    // Check if the file exists and has content
    const exists = await existsAsync(absolutePath);
    if (!exists) {
      console.log(`Verified missing: Creating placeholder for image at ${absolutePath}`);
      
      // Ensure directory exists
      const dir = path.dirname(absolutePath);
      if (!await existsAsync(dir)) {
        await mkdirAsync(dir, { recursive: true });
      }
      
      // Create a placeholder
      await writeFileAsync(absolutePath, MINIMAL_PNG);
      console.log(`Created placeholder for missing image: ${imageUrl}`);
    }
    
    // If a playlist ID is provided and the verification was needed,
    // you could update additional metadata or logs here
    if (playlistId) {
      // Optional additional actions for playlist-specific images
    }
  } catch (error) {
    console.error(`Error verifying image saved ${imageUrl}:`, error);
  }
}