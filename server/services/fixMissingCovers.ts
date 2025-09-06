/**
 * Image Recovery Service
 * 
 * This script fixes missing cover images by creating empty placeholder files
 * where images should exist but don't.
 */

import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { db } from '../db';
import { playlists } from '@shared/schema';

// Convert callbacks to promises
const existsAsync = promisify(fs.exists);
const writeFileAsync = promisify(fs.writeFile);
const mkdirAsync = promisify(fs.mkdir);

// Configuration
const IMAGES_DIR = path.join(process.cwd(), 'public', 'images');
const COVERS_DIR = path.join(IMAGES_DIR, 'covers');

/**
 * Check and fix all playlist cover images
 * This function will find any missing cover images and create empty placeholders
 */
export async function fixMissingCovers() {
  try {
    // Ensure the cover directories exist
    await ensureDirectoriesExist();
    
    // Query all playlists
    const allPlaylists = await db.select().from(playlists);
    console.log(`Checking ${allPlaylists.length} playlists for missing cover images...`);
    
    const missingCovers: { 
      id: number; 
      title: string; 
      coverImageUrl: string; 
      absolutePath: string 
    }[] = [];
    
    // Check each playlist for a missing cover
    for (const playlist of allPlaylists) {
      if (!playlist.coverImageUrl) continue;
      
      // Clean the URL (remove query parameters)
      const cleanUrl = playlist.coverImageUrl.split('?')[0];
      
      // Skip external URLs
      if (cleanUrl.startsWith('http')) continue;
      
      // Get absolute path to file
      const absolutePath = path.join(
        process.cwd(),
        'public',
        cleanUrl.replace(/^\//, '')
      );
      
      // Check if file exists
      const exists = await existsAsync(absolutePath);
      if (!exists) {
        console.log(`Missing image detected: ${absolutePath}`);
        missingCovers.push({
          id: playlist.id,
          title: playlist.title,
          coverImageUrl: playlist.coverImageUrl,
          absolutePath
        });
      }
    }
    
    console.log(`Found ${missingCovers.length} missing cover images`);
    
    // Create placeholder files for all missing covers
    let fixed = 0;
    for (const missing of missingCovers) {
      try {
        // Create empty file (1x1 pixel transparent PNG)
        const tinyPng = Buffer.from([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 
          0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 
          0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 
          0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 
          0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 
          0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
        ]);
        
        // Ensure parent directory exists
        const parentDir = path.dirname(missing.absolutePath);
        if (!await existsAsync(parentDir)) {
          await mkdirAsync(parentDir, { recursive: true });
        }
        
        // DISABLED: Do not create placeholder images that overwrite real covers
        // await writeFileAsync(missing.absolutePath, tinyPng);
        console.log(`SKIPPED creating placeholder for missing cover: ${missing.title} (ID: ${missing.id}) to prevent overwriting real covers`);
        // fixed++; // Don't count as fixed since we're not actually creating placeholders
      } catch (error) {
        console.error(`Failed to create placeholder for cover image (ID: ${missing.id}):`, error);
      }
    }
    
    console.log(`Fixed ${fixed} out of ${missingCovers.length} missing cover images`);
    return { total: missingCovers.length, fixed };
  } catch (error) {
    console.error('Error fixing missing covers:', error);
    return { total: 0, fixed: 0, error: error.message };
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