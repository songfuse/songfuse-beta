/**
 * Cover Image Recovery Service
 * 
 * This service helps detect and recover missing cover images by:
 * 1. Checking if referenced cover images actually exist in the filesystem
 * 2. Providing a fallback image if needed
 * 3. Optionally regenerating missing covers using AI
 */

import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { db } from '../db';
import { playlists } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { getAbsolutePathFromPublicPath, saveImageFromUrl } from './imageStorage';
import { updatePlaylistCover } from './playlistCoverService';

const existsAsync = promisify(fs.exists);

// Constants
const DEFAULT_COVER_PATH = '/images/default-cover.png';

/**
 * Check if a playlist's cover image exists in the filesystem
 * @param playlistId Playlist ID to check
 * @returns Object with status and current cover URL
 */
export async function verifyPlaylistCoverExists(playlistId: number): Promise<{
  exists: boolean;
  coverUrl: string | null;
}> {
  try {
    // Get the playlist from the database
    const playlist = await db.query.playlists.findFirst({
      where: eq(playlists.id, playlistId),
    });

    if (!playlist || !playlist.coverImageUrl) {
      console.log(`Playlist ${playlistId} has no cover image URL in database`);
      return { exists: false, coverUrl: null };
    }

    // Clean URL by removing query parameters
    const cleanUrl = playlist.coverImageUrl.split('?')[0];
    
    // Get absolute path
    const absolutePath = getAbsolutePathFromPublicPath(cleanUrl);
    
    // Check if file exists
    const fileExists = await existsAsync(absolutePath);
    
    if (fileExists) {
      console.log(`Cover image for playlist ${playlistId} exists at ${absolutePath}`);
      return { exists: true, coverUrl: playlist.coverImageUrl };
    } else {
      console.warn(`Cover image for playlist ${playlistId} is missing at ${absolutePath}`);
      return { exists: false, coverUrl: playlist.coverImageUrl };
    }
  } catch (error) {
    console.error(`Error verifying cover for playlist ${playlistId}:`, error);
    return { exists: false, coverUrl: null };
  }
}

/**
 * Find and repair missing playlist cover images
 * @param specificPlaylistId Optional specific playlist ID to repair
 * @returns Statistics about repaired covers
 */
export async function repairMissingCovers(specificPlaylistId?: number): Promise<{
  total: number;
  missing: number;
  repaired: number;
}> {
  try {
    console.log(`Starting cover image verification${specificPlaylistId ? ` for playlist ${specificPlaylistId}` : ''}`);
    
    // Statistics
    let total = 0;
    let missing = 0;
    let repaired = 0;
    
    // Get all playlists or a specific one
    const playlistsToCheck = specificPlaylistId 
      ? await db.select().from(playlists).where(eq(playlists.id, specificPlaylistId))
      : await db.select().from(playlists);
    
    total = playlistsToCheck.length;
    console.log(`Found ${total} playlists to check for cover images`);
    
    // Check each playlist
    for (const playlist of playlistsToCheck) {
      const { exists, coverUrl } = await verifyPlaylistCoverExists(playlist.id);
      
      if (!exists && coverUrl) {
        missing++;
        console.log(`Attempting to repair missing cover for playlist ${playlist.id}`);
        
        try {
          // Try to use the Spotify cover as fallback if available
          if (playlist.spotifyImageUrl) {
            console.log(`Recovering from Spotify cover for playlist ${playlist.id}`);
            const result = await updatePlaylistCover(playlist.id, playlist.spotifyImageUrl);
            
            if (result.success) {
              console.log(`Successfully repaired cover for playlist ${playlist.id} using Spotify cover`);
              repaired++;
            } else {
              console.error(`Failed to repair cover for playlist ${playlist.id} using Spotify cover`);
            }
          } else {
            // Use default cover if no Spotify cover is available
            console.log(`Using default cover for playlist ${playlist.id}`);
            const result = await updatePlaylistCover(playlist.id, DEFAULT_COVER_PATH);
            
            if (result.success) {
              console.log(`Successfully set default cover for playlist ${playlist.id}`);
              repaired++;
            } else {
              console.error(`Failed to set default cover for playlist ${playlist.id}`);
            }
          }
        } catch (repairError) {
          console.error(`Error repairing cover for playlist ${playlist.id}:`, repairError);
        }
      }
    }
    
    console.log(`Cover image verification complete. Total: ${total}, Missing: ${missing}, Repaired: ${repaired}`);
    return { total, missing, repaired };
  } catch (error) {
    console.error('Error in repairMissingCovers:', error);
    return { total: 0, missing: 0, repaired: 0 };
  }
}