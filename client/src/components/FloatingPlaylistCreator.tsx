import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, Music, Minimize2, Maximize2 } from 'lucide-react';
import ChatInterface from './ChatInterface';
import PlaylistEditor from './PlaylistEditor';
import SpotifyPlaylistImporter from './SpotifyPlaylistImporter';
import { usePlaylistCreator } from '@/contexts/PlaylistCreatorContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { GeneratedPlaylist } from '@shared/schema';
import { useLocation } from 'wouter';

// Breakpoint for mobile/tablet view (1024px = standard tablet landscape)
const MOBILE_TABLET_BREAKPOINT = 1024;

const FloatingPlaylistCreator: React.FC = () => {
  const [location] = useLocation();
  const { user } = useAuth();
  
  const { 
    isOpen, 
    isMinimized, 
    isLoading,
    generatedPlaylist, 
    databasePlaylistId,
    openCreator,
    closeCreator, 
    toggleMinimize, 
    setGeneratedPlaylist,
    setDatabasePlaylistId
  } = usePlaylistCreator();
  
  // Add state for responsive design
  const [isMobile, setIsMobile] = useState(false);
  
  // Add state for mobile menu height
  const [mobileMenuHeight, setMobileMenuHeight] = useState(80); // Default mobile menu height in pixels, a bit larger to ensure clearance
  
  // Add state for showing import mode
  const [showImportMode, setShowImportMode] = useState(false);
  
  // Update mobile state based on window size
  useEffect(() => {
    const checkMobile = () => {
      // Use constant for the breakpoint
      setIsMobile(window.innerWidth <= MOBILE_TABLET_BREAKPOINT);
    };
    
    // Check on initial render
    checkMobile();
    
    // Add event listener for window resize
    window.addEventListener('resize', checkMobile);
    
    // Cleanup
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  // Set mobile menu height based on actual menu element if it exists
  useEffect(() => {
    if (isMobile) {
      // Try to find the mobile menu element by searching for common navigation elements
      const mobileMenuElement = document.querySelector('.mobile-nav') || 
                              document.querySelector('#mobile-nav') || 
                              document.querySelector('nav[role="navigation"]') ||
                              document.querySelector('.bottom-nav') ||
                              document.querySelector('.navbar-mobile') ||
                              document.querySelector('.navigation-bottom');
      
      if (mobileMenuElement) {
        // Get the actual height
        const height = mobileMenuElement.getBoundingClientRect().height;
        if (height > 0) {
          setMobileMenuHeight(height);
        }
      }
    }
  }, [isMobile]);

  const handlePlaylistGenerated = (playlist: GeneratedPlaylist, originalPrompt: string, sessionId: string) => {
    // Log playlist tracks with database IDs for debugging
    console.log("Playlist generated with database IDs:", 
      playlist.tracks.map(track => ({
        name: track.name,
        dbId: track.dbId,
        id: track.id,
        artists: track.artists.map(a => a.name).join(', ')
      }))
    );
    
    // Create a deep copy of the playlist to avoid reference issues
    const playlistCopy: GeneratedPlaylist = {
      ...playlist,
      tracks: playlist.tracks.map(track => ({
        ...track,
        // Ensure database IDs are preserved
        dbId: track.dbId || undefined
      }))
    };
    
    console.log("Setting generated playlist in context:", playlistCopy.title);
    setGeneratedPlaylist(playlistCopy);
    
    // Reset database ID when a new playlist is generated
    setDatabasePlaylistId(null);
  };

  // Debug output for state
  console.log("FloatingPlaylistCreator state:", { isOpen, isMinimized, databasePlaylistId });

  // Hide the floating creator on playlist sharing link public pages or when not logged in
  if (location.startsWith('/share/') || !user) {
    return null;
  }

  // Always show the playlist creator, at least in minimized form
  // The isOpen state is no longer used for toggling visibility
  // Instead we'll always have the creator visible and just manage its minimized state

  // Right sidebar slider design
  return (
    <>
      {/* Backdrop overlay when sidebar is open on mobile */}
      {!isMinimized && isMobile && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 transition-opacity duration-300"
          onClick={() => toggleMinimize()}
        />
      )}

      {/* Sidebar toggle button when minimized - only show on desktop */}
      {isMinimized && !isMobile && (
        <div className="fixed right-2 top-2 z-50">
          <Button
            onClick={() => toggleMinimize()}
            disabled={isLoading}
            className={`${isLoading ? 'opacity-75 cursor-not-allowed' : ''}`}
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                <span className="text-sm font-medium">Creating...</span>
              </>
            ) : (
              <>
                <span className="text-sm font-medium">Create Playlist</span>
                <ChevronLeft className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      )}

      {/* Right sidebar */}
      <div 
        className={`fixed top-0 right-0 h-full z-50 bg-background border-l border-border shadow-2xl transition-transform duration-300 ease-in-out ${
          isMinimized ? 'translate-x-full' : 'translate-x-0'
        }`}
        style={{
          width: isMobile ? '100%' : '480px',
          maxWidth: isMobile ? '100%' : '90vw'
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 border-b border-border bg-gradient-to-r from-teal-50 to-green-50 dark:from-teal-950 dark:to-green-950" style={{ height: '69px' }}>
          <div>
            <h2 className="text-lg font-bold bg-gradient-to-r from-teal-600 to-[#1DB954] text-transparent bg-clip-text">
              {generatedPlaylist ? 'Edit Your Playlist' : 'Create New Playlist'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {generatedPlaylist ? 'Fine-tune your generated playlist' : 'Powered by AI music curation'}
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            {!showImportMode && !generatedPlaylist && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowImportMode(true)}
                className="flex items-center gap-1"
              >
                Import from Spotify
              </Button>
            )}
            {showImportMode && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowImportMode(false)}
              >
                Create New
              </Button>
            )}
            {generatedPlaylist && !showImportMode && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setGeneratedPlaylist(null)}
              >
                New Playlist
              </Button>
            )}
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => toggleMinimize()}
              disabled={isLoading}
              className={`${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isLoading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-transparent" />
              ) : (
                '→'
              )}
            </Button>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-hidden">
          <div 
            className="h-full overflow-y-auto"
            style={{ 
              height: 'calc(100vh - 69px)',
              paddingBottom: isMobile ? '80px' : '0px'
            }}
          >
            {showImportMode ? (
              <div className="p-4">
                <SpotifyPlaylistImporter />
              </div>
            ) : generatedPlaylist ? (
              <PlaylistEditor 
                playlist={generatedPlaylist}
                onCancel={() => setGeneratedPlaylist(null)}
                existingDatabaseId={databasePlaylistId}
                onDatabaseIdChange={(id) => setDatabasePlaylistId(id)}
              />
            ) : (
              <ChatInterface onPlaylistGenerated={handlePlaylistGenerated} />
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default FloatingPlaylistCreator;