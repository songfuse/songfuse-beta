import React, { useEffect, useState } from 'react';
import PlaylistCoverPlaceholder from './PlaylistCoverPlaceholder';

interface SpotifyPlaylistCoverProps {
  spotifyUrl: string;
  playlistTitle: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

/**
 * Component that fetches and displays a Spotify playlist cover image
 * Falls back to a placeholder if the image cannot be fetched
 */
const SpotifyPlaylistCover: React.FC<SpotifyPlaylistCoverProps> = ({ 
  spotifyUrl, 
  playlistTitle,
  size = 'md'
}) => {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [imageVersion, setImageVersion] = useState(Date.now()); // Add version for cache busting

  // Add utility function for cache busting URLs
  const getImageUrl = (url: string) => {
    if (!url) return '';
    return url.includes('?') ? `${url}&v=${imageVersion}` : `${url}?v=${imageVersion}`;
  };

  // Update version when coverUrl changes
  useEffect(() => {
    if (coverUrl) {
      setImageVersion(Date.now());
    }
  }, [coverUrl]);
  
  useEffect(() => {
    const fetchSpotifyCover = async () => {
      try {
        // Extract Spotify ID from URL
        const spotifyId = spotifyUrl.split('/').pop();
        
        if (!spotifyId) {
          console.error('Could not extract Spotify ID from URL:', spotifyUrl);
          setHasError(true);
          setIsLoading(false);
          return;
        }
        
        // Fetch playlist info from our API
        const response = await fetch(`/api/spotify-playlist-info/${spotifyId}`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch Spotify playlist info: ${response.status}`);
        }
        
        const data = await response.json();
        
        // If we have images, use the first one (usually the largest)
        if (data.images && data.images.length > 0) {
          setCoverUrl(data.images[0].url);
        } else {
          setHasError(true);
        }
      } catch (error) {
        console.error('Error fetching Spotify cover:', error);
        setHasError(true);
      } finally {
        setIsLoading(false);
      }
    };

    if (spotifyUrl) {
      fetchSpotifyCover();
    }
  }, [spotifyUrl]);

  // Show loading placeholder while fetching
  if (isLoading) {
    return <PlaylistCoverPlaceholder size={size} />;
  }

  // If we have a cover URL, show the image
  if (coverUrl && !hasError) {
    return (
      <img 
        src={getImageUrl(coverUrl)} 
        alt={`${playlistTitle} (Spotify Cover)`} 
        className="w-full h-full object-cover"
        onError={() => setHasError(true)}
      />
    );
  }

  // Otherwise show placeholder
  return <PlaylistCoverPlaceholder size={size} />;
};

export default SpotifyPlaylistCover;