/**
 * Client-side Image Optimizer
 * 
 * Uses react-image-file-resizer to create optimized versions of images
 * before uploading to reduce bandwidth and improve performance
 */

import Resizer from 'react-image-file-resizer';

export interface OptimizedImageSet {
  original: File;
  social: Blob;      // 800x800, optimized for messaging apps
  thumbnail: Blob;   // 256x256, for UI thumbnails
  openGraph: Blob;   // 1200x630, for social media cards
}

export interface ResizeOptions {
  maxWidth: number;
  maxHeight: number;
  compressFormat: 'JPEG' | 'PNG' | 'WEBP';
  quality: number;
  rotation?: number;
}

/**
 * Resize a single image file with specified options
 */
export const resizeImage = (
  file: File,
  options: ResizeOptions
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    try {
      Resizer.imageFileResizer(
        file,                           // file
        options.maxWidth,              // maxWidth
        options.maxHeight,             // maxHeight
        options.compressFormat,        // compressFormat
        options.quality,               // quality
        options.rotation || 0,         // rotation
        (blob) => {                    // responseUriFunc
          if (blob instanceof Blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to resize image: Invalid blob response'));
          }
        },
        'blob',                        // outputType
        options.maxWidth,              // minWidth
        options.maxHeight              // minHeight
      );
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Create a complete set of optimized images for different use cases
 */
export const createOptimizedImageSet = async (file: File): Promise<OptimizedImageSet> => {
  if (!file.type.startsWith('image/')) {
    throw new Error('File must be an image');
  }

  try {
    // Create different optimized versions
    const [social, thumbnail, openGraph] = await Promise.all([
      // Social version: 800x800, high quality for messaging apps
      resizeImage(file, {
        maxWidth: 800,
        maxHeight: 800,
        compressFormat: 'JPEG',
        quality: 85,
      }),
      
      // Thumbnail version: 256x256, for UI elements
      resizeImage(file, {
        maxWidth: 256,
        maxHeight: 256,
        compressFormat: 'JPEG',
        quality: 80,
      }),
      
      // Open Graph version: 1200x630, for social media cards
      resizeImage(file, {
        maxWidth: 1200,
        maxHeight: 630,
        compressFormat: 'JPEG',
        quality: 85,
      }),
    ]);

    return {
      original: file,
      social,
      thumbnail,
      openGraph,
    };
  } catch (error) {
    console.error('Error creating optimized image set:', error);
    throw error;
  }
};

/**
 * Create a lightweight version specifically for messaging apps
 * Ensures the file size is under 100KB for better compatibility
 */
export const createLightweightSocialImage = async (file: File): Promise<Blob> => {
  let quality = 85;
  let size = 800;
  let optimizedBlob: Blob;

  // Start with good quality and progressively reduce if needed
  do {
    optimizedBlob = await resizeImage(file, {
      maxWidth: size,
      maxHeight: size,
      compressFormat: 'JPEG',
      quality,
    });

    // If still too large, reduce quality first, then size
    if (optimizedBlob.size > 95000) { // 95KB safety margin
      if (quality > 50) {
        quality -= 10;
      } else if (size > 600) {
        size -= 50;
        quality = 85; // Reset quality when reducing size
      } else {
        quality -= 5; // Final quality reduction
      }
    }

    // Prevent infinite loop
    if (quality < 25 && size < 500) break;
  } while (optimizedBlob.size > 95000);

  console.log(`📸 Created lightweight social image: ${Math.round(optimizedBlob.size / 1024)}KB (${size}x${size}, quality: ${quality})`);
  
  return optimizedBlob;
};

/**
 * Validate image file before processing
 */
export const validateImageFile = (file: File): { valid: boolean; error?: string } => {
  // Check file type
  if (!file.type.startsWith('image/')) {
    return { valid: false, error: 'File must be an image' };
  }

  // Check file size (max 10MB for original)
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    return { valid: false, error: 'Image must be smaller than 10MB' };
  }

  // Check supported formats
  const supportedFormats = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!supportedFormats.includes(file.type)) {
    return { valid: false, error: 'Supported formats: JPEG, PNG, WebP' };
  }

  return { valid: true };
};

/**
 * Get optimal image format based on content and use case
 */
export const getOptimalFormat = (
  file: File,
  useCase: 'social' | 'thumbnail' | 'openGraph' = 'social'
): 'JPEG' | 'PNG' | 'WEBP' => {
  // For photos and complex images, JPEG is usually better
  if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
    return 'JPEG';
  }

  // For images with transparency, keep PNG
  if (file.type === 'image/png' && useCase !== 'social') {
    return 'PNG';
  }

  // For social sharing, always use JPEG for better compatibility
  if (useCase === 'social') {
    return 'JPEG';
  }

  // Default to JPEG for best compression
  return 'JPEG';
};

/**
 * Convert a Blob to a File object with proper name and type
 */
export const blobToFile = (blob: Blob, filename: string, type?: string): File => {
  return new File([blob], filename, {
    type: type || blob.type,
    lastModified: Date.now(),
  });
};