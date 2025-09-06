import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SpotifyTrack } from "@shared/schema";
import SongItem from "./SongItem";
import ShareModal from "./ShareModal";
import SimplePlaylistEmbed from "./SimplePlaylistEmbed";
import { DraggableTrackList } from "@/components/ui/DraggableTrackList";
import { DraggableTrackItem } from "@/components/ui/DraggableTrackItem";
import { FaShareAlt } from "react-icons/fa";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";

interface PlaylistDetailsProps {
  title: string;
  description?: string;
  coverImage?: string;
  tracks: SpotifyTrack[];
  spotifyUrl?: string;
  playlistId: number;
  isPublic?: boolean;
  articleTitle?: string;
  articleLink?: string;
  onSongRemoved?: () => void;
}

const PlaylistDetails = ({
  title,
  description,
  coverImage,
  tracks: initialTracks,
  spotifyUrl,
  playlistId,
  isPublic,
  articleTitle,
  articleLink,
  onSongRemoved
}: PlaylistDetailsProps) => {
  const [showShareModal, setShowShareModal] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // Use local state to manage tracks for immediate UI updates
  const [tracks, setTracks] = useState<SpotifyTrack[]>(initialTracks);
  
  // Update local tracks state when initialTracks change (e.g., due to query invalidation)
  useEffect(() => {
    setTracks(initialTracks);
  }, [initialTracks]);
  
  const totalDuration = tracks.reduce((total, track) => total + (track.duration_ms || 0), 0);
  const hours = Math.floor(totalDuration / 3600000);
  const minutes = Math.floor((totalDuration % 3600000) / 60000);
  const durationText = hours > 0 
    ? `${hours} hr ${minutes} min` 
    : `${minutes} min`;
    
  const handleImageError = () => {
    setImageError(true);
  };
  
  // Handle track reordering via drag-and-drop
  const handleTrackReorder = async (reorderedTracks: SpotifyTrack[]) => {
    const oldTracks = [...tracks];
    setTracks(reorderedTracks);

    // Check if user is authenticated to update track order in database
    if (user?.id) {
      try {
        const trackOrder = reorderedTracks.map((track, index) => ({
          trackId: track.dbId || track.id,
          position: index + 1
        }));

        const response = await fetch(`/api/playlist/${playlistId}/reorder-tracks?userId=${user.id}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ trackOrder }),
        });

        if (!response.ok) {
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

        // Invalidate queries to refresh playlist data in the background
        queryClient.invalidateQueries({ queryKey: [`/api/playlist/${playlistId}`] });
      } catch (error) {
        console.error("Error updating track order:", error);
        // Revert the track order if the API call failed
        setTracks(oldTracks);
        toast({
          title: "Error updating track order",
          description: "Failed to save the new track order. Please try again.",
          variant: "destructive"
        });
      }
    }
  };

  // Function to save the playlist to Spotify from the database version
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

      // Call the API to delete the song
      const response = await apiRequest(
        'DELETE', 
        `/api/playlist/${playlistId}/song/${index}?userId=${userId}`,
        {}
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to remove song');
      }
      
      // Show success message immediately after successful deletion
      toast({
        title: "Song Removed",
        description: "The song has been removed from your playlist.",
      });
      
      // Update the UI immediately by filtering out the removed track
      // This provides immediate visual feedback without waiting for the query refresh
      const updatedTracks = [...tracks];
      updatedTracks.splice(index, 1);
      setTracks(updatedTracks);
      
      // Wait for a short delay to ensure the UI shows the loading state
      await new Promise(resolve => setTimeout(resolve, 300));
      
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
      
      // Call the server to export the playlist to Spotify
      const userId = localStorage.getItem('userId');
      const response = await apiRequest('POST', `/api/playlist/${playlistId}/export?userId=${userId}`, {});
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to export to Spotify');
      }
      
      const result = await response.json();
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: [`/api/playlist/${playlistId}`] });
      
      // Show success message
      toast({
        title: "Exported to Spotify",
        description: "Your playlist has been successfully saved to Spotify.",
      });
      
      // Reload the page to show the updated UI with Spotify links
      setTimeout(() => {
        window.location.reload();
      }, 1500);
      
    } catch (error: any) {
      console.error('Failed to save to Spotify:', error);
      toast({
        title: "Export Failed",
        description: error?.message || "Could not export playlist to Spotify. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row gap-6">
          <div className="w-full md:w-48 lg:w-60">
            <div className="bg-muted rounded-lg overflow-hidden aspect-square">
              {coverImage && !imageError ? (
                <img 
                  src={coverImage} 
                  alt={title} 
                  className="w-full h-full object-cover"
                  onError={handleImageError}
                />
              ) : (
                <div className="w-full h-full bg-muted/80 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                </div>
              )}
            </div>
            
            <div className="mt-4 flex flex-col gap-2">
              {spotifyUrl ? (
                <>
                  <Button 
                    className="w-full bg-primary hover:bg-primary/80 text-primary-foreground font-medium"
                    onClick={() => window.open(spotifyUrl, "_blank")}
                  >
                    Open in Spotify
                  </Button>
                  
                  <Button 
                    variant="outline"
                    className="w-full border-muted-foreground/30 text-foreground hover:bg-muted flex items-center justify-center gap-2"
                    onClick={() => setShowShareModal(true)}
                  >
                    <FaShareAlt className="h-3.5 w-3.5" />
                    Share
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
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    This playlist is saved in Songfuse
                  </p>
                </>
              )}
            </div>
          </div>
          
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">{title}</h1>
            
            {description && (
              <p className="text-muted-foreground mt-2 text-sm">{description}</p>
            )}
            
            <div className="flex items-center mt-4 text-sm text-muted-foreground">
              <span>{tracks.length} songs</span>
              <span className="mx-2">•</span>
              <span>{durationText}</span>
            </div>
            
            {spotifyUrl && spotifyUrl.includes('spotify.com/playlist/') && (
              <div className="mt-6">
                <div className="w-full overflow-hidden rounded-lg">
                  {/* Use SimplePlaylistEmbed instead of iframe */}
                  <SimplePlaylistEmbed playlistUrl={spotifyUrl} />
                </div>
              </div>
            )}
          </div>
        </div>
        
        <div>
          <Card className="bg-card/40 border-border overflow-hidden">
            {tracks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No songs in this playlist.</p>
              </div>
            ) : (
              {(() => {
                // User owns this playlist if they're logged in (all playlists in PlaylistDetails are user-owned)
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
              })()}
            )}
          </Card>
        </div>
      </div>
      
      {showShareModal && spotifyUrl && (
        <ShareModal
          open={showShareModal}
          onClose={() => setShowShareModal(false)}
          playlistTitle={title}
          spotifyUrl={spotifyUrl}
          coverImageUrl={coverImage}
        />
      )}
    </>
  );
};

export default PlaylistDetails;