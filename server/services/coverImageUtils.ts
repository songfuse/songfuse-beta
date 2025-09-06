/**
 * Cover Image Utilities
 * 
 * Helper functions for working with cover images in the database
 */

import { pool } from '../db';
import fs from 'fs';
import path from 'path';

/**
 * Add a timestamp to a URL for cache busting
 * @param url The URL to add a timestamp to
 * @returns The URL with a timestamp parameter
 */
export function addTimestampToUrl(url: string): string {
  const timestamp = Date.now();
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}timestamp=${timestamp}`;
}

/**
 * Ensure a cover image exists and is valid
 * Simple version that just checks file existence
 * @param coverUrl The URL of the cover image to check
 * @returns True if the image exists and is valid
 */
export function verifyImageExists(coverUrl: string): boolean {
  try {
    // If it's a remote URL (starts with http), assume it's valid
    if (coverUrl && coverUrl.startsWith('http')) {
      return true;
    }
    
    if (!coverUrl) {
      return false;
    }
    
    // For local images, check if the file exists
    // Remove any parameters from the URL (like timestamp)
    const cleanUrl = coverUrl.split('?')[0];
    
    // Get the absolute path to the image
    const publicPath = path.join(process.cwd(), 'public');
    const imagePath = path.join(publicPath, cleanUrl.replace(/^\//, ''));
    
    // Check if the file exists
    return fs.existsSync(imagePath);
  } catch (error) {
    console.error(`Error verifying cover image ${coverUrl}:`, error);
    return false;
  }
}

/**
 * Ensure a cover image exists and update it in the database
 * This is the main function that the playlist cover service uses
 * @param pool Database connection pool
 * @param playlistId ID of the playlist to update
 * @param coverUrl New cover image URL (can be null to remove cover)
 * @returns Object with success flag and current URL
 */
export async function ensureAndVerifyCoverImage(
  pool: any, 
  playlistId: number, 
  coverUrl: string | null
): Promise<{ success: boolean; currentUrl: string | null }> {
  try {
    // If coverUrl is null, we're removing the cover image
    if (coverUrl === null) {
      const result = await pool.query(
        'UPDATE playlists SET cover_image_url = NULL WHERE id = $1 RETURNING id',
        [playlistId]
      );
      
      return { 
        success: result.rowCount === 1, 
        currentUrl: null 
      };
    }
    
    // Verify that the image exists
    const imageExists = verifyImageExists(coverUrl);
    
    if (!imageExists) {
      console.error(`Cover image does not exist: ${coverUrl}`);
      return { success: false, currentUrl: null };
    }
    
    // Update the playlist in the database
    const result = await pool.query(
      'UPDATE playlists SET cover_image_url = $1 WHERE id = $2 RETURNING id, cover_image_url',
      [coverUrl, playlistId]
    );
    
    if (result.rowCount === 0) {
      console.error(`Playlist ${playlistId} not found in database`);
      return { success: false, currentUrl: null };
    }
    
    return { 
      success: true, 
      currentUrl: result.rows[0].cover_image_url 
    };
  } catch (error) {
    console.error(`Error updating playlist ${playlistId} cover:`, error);
    return { success: false, currentUrl: null };
  }
}

/**
 * Update a playlist's cover image URL in the database
 * @param playlistId The ID of the playlist to update
 * @param coverUrl The URL of the cover image
 * @returns True if the update was successful
 */
export async function updatePlaylistCoverInDatabase(playlistId: number, coverUrl: string): Promise<boolean> {
  try {
    // Add a timestamp for cache busting
    const timestampedUrl = addTimestampToUrl(coverUrl);
    
    // Update the playlist's cover_image_url in the database
    const result = await pool.query(
      'UPDATE playlists SET cover_image_url = $1 WHERE id = $2 RETURNING id',
      [timestampedUrl, playlistId]
    );
    
    if (result.rowCount === 0) {
      console.error(`Failed to update playlist ${playlistId} - not found in database`);
      return false;
    }
    
    console.log(`Successfully updated playlist ${playlistId} with cover: ${timestampedUrl}`);
    return true;
  } catch (error) {
    console.error(`Error updating playlist ${playlistId} cover:`, error);
    return false;
  }
}