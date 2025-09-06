import React, { useState, useEffect, useRef } from 'react';
import { cn } from "@/lib/utils";

interface PlaylistCoverPlaceholderProps {
  className?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  imageUrl?: string;         // Primary image (AI-generated or user-uploaded)
  spotifyImageUrl?: string;  // Fallback Spotify image
  altText?: string;
}

/**
 * A unified playlist cover component that shows only real cover images
 * NO PLACEHOLDERS - shows transparent div if no cover available
 */
const PlaylistCoverPlaceholder: React.FC<PlaylistCoverPlaceholderProps> = ({ 
  className,
  size = "md",
  imageUrl,
  spotifyImageUrl,
  altText = "Playlist cover" 
}) => {
  const [primaryImageError, setPrimaryImageError] = useState(false);
  const [spotifyImageError, setSpotifyImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  
  // Reference to track mounted state to prevent state updates after unmount
  const isMounted = useRef(true);
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);
  
  // Size mappings for the icon
  const iconSizes = {
    xs: "h-4 w-4",
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-14 w-14",
    xl: "h-16 w-16",
  };

  // Track if we've already validated the image to prevent multiple checks
  const [imageValidated, setImageValidated] = useState(false);
  const [spotifyImageValidated, setSpotifyImageValidated] = useState(false);
  
  // Generate a stable timestamp that persists across renders and pages
  // Use a hash of the image URL to create a stable but unique timestamp
  const generateStableTimestamp = (url: string): number => {
    if (!url) return Date.now();
    // Create a simple hash of the URL for consistent timestamps
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    // Use absolute value and add a base timestamp to ensure it's positive and recent
    return Math.abs(hash) + 1700000000000; // Base timestamp from 2023
  };
  
  // Use ref to store the timestamp to ensure it doesn't change on re-renders
  const timestampRef = useRef(imageUrl ? generateStableTimestamp(imageUrl) : Date.now());

  // Function to optimize image URL for specific sizes
  const getOptimizedImageUrl = (url: string, size: string) => {
    if (!url) return url;
    
    // Size mapping for optimization
    const sizeMap = {
      xs: 64,
      sm: 128,
      md: 256,
      lg: 512,
      xl: 640
    };
    
    const targetSize = sizeMap[size as keyof typeof sizeMap] || sizeMap.md;
    
    // For Supabase images, use our thumbnail service for small sizes
    if (url.includes('supabase.co') && url.includes('playlist-covers') && (size === 'xs' || size === 'sm')) {
      // Use server-side thumbnail generation for sidebar images
      return `/api/thumbnail?url=${encodeURIComponent(url)}&size=${targetSize}`;
    }
    
    // For Spotify mosaic images, try to use a smaller size if available
    if (url.includes('mosaic.scdn.co')) {
      // Spotify mosaic URLs typically have size in the path like /640/
      const optimizedUrl = url.replace(/\/\d+\//, `/${targetSize}/`);
      return optimizedUrl !== url ? optimizedUrl : url;
    }
    
    return url;
  };

  // Reset validation state when image URLs change
  useEffect(() => {
    setPrimaryImageError(false);
    setImageValidated(false);
    setImageLoaded(false);
    // Update timestamp only when image URL actually changes to a different URL
    timestampRef.current = imageUrl ? generateStableTimestamp(imageUrl) : Date.now();
  }, [imageUrl]);
  
  useEffect(() => {
    setSpotifyImageError(false);
    setSpotifyImageValidated(false);
    // Update timestamp only when Spotify image URL actually changes to a different URL
    timestampRef.current = spotifyImageUrl ? generateStableTimestamp(spotifyImageUrl) : Date.now();
  }, [spotifyImageUrl]);

  // Validate primary image without using server API calls
  useEffect(() => {
    // Skip validation if we've already done it or if there's no URL
    if (!imageUrl || imageValidated || !isMounted.current) return;
    
    // Add more detailed logging
    console.log(`Validating image URL (${size} size): "${imageUrl}"`);
    
    // Mark as validated to prevent repeated checks
    setImageValidated(true);
    
    // Use a simple Image object to check if the image loads
    const testImg = new Image();
    
    // Set timeout for slow-loading images (5 seconds) - longer timeout for better stability
    const timeoutId = setTimeout(() => {
      if (isMounted.current) {
        console.warn("Image load timeout for:", imageUrl);
        // Don't retry - just mark as error to prevent infinite reloading
        setPrimaryImageError(true);
      }
    }, 5000);
    
    testImg.onload = () => {
      clearTimeout(timeoutId);
      if (isMounted.current) {
        console.log(`Image validated successfully (${size} size):`, imageUrl);
        setPrimaryImageError(false);
        setImageLoaded(true);
      }
    };
    
    testImg.onerror = () => {
      clearTimeout(timeoutId);
      if (isMounted.current) {
        console.error(`Primary image failed to load (${size} size):`, imageUrl);
        console.error("Origin:", window.location.origin);
        console.error("Image absolute URL:", new URL(imageUrl, window.location.origin).href);
        
        // Don't retry on error - just mark as failed to prevent reload loops
        setPrimaryImageError(true);
      }
    };
    
    // Set the src to trigger the loading process
    // Use the URL as-is to avoid unnecessary cache-busting
    testImg.src = imageUrl;
    
    // Cleanup function
    return () => {
      clearTimeout(timeoutId);
      testImg.onload = null;
      testImg.onerror = null;
    };
  }, [imageUrl, imageValidated]);
  
  // No longer need to validate Spotify images since we don't use them anymore
  useEffect(() => {
    // If a Spotify image URL exists but hasn't been validated, 
    // immediately mark it as validated and set error to true to prevent its use
    if (spotifyImageUrl && !spotifyImageValidated && isMounted.current) {
      console.log("Skipping Spotify image validation - fallback disabled");
      setSpotifyImageValidated(true);
      setSpotifyImageError(true); // Always treat as error so we don't try to use it
    }
  }, [spotifyImageUrl, spotifyImageValidated]);

  // Helper function to add cache-busting parameter to image URLs
  const addCacheBuster = (url: string | undefined): string | undefined => {
    if (!url) return url;
    
    // First check if this is a valid URL
    try {
      // Test if it's a valid URL by creating a URL object
      new URL(url, window.location.origin);
    } catch (e) {
      console.error(`Invalid URL in PlaylistCoverPlaceholder (${size}):`, url);
      return url; // Return the original URL if it's invalid
    }
    
    // If the URL already has a timestamp parameter, don't modify it
    // This preserves the timestamp from the parent component
    if (url.includes('timestamp=')) {
      console.log(`URL already has timestamp, using as-is (${size}): ${url}`);
      return url;
    }
    
    // Always replace any existing v= cache-busting params with a timestamp
    let processedUrl = url;
    
    // Handle v= parameter (used in PlaylistDetailsUpdated)
    if (url.includes('v=')) {
      processedUrl = url.replace(/[\?&]v=\d+/, '');
    }
    
    // Add a fresh cache-busting parameter
    const separator = processedUrl.includes('?') ? '&' : '?';
    const timestamp = timestampRef.current;
    
    console.log(`Processing image URL (${size}): ${url} → ${processedUrl}${separator}timestamp=${timestamp}`);
    
    return `${processedUrl}${separator}timestamp=${timestamp}`;
  };
  
  // Apply optimization and cache busting to both image URLs
  const optimizedImageUrl = imageUrl ? getOptimizedImageUrl(imageUrl, size) : imageUrl;
  const optimizedSpotifyUrl = spotifyImageUrl ? getOptimizedImageUrl(spotifyImageUrl, size) : spotifyImageUrl;
  
  const primaryImageWithCache = addCacheBuster(optimizedImageUrl);
  const spotifyImageWithCache = addCacheBuster(optimizedSpotifyUrl);

  // Check if the primary image is a Spotify mosaic URL (we now want to allow these)
  const isSpotifyMosaicUrl = primaryImageWithCache?.includes('mosaic.scdn.co') || false;
  
  // Log when we encounter a Spotify mosaic URL, but we'll still use it
  if (isSpotifyMosaicUrl && primaryImageWithCache) {
    console.log("Using Spotify mosaic URL:", primaryImageWithCache);
  }
  
  // Calculate what should be shown based on image availability and error states
  // Show the primary image if available, regardless of whether it's a Spotify mosaic
  const showPrimaryImage = !!primaryImageWithCache && !primaryImageError;
  const showSpotifyImage = false; // Always disable Spotify image fallback
  const showPlaceholder = !showPrimaryImage; // Show placeholder if primary image isn't available
  
  // Render the component with only two states: either show the primary image or the placeholder
  return (
    <div className={cn("w-full h-full aspect-square overflow-hidden", className)}>
      {/* Case 1: AI-generated or user-uploaded cover */}
      {showPrimaryImage && (
        <img 
          src={primaryImageWithCache}
          alt={altText}
          className="w-full h-full object-cover object-center"
          onError={() => {
            if (isMounted.current) {
              console.error("Primary image failed to load during render:", primaryImageWithCache);
              setPrimaryImageError(true);
            }
          }}
          onLoad={() => {
            if (isMounted.current) {
              setImageLoaded(true);
              console.log("Primary image loaded successfully:", primaryImageWithCache);
            }
          }}
        />
      )}
      
      {/* Case 2: Placeholder - always shown when primary image is not available */}
      {showPlaceholder && (
        <div 
          className={cn(
            "w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/30 dark:from-gray-800/90 dark:to-black/80"
          )}
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className={cn("text-primary dark:text-gray-300", iconSizes[size])} 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" 
            />
          </svg>
        </div>
      )}
    </div>
  );
};

export default PlaylistCoverPlaceholder;