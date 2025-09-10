import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SpotifyTrack, GeneratedPlaylist } from "@shared/schema";
import { useSpotify } from "@/hooks/useSpotify";
import { useToast } from "@/hooks/use-toast";
import { usePlaylistUpdate } from "@/contexts/PlaylistUpdateContext";
import { usePlaylistCreator } from "@/contexts/PlaylistCreatorContext";
import { useAuth } from "@/contexts/AuthContext";
import { resetPlaylistStorage } from "@/lib/resetPlaylistStorage";
import SongItem from "./SongItem";
import { DraggableTrackList } from "@/components/ui/DraggableTrackList";
import { DraggableTrackItem } from "@/components/ui/DraggableTrackItem";
import SavedModal from "./SavedModal";
import MusicSpinner from "./MusicSpinner";
import { Separator } from "@/components/ui/separator";
import PlaylistImprovementModal from "./PlaylistImprovementModal";
import PlaylistCoverPlaceholder from "./PlaylistCoverPlaceholder";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";

interface PlaylistEditorProps {
  playlist: GeneratedPlaylist;
  onCancel: () => void; // This is effectively setGeneratedPlaylist(null) in the parent
  onCoverUpdate?: (newImageUrl: string) => void; // Callback with the new image URL
  originalPrompt?: string; // Original user prompt that generated this playlist
  onLoadingChange?: (isLoading: boolean) => void; // Callback for loading state changes
  existingDatabaseId?: number | null; // Pass in an existing database ID if available
  onDatabaseIdChange?: (id: number | null) => void; // Callback when database ID changes
}

const PlaylistEditor = ({ 
  playlist: initialPlaylist, 
  onCancel, 
  onCoverUpdate, 
  originalPrompt, 
  onLoadingChange,
  existingDatabaseId,
  onDatabaseIdChange
}: PlaylistEditorProps) => {
  const [title, setTitle] = useState(initialPlaylist.title);
  const [description, setDescription] = useState(initialPlaylist.description || "");
  const [coverImageUrl, setCoverImageUrl] = useState(initialPlaylist.coverImageUrl);
  const [coverImageVersion, setCoverImageVersion] = useState(Date.now()); // Add version for cache busting
  const { user } = useAuth();
  // Log initial track database IDs for debugging
  console.log("Initial playlist tracks with database IDs:", 
    initialPlaylist.tracks.map(t => ({
      name: t.name,
      dbId: t.dbId,
      id: t.id
    }))
  );
  
  // Create a wrapper for setTracks to ensure database IDs are preserved
  const [tracksInternal, setTracksInternal] = useState<SpotifyTrack[]>(initialPlaylist.tracks);
  
  // Enhanced setTracks function that logs and preserves database IDs
  const setTracks = (newTracks: SpotifyTrack[]) => {
    console.log("Setting tracks with database IDs:", 
      newTracks.map(t => ({
        name: t.name,
        dbId: t.dbId,
        id: t.id
      }))
    );
    setTracksInternal(newTracks);
  };
  
  // Use tracksInternal as tracks throughout the component
  const tracks = tracksInternal;
  const [isPublic, setIsPublic] = useState(initialPlaylist.isPublic ?? true); // Initialize from playlist data
  const [showSavedModal, setShowSavedModal] = useState(false);
  const [savedPlaylistData, setSavedPlaylistData] = useState<{spotifyUrl: string} | null>(null);
  // Create a session ID for this playlist - used for tracking API calls
  const [sessionId] = useState(`playlist-${Date.now()}`);
  
  // Use the database ID from props if provided, otherwise initialize from null
  const [databaseSaved, setDatabaseSaved] = useState(Boolean(existingDatabaseId));
  const [databasePlaylistId, setDatabasePlaylistId] = useState<number | null>(existingDatabaseId || null);
  
  // Track which track ID is currently being removed, for proper loading state
  const [removingTrackId, setRemovingTrackId] = useState<string | null>(null);
  
  
  // Get access to playlist creator context for closing the modal
  const { closeCreator } = usePlaylistCreator();
  
  // Function to reset the playlist state to a new playlist
  const resetPlaylistState = () => {
    // Reset all state to default values for a new playlist
    setTitle("");
    setDescription("");
    setCoverImageUrl("");
    setTracks([]);
    setDatabasePlaylistId(null);
    setDatabaseSaved(false);
    setSavedPlaylistData(null);
    setShowSavedModal(false);
    setCoverImageVersion(Date.now());
    setIsPublic(true);
    
    // Clear all playlist storage
    resetPlaylistStorage();
    
    // Call onCancel which sets generatedPlaylist to null in parent component
    onCancel();
    
    // Close the modal to return to New Playlist state
    closeCreator();
  };
  
  // Log when component receives a database ID
  useEffect(() => {
    console.log("PlaylistEditor received existingDatabaseId:", existingDatabaseId);
  }, [existingDatabaseId]);

  // Notify parent component when database ID changes
  useEffect(() => {
    if (onDatabaseIdChange && databasePlaylistId) {
      console.log("Notifying parent about database ID change:", databasePlaylistId);
      onDatabaseIdChange(databasePlaylistId);
    }
  }, [databasePlaylistId, onDatabaseIdChange]);
  
  // Fetch the latest tracks from the database when component mounts or database ID changes
  useEffect(() => {
    if (databasePlaylistId) {
      const fetchUpdatedTracks = async () => {
        try {
          // Get the user ID from auth context or localStorage as fallback
          let userId = user?.id || 1; // Default user ID if not found in context

          // Fallback to localStorage.getItem('userId') if user context is not available
          if (!user) {
            const storedUserId = localStorage.getItem('userId');
            if (storedUserId) {
              userId = parseInt(storedUserId) || 1;
            }
          }
          
          console.log(`Fetching updated tracks for playlist ${databasePlaylistId}`);
          const response = await fetch(`/api/playlist/${databasePlaylistId}?userId=${userId}`);
          
          if (response.ok) {
            const data = await response.json();
            if (data && data.tracks && Array.isArray(data.tracks)) {
              console.log(`Loaded ${data.tracks.length} tracks from database for playlist ${databasePlaylistId}`);
              
              // Convert the track format to match what our component expects
              const formattedTracks = data.tracks.map((t: any) => {
                console.log("Raw track data from API:", JSON.stringify(t, null, 2));
                
                // Parse artists_json if it's a string
                let artists = [];
                try {
                  // If we have artists as a properly formatted array already
                  if (t.artists && Array.isArray(t.artists)) {
                    artists = t.artists;
                  }
                  // If we have artists_json as an array
                  else if (t.artists_json && Array.isArray(t.artists_json)) {
                    artists = t.artists_json;
                  }
                  // If we have artists_json as a string, parse it
                  else if (t.artists_json && typeof t.artists_json === 'string') {
                    artists = JSON.parse(t.artists_json);
                  }
                  // Fallback to single artist
                  else if (t.artist_name) {
                    artists = [{ id: 0, name: t.artist_name }];
                  }
                  else {
                    // Last resort fallback
                    artists = [{ id: 0, name: "Unknown Artist" }];
                  }
                } catch (e) {
                  console.error("Error parsing artists_json:", e);
                  artists = [{ id: 0, name: "Unknown Artist" }];
                }
                
                // Get spotifyId with fallbacks
                const spotifyId = t.spotifyId || t.spotify_id || (t.id ? `db-${t.id}` : null);
                
                // Track might already have album info from direct DB API
                const albumInfo = t.album || {
                  name: t.album_name || "Unknown Album",
                  images: t.album_cover_image 
                    ? [{ url: t.album_cover_image }] 
                    : []
                };
                
                // For direct DB API, preserve the original album format
                if (t.album && t.album.images && t.album.images.length > 0) {
                  // We already have proper album info from DB
                  // Just add direct references to the raw album cover for easier access
                  return {
                    ...t,  // Keep all original properties
                    dbId: t.id,  // Make sure we have the dbId
                    title: t.name || t.title,  // Ensure title is set
                    artist: artists.map((a: any) => a.name).join(", "),  // Add artist string
                    album_cover_image: t.album.images[0].url,  // Add direct album_cover_image reference
                    album_name: t.album.name  // Add direct album_name reference
                  };
                }
                
                // For regular API, create a full object with all possible fields
                return {
                  id: spotifyId,
                  dbId: t.id,
                  name: t.name || t.title || "Unknown Track",
                  title: t.title || t.name || "Unknown Track", // Add title field for compatibility
                  artists: artists,
                  artist: artists.map((a: any) => a.name).join(", "), // Add artist field for compatibility
                  album: albumInfo,
                  album_cover_image: t.album_cover_image || (albumInfo.images && albumInfo.images[0] ? albumInfo.images[0].url : ''), // Include raw field for easier access
                  album_name: t.album_name || (albumInfo ? albumInfo.name : "Unknown Album"), // Include raw field for easier access
                  spotify_id: spotifyId, // Include raw field for easier access
                  spotifyId: spotifyId, // Include spotifyId for compatibility
                  platforms: {
                    spotify: {
                      id: spotifyId
                    }
                  },
                  duration_ms: t.duration_ms || 0,
                  explicit: t.explicit || false,
                  preview_url: t.preview_url || null
                };
              });
              
              // Update the tracks state with the latest data from the database
              setTracks(formattedTracks);
            }
          }
        } catch (error) {
          console.error("Error fetching updated playlist tracks:", error);
        }
      };
      
      // Execute the fetch
      fetchUpdatedTracks();
    }
  }, [databasePlaylistId, user]);
  const [showImprovementModal, setShowImprovementModal] = useState(false);
  const [isLocalImproving, setIsLocalImproving] = useState(false);
  const [customCoverPrompt, setCustomCoverPrompt] = useState("");
  const [showCoverPromptInput, setShowCoverPromptInput] = useState(false);
  const [lastGeneratedPrompt, setLastGeneratedPrompt] = useState("");
  
  const { 
    generateCoverImage, 
    uploadCustomCover,
    savePlaylist, 
    savePlaylistToDatabase, 
    improvePlaylist,
    isLoading,
    isGeneratingCover,
    isUploadingCover,
    isImprovingPlaylist 
  } = useSpotify();
  const { toast } = useToast();
  const { notifyPlaylistUpdated, notifyPlaylistCreated, triggerSidebarRefresh } = usePlaylistUpdate();
  const { articleData } = usePlaylistCreator();
  
  // Initialize component state for playlist saving
  // Set existing database ID if provided (for editing existing playlists)
  useEffect(() => {
    if (existingDatabaseId) {
      console.log("Using existing database ID:", existingDatabaseId);
      setDatabaseSaved(true);
      setDatabasePlaylistId(existingDatabaseId);
    }
  }, [existingDatabaseId]);
  
  // Use the wouter hook for navigation
  const [, setLocation] = useLocation();
    
  // Save playlist to Songfuse database when requested by user
  const saveToSongfuseDatabase = async () => {
    if (tracks.length === 0) {
      toast({
        title: "No tracks",
        description: "Please add songs to your playlist before saving.",
        variant: "destructive"
      });
      return;
    }
    
    try {
      console.log(`Saving playlist to Songfuse database:`, {
        title,
        description: description ? `${description.substring(0, 25)}...` : null,
        playlistId: databasePlaylistId,
        trackCount: tracks.length,
        hasCover: !!coverImageUrl
      });
      
      // Save to database and automatically to Songfuse Spotify account
      const result = await savePlaylist(
        title, 
        description, 
        coverImageUrl, 
        tracks,
        isPublic,
        false, // skipSpotify=false to auto-save to Songfuse Spotify account
        databasePlaylistId, // Use existing ID if available
        articleData // Pass article data from context
      );
      
      if (result && (((result as any).playlist && (result as any).playlist.id) || result.id)) {
        // Handle both v2 API format (result.playlist.id) and legacy format (result.id)
        setDatabaseSaved(true);
        const playlistId = (result as any).playlist?.id || result.id;
        setDatabasePlaylistId(playlistId);
        console.log("Playlist saved to Songfuse database:", playlistId);
        
        // Check if it was also saved to Spotify
        const savedToSpotify = result.savedToSpotify || result.spotifyUrl;
        console.log("Saved to Spotify:", savedToSpotify);
        
        // Notify the PlaylistUpdateContext
        notifyPlaylistCreated({
          id: playlistId,
          title: title,
          description: description,
          coverImage: coverImageUrl
        });
        
        // Force sidebar refresh
        triggerSidebarRefresh();
        
        // Show success toast with link to playlist
        toast({
          title: "Playlist saved!",
          description: savedToSpotify 
            ? "Your playlist has been saved to Songfuse and Spotify." 
            : "Your playlist has been saved to Songfuse.",
          variant: "default"
        });
        
        // Redirect user to the playlist permalink with a flag to skip auto-save
        setLocation(`/playlist/${playlistId}?justCreated=true`);
        
        // Reset the form and collapse the modal
        resetPlaylistState();
        
        
      } else {
        console.error("Save failed with unexpected response format:", result);
        throw new Error("Save failed: No valid playlist ID in response");
      }
    } catch (error) {
      console.error("Error saving playlist to Songfuse database:", error);
      toast({
        title: "Save error",
        description: "We couldn't save your playlist to Songfuse. Please try again.",
        variant: "destructive"
      });
    }
  };
  
  // Only notify parent component of major loading operations, but not cover generation
  useEffect(() => {
    if (onLoadingChange) {
      // Only pass isLoading for Spotify operations, not cover generation
      onLoadingChange(isLoading || isImprovingPlaylist);
    }
  }, [isLoading, isImprovingPlaylist, onLoadingChange]);
  
  // For debugging cover image issues
  useEffect(() => {
    console.log(`PlaylistEditor Cover Info:`, {
      coverImageUrl: coverImageUrl,
      imageVersion: coverImageVersion,
      databasePlaylistId: databasePlaylistId
    });
  }, [coverImageUrl, coverImageVersion, databasePlaylistId]);

  const handleGenerateNewCover = async () => {
    // No need to manage loading state here as it's handled by the useSpotify hook
    // Use customCoverPrompt if provided, otherwise generate automatically
    const result = await generateCoverImage(
      title, 
      description, 
      tracks,
      showCoverPromptInput ? customCoverPrompt : undefined,
      undefined, // No improvePrompt
      databasePlaylistId || undefined // Pass playlist ID if we have one
    );
    
    if (result) {
      // Update the cover image URL
      setCoverImageUrl(result.coverImageUrl);
      // Update version to force re-render and prevent caching
      setCoverImageVersion(Date.now());
      // Save the prompt that was used
      if (result.promptUsed) {
        setLastGeneratedPrompt(result.promptUsed);
      }
      // Notify parent component with the new URL if callback is provided
      if (onCoverUpdate) {
        onCoverUpdate(result.coverImageUrl);
      }
      
      // Check if the server already updated the playlist with the new cover
      if (result.playlistUpdated === true) {
        console.log(`Cover image was automatically updated for playlist by the server`);
        
        // Show user feedback
        toast({
          title: "Cover updated",
          description: "The new cover image has been saved to your playlist.",
          variant: "default",
          duration: 3000
        });
        return;
      }
      
      // Only update the cover image in the database without changing the tracks
      try {
        // If we already have a database ID, only update the cover image
        if (databasePlaylistId !== null) {
          // Use the new uploadCustomCover function that properly updates the database
          await uploadCustomCover(databasePlaylistId, result.coverImageUrl);
          
          // Notify UI that the playlist has been updated
          notifyPlaylistUpdated(databasePlaylistId, undefined, result.coverImageUrl);
          
          console.log("Cover image updated in database using uploadCustomCover function");
        } else {
          // For new playlists, just store the cover URL in state - don't save to database yet
          // The user will need to click "Save to Songfuse" to save the playlist
          console.log("New playlist with generated cover - waiting for user to explicitly save");
          
          // Just update the local state with the new cover image
          setCoverImageUrl(result.coverImageUrl);
          
          // Store in localStorage for persistence between page refreshes
          const storedData = localStorage.getItem('songfuse_playlist_creator_state');
          if (storedData) {
            try {
              const parsedData = JSON.parse(storedData);
              if (parsedData.generatedPlaylist) {
                parsedData.generatedPlaylist.coverImageUrl = result.coverImageUrl;
                localStorage.setItem('songfuse_playlist_creator_state', JSON.stringify({
                  ...parsedData,
                  lastUpdated: Date.now()
                }));
                console.log("Updated cover image in localStorage only - not saving to database yet");
              }
            } catch (e) {
              console.error("Error updating cover in localStorage:", e);
            }
          }
        }
        
        // Make sure the playlist data in localStorage includes the new cover image
        const storedData = localStorage.getItem('songfuse_playlist_creator_state');
        if (storedData) {
          try {
            const parsedData = JSON.parse(storedData);
            if (parsedData.generatedPlaylist) {
              parsedData.generatedPlaylist.coverImageUrl = result.coverImageUrl;
              localStorage.setItem('songfuse_playlist_creator_state', JSON.stringify({
                ...parsedData,
                lastUpdated: Date.now()
              }));
              console.log("Updated cover image in localStorage");
            }
          } catch (e) {
            console.error("Error updating cover in localStorage:", e);
          }
        }
      } catch (error) {
        console.error("Failed to update cover image:", error);
        // Don't show an error message as this is a background operation
      }
      
      // Show success message
      toast({
        title: "Cover generated",
        description: "New playlist cover image has been created and saved.",
        variant: "default"
      });
      
      // Reset state
      setShowCoverPromptInput(false);
      setCustomCoverPrompt("");
    }
  };

  const handleUploadCustomCover = () => {
    // Create a file input element
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    
    fileInput.addEventListener("change", (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
          const result = e.target?.result as string;
          
          try {
            // First check if we have a playlist ID
            if (!databasePlaylistId) {
              // Instead of saving the playlist automatically, just store the cover in local state
              console.log("No database ID found, storing custom cover in local state only");
              
              // Just update local state with the uploaded image for preview
              setCoverImageUrl(result);
              setCoverImageVersion(Date.now());
              // Notify parent component with the new URL if callback is provided
              if (onCoverUpdate) {
                onCoverUpdate(result);
              }
              
              // Store in localStorage for persistence between page refreshes
              const storedData = localStorage.getItem('songfuse_playlist_creator_state');
              if (storedData) {
                try {
                  const parsedData = JSON.parse(storedData);
                  if (parsedData.generatedPlaylist) {
                    parsedData.generatedPlaylist.coverImageUrl = result;
                    localStorage.setItem('songfuse_playlist_creator_state', JSON.stringify({
                      ...parsedData,
                      lastUpdated: Date.now()
                    }));
                    console.log("Updated cover image in localStorage only - not saving to database yet");
                  }
                } catch (e) {
                  console.error("Error updating cover in localStorage:", e);
                }
              }
              
              toast({
                title: "Cover selected",
                description: "Your custom cover is ready. Click 'Save to Songfuse' to save your playlist with this cover.",
                variant: "default"
              });
            } else {
              // We already have a database ID, just upload the cover
              console.log(`Using existing database ID for cover upload: ${databasePlaylistId}`);
              
              // Add detailed logging about the image we're uploading
              console.log(`Uploading custom cover image for playlist ${databasePlaylistId}:`, {
                imageDataLength: result.length,
                imageDataPreview: result.substring(0, 50) + '...',
                isDataURL: result.startsWith('data:image/')
              });
              
              try {
                // Use our new uploadCustomCover function with better error handling
                const uploadResult = await uploadCustomCover(databasePlaylistId, result);
                console.log(`Cover upload result:`, uploadResult);
                
                if (uploadResult && uploadResult.coverImageUrl) {
                  // Update local state with the new cover URL
                  setCoverImageUrl(uploadResult.coverImageUrl);
                  // Update version to force re-render and prevent caching
                  setCoverImageVersion(Date.now());
                  // Notify parent component with the new URL if callback is provided
                  if (onCoverUpdate) {
                    onCoverUpdate(uploadResult.coverImageUrl);
                  }
                  
                  // Notify the UI about this playlist update
                  notifyPlaylistUpdated(databasePlaylistId, undefined, uploadResult.coverImageUrl);
                  
                  toast({
                    title: "Cover updated",
                    description: "Your custom cover image has been uploaded and saved to the database.",
                    variant: "default"
                  });
                } else {
                  console.warn("Upload succeeded but no cover URL was returned");
                  toast({
                    title: "Cover upload issue",
                    description: "Upload completed but we didn't get back a valid image URL. Please try again.",
                    variant: "destructive"
                  });
                }
              } catch (uploadError) {
                console.error("Error uploading cover for existing playlist:", uploadError);
                toast({
                  title: "Cover upload failed",
                  description: "Failed to upload custom cover image. Please try a different image or use the auto-generate option.",
                  variant: "destructive"
                });
                
                // Show temporary preview even if upload failed
                setCoverImageUrl(result);
                setCoverImageVersion(Date.now());
              }
            }
          } catch (error) {
            console.error("Top-level error in cover upload process:", error);
            
            // Show temporary preview even if upload failed
            setCoverImageUrl(result);
            setCoverImageVersion(Date.now());
            
            toast({
              title: "Cover upload failed",
              description: "Could not upload your custom cover image. Please try again.",
              variant: "destructive"
            });
          }
        };
        reader.readAsDataURL(file);
      }
    });
    
    fileInput.click();
  };
  
  // Helper function to update only the cover image
  // We've replaced the updateCoverOnly function with uploadCustomCover from useSpotify
  // This ensures consistent behavior and database updates across the application

  // Remove a song from the playlist
  const handleRemoveSong = async (indexToRemove: number): Promise<void> => {
    // Log the track being removed
    const trackBeingRemoved = tracks[indexToRemove];
    console.log("Removing track:", {
      index: indexToRemove,
      name: trackBeingRemoved?.name || 'unknown',
      dbId: trackBeingRemoved?.dbId,
      id: trackBeingRemoved?.id || 'unknown'
    });
    
    // Set the removing track ID for UI loading state
    if (trackBeingRemoved && trackBeingRemoved.id) {
      setRemovingTrackId(trackBeingRemoved.id);
    }
    
    try {
      // For unsaved playlists (most cases), just remove from local state
      if (!databasePlaylistId) {
        console.log("Playlist not yet saved to database, removing track locally");
        
        // Simply remove from local state
        setTracks(tracks.filter((_, index) => index !== indexToRemove));
        
        // Add a brief timeout for better UX
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Show success toast
        toast({
          title: "Track removed",
          description: "The track has been removed from your playlist",
          variant: "default"
        });
        
        return;
      }
      
      // For saved playlists, update in the database
      // Get the user ID from auth context or localStorage as fallback
      let userId = user?.id || 1; // Default user ID if not found in context
      
      // Fallback to localStorage.getItem('userId') if user context is not available
      if (!user) {
        const storedUserId = localStorage.getItem('userId');
        if (storedUserId) {
          userId = parseInt(storedUserId) || 1;
        }
      }
      
      // Make API call to remove track from database
      console.log(`Removing track at position ${indexToRemove} from playlist ${databasePlaylistId}`);
      const response = await fetch(`/api/playlist/${databasePlaylistId}/song/${indexToRemove}?userId=${userId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        // If the API call fails, show error
        const errorText = await response.text();
        console.error("Failed to remove track from database:", errorText);
        
        // Show error toast
        toast({
          title: "Failed to remove track",
          description: "The track could not be removed from your playlist. Please try again.",
          variant: "destructive"
        });
      } else {
        console.log("Successfully removed track from database");
        
        // Now that the API call succeeded, update the UI
        setTracks(tracks.filter((_, index) => index !== indexToRemove));
        
        // Show success toast
        toast({
          title: "Track removed",
          description: "The track has been removed from your playlist",
          variant: "default"
        });
      }
    } catch (error) {
      console.error("Error in handleRemoveSong:", error);
      
      // Show error toast
      toast({
        title: "Error removing track",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive"
      });
    } finally {
      // Always clear the removing track ID when done
      setRemovingTrackId(null);
    }
  };

  
  const handleReplaceSong = (indexToReplace: number, newTrack: SpotifyTrack) => {
    // Log tracks before replacement
    const trackBeingReplaced = tracks[indexToReplace];
    console.log("Replacing track:", {
      index: indexToReplace,
      oldTrack: {
        name: trackBeingReplaced.name,
        dbId: trackBeingReplaced.dbId,
        id: trackBeingReplaced.id
      },
      newTrack: {
        name: newTrack.name,
        dbId: newTrack.dbId,
        id: newTrack.id
      }
    });
    
    // Ensure the new track has a dbId if available
    if (newTrack.dbId === undefined && trackBeingReplaced.dbId !== undefined) {
      console.warn("New track is missing dbId that was present in old track. This could cause issues with playlist saving.");
    }
    
    setTracks(tracks.map((track, index) => 
      index === indexToReplace ? newTrack : track
    ));
    
    toast({
      title: "Track replaced",
      description: `"${newTrack.name}" has been added to your playlist`,
      variant: "default"
    });
  };

  // Handle track reordering via drag-and-drop
  const handleTrackReorder = async (reorderedTracks: SpotifyTrack[]) => {
    const oldTracks = [...tracks];
    setTracks(reorderedTracks);

    // If this is a saved playlist (has databasePlaylistId), update the track order in the database
    if (databasePlaylistId && user?.id) {
      try {
        const trackOrder = reorderedTracks.map((track, index) => ({
          trackId: track.dbId || track.id,
          position: index + 1
        }));

        const response = await fetch(`/api/playlist/${databasePlaylistId}/reorder-tracks?userId=${user.id}`, {
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

  const handleSaveToSpotify = async () => {
    if (tracks.length === 0) {
      toast({
        title: "No tracks",
        description: "Your playlist needs at least one track.",
        variant: "destructive"
      });
      return;
    }

    // Show loading toast to indicate the process has started
    toast({
      title: "Saving playlist...",
      description: "This may take a moment. Please don't refresh the page.",
      variant: "default"
    });

    console.log("Saving playlist to Spotify with database ID:", databasePlaylistId);

    try {
      const finalDescription = description;
      
      // Save to database first, then try to save to Spotify
      // Pass the existing playlistId if we have one (from auto-save to database)
      const result = await savePlaylist(
        title, 
        finalDescription, 
        coverImageUrl, 
        tracks, 
        isPublic, // Use the user-selected visibility setting
        false, // skipSpotify
        databasePlaylistId // Pass the existing playlist ID if available
      );
      
      if (result) {
        // The v2 API returns result.playlist.id instead of result.id
        const playlistId = (result as any).playlist?.id || result.id;
        
        if (playlistId) {
          console.log("Save successful, updating database ID:", playlistId);
          setDatabasePlaylistId(playlistId);
          setDatabaseSaved(true);
          
          // Use either structure depending on what the API returns
          const savedToSpotify = result.savedToSpotify || (result as any).playlist?.spotifyId;
          const spotifyUrl = result.spotifyUrl || (result as any).playlist?.spotifyUrl || '';
          
          // Automatically reset the playlist state
          resetPlaylistState();
        } else {
          console.error("Save response missing playlist ID:", result);
          toast({
            title: "Save issue",
            description: "Received an invalid response from the server. Your playlist might not have been saved properly.",
            variant: "destructive"
          });
        }
      } else {
        // Handle case where result is undefined but no exception was thrown
        toast({
          title: "Save incomplete",
          description: "There was a problem saving your playlist. Please try again.",
          variant: "destructive"
        });
      }
    } catch (error) {
      // Handle errors during saving process
      console.error("Error saving playlist:", error);
      
      // Show user-friendly error message
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "An unknown error occurred while saving your playlist. Your data is still in the editor.",
        variant: "destructive"
      });
    }
  };

  // Handle improvement prompts
  const handleImprovePlaylist = async (improvementPrompt: string) => {
    // Close the modal immediately so the user can see the loading state
    setShowImprovementModal(false);
    setIsLocalImproving(true);
    
    if (!databasePlaylistId) {
      const finalDescription = description;
        
      // Save to database first if not already saved
      const result = await savePlaylist(title, finalDescription, coverImageUrl, tracks, isPublic, true, null);
      if (result) {
        setDatabasePlaylistId(result.id);
      } else {
        toast({
          title: "Error",
          description: "Failed to save playlist. Please try again.",
          variant: "destructive"
        });
        return;
      }
    }
    
    try {
      // Send the improvement request
      const improvedPlaylist = await improvePlaylist(
        databasePlaylistId || 0,
        title,
        description,
        tracks,
        improvementPrompt,
        sessionId
      );
      
      // Update the playlist with the improved version
      if (improvedPlaylist) {
        console.log("Received improved playlist:", improvedPlaylist);
        
        // Update title and description with the improved versions
        setTitle(improvedPlaylist.title);
        setDescription(improvedPlaylist.description);
        
        // Check if tracks have been updated
        if (improvedPlaylist.tracks && improvedPlaylist.tracks.length > 0) {
          console.log(`Updating tracks from ${tracks.length} to ${improvedPlaylist.tracks.length}`);
          console.log("Track difference:", improvedPlaylist.tracks.length - tracks.length);
          
          // Always use the tracks returned from the server - this ensures we get the most up-to-date version
          setTracks(improvedPlaylist.tracks);
          
          // If we added or replaced tracks, show a toast notification
          if (improvedPlaylist.tracks.length !== tracks.length) {
            const diff = improvedPlaylist.tracks.length - tracks.length;
            toast({
              title: "Tracks updated",
              description: diff > 0 ? 
                `Added ${diff} new tracks to your playlist` : 
                "Replaced some tracks in your playlist",
              variant: "default"
            });
          }
        }
        
        // Force an immediate UI update to reflect changes
        setTimeout(() => {
          // Log state after timeout to verify changes
          console.log("Current state after improvement:", {
            currentTitle: title,
            currentDescription: description,
            newTitle: improvedPlaylist.title,
            newDescription: improvedPlaylist.description
          });
          
          // Force re-render if needed
          setCoverImageVersion(prevVersion => prevVersion + 1);
        }, 100);
        
        toast({
          title: "Playlist improved",
          description: "Your playlist has been improved by AI as requested.",
          variant: "default"
        });
        
        // Log the changes to help debug
        console.log("Playlist improvements applied:", {
          oldTitle: title,
          newTitle: improvedPlaylist.title,
          oldDescription: description,
          newDescription: improvedPlaylist.description
        });
      } else {
        toast({
          title: "Improvement failed",
          description: "Could not improve the playlist. Please try again.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Error during playlist improvement:", error);
      toast({
        title: "Error",
        description: "Failed to improve the playlist. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLocalImproving(false);
    }
  };

  // Calculate the total duration safely, adding debug logs
  console.log("Tracks for duration calculation:", tracks.map(t => ({
    name: t.name,
    duration_ms: t.duration_ms,
    type: typeof t.duration_ms
  })));
  
  const totalDuration = tracks.reduce((total, track) => {
    // Ensure duration_ms is a number and positive
    const duration = track.duration_ms && !isNaN(Number(track.duration_ms)) 
      ? Number(track.duration_ms) 
      : 0;
    return total + duration;
  }, 0);
  
  console.log(`Total calculated duration: ${totalDuration}ms`);
  
  const hours = Math.floor(totalDuration / 3600000);
  const minutes = Math.floor((totalDuration % 3600000) / 60000);
  
  // Create a fallback in case the duration calculation fails
  const durationText = !isNaN(hours) && !isNaN(minutes)
    ? (hours > 0 ? `${hours} hr ${minutes} min` : `${minutes} min`)
    : "0 min"; // Default fallback

  return (
    <>
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-auto">
          <div className="mb-6 px-6 pt-6">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-semibold dark:text-white text-gray-800">Playlist Details</h3>
              
              {/* Add refresh button */}
              {databasePlaylistId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    // Trigger the refresh to fetch the latest data
                    if (databasePlaylistId) {
                      const fetchUpdatedTracks = async () => {
                        try {
                          // Get the user ID from auth context or localStorage as fallback
                          let userId = user?.id || 1; // Default user ID if not found in context

                          // Fallback to localStorage.getItem('userId') if user context is not available
                          if (!user) {
                            const storedUserId = localStorage.getItem('userId');
                            if (storedUserId) {
                              userId = parseInt(storedUserId) || 1;
                            }
                          }
                          
                          console.log(`Manually refreshing tracks for playlist ${databasePlaylistId}`);
                          const response = await fetch(`/api/playlist/${databasePlaylistId}?userId=${userId}`);
                          
                          if (response.ok) {
                            const data = await response.json();
                            if (data && data.tracks && Array.isArray(data.tracks)) {
                              console.log(`Refreshed ${data.tracks.length} tracks from database`);
                              
                              // Convert the track format to match what our component expects
                              const formattedTracks = data.tracks.map((t: any) => {
                                console.log("Raw track data from manual refresh:", JSON.stringify(t, null, 2));
                                
                                // Parse artists_json if it's a string
                                let artists = [];
                                try {
                                  // If we have artists as a properly formatted array already
                                  if (t.artists && Array.isArray(t.artists)) {
                                    artists = t.artists;
                                  }
                                  // If we have artists_json as an array
                                  else if (t.artists_json && Array.isArray(t.artists_json)) {
                                    artists = t.artists_json;
                                  }
                                  // If we have artists_json as a string, parse it
                                  else if (t.artists_json && typeof t.artists_json === 'string') {
                                    artists = JSON.parse(t.artists_json);
                                  }
                                  // Fallback to single artist
                                  else if (t.artist_name) {
                                    artists = [{ id: 0, name: t.artist_name }];
                                  }
                                  else {
                                    // Last resort fallback
                                    artists = [{ id: 0, name: "Unknown Artist" }];
                                  }
                                } catch (e) {
                                  console.error("Error parsing artists_json:", e);
                                  artists = [{ id: 0, name: "Unknown Artist" }];
                                }
                                
                                // Get spotifyId with fallbacks
                                const spotifyId = t.spotifyId || t.spotify_id || (t.id ? `db-${t.id}` : null);
                                
                                // Track might already have album info from direct DB API
                                const albumInfo = t.album || {
                                  name: t.album_name || "Unknown Album",
                                  images: t.album_cover_image 
                                    ? [{ url: t.album_cover_image }] 
                                    : []
                                };
                                
                                // For direct DB API, preserve the original album format
                                if (t.album && t.album.images && t.album.images.length > 0) {
                                  // We already have proper album info from DB
                                  // Just add direct references to the raw album cover for easier access
                                  return {
                                    ...t,  // Keep all original properties
                                    dbId: t.id,  // Make sure we have the dbId
                                    title: t.name || t.title,  // Ensure title is set
                                    artist: artists.map((a: any) => a.name).join(", "),  // Add artist string
                                    album_cover_image: t.album.images[0].url,  // Add direct album_cover_image reference
                                    album_name: t.album.name  // Add direct album_name reference
                                  };
                                }
                                
                                // For regular API, create a full object with all possible fields
                                return {
                                  id: spotifyId,
                                  dbId: t.id,
                                  name: t.name || t.title || "Unknown Track",
                                  title: t.title || t.name || "Unknown Track", // Add title field for compatibility
                                  artists: artists,
                                  artist: artists.map((a: any) => a.name).join(", "), // Add artist field for compatibility
                                  album: albumInfo,
                                  album_cover_image: t.album_cover_image || (albumInfo.images && albumInfo.images[0] ? albumInfo.images[0].url : ''), // Include raw field for easier access
                                  album_name: t.album_name || (albumInfo ? albumInfo.name : "Unknown Album"), // Include raw field for easier access
                                  spotify_id: spotifyId, // Include raw field for easier access
                                  spotifyId: spotifyId, // Include spotifyId for compatibility
                                  platforms: {
                                    spotify: {
                                      id: spotifyId
                                    }
                                  },
                                  duration_ms: t.duration_ms || 0,
                                  explicit: t.explicit || false,
                                  preview_url: t.preview_url || null
                                };
                              });
                              
                              // Update the tracks state with the latest data from the database
                              setTracks(formattedTracks);
                              
                              toast({
                                title: "Playlist refreshed",
                                description: `Successfully loaded ${formattedTracks.length} tracks from the database`,
                                variant: "default"
                              });
                            }
                          }
                        } catch (error) {
                          console.error("Error refreshing playlist tracks:", error);
                          toast({
                            title: "Refresh failed",
                            description: "Could not refresh the playlist tracks",
                            variant: "destructive"
                          });
                        }
                      };
                      
                      fetchUpdatedTracks();
                    }
                  }}
                  className="flex items-center text-sm"
                >
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    className="h-4 w-4 mr-1" 
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
                  Refresh Tracks
                </Button>
              )}
            </div>
            
            <Card className="dark:bg-[#191414]/40 bg-gray-100/80 dark:border-gray-800 border-gray-300">
              <CardContent className="space-y-4">
                <div className="mt-2">
                  <Label className="block text-sm font-medium dark:text-gray-400 text-gray-600 mb-1">Title</Label>
                  <Input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full dark:bg-gray-700/20 bg-white dark:border-gray-700 border-gray-300 rounded-md py-2 px-3 dark:text-white text-gray-800 dark:placeholder-gray-500 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#d02b31]/50"
                  />
                </div>
                <div className="mt-2">
                  <div className="flex justify-between">
                    <Label className="block text-sm font-medium dark:text-gray-400 text-gray-600 mb-1">Description</Label>
                    <span className={`text-xs ${description.length > 250 ? 'text-red-500 font-medium' : 'dark:text-gray-400 text-gray-600'}`}>
                      {description.length}/250
                    </span>
                  </div>
                  <Textarea
                    value={description}
                    onChange={(e) => {
                      const newValue = e.target.value;
                      setDescription(newValue);
                    }}
                    maxLength={250}
                    placeholder="Describe your playlist (max 250 characters)"
                    className="w-full dark:bg-gray-700/20 bg-white dark:border-gray-700 border-gray-300 rounded-md py-2 px-3 dark:text-white text-gray-800 dark:placeholder-gray-500 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#d02b31]/50 h-20"
                  />
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <input
                    type="checkbox"
                    id="isPublic"
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-[#d02b31] focus:ring-[#d02b31]"
                  />
                  <Label htmlFor="isPublic" className="text-sm font-medium dark:text-gray-300 text-gray-700">
                    Make playlist discoverable by other users
                  </Label>
                </div>
                
                {originalPrompt && (
                  <div className="mt-2">
                    <Label className="block text-sm font-medium dark:text-gray-400 text-gray-600 mb-1">Original Prompt</Label>
                    <div className="dark:bg-gray-700/20 bg-white/80 dark:border-gray-700 border-gray-300 rounded-md p-3 dark:text-gray-300 text-gray-700 text-sm">
                      <p className="italic">"{originalPrompt}"</p>
                    </div>
                  </div>
                )}
                <div className="mt-2">
                  <Label className="block text-sm font-medium dark:text-gray-400 text-gray-600 mb-2">Cover Image</Label>
                  <div className="flex items-start">
                    <div className="w-32 h-32 rounded-md overflow-hidden mr-4">

                      <PlaylistCoverPlaceholder 
                        size="xl" 
                        imageUrl={coverImageUrl ? `${coverImageUrl}${coverImageUrl.includes('?') ? '&' : '?'}timestamp=${coverImageVersion}` : undefined}
                        altText="Playlist cover"
                        key={`cover-${coverImageVersion}`} // Key to force re-render on image change
                      />
                    </div>
                    <div className="flex-1 space-y-2">
                      {showCoverPromptInput ? (
                        <div className="space-y-2">
                          <Textarea
                            value={customCoverPrompt}
                            onChange={(e) => setCustomCoverPrompt(e.target.value)}
                            placeholder="Describe the cover image you want (e.g., 'a neon cityscape with 80s retro vibes')"
                            className="w-full dark:bg-gray-700/20 bg-white dark:border-gray-700 border-gray-300 rounded-md py-2 px-3 dark:text-white text-gray-800 dark:placeholder-gray-500 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#d02b31]/50 text-xs h-20"
                          />
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              onClick={() => setShowCoverPromptInput(false)}
                              className="flex-1 dark:bg-gray-700/30 bg-gray-200/70 hover:bg-[#d02b31]/10 dark:hover:bg-gray-700/50 dark:text-white text-gray-800 dark:border-gray-700 border-gray-300 text-xs py-1"
                            >
                              Cancel
                            </Button>
                            <Button
                              variant="outline"
                              onClick={handleGenerateNewCover}
                              disabled={isGeneratingCover || !customCoverPrompt.trim()}
                              className="flex-1 dark:bg-gray-700/30 bg-gray-200/70 hover:bg-[#d02b31]/10 dark:hover:bg-gray-700/50 dark:text-white text-gray-800 dark:border-gray-700 border-gray-300 text-xs py-1"
                            >
                              {isGeneratingCover ? (
                                <>
                                  <MusicSpinner type="equalizer" size="sm" className="mr-1" />
                                  Generating...
                                </>
                              ) : (
                                "Generate"
                              )}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <Button
                            variant="outline"
                            onClick={() => setShowCoverPromptInput(true)}
                            disabled={isGeneratingCover}
                            className="w-full dark:bg-gray-700/30 bg-gray-200/70 hover:bg-[#d02b31]/10 dark:hover:bg-gray-700/50 dark:text-white text-gray-800 dark:border-gray-700 border-gray-300"
                          >
                            <svg 
                              xmlns="http://www.w3.org/2000/svg" 
                              className="h-4 w-4 mr-2" 
                              fill="none" 
                              viewBox="0 0 24 24" 
                              stroke="currentColor"
                            >
                              <path 
                                strokeLinecap="round" 
                                strokeLinejoin="round" 
                                strokeWidth={2} 
                                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" 
                              />
                            </svg>
                            Custom Cover Prompt
                          </Button>
                          <Button
                            variant="outline"
                            onClick={handleGenerateNewCover}
                            disabled={isGeneratingCover}
                            className="w-full dark:bg-gray-700/30 bg-gray-200/70 hover:bg-[#d02b31]/10 dark:hover:bg-gray-700/50 dark:text-white text-gray-800 dark:border-gray-700 border-gray-300"
                          >
                            {isGeneratingCover ? (
                              <MusicSpinner type="equalizer" size="sm" className="mr-2" />
                            ) : (
                              <svg 
                                xmlns="http://www.w3.org/2000/svg" 
                                className="h-4 w-4 mr-2" 
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
                            )}
                            {isGeneratingCover ? "Generating..." : "Auto Generate Cover"}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={handleUploadCustomCover}
                            disabled={isUploadingCover}
                            className="w-full dark:bg-gray-700/30 bg-gray-200/70 hover:bg-[#d02b31]/10 dark:hover:bg-gray-700/50 dark:text-white text-gray-800 dark:border-gray-700 border-gray-300"
                          >
                            {isUploadingCover ? (
                              <>
                                <svg 
                                  className="animate-spin -ml-1 mr-2 h-4 w-4"
                                  xmlns="http://www.w3.org/2000/svg"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                >
                                  <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                  />
                                  <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                  />
                                </svg>
                                Uploading...
                              </>
                            ) : (
                              <>
                                <svg 
                                  xmlns="http://www.w3.org/2000/svg" 
                                  className="h-4 w-4 mr-2" 
                                  fill="none" 
                                  viewBox="0 0 24 24" 
                                  stroke="currentColor"
                                >
                                  <path 
                                    strokeLinecap="round" 
                                    strokeLinejoin="round" 
                                    strokeWidth={2} 
                                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" 
                                  />
                                </svg>
                                Upload Custom
                              </>
                            )}
                          </Button>
                        </>
                      )}
                      
                      {lastGeneratedPrompt && (
                        <div className="mt-1 text-[10px] dark:text-gray-400 text-gray-500 italic">
                          <span className="font-medium">Last prompt:</span> {lastGeneratedPrompt.length > 60 ? lastGeneratedPrompt.substring(0, 60) + "..." : lastGeneratedPrompt}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mb-6 px-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold dark:text-white text-gray-800">Song Selection</h3>
              <span className="text-sm dark:text-gray-400 text-gray-600">
                {tracks.length} songs
              </span>
            </div>

            {/* Information panel about editing capabilities */}
            <div className="mb-4 p-3 rounded-lg dark:bg-blue-900/20 bg-blue-50 dark:border-blue-800/30 border-blue-200">
              <div className="flex items-start space-x-2">
                <svg className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <div className="text-sm dark:text-blue-200 text-blue-700">
                  <p className="font-medium mb-1">Customize your playlist</p>
                  <p className="dark:text-blue-300 text-blue-600">You can remove songs you don't like and drag to reorder them before saving.</p>
                </div>
              </div>
            </div>

            
            <Card className="dark:bg-[#191414]/40 bg-gray-100/80 dark:border-gray-800 border-gray-300 overflow-hidden">
              <div className="p-2">
                {/* Filter out duplicate tracks by their Spotify ID and add drag-and-drop */}
                {(() => {
                  // Create a map to track unique track IDs for filtering
                  const seenTrackIds = new Map();
                  
                  // Filter out duplicates
                  const uniqueTracks = tracks.filter((track, index) => {
                    // Always include tracks with no ID
                    if (!track.id) return true;
                    
                    // If we've seen this ID before, filter it out
                    if (seenTrackIds.has(track.id)) {
                      return false;
                    }
                    
                    // Record this ID in our map along with its original index
                    seenTrackIds.set(track.id, index);
                    return true;
                  });

                  if (uniqueTracks.length === 0) {
                    return (
                      <div className="text-center py-8 dark:text-gray-400 text-gray-500">
                        <p>No songs in the playlist. Add some songs!</p>
                      </div>
                    );
                  }
                  
                  // Enable drag-and-drop for all playlists being edited (both new and existing)
                  // Only require user to be logged in
                  const canReorder = !!user?.id;
                  
                  return (
                    <DraggableTrackList
                      tracks={uniqueTracks}
                      onReorder={handleTrackReorder}
                      disabled={!canReorder}
                      className="space-y-1"
                    >
                      {uniqueTracks.map((track, filteredIndex) => {
                        // Get the original index for removing/replacing
                        const originalIndex = seenTrackIds.get(track.id) || filteredIndex;
                        
                        return (
                          <DraggableTrackItem
                            key={`playlist-track-${track.id || filteredIndex}`}
                            id={track.id || `track-${filteredIndex}`}
                            disabled={!canReorder}
                            showDragHandle={canReorder}
                            className="rounded-md"
                          >
                            <SongItem
                              track={track}
                              index={originalIndex}
                              sessionId={sessionId}
                              isLoading={!!(track.id && removingTrackId === track.id)}
                              onRemove={async () => await handleRemoveSong(originalIndex)}
                              onReplace={(newTrack) => handleReplaceSong(originalIndex, newTrack as SpotifyTrack)}
                              allTracks={tracks}
                            />
                          </DraggableTrackItem>
                        );
                      })}
                    </DraggableTrackList>
                  );
                })()}
              </div>
            </Card>
          </div>
          
          {/* The "Ask AI to Improve This Playlist" button is temporarily hidden */}
        </div>
        
        {/* Action bar fixed at the bottom inside the modal window */}
        <div className="border-t dark:border-gray-800 border-gray-300 dark:bg-[#191414]/80 bg-white/80 backdrop-blur-md sticky bottom-0 left-0 right-0 z-10 mt-0 w-full">
          <div className="flex items-center justify-center py-3">
            <Button 
              onClick={saveToSongfuseDatabase}
              disabled={isLoading || tracks.length === 0}
              className="bg-[#1DB954] hover:bg-[#1DB954]/80 text-white font-semibold h-12 px-10 min-w-[220px] text-sm"
            >
              {isLoading ? (
                <span className="flex items-center">
                  <MusicSpinner type="waveform" size="sm" color="black" className="mr-2" />
                  Saving...
                </span>
              ) : "Save to Songfuse"}
            </Button>
          </div>
        </div>
      </div>
      {/* SavedModal removed to automatically reset to new playlist state */}
      {/* Playlist Improvement Modal */}
      <PlaylistImprovementModal
        isOpen={showImprovementModal}
        onClose={() => setShowImprovementModal(false)}
        onImprove={handleImprovePlaylist}
        title={title}
        description={description}
        tracks={tracks}
        isLoading={isLocalImproving}
      />
    </>
  );
};

export default PlaylistEditor;
