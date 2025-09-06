/**
 * Image Verification Middleware
 * 
 * This middleware logs missing image requests to help identify issues
 * but doesn't create placeholders, allowing the frontend's empty state handling
 * to take over.
 */

import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { Request, Response, NextFunction } from 'express';

// Convert callbacks to promises
const existsAsync = promisify(fs.exists);
const mkdirAsync = promisify(fs.mkdir);

// Track missing images to avoid repeated logging
const missingImagesLog = new Set<string>();

/**
 * Ensures the image directory exists
 */
async function ensureDirectoryExists(dirPath: string): Promise<void> {
  if (!await existsAsync(dirPath)) {
    await mkdirAsync(dirPath, { recursive: true });
  }
}

/**
 * Express middleware that logs missing image files
 */
export async function imageVerificationMiddleware(req: Request, res: Response, next: NextFunction) {
  const url = req.url;
  
  // Only process image requests
  if (!url.startsWith('/images/') || 
      !url.match(/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i)) {
    return next();
  }
  
  try {
    // Get the absolute path to the requested file
    const publicDir = path.join(process.cwd(), 'public');
    const cleanPath = url.split('?')[0]; // Remove query parameters
    const filePath = path.join(publicDir, cleanPath);
    
    // Check if the file exists
    if (!await existsAsync(filePath)) {
      // If we haven't logged this missing image yet, log it
      if (!missingImagesLog.has(filePath)) {
        console.error(`Missing image detected: ${filePath}`);
        missingImagesLog.add(filePath);
      }
      
      // Ensure the directory exists for future file storage
      await ensureDirectoryExists(path.dirname(filePath));
      
      // The 404 will be served naturally, allowing frontend empty state to handle it
    }
  } catch (error) {
    console.error('Error in image verification middleware:', error);
  }
  
  // Continue processing the request
  next();
}