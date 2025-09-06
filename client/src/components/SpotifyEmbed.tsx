import { useState, useEffect, useRef } from 'react';

interface SpotifyEmbedProps {
  trackId: string;
  mini?: boolean;
}

// This is a completely revised version of the Spotify embed using their most current API
const SpotifyEmbed = ({ trackId, mini = true }: SpotifyEmbedProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [formattedId, setFormattedId] = useState<string | null>(null);
  const [embedError, setEmbedError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  // Process the trackId to ensure it's in the correct format for embedding
  useEffect(() => {
    if (!trackId || typeof trackId !== 'string') {
      setFormattedId(null);
      setEmbedError(true);
      return;
    }
    
    try {
      // Handle different Spotify ID formats
      let cleanId = trackId;
      
      // If ID begins with "spotify:track:"
      if (trackId.startsWith('spotify:track:')) {
        cleanId = trackId.replace('spotify:track:', '');
      } 
      // If ID is a full URL
      else if (trackId.includes('open.spotify.com/track/')) {
        cleanId = trackId.split('track/')[1]?.split('?')[0] || trackId;
      }
      
      // Validate the ID format (Spotify IDs are typically 22 characters)
      if (cleanId && cleanId.length > 5) {
        setFormattedId(cleanId);
        setEmbedError(false);
      } else {
        console.warn('Invalid Spotify track ID format:', trackId);
        setEmbedError(true);
        setFormattedId(null);
      }
    } catch (err) {
      console.error('Error processing Spotify track ID:', err);
      setEmbedError(true);
      setFormattedId(null);
    }
  }, [trackId]);

  // Inject the Spotify embed script after the component mounts
  useEffect(() => {
    // Skip if embed is not expanded or there's no ID
    if ((!isExpanded && mini) || !formattedId) return;
    
    // Check if the Spotify embed script is already loaded
    const scriptId = 'spotify-embed-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement;
    
    if (!script) {
      // Create and append the script if it doesn't exist
      script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://open.spotify.com/embed/iframe-api/v1';
      script.async = true;
      script.defer = true;
      
      // Upon script load, initialize embeds
      script.onload = () => {
        if (window.SpotifyIframeApi) {
          window.SpotifyIframeApi.createController(iframeRef.current as HTMLElement, {
            width: '100%',
            height: 80,
            uri: `spotify:track:${formattedId}`
          }, (embeddedController) => {
            // Embed successful
            console.log('Spotify embed loaded successfully');
          });
        } else {
          console.error('SpotifyIframeApi not available after script load');
          setEmbedError(true);
        }
      };
      
      // Handle script load error
      script.onerror = () => {
        console.error('Failed to load Spotify embed script');
        setEmbedError(true);
      };
      
      document.body.appendChild(script);
    } else if (window.SpotifyIframeApi && iframeRef.current) {
      // Script already exists, just initialize the embed
      try {
        window.SpotifyIframeApi.createController(iframeRef.current as HTMLElement, {
          width: '100%',
          height: 80,
          uri: `spotify:track:${formattedId}`
        }, (embeddedController) => {
          // Embed successful
          console.log('Spotify embed loaded successfully');
        });
      } catch (error) {
        console.error('Error initializing Spotify embed:', error);
        setEmbedError(true);
      }
    }
  }, [formattedId, isExpanded, mini]);
  
  // For mini player that expands on click
  if (mini && !isExpanded) {
    return (
      <button 
        onClick={() => setIsExpanded(true)}
        disabled={!formattedId || embedError}
        className={`spotify-button border px-3 py-1 rounded-full text-xs flex items-center ${
          !formattedId || embedError ? 'opacity-50 cursor-not-allowed' : 'hover:bg-accent/80'
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        </svg>
        <svg 
          className="h-3 w-3 mr-1" 
          viewBox="0 0 24 24" 
          fill="#1DB954"
        >
          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.48.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
        </svg>
        {formattedId ? 'Play on Spotify' : 'Spotify Unavailable'}
      </button>
    );
  }
  
  // Show error state if embed can't be created
  if (!formattedId || embedError) {
    return (
      <div className="flex items-center justify-center h-20 bg-muted/30 text-muted-foreground text-sm rounded">
        {trackId ? (
          <a 
            href={trackId.includes('spotify:') || trackId.includes('spotify.com') ? trackId : `https://open.spotify.com/track/${trackId}`}
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center text-xs px-3 py-1 border rounded-full hover:bg-accent/50 transition-colors"
          >
            <svg 
              className="h-4 w-4 mr-1" 
              viewBox="0 0 24 24" 
              fill="#1DB954"
            >
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.48.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
            </svg>
            Open in Spotify
          </a>
        ) : (
          <span>Spotify preview unavailable</span>
        )}
      </div>
    );
  }
  
  // Use simpler direct iframe approach with fallback
  return (
    <div className="relative z-10 w-full overflow-hidden rounded-lg" style={{ height: '80px' }}>
      {isExpanded && (
        <button 
          onClick={() => setIsExpanded(false)}
          className="absolute top-2 right-2 z-30 bg-black/50 hover:bg-black/70 text-white rounded-full p-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
      
      {/* Direct iframe - more reliable for most users */}
      <iframe 
        src={`https://open.spotify.com/embed/track/${formattedId}`}
        width="100%" 
        height="80"
        frameBorder="0" 
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
        style={{ 
          border: 'none',
          borderRadius: '8px',
          display: 'block'
        }}
        onError={() => setEmbedError(true)}
      ></iframe>
      
      {/* Fallback div for advanced Embed API - will be used if available */}
      <div 
        ref={iframeRef}
        className="absolute inset-0 z-20 bg-black"
        style={{ 
          opacity: 0,
          pointerEvents: 'none' 
        }}
      ></div>
    </div>
  );
};

// Add TypeScript definition for Spotify Embed API
declare global {
  interface Window {
    SpotifyIframeApi?: {
      createController: (
        element: HTMLElement,
        options: {
          width: string | number;
          height: number;
          uri: string;
        },
        callback: (controller: any) => void
      ) => void;
    }
  }
}

export default SpotifyEmbed;