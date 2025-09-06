import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

// Define types for our context
type PlaylistUpdateContextType = {
  lastUpdatedPlaylistId: number | null;
  notifyPlaylistUpdated: (playlistId: number, spotifyUrl?: string, coverImageUrl?: string) => void;
  notifyPlaylistCreated: (playlist: any) => void; // For newly created playlists
  resetNotification: () => void;
  triggerSidebarRefresh: () => void; // Force sidebar refresh
};

// Create context with default values
const PlaylistUpdateContext = createContext<PlaylistUpdateContextType>({
  lastUpdatedPlaylistId: null,
  notifyPlaylistUpdated: () => {},
  notifyPlaylistCreated: () => {},
  resetNotification: () => {},
  triggerSidebarRefresh: () => {},
});

// Create a provider component
export const PlaylistUpdateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lastUpdatedPlaylistId, setLastUpdatedPlaylistId] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const lastCreatedPlaylistRef = useRef<any>(null);

  // Function to update the last updated playlist ID and dispatch custom event
  const notifyPlaylistUpdated = useCallback((
    playlistId: number, 
    spotifyUrl?: string, 
    coverImageUrl?: string
  ) => {
    console.log(`Notifying that playlist ${playlistId} has been updated`, { 
      spotifyUrl, 
      coverImageUrl 
    });
    
    // Set the state for context consumers
    setLastUpdatedPlaylistId(playlistId);
    
    // Dispatch a custom event for components that need DOM-level updates
    const eventData = {
      playlistId,
      ...(spotifyUrl && { spotifyUrl }),
      ...(coverImageUrl && { coverImageUrl })
    };
    
    // Create and dispatch the event
    const event = new CustomEvent('playlist-updated', { 
      detail: eventData
    });
    window.dispatchEvent(event);
  }, []);

  // Function to notify that a new playlist has been created
  const notifyPlaylistCreated = useCallback((playlist: any) => {
    console.log(`Notifying that a new playlist has been created:`, playlist);
    
    // Store the created playlist in the ref
    lastCreatedPlaylistRef.current = playlist;
    
    // Set the state for context consumers
    setLastUpdatedPlaylistId(playlist.id);
    
    // Invalidate the playlists query to force a sidebar refresh
    queryClient.invalidateQueries({ queryKey: ['/api/playlists-with-counts'] });
    
    // Create and dispatch the event
    const event = new CustomEvent('playlist-created', { 
      detail: playlist
    });
    window.dispatchEvent(event);
  }, [queryClient]);

  // Function to force refresh the sidebar playlists
  const triggerSidebarRefresh = useCallback(() => {
    console.log("Triggering manual sidebar refresh");
    queryClient.invalidateQueries({ queryKey: ['/api/playlists-with-counts'] });
    
    // Dispatch event for any components listening for sidebar updates
    const event = new CustomEvent('sidebar-refresh-requested');
    window.dispatchEvent(event);
  }, [queryClient]);

  // Function to reset the notification
  const resetNotification = useCallback(() => {
    setLastUpdatedPlaylistId(null);
  }, []);

  return (
    <PlaylistUpdateContext.Provider 
      value={{ 
        lastUpdatedPlaylistId, 
        notifyPlaylistUpdated, 
        notifyPlaylistCreated,
        resetNotification,
        triggerSidebarRefresh
      }}
    >
      {children}
    </PlaylistUpdateContext.Provider>
  );
};

// Custom hook for using this context
export const usePlaylistUpdate = () => useContext(PlaylistUpdateContext);

export default PlaylistUpdateContext;