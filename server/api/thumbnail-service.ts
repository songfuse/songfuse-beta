/**
 * Thumbnail Service API
 * 
 * Provides optimized image serving for thumbnails, small images, and social sharing.
 * This service serves as a proxy to deliver the appropriate image size based on request parameters.
 */

import { Request, Response } from 'express';
import { getThumbnailUrl } from '../services/supabaseStorage';
import sharp from 'sharp';
import fetch from 'node-fetch';

/**
 * Serve optimized thumbnails based on size parameter
 * Query parameters:
 * - url: Original image URL
 * - size: thumbnail size (64, 150, 400, 1200x630)
 * - format: jpg or png (optional)
 */
export async function serveThumbnail(req: Request, res: Response) {
  try {
    const { url, size, format } = req.query;
    
    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        error: 'URL parameter is required'
      });
    }
    
    // Determine the appropriate thumbnail size
    let thumbnailSize: 'thumb' | 'small' | 'social' | 'og' = 'thumb';
    let targetSize = 64;
    
    if (size) {
      const sizeNum = parseInt(size as string);
      if (sizeNum <= 64) {
        thumbnailSize = 'thumb';
        targetSize = 64;
      } else if (sizeNum <= 150) {
        thumbnailSize = 'small';
        targetSize = 150;
      } else if (sizeNum <= 400) {
        thumbnailSize = 'social';
        targetSize = 400;
      } else {
        thumbnailSize = 'og';
        targetSize = 1200; // width for og images
      }
    }
    
    // Get the thumbnail URL
    const thumbnailUrl = getThumbnailUrl(url, thumbnailSize);
    
    // Set appropriate caching headers for aggressive browser caching
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // Cache for 1 year  
    res.setHeader('ETag', `"${Buffer.from(url).toString('base64')}-${targetSize}"`);
    res.setHeader('Content-Type', thumbnailSize === 'thumb' || thumbnailSize === 'small' ? 'image/png' : 'image/jpeg');
    
    try {
      // Try to fetch the pre-generated thumbnail first
      const thumbnailResponse = await fetch(thumbnailUrl);
      
      if (thumbnailResponse.ok) {
        // Serve the pre-generated thumbnail
        const buffer = await thumbnailResponse.buffer();
        return res.send(buffer);
      }
      
      // If thumbnail doesn't exist, generate it on-the-fly
      console.log(`Generating thumbnail on-the-fly for: ${url} (size: ${targetSize})`);
      
      const originalResponse = await fetch(url);
      if (!originalResponse.ok) {
        return res.status(404).json({
          error: 'Original image not found'
        });
      }
      
      const originalBuffer = await originalResponse.buffer();
      
      // Generate the thumbnail using Sharp
      let resizedBuffer;
      if (thumbnailSize === 'og') {
        // Open Graph images are 1200x630
        resizedBuffer = await sharp(originalBuffer)
          .resize(1200, 630, { fit: 'cover' })
          .jpeg({ quality: 80, progressive: true })
          .toBuffer();
      } else {
        const outputFormat = thumbnailSize === 'thumb' || thumbnailSize === 'small' ? 'png' : 'jpeg';
        const quality = thumbnailSize === 'thumb' ? 80 : thumbnailSize === 'small' ? 85 : 75;
        
        if (outputFormat === 'png') {
          resizedBuffer = await sharp(originalBuffer)
            .resize(targetSize, targetSize, { fit: 'cover' })
            .png({ quality, compressionLevel: 9 })
            .toBuffer();
        } else {
          resizedBuffer = await sharp(originalBuffer)
            .resize(targetSize, targetSize, { fit: 'cover' })
            .jpeg({ quality, progressive: true })
            .toBuffer();
        }
      }
      
      return res.send(resizedBuffer);
      
    } catch (fetchError) {
      console.error('Error fetching or processing image:', fetchError);
      return res.status(500).json({
        error: 'Failed to process image'
      });
    }
    
  } catch (error) {
    console.error('Error in thumbnail service:', error);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
}

/**
 * Get multiple thumbnail sizes for an image
 * Returns JSON with URLs for all available sizes
 */
export async function getThumbnailSizes(req: Request, res: Response) {
  try {
    const { url } = req.query;
    
    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        error: 'URL parameter is required'
      });
    }
    
    // Generate all thumbnail URLs
    const thumbnails = {
      original: url,
      thumbnail: getThumbnailUrl(url, 'thumb'),     // 64x64
      small: getThumbnailUrl(url, 'small'),         // 150x150
      social: getThumbnailUrl(url, 'social'),       // 400x400
      openGraph: getThumbnailUrl(url, 'og')         // 1200x630
    };
    
    return res.json({
      success: true,
      thumbnails
    });
    
  } catch (error) {
    console.error('Error getting thumbnail sizes:', error);
    return res.status(500).json({
      error: 'Failed to get thumbnail sizes'
    });
  }
}

/**
 * Add thumbnail service routes to Express app
 */
export function addThumbnailServiceRoutes(app: any) {
  // Serve optimized thumbnails
  app.get('/api/thumbnail', serveThumbnail);
  
  // Get all thumbnail size URLs
  app.get('/api/thumbnail-sizes', getThumbnailSizes);
  
  console.log('✅ Thumbnail service routes registered');
}