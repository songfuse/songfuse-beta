/**
 * Import Cover Images Script
 * 
 * This script imports cover images from a zip file that was exported
 * from another environment. It uses the manifest file to properly place
 * the images in the correct locations and update database records if needed.
 * 
 * Usage:
 *   node scripts/import-cover-images.js /path/to/manifest.json /path/to/images.zip
 * 
 * Arguments:
 *   - manifest: Path to the cover-images-manifest JSON file
 *   - zip: Path to the cover-images zip file
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { fileURLToPath } from 'url';
import ws from 'ws';

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const COVERS_DIR = path.join(process.cwd(), 'public', 'images', 'covers');
const TEMP_DIR = path.join(process.cwd(), 'temp');

// Ensure directories exist
if (!fs.existsSync(COVERS_DIR)) {
  fs.mkdirSync(COVERS_DIR, { recursive: true });
}

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Connect to database
async function connectToDatabase() {
  // Use the DATABASE_URL environment variable
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

// Helper to extract the zip file
function extractZipFile(zipPath) {
  console.log(`Extracting zip file: ${zipPath} to ${TEMP_DIR}...`);
  
  try {
    // Extract the zip file to a temporary directory
    execSync(`unzip -o "${zipPath}" -d "${TEMP_DIR}"`);
    console.log('Extraction completed successfully');
    return true;
  } catch (error) {
    console.error('Error extracting zip file:', error);
    return false;
  }
}

// Copy an image file from the temp directory to the covers directory
function copyImageFile(filename) {
  const sourcePath = path.join(TEMP_DIR, filename);
  const destPath = path.join(COVERS_DIR, filename);
  
  try {
    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, destPath);
      console.log(`Copied ${filename} to covers directory`);
      return true;
    } else {
      console.error(`Source file not found: ${sourcePath}`);
      return false;
    }
  } catch (error) {
    console.error(`Error copying file ${filename}:`, error);
    return false;
  }
}

// Main import function
async function importCoverImages(manifestPath, zipPath) {
  console.log('Starting cover image import process...');
  
  try {
    // Read the manifest file
    const manifestContent = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestContent);
    
    console.log(`Loaded manifest from ${manifestPath}`);
    console.log(`Manifest contains ${manifest.coverImages.length} cover images`);
    console.log(`Exported from ${manifest.environment} environment on ${manifest.exportDate}`);
    
    // Extract the zip file
    const extractionSuccessful = extractZipFile(zipPath);
    if (!extractionSuccessful) {
      console.error('Failed to extract zip file. Import aborted.');
      return;
    }
    
    // Connect to the database
    const pool = await connectToDatabase();
    
    // Process each image in the manifest
    let successCount = 0;
    let failureCount = 0;
    
    for (const imageInfo of manifest.coverImages) {
      const { filename, playlistId, databaseUrl } = imageInfo;
      
      // Copy the image file to the covers directory
      const copySuccessful = copyImageFile(filename);
      
      if (copySuccessful) {
        // Check if the playlist exists in the database
        const { rows } = await pool.query(`
          SELECT id, cover_image_url FROM playlists WHERE id = $1
        `, [playlistId]);
        
        if (rows.length > 0) {
          // Playlist exists, verify if the URLs match
          const playlist = rows[0];
          
          // Extract the base filename from both URLs
          const currentUrl = playlist.cover_image_url ? playlist.cover_image_url.split('?')[0] : null;
          const baseUrl = databaseUrl.split('?')[0];
          
          if (currentUrl !== baseUrl) {
            // Update the database record with the new URL
            await pool.query(`
              UPDATE playlists SET cover_image_url = $1 WHERE id = $2
            `, [databaseUrl, playlistId]);
            console.log(`Updated database record for playlist ${playlistId} with URL ${databaseUrl}`);
          } else {
            console.log(`Playlist ${playlistId} already has the correct URL: ${currentUrl}`);
          }
        } else {
          console.log(`Playlist ${playlistId} not found in the database, skipping URL update`);
        }
        
        successCount++;
      } else {
        failureCount++;
      }
    }
    
    // Close database connection
    await pool.end();
    
    // Clean up temp directory
    console.log('Cleaning up temporary files...');
    execSync(`rm -rf "${TEMP_DIR}/*"`);
    
    console.log(`
Import summary:
- Total images: ${manifest.coverImages.length}
- Successfully imported: ${successCount}
- Failed to import: ${failureCount}
    `);
    
    console.log('Cover image import completed');
  } catch (error) {
    console.error('Error importing cover images:', error);
  }
}

// Check command line arguments
const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error('Usage: node import-cover-images.js <manifest-path> <zip-path>');
  process.exit(1);
}

const manifestPath = args[0];
const zipPath = args[1];

// Run the import process
importCoverImages(manifestPath, zipPath);