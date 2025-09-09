import { useState } from "react";
import { SpotifyTrack, GeneratedPlaylist } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export function useSpotify() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);
  const [isImprovingPlaylist, setIsImprovingPlaylist] = useState(false);
  const [isFetchingCover, setIsFetchingCover] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const { toast } = useToast();

  // Generate a playlist from a prompt
  const generatePlaylist = async (prompt: string, sessionId: string, articleData?: { title: string; link: string }): Promise<{
    message: string;
    playlist: GeneratedPlaylist;
    suggestions?: string[];
  } | null> => {
    if (!user) {
      toast({
        title: "Not logged in",
        description: "Please log in to generate a playlist",
        variant: "destructive"
      });
      return null;
    }

    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/chat/generate", {
        userId: user.id,
        sessionId,
        message: prompt,
        articleData
      });
      
      const data = await response.json();
      
      // Check if we received an error with suggestions
      if (data.error && data.suggestions) {
        return {
          message: data.error || "No tracks found matching your criteria. Try one of these suggestions instead.",
          playlist: null,
          suggestions: data.suggestions
        };
      }
      
      // Set a temporary placeholder for the cover image if it's not already set
      if (data && data.playlist && !data.playlist.coverImageUrl) {
        data.playlist.coverImageUrl = "";
      }
      
      return data;
    } catch (error) {
      console.error("Error generating playlist:", error);
      toast({
        title: "Generation failed",
        description: "Failed to generate playlist. Please try again.",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // Generate a new cover image
  const generateCoverImage = async (
    title: string,
    description: string,
    tracks: SpotifyTrack[],
    customPrompt?: string,
    improvePrompt?: string,
    playlistId?: number
  ): Promise<{ coverImageUrl: string, promptUsed?: string, playlistUpdated?: boolean, playlistId?: number } | null> => {
    if (!user) return null;

    setIsGeneratingCover(true);
    try {
      const response = await apiRequest("POST", "/api/cover/generate", {
        userId: user.id,
        title,
        description,
        tracks,
        customPrompt,
        improvePrompt,
        playlistId
      });
      
      // Check if response is OK before trying to parse JSON
      if (!response.ok) {
        // Get error message as text first to avoid JSON parse errors
        const errorText = await response.text();
        console.error(`Cover generation error (${response.status}):`, errorText);
        throw new Error(`Server error ${response.status}: ${errorText.substring(0, 100) || 'Unknown error'}`);
      }
      
      // Response is OK, now parse as JSON
      const data = await response.json();
      
      return {
        coverImageUrl: data.coverImageUrl,
        promptUsed: data.promptUsed,
        playlistUpdated: data.playlistUpdated,
        playlistId: data.playlistId
      };
    } catch (error) {
      console.error("Error generating cover image:", error);
      toast({
        title: "Cover generation failed",
        description: "Failed to generate a new cover image. Please try again.",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsGeneratingCover(false);
    }
  };
  
  // Upload a custom cover image for a playlist
  const uploadCustomCover = async (
    playlistId: number, 
    imageData: string
  ): Promise<{ coverImageUrl: string, playlistUpdated?: boolean, playlistId?: number } | null> => {
    if (!user) {
      toast({
        title: "Not logged in",
        description: "Please log in to upload a custom cover image",
        variant: "destructive"
      });
      return null;
    }
    
    setIsUploadingCover(true);
    try {
      const response = await apiRequest("POST", "/api/cover/upload", {
        userId: user.id,
        playlistId,
        imageData
      });
      
      // Check if response is OK before trying to parse JSON
      if (!response.ok) {
        // Get error message as text first to avoid JSON parse errors
        const errorText = await response.text();
        console.error(`Upload cover error (${response.status}):`, errorText);
        throw new Error(`Server error ${response.status}: ${errorText.substring(0, 100) || 'Unknown error'}`);
      }
      
      // Response is OK, now parse as JSON
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || "Failed to upload cover image");
      }
      
      return {
        coverImageUrl: data.coverImageUrl,
        playlistUpdated: true,
        playlistId: data.playlistId
      };
    } catch (error) {
      console.error("Error uploading custom cover image:", error);
      toast({
        title: "Cover upload failed",
        description: "Failed to upload the custom cover image. Please try again.",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsUploadingCover(false);
    }
  };

  // Save playlist to database and optionally to Spotify
  const savePlaylist = async (
    title: string,
    description: string,
    coverImageUrl: string,
    tracks: SpotifyTrack[],
    isPublic = true,
    skipSpotify = false,
    playlistId?: number | null,
    articleData?: { title: string, link: string } | null
  ): Promise<{
    id: number;
    spotifyId: string | null;
    spotifyUrl: string | null;
    savedToSpotify: boolean;
  } | null> => {
    if (!user) {
      // Only show toast for user-initiated saves
      if (!skipSpotify) {
        toast({
          title: "Not logged in",
          description: "Please log in to save your playlist",
          variant: "destructive"
        });
      }
      return null;
    }

    // Validate input data before sending to the server
    if (!title) {
      // Only show toast for user-initiated saves
      if (!skipSpotify) {
        toast({
          title: "Missing title",
          description: "Please provide a title for your playlist",
          variant: "destructive"
        });
      }
      return null;
    }

    if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
      // Only show toast for user-initiated saves
      if (!skipSpotify) {
        toast({
          title: "No tracks",
          description: "Your playlist needs at least one track to save",
          variant: "destructive"
        });
      }
      return null;
    }

    // Clean up tracks array to ensure it's valid before saving
    const validTracks = tracks.filter(track => track && typeof track === 'object' && track.id);
    if (validTracks.length === 0) {
      // Only show toast for user-initiated saves
      if (!skipSpotify) {
        toast({
          title: "Invalid tracks",
          description: "Your playlist contains invalid tracks that cannot be saved",
          variant: "destructive"
        });
      }
      return null;
    }

    setIsLoading(true);
    try {
      // Check if any of the tracks have dbId or databaseId properties
      // This would happen if we received tracks from the server with their database IDs
      const dbTrackIds: number[] = [];
      let hasAllDatabaseIds = true;
      let tracksWithoutIDs: SpotifyTrack[] = [];
      
      console.log(`Checking database IDs for ${validTracks.length} tracks in savePlaylist:`);
      
      // Print all tracks with their database IDs for debugging
      console.log("All tracks in save request:", validTracks.map((track, index) => {
        // @ts-ignore - properties might not be in the type
        return {
          index,
          name: track.name,
          // @ts-ignore
          dbId: track.dbId,
          // @ts-ignore
          databaseId: track.databaseId,
          id: track.id,
          artists: track.artists.map(a => a.name).join(", ")
        };
      }));
      
      for (const track of validTracks) {
        // @ts-ignore - dbId is the standard property for database ID references
        if (track.dbId) {
          // @ts-ignore
          dbTrackIds.push(track.dbId);
        } 
        // @ts-ignore - databaseId is the legacy property we might still encounter
        else if (track.databaseId) {
          // @ts-ignore
          dbTrackIds.push(track.databaseId);
          // Also copy it to the standard property for consistency
          // @ts-ignore
          track.dbId = track.databaseId;
        } else {
          hasAllDatabaseIds = false;
          tracksWithoutIDs.push(track);
        }
      }
      
      // Log the first track for debugging
      if (validTracks.length > 0) {
        // @ts-ignore - accessing properties that might not be in the type
        const dbId = validTracks[0].dbId;
        // @ts-ignore
        const databaseId = validTracks[0].databaseId;
        
        console.log("First track in savePlaylist:", {
          dbId,
          databaseId,
          id: validTracks[0].id,
          name: validTracks[0].name,
          // Show which property will be used
          using: dbId ? 'dbId' : (databaseId ? 'databaseId' : 'none')
        });
      }
      
      // Log summary of database IDs
      console.log(`Database ID summary:
        - Total tracks: ${validTracks.length}
        - Tracks with database IDs: ${dbTrackIds.length}
        - Tracks missing database IDs: ${tracksWithoutIDs.length}
        - Has all database IDs: ${hasAllDatabaseIds}
      `);
      
      // If any tracks are missing database IDs, log their details
      if (tracksWithoutIDs.length > 0) {
        console.log("Tracks missing database IDs:", tracksWithoutIDs.map(t => ({
          name: t.name,
          id: t.id,
          artists: t.artists.map(a => a.name).join(", ")
        })));
      }
      
      // If we have database IDs for all tracks, use those directly
      let response;
      
      // Update logic to use dbTrackIds if we have at least some database IDs
      if (dbTrackIds.length > 0) {
        console.log("Using available database track IDs for playlist save:", dbTrackIds.length);
        
        // If some IDs are missing, log a warning
        if (dbTrackIds.length !== validTracks.length) {
          console.warn(`⚠️ Warning: Only ${dbTrackIds.length}/${validTracks.length} tracks have database IDs.
          This may cause issues with playlist saving.`);
        }
        
        // Log attempt for debugging
        console.log("Saving playlist with database track IDs:", {
          title,
          description: description?.substring(0, 30) + "...",
          skipSpotify,
          playlistId,
          trackCount: dbTrackIds.length,
          hasCover: !!coverImageUrl
        });
        
        // Use the direct database ID endpoint
        response = await apiRequest("POST", "/api/v2/playlist/save", {
          userId: user.id,
          title,
          description: description || "", 
          coverImageUrl: coverImageUrl || "",
          dbTrackIds: dbTrackIds, // Use direct database IDs instead of track objects
          isPublic,
          skipSpotify,
          playlistId,
          articleTitle: articleData?.title || null,
          articleLink: articleData?.link || null
        });
      } else {
        // No database IDs available, use the standard track objects
        console.log("Using standard track objects for playlist save:", validTracks.length);
        
        // Log attempt for debugging
        console.log("Attempting to save playlist with v2 API:", {
          title,
          description: description?.substring(0, 30) + "...",
          skipSpotify,
          playlistId,
          trackCount: validTracks.length,
          hasCover: !!coverImageUrl
        });
  
        // Use the new v2 endpoint for the simplified schema
        // Explicitly set article data to null if articleData is not provided
        // This ensures we don't accidentally get values from previous playlists
        response = await apiRequest("POST", "/api/v2/playlist/save", {
          userId: user.id,
          title,
          description: description || "", // Ensure we always send at least an empty string
          coverImageUrl: coverImageUrl || "", // Ensure we always send at least an empty string
          tracks: validTracks, // Use validated tracks
          isPublic,
          skipSpotify,
          playlistId,
          articleTitle: articleData ? articleData.title : null,
          articleLink: articleData ? articleData.link : null
        });
      }
      
      // Check if the response is ok before trying to parse JSON
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Save playlist error (${response.status}):`, errorText);
        throw new Error(`Server error ${response.status}: ${errorText || 'Unknown error'}`);
      }
      
      const data = await response.json();
      console.log("Playlist saved successfully with v2 API:", data);
      
      // Invalidate playlists cache to refresh sidebar and My Playlists page
      queryClient.invalidateQueries({ queryKey: ['/api/playlists'] });
      
      // Add a toast notification for successful database-only saves (skipSpotify=true)
      if (skipSpotify && !data.savedToSpotify) {
        toast({
          title: "Playlist saved to Songfuse",
          description: "Your playlist has been saved to your Songfuse account.",
          variant: "default"
        });
      }
      
      return data;
    } catch (error) {
      console.error("Error saving playlist with v2 API:", error);
      
      // Create a more detailed error message
      let errorMessage = "An unexpected error occurred while saving your playlist.";
      
      if (error instanceof Error) {
        // If it's a network error (e.g., offline)
        if (error.message.includes('NetworkError') || error.message.includes('Failed to fetch')) {
          errorMessage = "Network error. Please check your internet connection and try again.";
        } 
        // If it contains a useful error message
        else if (error.message) {
          errorMessage = error.message;
        }
      }
      
      toast({
        title: "Save failed",
        description: skipSpotify 
          ? `Failed to save playlist to database: ${errorMessage}` 
          : `Failed to save playlist to Spotify: ${errorMessage}`,
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };
  
  // Save playlist to database ONLY (not to Spotify) 
  // Used for automatic saving when a playlist is generated
  const savePlaylistToDatabase = async (
    title: string,
    description: string,
    coverImageUrl: string,
    tracks: SpotifyTrack[],
    playlistId?: number | null,
    articleData?: { title: string, link: string } | null
  ): Promise<{
    id: number;
    spotifyId: string | null;
    spotifyUrl: string | null;
    savedToSpotify: boolean;
  } | null> => {
    // IMPORTANT: We need to set skipSpotify=true to prevent automatic Spotify saving
    // This ensures the playlist is only saved to our database until the user explicitly chooses to save to Spotify
    return savePlaylist(title, description, coverImageUrl, tracks, true, true, playlistId, articleData);
  };

  // Get user's playlists
  const getPlaylists = async () => {
    if (!user) return [];

    setIsLoading(true);
    try {
      // Log the request for debugging
      console.log("Making GET request to /api/v2/playlists?userId=" + user.id + " with headers:", {
        "Accept": "application/json"
      });
      
      // Use api/v2 endpoint if available, fallback to api/playlists
      let response;
      try {
        response = await fetch(`/api/v2/playlists?userId=${user.id}`, {
          headers: {
            "Accept": "application/json"
          }
        });
        
        // If v2 endpoint returns an error, fall back to original endpoint
        if (!response.ok) {
          console.log("V2 endpoint failed, falling back to original endpoint");
          response = await fetch(`/api/playlists?userId=${user.id}`, {
            headers: {
              "Accept": "application/json"
            }
          });
        }
      } catch (v2Error) {
        console.warn("Error using v2 endpoint, falling back to original endpoint:", v2Error);
        response = await fetch(`/api/playlists?userId=${user.id}`, {
          headers: {
            "Accept": "application/json"
          }
        });
      }
      
      if (!response.ok) {
        throw new Error("Failed to fetch playlists");
      }
      
      const data = await response.json();
      console.log("Playlists from API:", data);
      return data;
    } catch (error) {
      console.error("Error fetching playlists:", error);
      toast({
        title: "Fetch failed",
        description: "Failed to fetch your playlists. Please try again.",
        variant: "destructive"
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  // Get a playlist's details
  const getPlaylistDetails = async (spotifyId: string) => {
    if (!user) return null;

    setIsLoading(true);
    try {
      // Use the v2 endpoint for playlist details
      const response = await fetch(`/api/v2/playlist/${spotifyId}?userId=${user.id}`);
      
      if (!response.ok) {
        throw new Error("Failed to fetch playlist details");
      }
      
      const data = await response.json();
      console.log("Playlist details fetched with v2 API:", data);
      return data;
    } catch (error) {
      console.error("Error fetching playlist details with v2 API:", error);
      toast({
        title: "Fetch failed",
        description: "Failed to fetch playlist details. Please try again.",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // Get alternative track suggestions
  const getTrackReplacements = async (
    originalTrack: SpotifyTrack,
    sessionId: string
  ): Promise<SpotifyTrack[]> => {
    if (!user) return [];

    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/track/replace", {
        userId: user.id,
        originalTrack,
        sessionId
      });
      
      const data = await response.json();
      return data.tracks || [];
    } catch (error) {
      console.error("Error getting track replacements:", error);
      toast({
        title: "Failed to find alternatives",
        description: "Could not find replacement tracks. Please try again.",
        variant: "destructive"
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  // Improve playlist with AI
  const improvePlaylist = async (
    playlistId: number,
    title: string,
    description: string,
    tracks: SpotifyTrack[],
    improvementPrompt: string,
    sessionId: string
  ): Promise<{
    title: string;
    description: string;
    tracks: SpotifyTrack[];
  } | null> => {
    if (!user) {
      toast({
        title: "Not logged in",
        description: "Please log in to improve this playlist",
        variant: "destructive"
      });
      return null;
    }

    setIsImprovingPlaylist(true);
    try {
      const response = await apiRequest("POST", "/api/playlist/improve", {
        userId: user.id,
        playlistId,
        title,
        description,
        tracks,
        improvementPrompt,
        sessionId
      });
      
      const data = await response.json();
      
      console.log("Response from AI improvement:", data);
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      // Check if we got valid new data
      const updatedTitle = data.title || title;
      const updatedDescription = data.description || description;
      
      console.log("Playlist improvement changes:", {
        titleChanged: updatedTitle !== title,
        descriptionChanged: updatedDescription !== description,
        originalTitle: title,
        newTitle: updatedTitle,
        originalDescription: description,
        newDescription: updatedDescription
      });
      
      return {
        title: updatedTitle,
        description: updatedDescription,
        tracks: data.tracks || tracks
      };
    } catch (error) {
      console.error("Error improving playlist:", error);
      toast({
        title: "Improvement failed",
        description: "Failed to improve the playlist. Please try again.",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsImprovingPlaylist(false);
    }
  };

  // Fetch cover image for a chat session (used for polling)
  const fetchCoverImage = async (sessionId: string): Promise<string | null> => {
    if (!user) return null;

    setIsFetchingCover(true);
    try {
      const response = await fetch(`/api/chat/${sessionId}/cover?userId=${user.id}`);
      
      if (response.status === 202) {
        // Status 202 means the cover is still being generated
        return null;
      }
      
      if (!response.ok) {
        throw new Error("Failed to fetch cover image");
      }
      
      const data = await response.json();
      return data.coverImageUrl || null;
    } catch (error) {
      console.error("Error fetching cover image:", error);
      return null;
    } finally {
      setIsFetchingCover(false);
    }
  };

  // Generate a playlist using the Enhanced Direct API
  const generatePlaylistWithEnhancedDirect = async (prompt: string, sessionId: string, articleData?: { title: string; link: string }): Promise<{
    message: string;
    playlist: GeneratedPlaylist;
    suggestions?: string[];
  } | null> => {
    if (!user) {
      toast({
        title: "Not logged in",
        description: "Please log in to generate a playlist",
        variant: "destructive"
      });
      return null;
    }

    setIsLoading(true);
    try {
      console.log("Using Enhanced Direct API...");
      
      const response = await fetch("/_songfuse_api/playlist/simple-direct", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({ 
          userId: user.id,
          sessionId,
          prompt
        })
      });
      
      if (!response.ok) {
        console.error("Enhanced Direct API request failed with status:", response.status);
        const errorText = await response.text();
        console.error("Error response text:", errorText);
        throw new Error(`API request failed with status ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      console.log("Enhanced Direct API response:", data);
      
      if (!data.success) {
        throw new Error(data.message || "Failed to generate playlist");
      }
      
      // Convert the Enhanced Direct API response to our expected format
      const playlist: GeneratedPlaylist = {
        id: `enhanced-${Date.now()}`,
        title: data.title || ``,
        description: data.description || ``,
        tracks: data.tracks ? data.tracks.map((track: any, index: number) => ({
          id: track.id.toString(),
          name: track.title || `Track ${index + 1}`,
          artists: track.artist_names?.map((name: string) => ({ name })) || [{ name: 'Unknown Artist' }],
          album: { 
            name: track.album_name || 'Unknown Album',
            images: track.album_cover ? [{ url: track.album_cover }] : []
          },
          duration_ms: track.duration ? track.duration * 1000 : 180000, // Convert seconds to milliseconds
          preview_url: track.previewUrl || null,
          external_urls: { spotify: track.spotify_url || '' },
          uri: track.spotify_id ? `spotify:track:${track.spotify_id}` : `spotify:track:${track.id}`,
          track_number: index + 1,
          disc_number: 1,
          explicit: track.explicit || false,
          popularity: track.popularity || 50,
          available_markets: [],
          external_ids: {},
          href: '',
          type: 'track',
          // Add database ID for frontend compatibility
          dbId: track.id,
          // Add Spotify ID for embed compatibility
          spotify_id: track.spotify_id
        })) : data.songs.map((songId: string, index: number) => ({
          id: songId,
          name: `Track ${index + 1}`,
          artists: [{ name: 'Unknown Artist' }],
          album: { name: 'Unknown Album' },
          duration_ms: 180000,
          preview_url: null,
          external_urls: { spotify: '' },
          uri: `spotify:track:${songId}`,
          track_number: index + 1,
          disc_number: 1,
          explicit: false,
          popularity: 50,
          available_markets: [],
          external_ids: {},
          href: '',
          type: 'track',
          dbId: parseInt(songId)
        })),
        coverImageUrl: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        userId: user.id,
        isPublic: false,
        spotifyId: null,
        spotifyUrl: null
      };
      
      return {
        message: data.message || `Playlist generated using ${data.strategy} strategy`,
        playlist,
        suggestions: []
      };
      
    } catch (error) {
      console.error("Error generating playlist with Enhanced Direct API:", error);
      toast({
        title: "Generation failed",
        description: "Failed to generate playlist. Please try again.",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // Generate a playlist directly with Assistant API (no MCP)
  const generatePlaylistWithDirectAssistant = async (prompt: string, sessionId: string, articleData?: { title: string; link: string }): Promise<{
    message: string;
    playlist: GeneratedPlaylist;
    suggestions?: string[];
  } | null> => {
    if (!user) {
      toast({
        title: "Not logged in",
        description: "Please log in to generate a playlist",
        variant: "destructive"
      });
      return null;
    }

    setIsLoading(true);
    try {
      console.log("Using direct Assistant API with improved implementation...");
      
      // First, connect to the progress WebSocket for real-time updates
      console.log('Connecting to progress WebSocket...');
      
      // Set up WebSocket connection to track progress
      const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const wsUrl = `${scheme}://${window.location.host}/ws`;
      
      console.log(`Opening WebSocket connection to ${wsUrl}`);
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log('Progress WebSocket connected');
        // Subscribe to the session
        ws.send(JSON.stringify({ type: 'subscribe', sessionId }));
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Progress WebSocket message:', data);
          // Handle progress updates here
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
      
      ws.onerror = (error) => {
        console.error('Progress WebSocket error:', error);
      };
      
      ws.onclose = () => {
        console.log('Progress WebSocket disconnected');
      };
      
      // Send request to the special direct assistant endpoint that bypasses Vite middleware
      console.log("Making direct assistant API request with prompt:", prompt.substring(0, 30) + "...");
      
      // Use fetch directly to access the special endpoint
      const response = await fetch("/_songfuse_api/playlist/direct-assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({ 
          userId: user.id,
          sessionId,
          prompt,
          articleData
        })
      });
      
      if (!response.ok) {
        console.error("Direct Assistant API request failed with status:", response.status);
        const errorText = await response.text();
        console.error("Error response text:", errorText);
        throw new Error(`API request failed with status ${response.status}: ${errorText}`);
      }
      
      console.log("Direct Assistant API response received");
      
      // Parse the initial response
      let initialData;
      try {
        // Get the raw text first for debugging
        const responseText = await response.text();
        console.log('Raw response text:', responseText.substring(0, 1000) + '...');
        
        // If the response starts with "<!", it's likely HTML and not JSON
        if (responseText.trim().startsWith('<!')) {
          console.error('Received HTML instead of JSON');
          console.error('First 1000 characters of HTML:', responseText.substring(0, 1000));
          throw new Error('Server returned HTML instead of JSON - possible server error');
        }
        
        // Try to parse it as JSON
        try {
          initialData = JSON.parse(responseText);
          console.log('Initial response data successfully parsed', initialData);
        } catch (error) {
          const jsonError = error as Error;
          console.error('JSON parsing error:', jsonError.message);
          
          // Log the first portion of the response for debugging
          if (responseText.length > 0) {
            console.error('First 100 chars that failed parsing:', responseText.substring(0, 100));
            
            // Try to detect if it's an HTML response
            if (responseText.includes('<!DOCTYPE') || responseText.includes('<html')) {
              throw new Error('Server returned HTML page instead of JSON (possible server error)');
            }
          }
          
          throw new Error(`Invalid JSON response from server: ${jsonError.message}`);
        }
      } catch (parseError) {
        console.error('Failed to parse initial response JSON:', parseError);
        throw new Error('Error reading server response: ' + (parseError instanceof Error ? parseError.message : String(parseError)));
      }
      
      // Process the direct assistant response
      console.log("Processing direct assistant response");
      
      if (!initialData.success) {
        console.error("Direct Assistant API reported an error:", initialData.message);
        throw new Error(initialData.message || "Failed to generate playlist");
      }
      
      // Parse the response into the format our app expects
      let responseData: any;
      
      if (initialData.response) {
        responseData = initialData.response;
      } else if (initialData.rawResponse) {
        try {
          // Try to extract structured playlist data from the raw response
          // First, check if it contains a JSON block
          const jsonMatch = initialData.rawResponse.match(/```json\n([\s\S]*?)\n```/);
          if (jsonMatch && jsonMatch[1]) {
            try {
              // Try to parse the extracted JSON
              responseData = JSON.parse(jsonMatch[1]);
            } catch (e) {
              console.log("Failed to parse JSON from markdown block:", e);
              responseData = { text: initialData.rawResponse };
            }
          } else {
            // No JSON block found, treat as text
            responseData = { text: initialData.rawResponse };
          }
        } catch (e) {
          // If parsing fails, just show the raw text
          responseData = { text: initialData.rawResponse };
        }
      } else {
        throw new Error("No data in response");
      }
      
      console.log("Processed response data:", responseData);
      
      // Close the WebSocket connection since we don't need it anymore
      ws.close();
      
      // Extract songs from the response
      const parsedSongs = [];
      
      if (responseData.songs && Array.isArray(responseData.songs)) {
        // Songs already in structured format
        for (const song of responseData.songs) {
          if (typeof song === "string") {
            // Format: "Title:>Artist:>DbId" or "Title by Artist"
            let title = song;
            let artist = "";
            let dbId = null;
            
            if (song.includes(":>")) {
              const parts = song.split(":>");
              title = parts[0] || "";
              artist = parts[1] || "";
              
              // Check if there's a database ID as the third part
              if (parts.length >= 3 && parts[2] && !isNaN(parseInt(parts[2]))) {
                dbId = parseInt(parts[2]);
                console.log(`Extracted database ID ${dbId} from song: "${song}"`);
              }
            } else if (song.includes(" by ")) {
              const [songTitle, songArtist] = song.split(" by ");
              title = songTitle || "";
              artist = songArtist || "";
            }
            
            // Include the database ID if it was found
            parsedSongs.push({ 
              title, 
              artist,
              ...(dbId !== null ? { dbId } : {})
            });
          } else if (typeof song === "object") {
            // Object format
            parsedSongs.push({
              title: song.title || song.name || "",
              artist: song.artist || (song.artists ? (Array.isArray(song.artists) ? song.artists.join(", ") : song.artists) : "")
            });
          }
        }
      } else if (responseData.text) {
        // Try to extract songs from text
        console.log("Trying to extract songs from text response");
        
        // Look for JSON block in the text
        const jsonMatch = responseData.text.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch && jsonMatch[1]) {
          try {
            const jsonData = JSON.parse(jsonMatch[1]);
            if (jsonData.songs && Array.isArray(jsonData.songs)) {
              for (const song of jsonData.songs) {
                if (typeof song === "string") {
                  // Parse string format (same as above)
                  let title = song;
                  let artist = "";
                  let dbId = null;
                  
                  if (song.includes(":>")) {
                    const parts = song.split(":>");
                    title = parts[0] || "";
                    artist = parts[1] || "";
                    
                    // Check if there's a database ID as the third part
                    if (parts.length >= 3 && parts[2] && !isNaN(parseInt(parts[2]))) {
                      dbId = parseInt(parts[2]);
                      console.log(`Extracted database ID ${dbId} from song in JSON block: "${song}"`);
                    }
                  } else if (song.includes(" by ")) {
                    const [songTitle, songArtist] = song.split(" by ");
                    title = songTitle || "";
                    artist = songArtist || "";
                  }
                  
                  // Include the database ID if it was found
                  parsedSongs.push({ 
                    title, 
                    artist,
                    ...(dbId !== null ? { dbId } : {})
                  });
                } else if (typeof song === "object") {
                  // Object format
                  parsedSongs.push({
                    title: song.title || song.name || "",
                    artist: song.artist || (song.artists ? (Array.isArray(song.artists) ? song.artists.join(", ") : song.artists) : "")
                  });
                }
              }
            }
          } catch (e) {
            console.error("Error parsing JSON from text:", e);
          }
        }
      }
      
      // If we still don't have songs, try to extract from raw text by looking for patterns
      if (parsedSongs.length === 0 && typeof initialData.rawResponse === 'string') {
        console.log("Attempting to extract songs from raw text response");
        const rawText = initialData.rawResponse;
        
        // Try to detect if the response has a list of songs in the format "1. Song Title by Artist"
        const songListRegex = /\d+\.\s+["']?([^"'\n]+)["']?\s+by\s+["']?([^"'\n]+)["']?/gi;
        let match;
        
        while ((match = songListRegex.exec(rawText)) !== null) {
          if (match[1] && match[2]) {
            parsedSongs.push({
              title: match[1].trim(),
              artist: match[2].trim()
            });
          }
        }
        
        // If still no songs, try alternative format "- Song Title - Artist"
        if (parsedSongs.length === 0) {
          const altFormatRegex = /-\s+["']?([^"'\n-]+)["']?\s+-\s+["']?([^"'\n]+)["']?/gi;
          
          while ((match = altFormatRegex.exec(rawText)) !== null) {
            if (match[1] && match[2]) {
              parsedSongs.push({
                title: match[1].trim(),
                artist: match[2].trim()
              });
            }
          }
        }
        
        // Try one more format: "Song Title" by Artist
        if (parsedSongs.length === 0) {
          const quotedFormatRegex = /["']([^"']+)["']\s+by\s+([^,\n]+)/gi;
          
          while ((match = quotedFormatRegex.exec(rawText)) !== null) {
            if (match[1] && match[2]) {
              parsedSongs.push({
                title: match[1].trim(),
                artist: match[2].trim()
              });
            }
          }
        }
        
        console.log(`Extracted ${parsedSongs.length} songs from raw text response`);
      }
      
      console.log(`Parsed ${parsedSongs.length} songs from response`);
      
      if (parsedSongs.length === 0) {
        console.error("No songs found in response");
        throw new Error("No songs found in the Assistant's response");
      }
      
      // Define proper types for our songs
      interface ParsedSong {
        title: string;
        artist: string;
        dbId?: number;
      }
      
      // Type assertion to help TypeScript
      const typedParsedSongs = parsedSongs as ParsedSong[];
      
      // Check if we have database IDs for the tracks
      const songsWithDbIds = typedParsedSongs.filter(song => song.dbId !== undefined);
      console.log(`${songsWithDbIds.length} out of ${typedParsedSongs.length} songs have database IDs`);
      
      let foundTracks = [];
      
      // If all songs have database IDs, use the direct ID lookup endpoint
      if (songsWithDbIds.length > 0) {
        // Extract the database IDs
        const dbIds = songsWithDbIds.map(song => song.dbId);
        console.log("Using direct database IDs:", dbIds);
        
        // Use the direct tracks-by-ids endpoint
        const directResponse = await fetch("/api/direct/tracks-by-ids", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            trackIds: dbIds
          })
        });
        
        if (!directResponse.ok) {
          console.error("Direct ID lookup failed:", directResponse.status);
          
          // Fall back to search only if we must
          if (songsWithDbIds.length < parsedSongs.length) {
            console.log("Some songs were missing IDs, falling back to search");
          } else {
            throw new Error(`Direct ID lookup failed with status ${directResponse.status}`);
          }
        } else {
          // Process the direct lookup results
          const directResults = await directResponse.json();
          
          if (directResults.success && directResults.tracks) {
            foundTracks = directResults.tracks;
            console.log(`Found ${foundTracks.length} tracks via direct ID lookup`);
            
            // If we found all tracks, we can skip the search
            if (foundTracks.length === parsedSongs.length) {
              console.log("All tracks found via direct ID lookup, skipping search");
            }
          }
        }
      }
      
      // Only perform search if we have songs without database IDs or if direct lookup failed
      if (foundTracks.length < typedParsedSongs.length) {
        // Get songs that don't have database IDs
        const songsNeedingSearch = typedParsedSongs.filter(song => song.dbId === undefined);
        
        console.log(`Searching for ${songsNeedingSearch.length} songs without database IDs...`);
        const searchResponse = await fetch("/api/discover/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            songs: songsNeedingSearch.map(song => ({
              title: song.title,
              artist: song.artist,
              query: `${song.title} ${song.artist}`.trim()
            }))
          })
        });
        
        if (!searchResponse.ok) {
          console.error("Search request failed:", searchResponse.status);
          
          // If we already have some tracks from direct lookup, continue with those
          if (foundTracks.length > 0) {
            console.log(`Continuing with ${foundTracks.length} tracks from direct lookup`);
          } else {
            throw new Error(`Search request failed with status ${searchResponse.status}`);
          }
        } else {
          // Parse the search results
          const searchResultText = await searchResponse.text();
          console.log("Search results (first 200 chars):", searchResultText.substring(0, 200) + "...");
          
          try {
            const searchResults = JSON.parse(searchResultText);
            console.log("Parsed search results:", searchResults);
            
            // Add the found tracks from search to our collection
            const searchedTracks = searchResults.results.filter(r => r.status === "found").map(r => r.track);
            foundTracks = [...foundTracks, ...searchedTracks];
          } catch (e) {
            console.error("Error parsing search results:", e);
            
            // If we already have tracks from direct lookup, continue with those
            if (foundTracks.length === 0) {
              throw new Error("Failed to parse search results");
            }
          }
        }
      }
      
      console.log(`Final count: Found ${foundTracks.length} out of ${typedParsedSongs.length} tracks`);
      
      // Deduplicate tracks based on database ID
      const uniqueTracks = [];
      const trackIds = new Set();
      
      for (const track of foundTracks) {
        if (!trackIds.has(track.dbId)) {
          uniqueTracks.push(track);
          trackIds.add(track.dbId);
        }
      }
      
      foundTracks = uniqueTracks;
      console.log(`After deduplication: ${foundTracks.length} unique tracks`);
      
      if (foundTracks.length === 0) {
        // No tracks found, suggest alternatives
        console.log("No tracks found, suggesting alternatives");
        return {
          message: "I couldn't find any of those songs in our database. Try a different prompt.",
          playlist: null,
          suggestions: [
            "Popular songs from the 2010s",
            "Classic rock anthems",
            "Modern pop hits with electronic elements",
            "Hip hop songs with melodic beats",
            "Relaxing acoustic indie music"
          ]
        };
      }
      
      // Create initial playlist with basic metadata from AI response
      let playlistTitle = responseData.title || responseData.playlist_title || `Playlist based on "${prompt.substring(0, 30)}..."`;
      let playlistDescription = responseData.description || responseData.playlist_description || `Generated from prompt: ${prompt.substring(0, 100)}...`;
      
      // Try to generate a better title and description using our GPT-4o endpoint
      try {
        console.log("Requesting improved title and description from metadata API...");
        const metadataResponse = await fetch('/api/playlist/generate-metadata', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            tracks: foundTracks,
            prompt: prompt
          })
        });
        
        if (metadataResponse.ok) {
          const metadataResult = await metadataResponse.json();
          
          if (metadataResult.success) {
            console.log("Generated improved title and description:", metadataResult);
            playlistTitle = metadataResult.title;
            playlistDescription = metadataResult.description;
          } else {
            console.warn("Metadata generation failed, using fallback values:", metadataResult.message);
          }
        } else {
          console.warn("Metadata API call failed, using fallback values:", metadataResponse.status);
        }
      } catch (metadataError) {
        console.error("Error generating improved metadata:", metadataError);
        // Continue with the original metadata
      }
      
      const playlist: GeneratedPlaylist = {
        title: playlistTitle,
        description: playlistDescription,
        tracks: foundTracks,
        coverImageUrl: "", // Will be generated later
        originalPrompt: prompt
      };
      
      // Return the results
      return {
        message: `Created a playlist with ${foundTracks.length} songs based on your request.`,
        playlist: playlist
      };
    } catch (error) {
      console.error("Error generating playlist with direct Assistant API:", error);
      toast({
        title: "Generation failed",
        description: error instanceof Error 
          ? `Failed to generate playlist: ${error.message}` 
          : "Failed to generate playlist. Please try the regular method.",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    isGeneratingCover,
    isImprovingPlaylist,
    isFetchingCover,
    isUploadingCover,
    generatePlaylist,
    generatePlaylistWithDirectAssistant,
    generatePlaylistWithEnhancedDirect,
    generateCoverImage,
    uploadCustomCover,
    fetchCoverImage,
    savePlaylist,
    savePlaylistToDatabase,
    getPlaylists,
    getPlaylistDetails,
    getTrackReplacements,
    improvePlaylist
  };
}
