import { useEffect, useState } from 'react';

interface YouTubeEmbedProps {
  videoId: string;
}

const SimpleYouTubeEmbed = ({ videoId }: YouTubeEmbedProps) => {
  const [formattedId, setFormattedId] = useState<string | null>(null);
  
  // Process the videoId to ensure it's in the correct format for embedding
  useEffect(() => {
    if (!videoId || typeof videoId !== 'string') {
      setFormattedId(null);
      return;
    }
    
    try {
      // Handle different YouTube ID formats
      let cleanId = videoId;
      
      // If ID is from our database with YOUTUBE_VIDEO:: prefix
      if (videoId.startsWith('YOUTUBE_VIDEO::')) {
        cleanId = videoId.replace('YOUTUBE_VIDEO::', '');
      }
      // If ID is a full URL (youtube.com/watch?v=)
      else if (videoId.includes('youtube.com/watch?v=')) {
        cleanId = new URL(videoId).searchParams.get('v') || '';
      } 
      // If ID is a youtu.be URL
      else if (videoId.includes('youtu.be/')) {
        cleanId = videoId.split('youtu.be/')[1]?.split('?')[0] || '';
      }
      // If ID is already in the right format (just the ID portion)
      else if (/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        cleanId = videoId;
      }
      
      // Make sure we have a valid ID format (basic check)
      if (cleanId && cleanId.length === 11) {
        setFormattedId(cleanId);
      } else {
        console.warn('Invalid YouTube video ID format:', videoId);
        setFormattedId(null);
      }
    } catch (err) {
      console.error('Error processing YouTube video ID:', err);
      setFormattedId(null);
    }
  }, [videoId]);
  
  if (!formattedId) {
    return null;
  }
  
  // Use direct HTML string to avoid Replit metadata attributes
  const iframeHtml = `
    <iframe 
      style="border-radius:12px" 
      src="https://www.youtube.com/embed/${formattedId}" 
      width="100%" 
      height="300" 
      frameBorder="0" 
      allowfullscreen="" 
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
      loading="lazy">
    </iframe>
  `;
  
  return (
    <div 
      className="youtube-embed-container w-full md:max-w-[50%]" 
      style={{ 
        minHeight: '300px',
      }}
      dangerouslySetInnerHTML={{ __html: iframeHtml }} 
    />
  );
};

export default SimpleYouTubeEmbed;