/**
 * Ensure Image Exists Service
 * 
 * This service provides a simple utility to check if an image exists at a given path 
 * and create a placeholder if it doesn't. It can be used both as middleware and as
 * a standalone function.
 */

import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import fetch from 'node-fetch';

// Convert callbacks to promises
const existsAsync = promisify(fs.exists);
const writeFileAsync = promisify(fs.writeFile);
const mkdirAsync = promisify(fs.mkdir);
const readFileAsync = promisify(fs.readFile);

// Configuration
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const IMAGES_DIR = path.join(PUBLIC_DIR, 'images');
const COVERS_DIR = path.join(IMAGES_DIR, 'covers');
const DEFAULT_COVER_PATH = path.join(IMAGES_DIR, 'default-cover.png');

/**
 * Ensure the necessary directories exist
 */
async function ensureDirectories(): Promise<void> {
  if (!await existsAsync(IMAGES_DIR)) {
    await mkdirAsync(IMAGES_DIR, { recursive: true });
    console.log(`Created directory: ${IMAGES_DIR}`);
  }
  
  if (!await existsAsync(COVERS_DIR)) {
    await mkdirAsync(COVERS_DIR, { recursive: true });
    console.log(`Created directory: ${COVERS_DIR}`);
  }
}

/**
 * Check if an image file exists
 * 
 * @param imageUrl The URL path of the image (e.g., /images/covers/image.png)
 * @returns The original URL to allow for frontend empty state handling
 */
export async function ensureImageExists(imageUrl: string): Promise<string> {
  try {
    // Skip external URLs
    if (imageUrl.startsWith('http')) {
      return imageUrl;
    }
    
    // Clean up the URL (remove query parameters)
    const cleanUrl = imageUrl.split('?')[0];
    
    // Convert to absolute path
    const absolutePath = path.join(PUBLIC_DIR, cleanUrl.replace(/^\//, ''));
    
    // Check if the file exists
    if (await existsAsync(absolutePath)) {
      return imageUrl; // File exists, return original URL
    }
    
    // Ensure directories exist for future storage
    await ensureDirectories();
    
    // Log the missing image
    console.log(`Missing image detected at ${absolutePath}`);
    
    // Simply return the original URL - let frontend handle empty states
    return imageUrl;
  } catch (error) {
    console.error(`Error checking if image exists at ${imageUrl}:`, error);
    return imageUrl; // Return original URL to allow frontend empty state handling
  }
}

/**
 * Retrieve an image file from an external URL and save it locally
 * 
 * @param externalUrl The external URL to download from
 * @param destinationPath The local path to save to (should start with /)
 * @returns The local path if successful, or null if failed
 */
export async function downloadExternalImage(externalUrl: string, destinationPath: string): Promise<string | null> {
  try {
    // Skip if not an external URL
    if (!externalUrl.startsWith('http')) {
      return destinationPath; // Already a local path
    }
    
    // Ensure directories exist
    await ensureDirectories();
    
    // Get the absolute path to save to
    const cleanPath = destinationPath.split('?')[0]; // Remove query parameters
    const absolutePath = path.join(PUBLIC_DIR, cleanPath.replace(/^\//, ''));
    
    // Download the image
    const response = await fetch(externalUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
    }
    
    // Get the image data
    const imageBuffer = Buffer.from(await response.arrayBuffer());
    
    // Ensure the directory exists
    const imageDir = path.dirname(absolutePath);
    if (!await existsAsync(imageDir)) {
      await mkdirAsync(imageDir, { recursive: true });
    }
    
    // Save the image
    await writeFileAsync(absolutePath, imageBuffer);
    
    console.log(`Downloaded external image from ${externalUrl} to ${absolutePath}`);
    return destinationPath;
  } catch (error) {
    console.error(`Error downloading external image from ${externalUrl}:`, error);
    return null;
  }
}