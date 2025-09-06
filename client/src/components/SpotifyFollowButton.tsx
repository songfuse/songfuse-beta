import React, { useState } from 'react';
import { FaSpotify } from 'react-icons/fa';
import { Button } from '@/components/ui/button';
import { ExternalLink, Heart, Plus } from 'lucide-react';

interface SpotifyFollowButtonProps {
  spotifyId?: string;
  playlistTitle: string;
  variant?: 'default' | 'large' | 'compact';
  className?: string;
}

export function SpotifyFollowButton({ 
  spotifyId, 
  playlistTitle, 
  variant = 'default',
  className = '' 
}: SpotifyFollowButtonProps) {
  const [isHovered, setIsHovered] = useState(false);

  if (!spotifyId) {
    return null;
  }

  const spotifyUrl = `https://open.spotify.com/playlist/${spotifyId}`;

  const handleClick = () => {
    window.open(spotifyUrl, '_blank', 'noopener,noreferrer');
  };

  // Large variant for hero sections
  if (variant === 'large') {
    return (
      <Button
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`
          bg-[#1DB954] hover:bg-[#1ed760] text-white border-0 
          shadow-lg hover:shadow-xl transition-all duration-300 
          px-8 py-6 text-lg font-semibold rounded-xl
          transform hover:scale-105 active:scale-95
          ${className}
        `}
        size="lg"
      >
        <div className="flex items-center space-x-3">
          <FaSpotify className="w-6 h-6" />
          <span>Follow on Spotify</span>
          <ExternalLink className="w-4 h-4" />
        </div>
      </Button>
    );
  }

  // Compact variant for smaller spaces
  if (variant === 'compact') {
    return (
      <Button
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`
          bg-[#1DB954] hover:bg-[#1ed760] text-white border-0 
          shadow-md hover:shadow-lg transition-all duration-200
          px-4 py-2 text-sm font-medium rounded-lg
          ${className}
        `}
        size="sm"
      >
        <div className="flex items-center space-x-2">
          <FaSpotify className="w-4 h-4" />
          <span>Follow</span>
        </div>
      </Button>
    );
  }

  // Default variant
  return (
    <Button
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`
        bg-[#1DB954] hover:bg-[#1ed760] text-white border-0 
        shadow-lg hover:shadow-xl transition-all duration-300 
        px-6 py-3 font-semibold rounded-lg
        transform hover:scale-105 active:scale-95
        ${className}
      `}
    >
      <div className="flex items-center space-x-2">
        <FaSpotify className="w-5 h-5" />
        <span>Follow on Spotify</span>
        <div className={`transform transition-transform duration-200 ${isHovered ? 'translate-x-1' : ''}`}>
          <ExternalLink className="w-4 h-4" />
        </div>
      </div>
    </Button>
  );
}

export default SpotifyFollowButton;