import React from 'react';
import PlaylistCoverPlaceholder from './PlaylistCoverPlaceholder';
import { GeneratedPlaylist } from '@shared/schema';

interface PlaylistPreviewProps {
  playlist: GeneratedPlaylist;
  className?: string;
}

/**
 * A component to display a preview of a playlist with its cover image, title, and description
 */
const PlaylistPreview: React.FC<PlaylistPreviewProps> = ({ 
  playlist,
  className = ''
}) => {
  const { title, description, coverImageUrl } = playlist;
  // GeneratedPlaylist doesn't have spotifyImageUrl by default
  
  return (
    <div className={`p-6 h-full flex flex-col ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold font-sans text-foreground">Preview</h2>
      </div>
      
      <div className="flex-1 overflow-auto">
        <div className="aspect-square max-w-xs mx-auto bg-muted rounded-lg overflow-hidden">
          <PlaylistCoverPlaceholder 
            size="lg"
            imageUrl={coverImageUrl}
            spotifyImageUrl={undefined}
            altText={title}
          />
        </div>
        
        <div className="mt-4 text-center">
          <h3 className="text-xl font-bold text-foreground">{title}</h3>
          {description && (
            <p className="text-muted-foreground mt-2 text-sm">{description}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlaylistPreview;