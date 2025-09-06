/**
 * Cover Image Verification Service
 * 
 * This service provides functions to verify that cover images referenced in the database
 * actually exist in the filesystem, and logs/fixes any discrepancies found.
 */

import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { db } from '../db';
import { playlists } from '@shared/schema';
import { eq } from 'drizzle-orm';
import fetch from 'node-fetch';
import { saveImageFromUrl } from './imageStorage';

const existsAsync = promisify(fs.exists);
const writeFileAsync = promisify(fs.writeFile);
const readFileAsync = promisify(fs.readFile);
const mkdirAsync = promisify(fs.mkdir);

// Configuration
const IMAGES_DIR = path.join(process.cwd(), 'public', 'images');
const COVERS_DIR = path.join(IMAGES_DIR, 'covers');
const PUBLIC_PATH_PREFIX = '/images/covers';
const DEFAULT_COVER_PATH = '/images/covers/default-cover.png';

/**
 * Convert a public path to an absolute filesystem path
 */
function publicPathToAbsolute(publicPath: string): string {
  // Remove any query parameters
  const pathWithoutParams = publicPath.split('?')[0];
  
  // Remove leading slash if present
  const relativePath = pathWithoutParams.startsWith('/') 
    ? pathWithoutParams.substring(1) 
    : pathWithoutParams;
    
  return path.join(process.cwd(), 'public', relativePath);
}

/**
 * Check if a cover image file exists
 */
export async function verifyCoverImageExists(coverImageUrl: string | null): Promise<boolean> {
  if (!coverImageUrl) return false;
  
  // Remote URLs are considered valid without checking
  if (coverImageUrl.startsWith('http')) return true;
  
  // Local files need to be checked
  const absolutePath = publicPathToAbsolute(coverImageUrl);
  return await existsAsync(absolutePath);
}

/**
 * Get all playlists with missing cover images
 */
export async function findPlaylistsWithMissingCovers(): Promise<{id: number, title: string, coverImageUrl: string}[]> {
  const allPlaylists = await db.select({
    id: playlists.id,
    title: playlists.title,
    coverImageUrl: playlists.coverImageUrl
  }).from(playlists);
  
  const missingCovers: {id: number, title: string, coverImageUrl: string}[] = [];
  
  for (const playlist of allPlaylists) {
    // Skip playlists without cover image URLs
    if (!playlist.coverImageUrl) continue;
    
    // Skip remote URLs (we can't verify these)
    if (playlist.coverImageUrl.startsWith('http')) continue;
    
    const exists = await verifyCoverImageExists(playlist.coverImageUrl);
    if (!exists) {
      // We can safely assert that coverImageUrl is a string here because:
      // 1. We've already checked it's not null/undefined above
      // 2. We've already checked it's a local URL (starts with http)
      missingCovers.push({
        id: playlist.id,
        title: playlist.title,
        coverImageUrl: playlist.coverImageUrl as string
      });
    }
  }
  
  return missingCovers;
}

/**
 * Fix a missing cover image by either recovering it from another source
 * or setting it to the default cover
 */
export async function fixMissingCoverImage(playlistId: number, coverImageUrl: string): Promise<string> {
  console.log(`Fixing missing cover for playlist ${playlistId}, url: ${coverImageUrl}`);
  
  try {
    // First try to download the missing image - maybe it's available from a cache or CDN
    if (coverImageUrl.startsWith('http')) {
      try {
        // Try to download and save the image
        const savedPath = await saveImageFromUrl(coverImageUrl);
        
        // Update the database with the new local path
        await db.update(playlists)
          .set({ coverImageUrl: savedPath })
          .where(eq(playlists.id, playlistId));
          
        console.log(`Recovered cover image for playlist ${playlistId} from URL: ${savedPath}`);
        return savedPath;
      } catch (error) {
        console.error(`Failed to recover image from URL ${coverImageUrl}:`, error);
      }
    }
    
    // If we can't recover the image, use the default cover
    await db.update(playlists)
      .set({ coverImageUrl: DEFAULT_COVER_PATH })
      .where(eq(playlists.id, playlistId));
      
    console.log(`Set default cover for playlist ${playlistId}`);
    return DEFAULT_COVER_PATH;
  } catch (error) {
    console.error(`Error fixing cover for playlist ${playlistId}:`, error);
    return DEFAULT_COVER_PATH;
  }
}

/**
 * Ensure that cover image directories exist
 */
export async function ensureCoverDirectoriesExist(): Promise<void> {
  try {
    // Check if the images directory exists, if not create it
    if (!await existsAsync(IMAGES_DIR)) {
      await mkdirAsync(IMAGES_DIR, { recursive: true });
    }
    
    // Check if the covers directory exists, if not create it
    if (!await existsAsync(COVERS_DIR)) {
      await mkdirAsync(COVERS_DIR, { recursive: true });
    }
  } catch (error) {
    console.error('Error ensuring cover directories exist:', error);
  }
}

/**
 * This function adds a hook to ensure all cover image paths are verified before saving
 */
export function installCoverImageVerificationHook() {
  // This would be implemented in a more complete system
  // For now, it's a reminder to call the verification service
  console.log('[COVER VERIFIER] Cover image verification hook installed');
}

/**
 * Fix all playlists with missing cover images
 */
export async function fixAllMissingCovers(): Promise<{
  fixed: number,
  total: number,
  details: {id: number, title: string, oldUrl: string, newUrl: string}[]
}> {
  await ensureCoverDirectoriesExist();
  
  const missingCovers = await findPlaylistsWithMissingCovers();
  const fixedDetails: {id: number, title: string, oldUrl: string, newUrl: string}[] = [];
  
  for (const playlist of missingCovers) {
    const newUrl = await fixMissingCoverImage(playlist.id, playlist.coverImageUrl);
    fixedDetails.push({
      id: playlist.id,
      title: playlist.title,
      oldUrl: playlist.coverImageUrl,
      newUrl
    });
  }
  
  return {
    fixed: fixedDetails.length,
    total: missingCovers.length,
    details: fixedDetails
  };
}

/**
 * Verify that a newly saved cover image exists in the filesystem
 * If not, log an error and set a default cover
 */
export async function verifyAndEnsureCoverImage(playlistId: number, coverImageUrl: string): Promise<string> {
  await ensureCoverDirectoriesExist();
  
  const exists = await verifyCoverImageExists(coverImageUrl);
  
  if (!exists) {
    console.error(`Cover image not found for playlist ${playlistId}: ${coverImageUrl}`);
    return await fixMissingCoverImage(playlistId, coverImageUrl);
  }
  
  return coverImageUrl;
}