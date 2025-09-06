/**
 * Download and save images that are already working on our server
 * This fixes the issue where images display correctly but aren't saved to filesystem
 */

import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const writeFileAsync = promisify(fs.writeFile);
const statAsync = promisify(fs.stat);

/**
 * Download a working image from our server and save it to the filesystem
 */
export async function downloadAndSaveServerImage(imageUrl: string): Promise<boolean> {
  try {
    console.log(`🔄 Downloading image from our server: ${imageUrl}`);
    
    // Extract the filename from the URL
    const urlParts = imageUrl.split('/');
    const filenameWithParams = urlParts[urlParts.length - 1];
    const filename = filenameWithParams.split('?')[0]; // Remove timestamp parameters
    
    // Full server URL
    const fullUrl = `https://beta.songfuse.app${imageUrl}`;
    
    console.log(`📥 Fetching image from: ${fullUrl}`);
    
    const response = await fetch(fullUrl);
    if (!response.ok) {
      console.error(`❌ Failed to fetch image: ${response.status} ${response.statusText}`);
      return false;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);
    
    console.log(`📏 Downloaded ${imageBuffer.length} bytes`);
    
    // Save to the correct location (from the server directory, the public folder is in the parent)
    const filePath = path.join(process.cwd(), 'public', 'images', 'covers', filename);
    
    console.log(`💾 Saving to: ${filePath}`);
    await writeFileAsync(filePath, imageBuffer);
    
    // Verify the file was saved correctly
    const stats = await statAsync(filePath);
    console.log(`✅ File saved successfully: ${stats.size} bytes`);
    
    if (stats.size === imageBuffer.length) {
      console.log(`🎉 Perfect! File size matches downloaded size`);
      return true;
    } else {
      console.warn(`⚠️ Size mismatch: expected ${imageBuffer.length}, got ${stats.size}`);
      return false;
    }
    
  } catch (error) {
    console.error('❌ Error downloading from server:', error);
    return false;
  }
}

/**
 * Fix missing cover images by downloading them from the working server URLs
 */
export async function fixMissingCoverImages(playlistIds: number[]): Promise<void> {
  const { db } = await import('../db');
  const { playlists } = await import('../../shared/schema');
  const { eq } = await import('drizzle-orm');
  
  console.log(`🔧 Fixing missing cover images for ${playlistIds.length} playlists`);
  
  for (const playlistId of playlistIds) {
    try {
      // Get the playlist cover URL from database
      const [playlist] = await db.select().from(playlists).where(eq(playlists.id, playlistId));
      
      if (!playlist || !playlist.coverImageUrl) {
        console.log(`⏭️ Skipping playlist ${playlistId} - no cover URL found`);
        continue;
      }
      
      console.log(`🔄 Processing playlist ${playlistId}: ${playlist.title}`);
      console.log(`📸 Cover URL: ${playlist.coverImageUrl}`);
      
      const success = await downloadAndSaveServerImage(playlist.coverImageUrl);
      
      if (success) {
        console.log(`✅ Fixed playlist ${playlistId} cover image`);
      } else {
        console.log(`❌ Failed to fix playlist ${playlistId} cover image`);
      }
      
    } catch (error) {
      console.error(`❌ Error processing playlist ${playlistId}:`, error);
    }
  }
  
  console.log(`🎯 Finished fixing cover images`);
}