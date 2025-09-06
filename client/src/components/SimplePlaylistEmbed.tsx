import React from 'react';

interface SimplePlaylistEmbedProps {
  playlistUrl: string;
  mini?: boolean;
}

const SimplePlaylistEmbed: React.FC<SimplePlaylistEmbedProps> = ({ playlistUrl, mini = false }) => {
  if (!playlistUrl || !playlistUrl.includes('spotify.com/playlist/')) {
    return null;
  }

  // Extract playlist ID
  const playlistId = playlistUrl.split('/playlist/')[1]?.split('?')[0];
  
  if (!playlistId) {
    return null;
  }

  // Use direct HTML string to avoid Replit metadata attributes
  const iframeHtml = `
    <iframe 
      style="border-radius:12px" 
      src="https://open.spotify.com/embed/playlist/${playlistId}?utm_source=generator" 
      width="100%" 
      height="${mini ? '152' : '352'}" 
      frameborder="0"
      allowfullscreen=""
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      loading="lazy">
    </iframe>
  `;
  
  return (
    <div 
      className="spotify-embed-container playlist" 
      style={{ 
        width: '100%',
        minHeight: mini ? '152px' : '352px',
      }}
      dangerouslySetInnerHTML={{ __html: iframeHtml }} 
    />
  );
};

export default SimplePlaylistEmbed;