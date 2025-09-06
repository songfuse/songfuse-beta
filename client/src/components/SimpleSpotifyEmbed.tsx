import { useEffect, useState } from 'react';

interface SpotifyEmbedProps {
  trackId: string;
}

const SimpleSpotifyEmbed = ({ trackId }: SpotifyEmbedProps) => {
  const [formattedId, setFormattedId] = useState<string | null>(null);
  
  // Process the trackId to ensure it's in the correct format for embedding
  useEffect(() => {
    if (!trackId || typeof trackId !== 'string') {
      setFormattedId(null);
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
      // If ID is already in the right format (just the ID portion)
      else if (/^[a-zA-Z0-9]{22}$/.test(trackId)) {
        cleanId = trackId;
      }
      
      // Make sure we have a valid ID format (basic check)
      if (cleanId && cleanId.length > 5) {
        setFormattedId(cleanId);
      } else {
        console.warn('Invalid Spotify track ID format:', trackId);
        setFormattedId(null);
      }
    } catch (err) {
      console.error('Error processing Spotify track ID:', err);
      setFormattedId(null);
    }
  }, [trackId]);
  
  if (!formattedId) {
    return null;
  }
  
  // Use direct HTML string to avoid Replit metadata attributes
  const iframeHtml = `
    <iframe 
      style="border-radius:12px" 
      src="https://open.spotify.com/embed/track/${formattedId}?utm_source=generator" 
      width="100%" 
      height="80" 
      frameBorder="0" 
      allowfullscreen="" 
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" 
      loading="lazy">
    </iframe>
  `;
  
  return (
    <div 
      className="spotify-embed-container" 
      style={{ 
        width: '100%',
        minHeight: '80px',
      }}
      dangerouslySetInnerHTML={{ __html: iframeHtml }} 
    />
  );
};

export default SimpleSpotifyEmbed;