import { SpotifyTrack } from "@shared/schema";
import { useState, useRef, useEffect, useMemo } from "react";
import SimpleSpotifyEmbed from "./SimpleSpotifyEmbed";
import SimpleYouTubeEmbed from "./SimpleYouTubeEmbed";
import SpotifyEmbed from "./SpotifyEmbed";
import MusicSpinner from "./MusicSpinner";

// Extended track type to handle all possible track formats
interface ExtendedTrack {
  // Standard Spotify properties
  id: string;
  name?: string;
  
  // Properties from our database format
  dbId?: number;
  title?: string;
  artist?: string;
  duration?: number;
  duration_ms?: number;
  spotifyId?: string;
  
  // Album or track images
  images?: { url: string; }[];
  
  // Support for both Spotify and our format for album
  album?: {
    name?: string;
    images?: { url: string; }[];
  };
  
  // Artist information
  artists?: { id?: string; name?: string; }[];
  
  // Additional properties
  platforms?: {
    spotify?: {
      id?: string;
    };
    [key: string]: any;
  };
  
  // Any additional properties in either format
  [key: string]: any;
}

interface SongItemProps {
  track: ExtendedTrack;
  index: number;
  onRemove?: () => Promise<void>;
  onReplace?: (newTrack: ExtendedTrack) => void;
  sessionId?: string;
  allTracks?: ExtendedTrack[]; // All tracks in the playlist
  isLoading?: boolean; // Indicates if the track is being removed
  variant?: 'standard' | 'compact' | 'minimal' | 'discover'; // Display variant
  showControls?: boolean; // Whether to show action buttons (remove/replace)
  showIndex?: boolean; // Whether to show track position number
  onPlay?: (track: ExtendedTrack) => void; // Callback when play is clicked
  className?: string; // Additional CSS classes to apply
  readonly?: boolean; // If true, track can't be modified (remove/replace)
}

// Flag to use embedded Spotify player instead of preview URLs
const USE_SPOTIFY_EMBED = true;

// Helper function to format milliseconds to MM:SS
const formatDuration = (ms: number): string => {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
};

// Helper function to get album cover URL with fallbacks
const getAlbumCoverUrl = (track: ExtendedTrack): string => {
  // Log track for debugging
  console.log("Getting album cover for track:", JSON.stringify({
    id: track.id,
    name: track.name,
    title: track.title,
    album: track.album,
    album_cover_image: track.album_cover_image,
    album_name: track.album_name
  }, null, 2));
  
  // Add timestamp to prevent caching issues
  const addCacheBuster = (url: string): string => {
    if (!url) return '';
    // Add a timestamp parameter to prevent caching
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}t=${Date.now()}`;
  };

  // Try all possible sources for album cover in order of reliability
  
  // 1. Check for direct album_cover_image property (most likely with DB tracks)
  if (track.album_cover_image) {
    console.log("Using direct album_cover_image:", track.album_cover_image);
    return addCacheBuster(track.album_cover_image);
  }
  
  // 2. Check standard Spotify format with album.images array
  if (track.album?.images && track.album.images.length > 0 && track.album.images[0].url) {
    console.log("Using album.images[0].url:", track.album.images[0].url);
    return addCacheBuster(track.album.images[0].url);
  }
  
  // 3. Check for track-level images array
  if (track.images && track.images.length > 0 && track.images[0].url) {
    console.log("Using track.images[0].url:", track.images[0].url);
    return addCacheBuster(track.images[0].url);
  }
  
  // 4. Check for direct album_image or image property
  if (track.album_image) {
    console.log("Using album_image:", track.album_image);
    return addCacheBuster(track.album_image);
  }
  
  if (track.image) {
    console.log("Using image:", track.image);
    return addCacheBuster(track.image);
  }
  
  // 5. If track has a Spotify ID but no image, log it - we don't attempt to construct
  // a URL anymore as this can lead to misleading results
  const spotifyId = getTrackSpotifyId(track);
  if (spotifyId && typeof spotifyId === 'string' && spotifyId.length > 5) {
    console.log("Track has Spotify ID but no image:", spotifyId);
  }
  
  // Default fallback
  console.log("No album cover found for track:", track.name || track.title);
  return '';
};

// Helper function to get Spotify track ID with fallbacks
const getTrackSpotifyId = (track: ExtendedTrack): string => {
  // Check platforms object first (most reliable)
  if (track.platforms?.spotify?.id) {
    return track.platforms.spotify.id;
  }
  
  // Check spotifyId property
  if (track.spotifyId) {
    return track.spotifyId;
  }
  
  // Check spotify_id property from database
  // @ts-ignore - This property comes from the database
  if (track.spotify_id) {
    // @ts-ignore
    return track.spotify_id;
  }
  
  // Use id if it seems to be a Spotify ID
  if (typeof track.id === 'string' && track.id.length > 10 && !track.id.includes('spotify:') && !track.id.includes('spotify.com')) {
    return track.id;
  }
  
  // Extract ID from spotify URI if needed
  if (typeof track.id === 'string' && track.id.includes('spotify:track:')) {
    return track.id.split('spotify:track:')[1];
  }
  
  // Extract ID from spotify URL if needed
  if (typeof track.id === 'string' && track.id.includes('spotify.com/track/')) {
    return track.id.split('spotify.com/track/')[1].split('?')[0];
  }
  
  // Default empty string (SimpleSpotifyEmbed will handle this gracefully)
  return '';
};

const getTrackYouTubeId = (track: ExtendedTrack): string => {
  // Check platforms object first (most reliable)
  if (track.platforms?.youtube?.id) {
    return track.platforms.youtube.id;
  }
  
  // Check platforms with string key
  if (track.platforms?.['youtube']?.id) {
    return track.platforms['youtube'].id;
  }
  
  // Check youtubeId property
  if (track.youtubeId) {
    return track.youtubeId;
  }
  
  // Check youtube_id property from database
  // @ts-ignore - This property comes from the database
  if (track.youtube_id) {
    // @ts-ignore
    return track.youtube_id;
  }
  
  // Check youtube object
  if (track.youtube?.id) {
    return track.youtube.id;
  }
  
  // Default empty string
  return '';
};

const SongItem = ({ 
  track, 
  index, 
  onRemove, 
  onReplace, 
  sessionId, 
  allTracks = [], 
  isLoading = false,
  variant = 'standard',
  showControls = true,
  showIndex = true,
  onPlay,
  className = '',
  readonly = false
}: SongItemProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [imageError, setImageError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Track previously suggested replacements to avoid showing the same tracks again
  const [previousSuggestions, setPreviousSuggestions] = useState<string[]>([]);
  
  // We no longer need duplicate detection here since we're filtering them in PlaylistEditor
  
  // Function to handle play/pause
  const togglePlayback = () => {
    if (!track.preview_url) {
      return; // No preview available
    }
    
    if (isPlaying) {
      audioRef.current?.pause();
    } else {
      // Pause all other audio elements on the page
      document.querySelectorAll('audio').forEach(audio => {
        if (audio !== audioRef.current) {
          audio.pause();
        }
      });
      
      audioRef.current?.play();
    }
  };
  
  // Set up the audio element and event listeners if we're still using preview_url
  useEffect(() => {
    if (!USE_SPOTIFY_EMBED && track.preview_url) {
      console.log(`Creating audio for track ${track.name}`, track.preview_url);
      
      const audio = new Audio(track.preview_url);
      audioRef.current = audio;
      
      audio.addEventListener('play', () => setIsPlaying(true));
      audio.addEventListener('pause', () => setIsPlaying(false));
      audio.addEventListener('ended', () => setIsPlaying(false));
      
      audio.addEventListener('error', (e) => {
        console.error(`Audio error for ${track.name}:`, e);
      });
      
      return () => {
        audio.pause();
        audio.removeEventListener('play', () => setIsPlaying(true));
        audio.removeEventListener('pause', () => setIsPlaying(false));
        audio.removeEventListener('ended', () => setIsPlaying(false));
        audio.removeEventListener('error', (e) => {
          console.error(`Audio error for ${track.name}:`, e);
        });
      };
    }
  }, [track.preview_url, track.name]);
  
  // Effect to pause audio when component is unmounted
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);
  
  const [showEmbed, setShowEmbed] = useState(false);
  
  // Handle song removal with loading state
  const handleRemoveClick = async () => {
    if (isRemoving || !onRemove) return; // Prevent multiple clicks or if no handler
    
    setIsRemoving(true);
    try {
      await onRemove!(); // Use non-null assertion since we've checked above
    } catch (error) {
      console.error('Error removing song:', error);
      // Error is handled in the parent component
      setIsRemoving(false); // Reset loading state if there's an error
    }
    // Don't reset isRemoving on success as the component will be removed
  };

  // Auto-replace feature: directly fetches and replaces track
  const handleReplaceClick = async () => {
    if (!onReplace || !sessionId || isReplacing) return;
    
    setIsReplacing(true);
    
    try {
      // Direct API call for replacement
      const response = await fetch('/api/track/replace', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          trackId: track.id || '',
          artistName: track.artists?.[0]?.name || 'Unknown Artist',
          trackName: track.name || 'Unknown Track',
          playlistTracks: allTracks || [], // Pass all playlist tracks to filter out duplicates
          previousSuggestions: previousSuggestions || [] // Pass previously suggested tracks to avoid repetition
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to get replacement track');
      }
      
      const data = await response.json();
      if (data.alternatives && data.alternatives.length > 0) {
        // Get the recommended track
        const alternative = data.alternatives[0].track;
        
        // Add this track ID to previously suggested tracks to avoid showing it again
        setPreviousSuggestions(prev => [...prev, alternative.id]);
        
        // Replace the track
        onReplace(alternative);
      }
    } catch (error) {
      console.error('Error replacing track:', error);
    } finally {
      setIsReplacing(false);
    }
  };

  // Generate different CSS classes based on variant
  const containerClasses = [
    'flex flex-col rounded-md group',
    isReplacing ? 'opacity-80 pointer-events-none bg-yellow-700/10 dark:bg-yellow-700/5' : 'hover:bg-accent/5',
    variant === 'compact' ? 'text-sm' : '',
    variant === 'minimal' ? 'text-xs border-b last:border-b-0 pb-1' : '',
    variant === 'discover' ? 'bg-card/50 hover:bg-card/80 border border-border/40 shadow-sm' : '',
    'transition-all duration-300',
    className // Additional custom classes
  ].filter(Boolean).join(' ');

  // Determine padding based on variant
  const rowPadding = variant === 'minimal' ? 'py-1 px-2' : variant === 'compact' ? 'p-1.5' : 'p-2';

  // Using fixed album art size (h-12 w-12) as requested

  return (
    <div className={containerClasses}>
      {/* Main track row */}
      <div 
        className={`flex items-center ${rowPadding}`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Track index/position or play button */}
        {showIndex && (
          <div className={`${variant === 'minimal' ? 'w-6' : 'w-8'} flex items-center justify-center text-muted-foreground text-sm mr-2`}>
            {isLoading ? (
              <MusicSpinner size={variant === 'minimal' ? 'xs' : 'sm'} />
            ) : isHovered ? (
              <button 
                className={`text-foreground hover:text-primary ${variant === 'minimal' ? '' : 'hidden md:block'}`}
                onClick={() => {
                  if (onPlay) {
                    onPlay(track);
                  } else {
                    setShowEmbed(!showEmbed);
                  }
                }}
                title={onPlay ? "Play track" : "Show Spotify player"}
              >
                {showEmbed ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className={`${variant === 'minimal' ? 'h-4 w-4' : 'h-5 w-5'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className={`${variant === 'minimal' ? 'h-4 w-4' : 'h-5 w-5'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  </svg>
                )}
              </button>
            ) : (
              <span className={`${variant === 'minimal' ? 'text-xs' : 'text-sm'}`}>{index + 1}</span>
            )}
          </div>
        )}
        
        {/* Album Cover - using fixed size as requested */}
        <div className="h-12 w-12 bg-muted rounded mr-3 flex-shrink-0 overflow-hidden relative">
          {(() => {
            const [refreshKey, setRefreshKey] = useState(Date.now());
            const albumUrl = getAlbumCoverUrl(track);
            
            if (!imageError && albumUrl) {
              return (
                <div className="relative w-full h-full">
                  <img 
                    key={`${track.id}-${refreshKey}`}
                    src={`${albumUrl}${albumUrl.includes('?') ? '&' : '?'}t=${refreshKey}`}
                    alt={(track.album?.name || track.album_name || track.name || track.title || 'Album cover')} 
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      console.error(`Image load error for track: ${track.name || track.title}`, {
                        track,
                        url: albumUrl,
                        error: e
                      });
                      setImageError(true);
                    }}
                    onLoad={() => {
                      // Reset error state if image loads successfully
                      if (imageError) setImageError(false);
                    }}
                  />
                  
                  {/* Play overlay for discover variant */}
                  {variant === 'discover' && isHovered && onPlay && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <button
                        onClick={() => onPlay(track)}
                        className="text-white hover:text-primary transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </button>
                    </div>
                  )}

                </div>
              );
            } else {
              return (
                <div className="w-full h-full bg-muted/80 flex items-center justify-center">
                  {imageError ? (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        className={`${variant === 'minimal' ? 'h-4 w-4' : variant === 'compact' ? 'h-5 w-5' : variant === 'discover' ? 'h-7 w-7' : 'h-5 w-5'} text-muted-foreground`} 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                      </svg>
                    </div>
                  ) : (
                    <svg 
                      xmlns="http://www.w3.org/2000/svg" 
                      className={`${variant === 'minimal' ? 'h-4 w-4' : variant === 'compact' ? 'h-5 w-5' : variant === 'discover' ? 'h-7 w-7' : 'h-6 w-6'} text-muted-foreground`} 
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                  )}
                </div>
              );
            }
          })()}
          
          {isHovered && !readonly && (
            <div 
              className="absolute inset-0 bg-background/50 hidden md:flex items-center justify-center cursor-pointer"
              onClick={() => {
                if (onPlay) {
                  onPlay(track);
                } else {
                  setShowEmbed(!showEmbed);
                }
              }}
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className={`${variant === 'minimal' ? 'h-4 w-4' : 'h-5 w-5'} text-foreground`} 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" 
                />
              </svg>
            </div>
          )}
        </div>
        
        {/* Track title and artist details - size varies by variant */}
        <div className="flex-1 min-w-0 mr-2">
          <div className={`text-foreground truncate ${
            variant === 'minimal' ? 'text-xs' : 
            variant === 'compact' ? 'text-sm' : 
            variant === 'discover' ? 'text-base font-medium' : 
            'text-sm font-medium'
          }`} title={
            track.title?.trim() || track.name?.trim() || "Unknown Track"
          }>
            {(() => {
              // Debug track name info
              console.log("Track name info:", {
                name: track.name,
                title: track.title,
                id: track.id,
                dbId: track.dbId,
                trackName: track.trackName,
                songName: track.songName
              });
              
              // Check multiple possible sources for the track title in order of reliability
              
              // 1. First check the title field (most common for database tracks)
              if (track.title && typeof track.title === 'string' && track.title.trim() !== '') {
                return track.title.trim();
              }
              
              // 2. Check the name field (Spotify format)
              if (track.name && typeof track.name === 'string' && track.name.trim() !== '') {
                return track.name.trim();
              }
              
              // 3. Check alternate name fields that might be present
              if (track.trackName && typeof track.trackName === 'string' && track.trackName.trim() !== '') {
                return track.trackName.trim();
              }
              
              if (track.songName && typeof track.songName === 'string' && track.songName.trim() !== '') {
                return track.songName.trim();
              }
              
              // 4. Try to extract name from track_name or song_name (snake case variants)
              if (track.track_name && typeof track.track_name === 'string' && track.track_name.trim() !== '') {
                return track.track_name.trim();
              }
              
              if (track.song_name && typeof track.song_name === 'string' && track.song_name.trim() !== '') {
                return track.song_name.trim();
              }
              
              // 5. If we have an ID that looks like a database ID (starts with "db-")
              if (typeof track.id === 'string' && track.id.startsWith('db-')) {
                return `Track ${track.id.replace('db-', '')}`;
              }
              
              // Fallback
              return "Unknown Track";
            })()}
            
            {/* Removed isReplacing section */}
          </div>

          {/* Show artist name for all variants except minimal */}
          {variant !== 'minimal' && (
            <div className={`text-muted-foreground break-normal ${
              variant === 'compact' ? 'text-[0.7rem] mt-0.5' : 
              variant === 'discover' ? 'text-sm mt-1' : 
              'text-xs mt-1'
            }`}>
              {(() => {
                // Debug artist info
                console.log("Artist info for track:", track.id, {
                  artists: track.artists,
                  artist: track.artist,
                  artistsJson: track.artists_json,
                  artistName: track.artist_name,
                  'track.artists?.length': track.artists?.length
                });
              
              // Priority 1: Check artists_json first (this comes from the database)
              if (track.artists_json) {
                // If it's already an array (most common case from PostgreSQL json_agg)
                if (Array.isArray(track.artists_json) && track.artists_json.length > 0) {
                  const artistNames = track.artists_json
                    .filter(a => a && a.name && typeof a.name === 'string' && a.name.trim() !== '')
                    .map(a => a.name!.trim());
                    
                  if (artistNames.length > 0) {
                    return artistNames.join(", ");
                  }
                }
                // If it's a string, try to parse it
                else if (typeof track.artists_json === 'string') {
                  try {
                    const parsed = JSON.parse(track.artists_json);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                      const artistNames = parsed
                        .filter(a => a && a.name && a.name.trim() !== '')
                        .map(a => a.name.trim());
                        
                      if (artistNames.length > 0) {
                        return artistNames.join(", ");
                      }
                    }
                  } catch (e) {
                    console.error("Error parsing artists_json string:", e);
                  }
                }
              }
              
              // Priority 2: If we already have a formatted artist string
              if (track.artist && typeof track.artist === 'string' && track.artist.trim() !== '') {
                return track.artist.trim();
              }
              
              // Priority 3: If we have standard artists array with objects
              if (track.artists?.length && typeof track.artists[0] === 'object') {
                const validArtists = track.artists
                  .filter(artist => artist && artist.name && artist.name.trim() !== '')
                  .map(artist => artist.name.trim());
                  
                if (validArtists.length > 0) {
                  return validArtists.join(", ");
                }
              }
              
              // Priority 4: Try to extract from artist_name
              if (track.artist_name && track.artist_name.trim() !== '') {
                return track.artist_name.trim();
              }
              
              // If we have a title, try to extract artist from it (some tracks have "Artist - Title" format)
              if (track.title && track.title.includes(' - ')) {
                const parts = track.title.split(' - ');
                if (parts.length >= 2 && parts[0].trim() !== '') {
                  return parts[0].trim();
                }
              }
              
              // Final fallback for tracks that genuinely have no artist data
              return "Unknown Artist";
            })()}
          </div>
          )}
        </div>
        
        {/* Removed Spotify embed button for cleaner UI */}
        
        {!isHovered && (
          <div className="text-muted-foreground text-sm mr-2">
            {(() => {
              // Debug logging for duration values
              console.log("Track name info:", {
                name: track.name || track.title,
                title: track.title,
                id: track.id,
                dbId: track.dbId
              });
              console.log("Duration values for track:", track.id, {
                duration_ms: track.duration_ms,
                duration: track.duration,
                "typeof duration_ms": typeof track.duration_ms,
                "typeof duration": typeof track.duration
              });
              
              // Normalize duration - duration_ms should already be in milliseconds from the server
              let normalizedDuration = 0;
              if (track.duration_ms && track.duration_ms > 0) {
                normalizedDuration = track.duration_ms;
              } else if (track.duration && track.duration > 0) {
                // If duration is provided but duration_ms is not, assume duration is in milliseconds
                normalizedDuration = track.duration;
              }
              
              console.log("Normalized duration:", normalizedDuration);
              
              return normalizedDuration > 0 ? formatDuration(normalizedDuration) : "—:—";
            })()}
          </div>
        )}
        
        {/* Action buttons section - only shown when hovered, controls enabled, and not readonly */}
        {isHovered && showControls && !readonly && (
          <div className={`flex items-center ${variant === 'minimal' ? 'scale-90' : ''}`}>
            {/* Spotify link */}
            {getTrackSpotifyId(track) && (
              <a 
                href={`https://open.spotify.com/track/${getTrackSpotifyId(track)}`}
                target="_blank" 
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-[#1DB954] p-2" 
                title="Open in Spotify"
              >
                <svg 
                  viewBox="0 0 24 24" 
                  className={`${variant === 'minimal' ? 'h-4 w-4' : 'h-5 w-5'}`}
                  fill="currentColor"
                >
                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.48.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                </svg>
              </a>
            )}
            
            {/* YouTube link */}
            {getTrackYouTubeId(track) && (
              <a 
                href={`https://www.youtube.com/watch?v=${getTrackYouTubeId(track)}`}
                target="_blank" 
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-[#FF0000] p-2" 
                title="Watch on YouTube"
              >
                <svg 
                  viewBox="0 0 24 24" 
                  className={`${variant === 'minimal' ? 'h-4 w-4' : 'h-5 w-5'}`}
                  fill="currentColor"
                >
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
              </a>
            )}
            
            {/* Replace button - temporarily hidden at frontend level */}
            {false && onReplace && sessionId && (
              <button 
                onClick={handleReplaceClick}
                className="text-muted-foreground hover:text-foreground p-2"
                title="Replace song"
                disabled={isReplacing}
              >
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  className={`h-5 w-5 ${isReplacing ? 'animate-spin' : ''}`} 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
                  />
                </svg>
              </button>
            )}
            
            {/* Remove button - only show if onRemove is provided */}
            {onRemove && (
              <button 
                onClick={handleRemoveClick}
                className="text-muted-foreground hover:text-red-500 p-2"
                title="Remove song"
                disabled={isRemoving || isLoading}
              >
                {isLoading || isRemoving ? (
                  <MusicSpinner size="xs" />
                ) : (
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    className={`${variant === 'minimal' ? 'h-4 w-4' : 'h-5 w-5'}`} 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                )}
              </button>
            )}
          </div>
        )}
      </div>
      
      {/* Spotify embed player (expanded) - hidden on mobile and in minimal/compact variants */}
      {showEmbed && variant === 'standard' && (
        <div className="pl-8 pr-2 my-2 relative z-10 hidden md:block">
          <SimpleSpotifyEmbed 
            trackId={getTrackSpotifyId(track)} 
          />
          
          {/* Add YouTube embed if available - check all possible data formats */}
          {(track.platforms?.youtube?.id || track.platforms?.['youtube']?.id || track.youtube?.id) && (
            <div className="mt-4">
              <h4 className="text-sm font-medium mb-2 text-muted-foreground">Also available on YouTube:</h4>
              <SimpleYouTubeEmbed 
                videoId={track.platforms?.youtube?.id || track.platforms?.['youtube']?.id || track.youtube?.id} 
              />
            </div>
          )}
        </div>
      )}
      
      {/* No longer using expanded TrackReplacer UI - using direct replacement instead */}
    </div>
  );
};

export default SongItem;
