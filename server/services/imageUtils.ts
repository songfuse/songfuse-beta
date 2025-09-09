/**
 * Image Utilities Service
 * 
 * Provides utilities for image processing, particularly for Spotify API integration.
 */

import fetch from 'node-fetch';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

/**
 * Convert an image URL to a base64 string, with resizing and optimization for Spotify
 * This function handles both remote URLs and local file paths
 */
export async function imageUrlToBase64(url: string): Promise<string> {
  try {
    console.log("Fetching image from URL:", url);

    let originalBuffer: Buffer;
    let fileExists = false;

    // Handle local file paths vs remote URLs
    if (url.startsWith('/images/')) {
      // Local file path - read from filesystem
      const filePath = getAbsolutePathFromPublicPath(url);
      console.log("Reading local image from:", filePath);
      
      // Check if file exists
      try {
        await fs.promises.access(filePath);
        fileExists = true;
        console.log("Image file exists at path:", filePath);
      } catch (fileError) {
        console.error("ERROR: Image file does not exist at path:", filePath);
        throw new Error(`Image file not found at path: ${filePath}`);
      }
      
      originalBuffer = await fs.promises.readFile(filePath);
    } else {
      // Remote URL - fetch from network
      console.log("Fetching remote image from:", url);
      
      // Special handling for OpenAI DALL-E temporary URLs
      const fetchOptions: any = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SongFuse/1.0)',
        }
      };
      
      // Add timeout to prevent hanging on slow/problematic URLs
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      fetchOptions.signal = controller.signal;
      
      try {
        const response = await fetch(url, fetchOptions);
        clearTimeout(timeoutId);

        if (!response.ok) {
          // For 409 errors (like DALL-E temporary URLs), provide a more helpful error
          if (response.status === 409) {
            throw new Error(`Image access denied (${response.status}). This may be a temporary image URL that has expired or requires special permissions.`);
          }
          throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.startsWith('image/')) {
          throw new Error(`URL does not contain an image (content-type: ${contentType})`);
        }

        const arrayBuffer = await response.arrayBuffer();
        originalBuffer = Buffer.from(arrayBuffer);
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          throw new Error('Image fetch timeout after 30 seconds');
        }
        throw fetchError;
      }
    }

    if (!originalBuffer || originalBuffer.length === 0) {
      throw new Error("Failed to load image: buffer is empty");
    }

    console.log("Original image size:", originalBuffer.length, "bytes");

    try {
      // IMPORTANT: After analyzing Spotify's API behavior, we're taking a more aggressive approach
      // For successful uploads, we need to keep the image extremely small
      
      // EXTREME OPTIMIZATION: Based on the Spotify API 502 errors
      // Resize to exactly 250x250 - much smaller than Spotify's recommended size
      // but increases chances of successful upload without 502 errors
      let processedBuffer = await sharp(originalBuffer)
        .resize(250, 250, {
          fit: 'cover',
          position: 'center'
        })
        .jpeg({
          quality: 40, // Start with very low quality
          progressive: true,
          chromaSubsampling: '4:2:0', // Aggressive chroma subsampling
          optimizeScans: true,
          trellisQuantisation: true, 
          overshootDeringing: true,
          force: true // Ensure we get JPEG
        })
        .toBuffer();
      
      console.log("Initial processing result (250x250, 40% quality):", processedBuffer.length, "bytes");
      
      // Spotify's API requires images under ~200KB, aim for much lower to avoid 502 errors
      // Target 30KB for maximum compatibility with Spotify's strict limits
      if (processedBuffer.length > 30000) { // 30KB
        let quality = 30;
        let size = 250;
        
        // Try progressively more aggressive optimizations
        while (processedBuffer.length > 30000 && (quality > 10 || size > 150)) {
          // First try reducing quality
          if (quality > 10) {
            console.log(`Image still too large (${processedBuffer.length} bytes), reducing quality to ${quality}%`);
            quality -= 5;
          } 
          // Then try reducing size if quality reduction isn't enough
          else if (size > 150) {
            size -= 25;
            quality = 20; // Reset quality a bit when dropping size
            console.log(`Image still too large, reducing size to ${size}x${size} with quality ${quality}%`);
          }
          
          processedBuffer = await sharp(originalBuffer)
            .resize(size, size, { fit: 'cover' })
            // Maximum optimizations for extreme size reduction
            .jpeg({
              quality: quality,
              progressive: true,
              chromaSubsampling: '4:2:0',
              trellisQuantisation: true,
              overshootDeringing: true,
              optimizeScans: true
            })
            .toBuffer();
        }
        
        console.log(`Final optimized image size: ${processedBuffer.length} bytes at ${size}x${size} with quality ${quality}%`);
      }
      
      // Calculate the approximate base64 size for logging
      const base64Size = Math.ceil(processedBuffer.length * 1.37); // Approximation of base64 overhead
      console.log(`Estimated base64 string length: ~${base64Size} characters`);
      
      // Convert to base64 and return
      const base64Result = processedBuffer.toString('base64');
      console.log(`Actual base64 string length: ${base64Result.length} characters`);
      
      return base64Result;
    } catch (error) {
      // Type-safe error handling
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("ERROR: Sharp processing failed:", errorMessage);
      throw new Error(`Image processing failed: ${errorMessage}`);
    }
  } catch (error) {
    console.error("ERROR: Failed to process image:", error);
    
    // Important: Return an empty string to continue without the cover
    // rather than failing the entire export process
    return "";
  }
}

/**
 * Get the absolute path from a public path
 */
export function getAbsolutePathFromPublicPath(publicPath: string): string {
  // Remove leading slash if present
  const normalizedPath = publicPath.startsWith('/') ? publicPath.substring(1) : publicPath;
  return path.join(process.cwd(), 'public', normalizedPath);
}

/**
 * Select the best image from an array of images, preferring square images
 * @param images Array of image objects with url, width, and height properties
 * @returns URL of the best image, or undefined if no images
 */
export function selectBestImage(images: Array<any> = []): string | undefined {
  if (!images || images.length === 0) {
    return undefined;
  }

  // Default to the first image if no better option is found
  let bestImage = images[0]?.url;

  // Look for square images (where width === height)
  const squareImage = images.find(img => img.width && img.height && img.width === img.height);
  if (squareImage) {
    bestImage = squareImage.url;
  }

  return bestImage;
}