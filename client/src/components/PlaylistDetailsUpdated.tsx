import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SpotifyTrack } from "@shared/schema";
import SongItem from "./SongItem";
import ShareModal from "./ShareModal";
import CreateSmartLinkModal from "./CreateSmartLinkModal";
import PlaylistCoverPlaceholder from "./PlaylistCoverPlaceholder";
import SpotifyBadge from "./SpotifyBadge";
import { DraggableTrackList } from "@/components/ui/DraggableTrackList";
import { DraggableTrackItem } from "@/components/ui/DraggableTrackItem";
import { FaShareAlt } from "react-icons/fa";
import { FaLock, FaGlobe } from "react-icons/fa";
import { Share2, Link } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePlaylistUpdate } from "@/contexts/PlaylistUpdateContext";
import { useLocation } from "wouter";

interface PlaylistDetailsProps {
  title: string;
  description?: string;
  coverImage?: string;
  tracks: SpotifyTrack[];
  spotifyUrl?: string;
  spotifyImageUrl?: string;
  playlistId: number;
  isPublic?: boolean;
  articleTitle?: string;
  articleLink?: string;
  onSongRemoved?: () => void;
}

const PlaylistDetailsUpdated = ({
  title,
  description,
  coverImage,
  tracks: initialTracks,
  spotifyUrl,
  spotifyImageUrl,
  playlistId,
  isPublic = true,
  articleTitle,
  articleLink,
  onSongRemoved
}: PlaylistDetailsProps) => {
  const [showShareModal, setShowShareModal] = useState(false);
  const [showSmartLinkModal, setShowSmartLinkModal] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTogglingVisibility, setIsTogglingVisibility] = useState(false);
  const [currentVisibility, setCurrentVisibility] = useState(isPublic);
  const [imageVersion, setImageVersion] = useState(Date.now()); // Add version for cache busting
  const [localSpotifyUrl, setLocalSpotifyUrl] = useState(spotifyUrl); // Local state for DOM-level updates
  const [localCoverImage, setLocalCoverImage] = useState(coverImage); // Local state for cover image updates
  const [showEmbed, setShowEmbed] = useState(true); // Controls iframe visibility
  const [savedToSpotify, setSavedToSpotify] = useState(!!spotifyUrl); // Track if saved to Spotify
  const [hasSmartLink, setHasSmartLink] = useState(false); // Track if playlist sharing link exists
  const [smartLinkData, setSmartLinkData] = useState<any>(null); // Store playlist sharing link data
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { triggerSidebarRefresh } = usePlaylistUpdate();
  const [, setLocation] = useLocation();
  
  // Use local state to manage tracks for immediate UI updates
  const [tracks, setTracks] = useState<SpotifyTrack[]>(initialTracks);
  
  // Update local tracks state when initialTracks change (e.g., due to query invalidation)
  useEffect(() => {
    setTracks(initialTracks);
  }, [initialTracks]);
  
  // Update visibility state when prop changes
  useEffect(() => {
    setCurrentVisibility(isPublic);
  }, [isPublic]);
  
  // Update image version and local state when coverImage changes
  useEffect(() => {
    setLocalCoverImage(coverImage);
    setImageVersion(Date.now());
  }, [coverImage]);
  
  // Check if playlist sharing link exists for this playlist
  useEffect(() => {
    const checkSmartLink = async () => {
      try {
        const response = await fetch(`/api/playlists/${playlistId}/smart-link`);
        if (response.ok) {
          const data = await response.json();
          setHasSmartLink(data.exists);
          if (data.exists) {
            setSmartLinkData(data.smartLink);
          }
        }
      } catch (error) {
        console.error('Error checking playlist sharing link status:', error);
      }
    };

    if (playlistId) {
      checkSmartLink();
    }
  }, [playlistId]);

  // For debugging cover image and article data issues
  useEffect(() => {
    console.log(`Playlist ${playlistId} Info:`, {
      localCoverImage: localCoverImage, 
      processedImageUrl: localCoverImage ? getImageUrl(localCoverImage) : undefined,
      spotifyImageUrl: spotifyImageUrl,
      imageVersion: imageVersion,
      articleTitle: articleTitle,
      articleLink: articleLink,
      hasSmartLink: hasSmartLink
    });
  }, [localCoverImage, spotifyImageUrl, imageVersion, playlistId, articleTitle, articleLink, hasSmartLink]);
  
  // Handle Spotify embed delayed loading
  useEffect(() => {
    // When Spotify URL changes (e.g., after export), hide the embed, then show it after a delay
    if (localSpotifyUrl) {
      setShowEmbed(false); // Hide embed immediately
      
      // Show embed after a delay to allow Spotify to process the playlist
      const timer = setTimeout(() => {
        setShowEmbed(true);
      }, 5000); // 5 seconds delay
      
      return () => clearTimeout(timer); // Cleanup on unmount
    }
  }, [localSpotifyUrl]);
  
  // Listen for playlist-updated event for DOM-level updates without page reload
  useEffect(() => {
    const handlePlaylistUpdated = (event: any) => {
      const { 
        playlistId: updatedPlaylistId, 
        spotifyUrl: updatedSpotifyUrl,
        coverImageUrl: updatedCoverImage 
      } = event.detail;
      
      // Only update if this is our playlist
      if (updatedPlaylistId === playlistId) {
        // Update Spotify URL if provided
        if (updatedSpotifyUrl) {
          console.log('Updating playlist with DOM-level Spotify URL refresh:', updatedSpotifyUrl);
          setLocalSpotifyUrl(updatedSpotifyUrl);
          // Reset embed loading state when Spotify URL is updated via event
          setShowEmbed(false);
          
          // Mark playlist as saved to Spotify
          setSavedToSpotify(true);
        }
        
        // Update cover image if provided
        if (updatedCoverImage) {
          console.log('Updating playlist with DOM-level cover image refresh:', updatedCoverImage);
          
          // Only update cover if we don't already have one (Spotify mosaic situation)
          if (!coverImage) {
            // Update the local cover image state
            setLocalCoverImage(updatedCoverImage);
            // Update the image version to force a cache-bust with a new timestamp
            setImageVersion(Date.now());
          } else {
            console.log('Ignoring Spotify mosaic update since we already have a cover image:', coverImage);
          }
        }
        
        // Force invalidation of related queries
        queryClient.invalidateQueries({ queryKey: [`/api/playlist/${playlistId}`] });
      }
    };
    
    // Listen for the custom event
    window.addEventListener('playlist-updated', handlePlaylistUpdated);
    
    // Cleanup the event listener
    return () => {
      window.removeEventListener('playlist-updated', handlePlaylistUpdated);
    };
  }, [playlistId, queryClient]);
  
  // Prepare image URL with cache busting
  const getImageUrl = (url: string | undefined) => {
    if (!url) return '';
    
    // Check if the URL already has timestamp parameters
    if (url.includes('timestamp=')) {
      console.log(`URL already has timestamp, using original: ${url}`);
      return url;
    }
    
    // For clean URLs without timestamps, add a fresh timestamp
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}timestamp=${imageVersion}`;
  };
  
  // Note: Spotify cover URL is now passed directly through props
  // We removed the fetch effect since we're now passing spotifyImageUrl directly
  
  const totalDuration = tracks.reduce((total, track) => total + (track.duration_ms || 0), 0);
  const hours = Math.floor(totalDuration / 3600000);
  const minutes = Math.floor((totalDuration % 3600000) / 60000);
  const durationText = hours > 0 
    ? `${hours} hr ${minutes} min` 
    : `${minutes} min`;
    
  const handleImageError = () => {
    setImageError(true);
  };
  
  // Handle track reordering for drag-and-drop
  const handleTrackReorder = async (reorderedTracks: SpotifyTrack[]) => {
    try {
      // Update local state immediately for smooth UI
      setTracks(reorderedTracks);

      const userId = localStorage.getItem('userId');
      if (!userId) {
        toast({
          title: "Authentication Error",
          description: "You need to be logged in to reorder tracks.",
          variant: "destructive"
        });
        return;
      }

      // Send reorder request to the server
      const response = await apiRequest('POST', `/api/playlist/${playlistId}/reorder-tracks?userId=${userId}`, {
        trackOrder: reorderedTracks.map((track, index) => ({
          trackId: track.dbId, // Use dbId as trackId
          position: index
        }))
      });

      if (!response.ok) {
        // Revert the local state if the server update failed
        setTracks(initialTracks);
        throw new Error('Failed to update track order');
      }

      const result = await response.json();
      
      toast({
        title: "Track order updated",
        description: result.spotifySync 
          ? "The new track order has been saved and synced to Spotify"
          : "The new track order has been saved to your playlist",
        variant: "default"
      });

      // Invalidate queries to sync with server state
      queryClient.invalidateQueries({ queryKey: [`/api/playlist/${playlistId}`] });
      
    } catch (error: any) {
      console.error('Failed to reorder tracks:', error);
      // Revert to original order
      setTracks(initialTracks);
      toast({
        title: "Error",
        description: "Could not reorder tracks. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Handle song removal
  const handleRemoveSong = async (index: number): Promise<void> => {
    try {
      const userId = localStorage.getItem('userId');
      if (!userId) {
        toast({
          title: "Authentication Error",
          description: "You need to be logged in to remove songs.",
          variant: "destructive"
        });
        throw new Error('Not authenticated');
      }

      // Call the API to delete the song using our new synchronized deletion endpoint
      const response = await apiRequest(
        'DELETE', 
        `/api/playlist/${playlistId}/track/${index}?userId=${userId}`,
        {}
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to remove song');
      }

      // Show success message immediately after successful deletion
      const result = await response.json();
      const syncMessage = spotifyUrl ? " and Spotify" : "";
      
      toast({
        title: "Song Removed",
        description: `"${result.track?.title || 'The song'}" has been removed from your playlist${syncMessage}.`,
      });
      
      // Wait for 300ms before updating the UI to make the loading state visible
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Update the UI by filtering out the removed track
      const updatedTracks = [...tracks];
      updatedTracks.splice(index, 1);
      setTracks(updatedTracks);
      
      // Invalidate queries to refresh playlist data in the background
      // This will eventually update all components with the server data
      queryClient.invalidateQueries({ queryKey: [`/api/playlist/${playlistId}`] });
      
      // Callback if provided
      if (onSongRemoved) {
        onSongRemoved();
      }
    } catch (error: any) {
      console.error('Failed to remove song:', error);
      toast({
        title: "Error",
        description: error?.message || "Could not remove the song. Please try again.",
        variant: "destructive"
      });
      throw error; // Re-throw to propagate to SongItem component
    }
  };

  // Handle toggling visibility between public and private - use simplest approach
  const handleToggleVisibility = async () => {
    try {
      setIsTogglingVisibility(true);
      
      const userId = localStorage.getItem('userId');
      if (!userId) {
        toast({
          title: "Authentication Error",
          description: "You need to be logged in to change playlist visibility.",
          variant: "destructive"
        });
        return;
      }
      
      // Use the most direct and reliable approach
      const newVisibility = !currentVisibility;
      
      // Make the API call with minimal processing
      await fetch(`/api/playlist/${playlistId}/update-visibility`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          isPublic: newVisibility,
          userId: parseInt(userId)
        })
      });
      
      // Update local state directly without depending on the response
      setCurrentVisibility(newVisibility);
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: [`/api/playlist/${playlistId}`] });
      
      // Show success message
      toast({
        title: "Visibility Updated",
        description: `Playlist is now ${newVisibility ? 'public' : 'private'}.`,
      });
      
    } catch (error: any) {
      console.error('Failed to update visibility:', error);
      toast({
        title: "Update Failed",
        description: "Could not update playlist visibility. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsTogglingVisibility(false);
    }
  };

  const handleSaveToSpotify = async () => {
    if (tracks.length === 0) {
      toast({
        title: "No tracks",
        description: "Your playlist needs at least one track.",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsSaving(true);
      
      // Call the server to export the playlist to Spotify using our direct export endpoint
      const userId = localStorage.getItem('userId');
      
      // Try the direct export endpoint first
      const response = await apiRequest(
        'POST', 
        `/api/playlist/${playlistId}/direct-export-to-spotify`, 
        { userId: parseInt(userId || '1') }
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to export to Spotify');
      }
      
      const result = await response.json();
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: [`/api/playlist/${playlistId}`] });
      
      // Trigger sidebar refresh to update Latest Playlists
      triggerSidebarRefresh();
      
      // Show success message
      toast({
        title: "Exported to Spotify",
        description: "Your playlist has been successfully saved to Spotify.",
      });
      
      if (result.spotifyUrl) {
        // Add an option to open the playlist directly
        toast({
          title: "Spotify Playlist Created",
          description: 
            <div className="flex flex-col gap-2">
              <p>Your playlist is now available on Spotify!</p>
              <a 
                href={result.spotifyUrl}
                target="_blank" 
                rel="noopener noreferrer"
                className="bg-[#1DB954] hover:bg-[#1DB954]/90 text-white p-2 rounded text-center text-sm"
              >
                Open in Spotify
              </a>
            </div>,
          duration: 5000,
        });
      }
      
      // Update the UI without a full page reload by setting the local state
      if (result.spotifyUrl) {
        // Update the local state directly
        setLocalSpotifyUrl(result.spotifyUrl);
        
        // Check if we have a cover image URL from Spotify (mosaic cover)
        if (result.coverImageUrl && !coverImage) {
          console.log('Using Spotify mosaic cover image:', result.coverImageUrl);
          setLocalCoverImage(result.coverImageUrl);
          setImageVersion(Date.now()); // Force a cache-bust with a new timestamp
        }
        
        // Update any other state needed
        setTimeout(() => {
          // Manually re-render the UI to reflect the updated state
          window.dispatchEvent(new CustomEvent('playlist-updated', { 
            detail: { 
              playlistId, 
              spotifyUrl: result.spotifyUrl,
              coverImageUrl: result.coverImageUrl
            } 
          }));
        }, 500);
      }
      
    } catch (error: any) {
      console.error('Failed to save to Spotify:', error);
      
      try {
        // Try to parse the error response
        let errorData = null;
        
        // Handle fetch Response objects
        if (error?.response instanceof Response) {
          try {
            errorData = await error.response.clone().json();
          } catch (e) {
            /* Ignore - will fall back to text or default message */
          }
        }
        // Handle string responses
        else if (typeof error === 'string') {
          try {
            errorData = JSON.parse(error);
          } catch (e) {
            /* Not valid JSON */
          }
        }
        // Handle error objects with response data
        else if (error?.json) {
          try {
            errorData = await error.json();
          } catch (e) {
            /* Ignore - will fall back to message or default */
          }
        }
        
        // Check if it's a rate limit error (status code, error text, or message content)
        if (errorData?.error === 'Rate limit exceeded' || 
            error?.status === 429 || 
            error?.response?.status === 429 ||
            (error?.message && (error.message.includes('rate limit') || error.message.includes('429'))) ||
            (errorData?.details && errorData.details.includes('rate limit'))) {
          
          // Get the specific details with retry information
          const details = errorData?.details || 'Spotify API rate limit reached. Please try again later.';
          
          toast({
            title: "Spotify Rate Limit Reached",
            description: details,
            variant: "destructive",
            duration: 10000 // Show for longer (10 seconds)
          });
        } else {
          // Regular error handling for non-rate-limit errors
          toast({
            title: "Export Failed",
            description: errorData?.details || error?.message || "Could not export playlist to Spotify. Please try again.",
            variant: "destructive"
          });
        }
      } catch (parseError) {
        // Fallback error message if we can't parse the response
        toast({
          title: "Export Failed",
          description: error?.message || "Could not export playlist to Spotify. Please try again.",
          variant: "destructive"
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row gap-6">
          <div className="w-full md:w-48 lg:w-60">
            <div className="bg-muted rounded-lg overflow-hidden aspect-square relative">
              {/* 
                Priority order for cover images:
                1. Songfuse-generated cover (AI or user-uploaded)
                2. Fallback to placeholder if no covers are available 
                3. Never use Spotify cover if we already have a Songfuse cover
              */}
              {/* Using useEffect for logging to avoid ReactNode error */}
              <PlaylistCoverPlaceholder 
                size="lg" 
                imageUrl={localCoverImage ? getImageUrl(localCoverImage) : undefined}
                spotifyImageUrl={spotifyImageUrl}
                altText={title}
                key={`cover-${imageVersion}`} // Force component refresh when image changes
              />
              
              {/* Display Spotify badge when playlist has a Spotify URL */}
              {localSpotifyUrl && <SpotifyBadge className="absolute top-2 right-2" />}
            </div>
            
            <div className="flex flex-col gap-2">
              {/* Visibility toggle as first child for all playlists */}
              {user && (
                <div className="mb-2">
                  <div className="flex items-center justify-between rounded-md border border-border p-2 bg-card shadow-sm">
                    <div className="flex items-center">
                      <span className="text-sm font-semibold text-foreground">
                        {currentVisibility ? "Public" : "Private"}
                      </span>
                    </div>
                    <Switch
                      checked={currentVisibility}
                      onCheckedChange={handleToggleVisibility}
                      disabled={isTogglingVisibility}
                      className="data-[state=checked]:bg-green-500"
                    />
                  </div>
                </div>
              )}
              
              {localSpotifyUrl ? (
                <>
                  {/* Primary Playlist Sharing Link button */}
                  <Button 
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-medium flex items-center justify-center gap-2"
                    onClick={() => {
                      if (hasSmartLink && smartLinkData?.shareId) {
                        setLocation(`/smart-links/edit/${smartLinkData.shareId}`);
                      } else {
                        setLocation(`/smart-links/create/${playlistId}`);
                      }
                    }}
                  >
                    <Share2 className="h-4 w-4" />
                    {hasSmartLink ? 'Edit Playlist Sharing Link' : 'Create Playlist Sharing Link'}
                  </Button>
                </>
              ) : (
                <>
                  <Button 
                    className="w-full bg-[#1DB954] hover:bg-[#1DB954]/80 text-white font-semibold h-12 px-10 text-sm"
                    onClick={handleSaveToSpotify}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <span className="flex items-center justify-center">
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Saving...
                      </span>
                    ) : "Save to Spotify"}
                  </Button>
                </>
              )}
            </div>
          </div>
          
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-bold bg-gradient-to-r from-teal-400 to-[#1DB954] text-transparent bg-clip-text text-[40px]">{title}</h1>
              <div className="flex items-center gap-2">
                {localSpotifyUrl && (
                  <button 
                    className="px-3 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium rounded-full flex items-center gap-1.5 transition-colors"
                    onClick={() => setShowShareModal(true)}
                  >
                    <FaShareAlt className="h-3 w-3" />
                    Share
                  </button>
                )}
              </div>
            </div>
            
            {description && (
              <p className="text-foreground/70 mt-2 text-sm">{description}</p>
            )}
            
            {/* Display article source info if available - less strict conditions */}
            {(articleTitle || articleLink) && (
              <div className="mt-3 bg-gray-100 dark:bg-gray-800 rounded-md p-2 border border-gray-200 dark:border-gray-700">
                <p className="text-xs text-foreground/80">
                  <span className="font-semibold">Inspired by article: </span>
                  {articleLink ? (
                    <a 
                      href={articleLink} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {articleTitle || articleLink}
                    </a>
                  ) : (
                    <span>{articleTitle}</span>
                  )}
                </p>
              </div>
            )}
            
            <div className="flex items-center mt-4 text-sm text-foreground/70">
              <span>{tracks.length} songs</span>
              <span className="mx-2">•</span>
              <span>{durationText}</span>
            </div>
            
            {localSpotifyUrl && localSpotifyUrl.includes('spotify.com/playlist/') && showEmbed && (
              <div className="mt-6">
                <div className="w-full">
                  <iframe 
                    src={`https://open.spotify.com/embed/playlist/${localSpotifyUrl.split('/playlist/')[1]?.split('?')[0] || ''}?theme=0`}
                    width="100%" 
                    height="152" 
                    frameBorder="0" 
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" 
                    loading="lazy"
                    style={{ display: 'block', border: 'none', margin: 0, padding: 0 }}
                    className="max-w-full"
                    onError={(e) => {
                      // Hide the iframe if it fails to load
                      (e.target as HTMLIFrameElement).style.display = 'none';
                    }}
                  ></iframe>
                </div>
              </div>
            )}
            {localSpotifyUrl && localSpotifyUrl.includes('spotify.com/playlist/') && !showEmbed && (
              <div className="mt-6">
                <div className="w-full h-[152px] flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-md animate-pulse">
                  <p className="text-gray-500 dark:text-gray-400">Loading Spotify embed...</p>
                </div>
              </div>
            )}
          </div>
        </div>
        
        <div>
          <Card className="bg-card shadow-sm border-border overflow-hidden mb-16"> {/* Added margin-bottom for spacing */}
            {tracks.length === 0 ? (
              <div className="text-center py-8 text-foreground/70">
                <p>No songs in this playlist.</p>
              </div>
            ) : (
              (() => {
                // User owns this playlist if they're logged in (all playlists in PlaylistDetailsUpdated are user-owned)
                const isOwner = !!user?.id;
                
                // Create tracks with consistent IDs for drag-and-drop
                const tracksWithIds = tracks.map((track, index) => ({
                  ...track,
                  // Use Spotify ID if available, otherwise fallback to dbId or position
                  dragId: track.id || track.dbId?.toString() || `track-${index}`
                }));
                
                return (
                  <DraggableTrackList
                    tracks={tracksWithIds}
                    onReorder={(reorderedTracks) => {
                      // Remove the dragId property before passing to handleTrackReorder
                      const cleanedTracks = reorderedTracks.map(({ dragId, ...track }) => track);
                      handleTrackReorder(cleanedTracks);
                    }}
                    disabled={!isOwner}
                    className="divide-y divide-border"
                  >
                    {tracksWithIds.map((track, index) => (
                      <DraggableTrackItem
                        key={track.dragId}
                        id={track.dragId}
                        disabled={!isOwner}
                        showDragHandle={isOwner}
                        className="py-2"
                      >
                        <SongItem
                          track={track}
                          index={index}
                          onRemove={() => handleRemoveSong(index)}
                        />
                      </DraggableTrackItem>
                    ))}
                  </DraggableTrackList>
                );
              })()
            )}
          </Card>
        </div>
      </div>
      {showShareModal && localSpotifyUrl && (
        <ShareModal
          open={showShareModal}
          onClose={() => setShowShareModal(false)}
          playlistTitle={title}
          spotifyUrl={localSpotifyUrl}
          coverImageUrl={coverImage}
          spotifyImageUrl={spotifyImageUrl}
        />
      )}
      {showSmartLinkModal && (
        <CreateSmartLinkModal 
          isOpen={showSmartLinkModal}
          onClose={() => setShowSmartLinkModal(false)}
          playlist={{
            id: playlistId,
            title,
            description,
            coverImageUrl: localCoverImage
          }}
          songs={tracks.map((track, index) => ({
            id: typeof track.dbId === 'number' ? track.dbId : Number(track.id), // Ensure number type for track ID
            title: track.name,
            artist: track.artists?.[0]?.name || 'Unknown Artist',
            album: track.album?.name,
            duration: track.duration_ms
          }))}
          existingSmartLink={smartLinkData}
          isEditing={hasSmartLink}
        />
      )}
    </>
  );
};

export default PlaylistDetailsUpdated;