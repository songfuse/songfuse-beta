/**
 * Fix Cover Images Script
 * 
 * This script identifies playlists with temporary DALL-E URLs and downloads
 * the images to store them permanently, updating the database references.
 */

import { db } from './db';
import { playlists } from '@shared/schema';
import { eq, like } from 'drizzle-orm';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

/**
 * Download an image from a temporary URL and save it permanently
 */
async function downloadAndSaveImage(imageUrl: string, playlistId: number): Promise<string | null> {
  try {
    console.log(`Downloading image for playlist ${playlistId}...`);
    
    // Create covers directory if it doesn't exist
    const coversDir = path.join(process.cwd(), 'public', 'images', 'covers');
    if (!fs.existsSync(coversDir)) {
      fs.mkdirSync(coversDir, { recursive: true });
    }
    
    // Try to fetch the image with a timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    const response = await fetch(imageUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SongFuse/1.0)',
      }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.error(`Failed to fetch image for playlist ${playlistId}: ${response.status} ${response.statusText}`);
      return null;
    }
    
    // Get image data
    const imageBuffer = await response.buffer();
    
    // Create unique filename
    const filename = `playlist-${playlistId}-cover-${Date.now()}.png`;
    const filePath = path.join(coversDir, filename);
    
    // Save the image
    fs.writeFileSync(filePath, imageBuffer);
    
    // Return the public URL
    const publicUrl = `/images/covers/${filename}`;
    console.log(`✅ Saved image for playlist ${playlistId} to ${publicUrl}`);
    
    return publicUrl;
    
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error(`Image download timeout for playlist ${playlistId}`);
    } else {
      console.error(`Error downloading image for playlist ${playlistId}:`, error.message);
    }
    return null;
  }
}

/**
 * Fix all playlists with temporary DALL-E URLs
 */
async function fixCoverImages() {
  try {
    console.log('🔍 Finding playlists with temporary DALL-E URLs...');
    
    // Find all playlists with temporary DALL-E URLs using raw SQL to avoid ORM issues
    const result = await db.execute(`
      SELECT id, title, cover_image_url as "coverImageUrl"
      FROM playlists 
      WHERE cover_image_url LIKE '%oaidalleapiprodscus.blob.core.windows.net%'
      ORDER BY id DESC
    `);
    
    const playlistsWithTempUrls = result.rows as Array<{
      id: number;
      title: string;
      coverImageUrl: string;
    }>;
    
    console.log(`Found ${playlistsWithTempUrls.length} playlists with temporary URLs`);
    
    if (playlistsWithTempUrls.length === 0) {
      console.log('✅ No playlists need fixing!');
      return;
    }
    
    let fixed = 0;
    let failed = 0;
    
    // Process each playlist
    for (const playlist of playlistsWithTempUrls) {
      console.log(`\n📥 Processing playlist ${playlist.id}: "${playlist.title}"`);
      
      // Download and save the image
      const newImageUrl = await downloadAndSaveImage(playlist.coverImageUrl, playlist.id);
      
      if (newImageUrl) {
        // Update the database with the new URL
        try {
          await db
            .update(playlists)
            .set({ cover_image_url: newImageUrl })
            .where(eq(playlists.id, playlist.id));
          
          console.log(`✅ Updated playlist ${playlist.id} database record with new URL: ${newImageUrl}`);
          fixed++;
        } catch (dbError) {
          console.error(`❌ Failed to update database for playlist ${playlist.id}:`, dbError);
          failed++;
        }
      } else {
        console.log(`❌ Failed to download image for playlist ${playlist.id}`);
        failed++;
      }
      
      // Add a small delay to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`✅ Fixed: ${fixed} playlists`);
    console.log(`❌ Failed: ${failed} playlists`);
    console.log(`📁 Total processed: ${playlistsWithTempUrls.length} playlists`);
    
  } catch (error) {
    console.error('Error fixing cover images:', error);
  }
}

// Run the script if called directly
fixCoverImages()
  .then(() => {
    console.log('\n🎉 Cover image fix process completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });

export { fixCoverImages, downloadAndSaveImage };