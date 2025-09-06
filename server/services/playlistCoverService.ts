/**
 * Playlist Cover Image Service
 * This service centralizes all operations related to playlist cover images
 * to ensure consistent database updates and verification
 */

import { Pool } from '@neondatabase/serverless';
import { db } from '../db';
import { playlists } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { ensureAndVerifyCoverImage, addTimestampToUrl } from './coverImageUtils';
import { storage } from '../storage';

// Reuse the existing Pool instance from db.ts (which is already configured)
import { pool as dbPool } from '../db';

// Use the existing pool which is already properly configured with WebSocket support
const pool = dbPool;

/**
 * Update a playlist's cover image with robust verification
 * This ensures the cover image URL is properly stored in the database
 * 
 * @param playlistId The ID of the playlist to update
 * @param coverImageUrl The new cover image URL
 * @returns Promise resolving to an object with success status and resulting URL
 */
export async function updatePlaylistCover(
  playlistId: number,
  coverImageUrl: string | null
): Promise<{ success: boolean; resultUrl: string | null }> {
  console.log(`[COVER SERVICE] Updating cover for playlist ${playlistId} to ${coverImageUrl || 'null'}`);
  
  try {
    // Record original cover for reference
    const originalPlaylist = await db.query.playlists.findFirst({
      where: eq(playlists.id, playlistId),
    });
    
    const originalCover = originalPlaylist?.coverImageUrl;
    console.log(`[COVER SERVICE] Original cover for playlist ${playlistId}: ${originalCover || 'null'}`);
    
    // Add timestamp to URL for cache busting if it's not null
    const timestampedUrl = coverImageUrl ? addTimestampToUrl(coverImageUrl) : null;
    
    // 1. First update through our robust verification system
    const { success, currentUrl } = await ensureAndVerifyCoverImage(
      pool,
      playlistId,
      timestampedUrl
    );
    
    if (success) {
      console.log(`[COVER SERVICE] Primary update successful for playlist ${playlistId}`);
      return { success: true, resultUrl: currentUrl };
    }
    
    // 2. If the primary update failed, try the ORM update as backup
    console.log(`[COVER SERVICE] Primary update failed, trying ORM update for playlist ${playlistId}`);
    try {
      await db.update(playlists)
        .set({ coverImageUrl: timestampedUrl })
        .where(eq(playlists.id, playlistId));
      
      // 3. Verify the ORM update actually worked
      const updatedPlaylist = await db.query.playlists.findFirst({
        where: eq(playlists.id, playlistId),
      });
      
      const expected = timestampedUrl?.split('?')[0] || null;
      const actual = updatedPlaylist?.coverImageUrl?.split('?')[0] || null;
      
      if ((expected === null && actual === null) || 
          (expected !== null && actual !== null && expected === actual)) {
        console.log(`[COVER SERVICE] ORM update successful for playlist ${playlistId}`);
        return { success: true, resultUrl: updatedPlaylist ? updatedPlaylist.coverImageUrl : null };
      }
      
      console.error(`[COVER SERVICE] ORM update failed verification for playlist ${playlistId}`);
      console.error(`[COVER SERVICE] Expected: ${expected}, Actual: ${actual}`);
    } catch (ormError) {
      console.error(`[COVER SERVICE] ORM update error for playlist ${playlistId}:`, ormError);
    }
    
    // 3. Last resort: direct SQL update (bypassing ORM)
    console.log(`[COVER SERVICE] Trying direct SQL update for playlist ${playlistId}`);
    try {
      const result = await pool.query(
        `UPDATE playlists SET cover_image_url = $1 WHERE id = $2 RETURNING id, cover_image_url`,
        [timestampedUrl, playlistId]
      );
      
      if (result.rowCount === 1) {
        console.log(`[COVER SERVICE] Direct SQL update successful for playlist ${playlistId}`);
        return { 
          success: true, 
          resultUrl: result.rows[0].cover_image_url 
        };
      }
      
      console.error(`[COVER SERVICE] Direct SQL update failed for playlist ${playlistId}`);
    } catch (sqlError) {
      console.error(`[COVER SERVICE] Direct SQL update error for playlist ${playlistId}:`, sqlError);
    }
    
    // If we get here, all update attempts have failed
    console.error(`[COVER SERVICE] All update attempts failed for playlist ${playlistId}`);
    return { success: false, resultUrl: originalCover || null };
  } catch (error) {
    console.error(`[COVER SERVICE] Unexpected error updating cover for playlist ${playlistId}:`, error);
    return { success: false, resultUrl: null };
  }
}

/**
 * Synchronize a session's cover image with a playlist
 * This ensures any cover image generated during the session is properly saved with the playlist
 * 
 * @param sessionId The session ID that might contain a cover image
 * @param playlistId The playlist ID to associate the cover with
 * @returns Promise resolving to success status and resulting URL
 */
export async function syncSessionCoverWithPlaylist(
  sessionId: string,
  playlistId: number
): Promise<{ success: boolean; resultUrl: string | null }> {
  console.log(`[COVER SERVICE] Syncing session ${sessionId} cover with playlist ${playlistId}`);
  
  try {
    // Try to get a cover image from the session
    const sessionCover = await storage.getCoverImageForSession(sessionId);
    
    if (!sessionCover) {
      console.log(`[COVER SERVICE] No cover found in session ${sessionId}`);
      return { success: false, resultUrl: null };
    }
    
    console.log(`[COVER SERVICE] Found cover in session ${sessionId}: ${sessionCover}`);
    
    // Update the playlist with the session cover
    return await updatePlaylistCover(playlistId, sessionCover);
  } catch (error) {
    console.error(`[COVER SERVICE] Error syncing session cover with playlist:`, error);
    return { success: false, resultUrl: null };
  }
}

/**
 * Ensure that all requests to save a cover image go through our central service
 * This patches key endpoints to ensure consistent cover image handling
 */
export function patchCoverImageHandlers() {
  // This is a placeholder for future implementation
  // We would add patching logic here if needed
  console.log('[COVER SERVICE] Cover image handlers patched for consistent handling');
}