/**
 * Cover Image Sync Service
 * 
 * This service ensures cover images referenced in the database actually exist
 * in the filesystem. It runs both during server startup and can be triggered
 * manually through an API endpoint.
 */

import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { db } from '../db';
import { playlists } from '@shared/schema';
import { eq } from 'drizzle-orm';
import fetch from 'node-fetch';
import { saveImageFromUrl, ensureDirectoriesExist } from './imageStorage';

const existsAsync = promisify(fs.exists);
const writeFileAsync = promisify(fs.writeFile);
const readFileAsync = promisify(fs.readFile);

// Configuration constants
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
  
  // Remote URLs are considered valid without checking (though we can't verify them)
  if (coverImageUrl.startsWith('http')) return true;
  
  // Local files need to be checked
  const absolutePath = publicPathToAbsolute(coverImageUrl);
  return await existsAsync(absolutePath);
}

/**
 * Try to recover a cover image from Spotify or another external source
 * This is used when the local file is missing but we have information
 * about where it might be available
 */
async function tryRecoverFromExternalSource(playlistId: number): Promise<string | null> {
  try {
    // Get the playlist details to check for Spotify URL
    const [playlist] = await db.select({
      spotifyId: playlists.spotifyId,
      spotifyUrl: playlists.spotifyUrl
    })
    .from(playlists)
    .where(eq(playlists.id, playlistId));
    
    if (!playlist || !playlist.spotifyId) {
      return null;
    }
    
    // If we have a Spotify ID, try to get the cover from Spotify API
    // We're not actually implementing Spotify API call here to keep this simple
    // In a real implementation, this would call the Spotify API
    console.log(`Could try to recover from Spotify for playlist ID ${playlistId}, Spotify ID: ${playlist.spotifyId}`);
    
    // For now, we'll just return null to indicate we couldn't recover
    return null;
  } catch (error) {
    console.error(`Error trying to recover cover from external sources:`, error);
    return null;
  }
}

/**
 * Fix a missing cover image by either recovering it from another source
 * or setting it to the default cover
 */
export async function fixMissingCoverImage(playlistId: number, coverImageUrl: string): Promise<string> {
  console.log(`Fixing missing cover for playlist ${playlistId}, url: ${coverImageUrl}`);
  
  try {
    // First try to download from the original URL if it's a remote URL
    if (coverImageUrl.startsWith('http')) {
      try {
        // Try to download and save the image
        const savedPath = await saveImageFromUrl(coverImageUrl, playlistId);
        console.log(`Recovered cover image for playlist ${playlistId} from URL: ${savedPath}`);
        return savedPath;
      } catch (error) {
        console.error(`Failed to recover image from URL ${coverImageUrl}:`, error);
      }
    }
    
    // If we can't recover from the original URL, try Spotify or other sources
    const externalCover = await tryRecoverFromExternalSource(playlistId);
    if (externalCover) {
      try {
        const savedPath = await saveImageFromUrl(externalCover, playlistId);
        console.log(`Recovered cover image for playlist ${playlistId} from external source: ${savedPath}`);
        return savedPath;
      } catch (error) {
        console.error(`Failed to recover image from external source:`, error);
      }
    }
    
    // If we still can't recover, use the default cover
    const defaultCoverPath = `${DEFAULT_COVER_PATH}?timestamp=${Date.now()}`;
    await db.update(playlists)
      .set({ coverImageUrl: null })
      .where(eq(playlists.id, playlistId));
      
    console.log(`Removed cover for playlist ${playlistId} - no placeholders`);
    return null;
  } catch (error) {
    console.error(`Error fixing cover for playlist ${playlistId}:`, error);
    return null;
  }
}

/**
 * Find all playlists with missing cover images
 */
export async function findPlaylistsWithMissingCovers(): Promise<{id: number, title: string, coverImageUrl: string | null}[]> {
  const allPlaylists = await db.select({
    id: playlists.id,
    title: playlists.title,
    coverImageUrl: playlists.coverImageUrl
  }).from(playlists);
  
  const missingCovers: {id: number, title: string, coverImageUrl: string | null}[] = [];
  
  for (const playlist of allPlaylists) {
    if (!playlist.coverImageUrl) {
      // If there's no cover URL at all, it's missing
      missingCovers.push({
        id: playlist.id,
        title: playlist.title,
        coverImageUrl: null
      });
      continue;
    }
    
    // Skip remote URLs - we don't want to download remote URLs on every server start
    // This was causing existing playlists to lose their covers
    if (playlist.coverImageUrl.startsWith('http')) {
      // Only try to download remote URLs for newly created playlists (last 30 minutes)
      // This prevents all playlists from being "fixed" on every server restart
      const playlistData = await db.select({
        createdAt: playlists.createdAt
      })
      .from(playlists)
      .where(eq(playlists.id, playlist.id));
      
      // Check if the playlist was created in the last 30 minutes
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      if (playlistData[0]?.createdAt && playlistData[0].createdAt > thirtyMinutesAgo) {
        console.log(`Processing new playlist ${playlist.id} with remote URL: ${playlist.coverImageUrl}`);
        missingCovers.push({
          id: playlist.id,
          title: playlist.title,
          coverImageUrl: playlist.coverImageUrl
        });
      }
      continue;
    }
    
    // For local URLs, check if the file exists
    const exists = await verifyCoverImageExists(playlist.coverImageUrl);
    if (!exists) {
      missingCovers.push({
        id: playlist.id,
        title: playlist.title,
        coverImageUrl: playlist.coverImageUrl
      });
    }
  }
  
  return missingCovers;
}

/**
 * Fix all playlists with missing cover images
 */
export async function syncAllCovers(): Promise<{
  fixed: number,
  total: number,
  details: {id: number, title: string, oldUrl: string | null, newUrl: string}[]
}> {
  await ensureDirectoriesExist();
  
  const missingCovers = await findPlaylistsWithMissingCovers();
  const fixedDetails: {id: number, title: string, oldUrl: string | null, newUrl: string}[] = [];
  
  for (const playlist of missingCovers) {
    const newUrl = await fixMissingCoverImage(
      playlist.id, 
      playlist.coverImageUrl || DEFAULT_COVER_PATH
    );
    
    fixedDetails.push({
      id: playlist.id,
      title: playlist.title,
      oldUrl: playlist.coverImageUrl,
      newUrl
    });
  }
  
  console.log(`Fixed ${fixedDetails.length} playlists with missing covers out of ${missingCovers.length} found`);
  
  return {
    fixed: fixedDetails.length,
    total: missingCovers.length,
    details: fixedDetails
  };
}

/**
 * Run the sync process once at server startup
 */
export async function runStartupSync(): Promise<void> {
  try {
    console.log('Starting cover image sync at server startup...');
    const result = await syncAllCovers();
    console.log(`Cover image sync complete. Fixed ${result.fixed} of ${result.total} playlists.`);
  } catch (error) {
    console.error('Error running startup cover image sync:', error);
  }
}