/**
 * Export Cover Images Script
 * 
 * This script exports all cover images from the current environment
 * to a zip file that can be transferred to another environment.
 * 
 * Usage:
 *   node scripts/export-cover-images.js
 * 
 * Output:
 *   - Creates a zip file in the root directory with all cover images
 *   - Also creates a JSON manifest with image metadata
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
const OUTPUT_DIR = path.join(process.cwd(), 'exports');
const COVERS_DIR = path.join(process.cwd(), 'public', 'images', 'covers');
const TIMESTAMP = new Date().toISOString().replace(/:/g, '-');
const ZIP_FILENAME = `cover-images-${TIMESTAMP}.zip`;
const MANIFEST_FILENAME = `cover-images-manifest-${TIMESTAMP}.json`;

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Connect to database
async function connectToDatabase() {
  // Use the DATABASE_URL environment variable
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

async function exportCoverImages() {
  console.log('Starting cover image export process...');
  
  try {
    // Connect to database
    const pool = await connectToDatabase();
    
    // Get all playlist cover image information from database
    const { rows: playlists } = await pool.query(`
      SELECT id, title, cover_image_url 
      FROM playlists 
      WHERE cover_image_url IS NOT NULL
    `);
    
    console.log(`Found ${playlists.length} playlists with cover images in the database`);
    
    // Create manifest of all images
    const manifest = {
      exportDate: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      coverImages: []
    };
    
    // Process each playlist's cover image
    const imageFiles = [];
    
    for (const playlist of playlists) {
      // Extract image filename from URL
      const imageUrl = playlist.cover_image_url;
      if (!imageUrl) continue;
      
      const cleanUrl = imageUrl.split('?')[0]; // Remove query parameters
      const filename = path.basename(cleanUrl);
      const filePath = path.join(COVERS_DIR, filename);
      
      // Check if file exists
      if (fs.existsSync(filePath)) {
        console.log(`Found cover image: ${filename} for playlist ${playlist.id}`);
        imageFiles.push(filename);
        
        // Add to manifest
        manifest.coverImages.push({
          playlistId: playlist.id,
          playlistTitle: playlist.title,
          databaseUrl: imageUrl,
          filename: filename
        });
      } else {
        console.log(`⚠️ Missing cover image: ${filename} for playlist ${playlist.id}`);
      }
    }
    
    // Save manifest to file
    const manifestPath = path.join(OUTPUT_DIR, MANIFEST_FILENAME);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`Saved manifest to ${manifestPath}`);
    
    // Create zip archive with all images
    if (imageFiles.length > 0) {
      console.log(`Creating zip archive with ${imageFiles.length} images...`);
      const zipPath = path.join(OUTPUT_DIR, ZIP_FILENAME);
      
      // Change to the covers directory
      process.chdir(COVERS_DIR);
      
      // Create the zip file using the zip command
      execSync(`zip -r "${zipPath}" ${imageFiles.join(' ')}`);
      
      console.log(`Successfully created zip archive at ${zipPath}`);
    } else {
      console.log('No image files found to zip');
    }
    
    // Close database connection
    await pool.end();
    
    console.log('Cover image export completed successfully');
  } catch (error) {
    console.error('Error exporting cover images:', error);
    process.exit(1);
  }
}

// Run the export process
exportCoverImages();