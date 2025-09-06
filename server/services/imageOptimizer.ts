/**
 * Image Optimizer Service
 * 
 * This service creates optimized thumbnail URLs by modifying Supabase image URLs
 * to use smaller dimensions and better compression for faster loading.
 */

/**
 * Generate optimized thumbnail URL from original Supabase image URL
 * This uses Supabase's built-in image transformation features
 */
export function getOptimizedImageUrl(
  originalUrl: string,
  size: 'xs' | 'sm' | 'md' = 'sm'
): string {
  if (!originalUrl) return originalUrl;
  
  // Size configurations for different use cases
  const sizeConfigs = {
    xs: { width: 64, height: 64, quality: 60 },   // For small cards and lists
    sm: { width: 128, height: 128, quality: 70 }, // For medium cards  
    md: { width: 256, height: 256, quality: 80 }  // For large cards
  };
  
  const config = sizeConfigs[size];
  
  // Check if this is a Supabase storage URL
  if (originalUrl.includes('supabase.co/storage/v1/object/public/')) {
    // Add Supabase image transformation parameters
    const separator = originalUrl.includes('?') ? '&' : '?';
    return `${originalUrl}${separator}width=${config.width}&height=${config.height}&resize=cover&quality=${config.quality}`;
  }
  
  // For non-Supabase URLs, return as-is
  return originalUrl;
}

/**
 * Generate multiple thumbnail sizes for a given image URL
 */
export function getMultipleThumbnailUrls(originalUrl: string) {
  return {
    xs: getOptimizedImageUrl(originalUrl, 'xs'),
    sm: getOptimizedImageUrl(originalUrl, 'sm'),
    md: getOptimizedImageUrl(originalUrl, 'md'),
    original: originalUrl
  };
}

/**
 * Validate and process image URL for optimization
 */
export function processImageUrlForThumbnail(
  imageUrl: string | null | undefined,
  size: 'xs' | 'sm' | 'md' = 'sm'
): string | null {
  if (!imageUrl) return null;
  
  try {
    // Validate URL format
    new URL(imageUrl);
    return getOptimizedImageUrl(imageUrl, size);
  } catch (error) {
    console.warn('Invalid image URL:', imageUrl);
    return null;
  }
}