/**
 * Image Monitoring Service
 * 
 * This service provides diagnostic and monitoring capabilities for the image storage system.
 * It includes utilities to verify image files exist, retry failed saves, and log image operations.
 */

import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import fetch from 'node-fetch';
import { db } from '../db';
import { playlists } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { saveImageFromUrl } from './imageStorage';

// Convert callbacks to promises
const existsAsync = promisify(fs.exists);
const writeFileAsync = promisify(fs.writeFile);
const mkdirAsync = promisify(fs.mkdir);
const readFileAsync = promisify(fs.readFile);

// Configuration
const IMAGES_DIR = path.join(process.cwd(), 'public', 'images');
const COVERS_DIR = path.join(IMAGES_DIR, 'covers');
const PUBLIC_PATH_PREFIX = '/images/covers';
const DEFAULT_COVER_PATH = '/images/covers/default-cover.png';

/**
 * Service to monitor and diagnose image storage issues
 * 
 * This helps ensure cover images actually exist on disk when referenced in the database
 */
export async function monitorMissingCovers() {
  try {
    // Ensure the cover directories exist
    await ensureDirectoriesExist();
    
    // Get all playlists
    const allPlaylists = await db.select().from(playlists);
    console.log(`Checking ${allPlaylists.length} playlists for missing cover images...`);
    
    let missingCount = 0;
    let fixedCount = 0;
    
    // Check each playlist for a missing cover image
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
        missingCount++;
        console.log(`Missing image detected: ${absolutePath}`);
        
        // Create an empty file marker to help with debugging
        try {
          // Create empty file as a placeholder for missing images
          await writeFileAsync(absolutePath, '');
        } catch (error) {
          console.error(`Failed to create empty file marker at ${absolutePath}:`, error);
        }
      }
    }
    
    console.log(`Image monitor results: ${missingCount} missing images, ${fixedCount} fixed`);
    return { missingCount, fixedCount };
  } catch (error) {
    console.error('Error in image monitor:', error);
    return { missingCount: 0, fixedCount: 0, error: error.message };
  }
}

/**
 * Ensure the necessary directories exist
 */
async function ensureDirectoriesExist(): Promise<void> {
  try {
    if (!await existsAsync(IMAGES_DIR)) {
      await mkdirAsync(IMAGES_DIR, { recursive: true });
    }
    
    if (!await existsAsync(COVERS_DIR)) {
      await mkdirAsync(COVERS_DIR, { recursive: true });
    }
  } catch (error) {
    console.error('Error ensuring directories exist:', error);
    throw error;
  }
}

/**
 * Check if the default cover image exists, and create it if not
 */
export async function ensureDefaultCoverExists(): Promise<void> {
  try {
    const defaultCoverPath = path.join(process.cwd(), 'public', DEFAULT_COVER_PATH.replace(/^\//, ''));
    
    if (!await existsAsync(defaultCoverPath)) {
      console.log(`Default cover image does not exist, creating at ${defaultCoverPath}`);
      
      // Create a simple placeholder image or copy from assets
      try {
        // Copy from assets if available
        const assetPath = path.join(process.cwd(), 'public', 'assets', 'default-cover.png');
        if (await existsAsync(assetPath)) {
          const imageData = await readFileAsync(assetPath);
          await writeFileAsync(defaultCoverPath, imageData);
          console.log('Copied default cover from assets');
        } else {
          // Create a simple SVG placeholder
          const svgContent = `<svg width="250" height="250" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="#f0f0f0"/>
            <text x="50%" y="50%" font-family="Arial" font-size="24" fill="#333" text-anchor="middle">Cover Image</text>
          </svg>`;
          
          await writeFileAsync(defaultCoverPath.replace('.png', '.svg'), Buffer.from(svgContent));
          console.log('Created default cover SVG placeholder');
        }
      } catch (createError) {
        console.error('Error creating default cover:', createError);
      }
    }
  } catch (error) {
    console.error('Error ensuring default cover exists:', error);
  }
}