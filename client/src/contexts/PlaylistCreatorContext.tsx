import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { GeneratedPlaylist } from '@shared/schema';

// Define the shape of our stored data
interface StoredPlaylistState {
  isOpen: boolean;
  isMinimized: boolean;
  generatedPlaylist: GeneratedPlaylist | null;
  lastUpdated: number;
  databasePlaylistId: number | null; // Store the database ID to avoid duplicate saves
  initialPrompt: string | null; // Store initial prompt to auto-submit
  articleData: {
    title: string;
    link: string;
  } | null; // Store article data for news-inspired playlists
}

// Define article data interface for consistency
export interface ArticleData {
  title: string;
  link: string;
}

type PlaylistCreatorContextType = {
  isOpen: boolean;
  isMinimized: boolean;
  isLoading: boolean;
  generatedPlaylist: GeneratedPlaylist | null;
  databasePlaylistId: number | null;
  initialPrompt: string | null;
  articleData: ArticleData | null;
  openCreator: (prompt?: string, articleData?: ArticleData) => void;
  closeCreator: () => void;
  toggleMinimize: () => void;
  setGeneratedPlaylist: (playlist: GeneratedPlaylist | null) => void;
  setDatabasePlaylistId: (id: number | null) => void;
  setInitialPrompt: (prompt: string | null) => void;
  setArticleData: (data: ArticleData | null) => void;
  setIsLoading: (loading: boolean) => void;
};

const STORAGE_KEY = 'songfuse_playlist_creator_state';

// Helper to load state from localStorage
const loadStateFromStorage = (): StoredPlaylistState | null => {
  try {
    const storedData = localStorage.getItem(STORAGE_KEY);
    if (!storedData) return null;
    
    const parsedData = JSON.parse(storedData) as StoredPlaylistState;
    
    // Check if data is stale (older than 1 hour)
    const isStale = Date.now() - parsedData.lastUpdated > 60 * 60 * 1000;
    if (isStale) return null;
    
    // Ensure database IDs are preserved when we load playlists from storage
    if (parsedData.generatedPlaylist?.tracks) {
      console.log('Verifying track database IDs from localStorage:', 
        parsedData.generatedPlaylist.tracks.map(t => ({
          name: t.name,
          dbId: t.dbId,
          id: t.id
        }))
      );
    }
    
    return parsedData;
  } catch (error) {
    console.error('Error loading playlist creator state:', error);
    return null;
  }
};

// Helper to save state to localStorage
const saveStateToStorage = (state: StoredPlaylistState) => {
  try {
    // Log track database IDs before saving to localStorage
    if (state.generatedPlaylist?.tracks) {
      console.log('Saving tracks to localStorage with database IDs:', 
        state.generatedPlaylist.tracks.map(t => ({
          name: t.name,
          dbId: t.dbId,
          id: t.id
        }))
      );
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...state,
      lastUpdated: Date.now()
    }));
  } catch (error) {
    console.error('Error saving playlist creator state:', error);
  }
};

const PlaylistCreatorContext = createContext<PlaylistCreatorContextType | undefined>(undefined);

export const PlaylistCreatorProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Initialize state from localStorage or defaults
  const storedState = loadStateFromStorage();
  
  console.log("PlaylistCreatorProvider loading state from storage:", storedState);
  
  // Always keep isOpen as true to ensure the creator is always visible
  const [isOpen, setIsOpen] = useState(true);
  const [isMinimized, setIsMinimized] = useState<boolean>(storedState?.isMinimized ?? true);
  const [isLoading, setIsLoading] = useState(false);
  const [generatedPlaylist, setGeneratedPlaylist] = useState<GeneratedPlaylist | null>(
    storedState?.generatedPlaylist || null
  );
  const [databasePlaylistId, setDatabasePlaylistId] = useState<number | null>(
    storedState?.databasePlaylistId || null
  );
  const [initialPrompt, setInitialPrompt] = useState<string | null>(
    storedState?.initialPrompt || null
  );
  const [articleData, setArticleData] = useState<ArticleData | null>(
    storedState?.articleData || null
  );
  
  // Log when database ID changes
  const updateDatabasePlaylistId = (id: number | null) => {
    console.log("Context updating database playlist ID:", id);
    setDatabasePlaylistId(id);
  };

  // Update localStorage whenever state changes
  useEffect(() => {
    console.log('Saving playlist creator state to localStorage:', { 
      isOpen, 
      isMinimized,
      playlistId: databasePlaylistId,
      hasPrompt: !!initialPrompt,
      hasArticleData: !!articleData
    });
    saveStateToStorage({
      isOpen,
      isMinimized,
      generatedPlaylist,
      lastUpdated: Date.now(),
      databasePlaylistId,
      initialPrompt,
      articleData
    });
  }, [isOpen, isMinimized, generatedPlaylist, databasePlaylistId, initialPrompt, articleData]);

  // Reset playlistId when generatedPlaylist is null
  useEffect(() => {
    if (generatedPlaylist === null) {
      setDatabasePlaylistId(null);
    }
  }, [generatedPlaylist]);

  const openCreator = (prompt?: string, article?: ArticleData) => {
    console.log("OpenCreator called with:", { prompt, article, currentState: { isOpen, isMinimized } });
    
    // isOpen is always true, so we just need to expand the creator
    setIsMinimized(false);
    
    // If a prompt is provided, store it to be picked up by the ChatInterface
    if (prompt) {
      console.log("Setting initial prompt:", prompt);
      setInitialPrompt(prompt);
    }
    
    // If article data is provided, store it for attaching to the saved playlist
    if (article) {
      console.log("Setting article data:", article);
      setArticleData(article);
    }
    
    console.log("OpenCreator completed, new state should be:", { isOpen: true, isMinimized: false });
  };

  const closeCreator = () => {
    // Instead of closing completely, just minimize
    setIsMinimized(true);
    
    // Clear any initial prompt when closing
    setInitialPrompt(null);
  };

  const toggleMinimize = () => {
    console.log("Toggle minimize called. Current state:", isMinimized);
    setIsMinimized(prev => !prev);
  };

  return (
    <PlaylistCreatorContext.Provider
      value={{
        isOpen,
        isMinimized,
        isLoading,
        generatedPlaylist,
        databasePlaylistId,
        initialPrompt,
        articleData,
        openCreator,
        closeCreator,
        toggleMinimize,
        setGeneratedPlaylist,
        setDatabasePlaylistId: updateDatabasePlaylistId,
        setInitialPrompt,
        setArticleData,
        setIsLoading
      }}
    >
      {children}
    </PlaylistCreatorContext.Provider>
  );
};

export const usePlaylistCreator = (): PlaylistCreatorContextType => {
  const context = useContext(PlaylistCreatorContext);
  if (context === undefined) {
    throw new Error('usePlaylistCreator must be used within a PlaylistCreatorProvider');
  }
  return context;
};