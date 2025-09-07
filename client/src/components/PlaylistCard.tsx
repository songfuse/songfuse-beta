import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, Music } from 'lucide-react';
import PlaylistCoverPlaceholder from './PlaylistCoverPlaceholder';
import SpotifyPlaylistCover from './SpotifyPlaylistCover';
import SpotifyBadge from './SpotifyBadge';

interface Playlist {
  id: string | number;
  title: string;
  description?: string;
  coverImage?: string;
  coverImageUrl?: string;
  createdAt?: string;
  creatorName?: string;
  tracks?: number;
  spotifyUrl?: string;
  spotifyImageUrl?: string;
  duration?: number;
}

interface PlaylistCardProps {
  playlist: Playlist;
  showActions?: boolean;
  className?: string;
}

const PlaylistCard: React.FC<PlaylistCardProps> = ({ 
  playlist, 
  showActions = true,
  className = ""
}) => {
  const [imageError, setImageError] = useState(false);
  const [imageVersion, setImageVersion] = useState(Date.now()); // Add version for cache busting
  
  // Add cache busting whenever the playlist cover changes
  useEffect(() => {
    setImageVersion(Date.now());
  }, [playlist.coverImage, playlist.coverImageUrl]);
  
  // Prepare image URL with cache busting
  const getImageUrl = (url: string) => {
    return url.includes('?') ? `${url}&v=${imageVersion}` : `${url}?v=${imageVersion}`;
  };
  
  return (
    <Card className={`bg-[#282828] border-[#3E3E3E] hover:bg-[#333333] transition-colors overflow-hidden h-full flex flex-col group ${className}`}>
      <div className="aspect-square w-full overflow-hidden relative">
        {/* 
          Priority order for cover images:
          1. Songfuse-generated cover (AI-generated or user-uploaded) 
          2. Fallback to placeholder if no Songfuse cover
          3. Never use Spotify cover if Songfuse has its own cover 
        */}
        <PlaylistCoverPlaceholder 
          size="md" 
          imageUrl={
            playlist.coverImage 
              ? getImageUrl(playlist.coverImage)
              : playlist.coverImageUrl 
                ? getImageUrl(playlist.coverImageUrl)
                : undefined
          }
          spotifyImageUrl={playlist.spotifyImageUrl ? getImageUrl(playlist.spotifyImageUrl) : undefined}
          altText={playlist.title}
        />
        
        {/* Display Spotify badge when playlist has a Spotify URL */}
        {playlist.spotifyUrl && <SpotifyBadge />}
        
        {/* Action buttons overlay (visible on hover) */}
        {showActions && (
          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-60 transition-opacity flex items-center justify-center opacity-0 group-hover:opacity-100">
            {playlist.spotifyUrl && (
              <Button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  window.open(playlist.spotifyUrl, "_blank");
                }}
                className="bg-[#1DB954] hover:bg-[#1ed760] text-white rounded-full p-3 mr-2"
                size="icon"
              >
                Open
              </Button>
            )}
            
            <Button 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              className="bg-[#d02b31] hover:bg-[#d02b31]/80 text-white rounded-full p-3"
              size="icon"
            >
              Play
            </Button>
          </div>
        )}
      </div>
      
      <div className="p-4 pb-2 flex-grow">
        <h3 className="font-semibold truncate text-white">{playlist.title}</h3>
        
        {playlist.description && (
          <p className="text-sm text-gray-400 line-clamp-2 mt-1">
            {playlist.description}
          </p>
        )}
      </div>
      
      <div className="px-4 pb-4 text-xs text-gray-500 flex items-center">
        {playlist.tracks !== undefined && (
          <div className="flex items-center mr-3">
            <Music className="h-3.5 w-3.5 mr-1" />
            <span>{playlist.tracks} {playlist.tracks === 1 ? 'track' : 'tracks'}</span>
          </div>
        )}
        
        {playlist.createdAt && (
          <div className="flex items-center">
            <Calendar className="h-3.5 w-3.5 mr-1" />
            <span>{new Date(playlist.createdAt).toLocaleDateString()}</span>
          </div>
        )}
        
        {playlist.creatorName && !playlist.createdAt && (
          <div className="flex items-center">
            <span>by {playlist.creatorName}</span>
          </div>
        )}
      </div>
    </Card>
  );
};

export default PlaylistCard;
