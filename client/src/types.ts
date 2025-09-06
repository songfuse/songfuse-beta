export interface Artist {
  id?: string;
  name: string;
}

export interface Album {
  name: string;
  images: {
    url: string;
  }[];
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: Artist[];
  album: Album;
  duration_ms: number;
  preview_url?: string;
  explicit?: boolean;
  popularity?: number;
  platforms?: {
    [platform: string]: {
      id: string;
      url?: string;
    }
  };
}

export interface GeneratedPlaylist {
  tracks: SpotifyTrack[];
  title: string;
  description: string;
  coverImageUrl?: string;
  originalPrompt?: string;
  sessionId?: string;
}

export interface PlaylistEditorProps {
  playlist: GeneratedPlaylist;
  onCancel: () => void;
  onCoverUpdate?: (newImageUrl: string) => void;
  originalPrompt?: string;
  onLoadingChange?: (isLoading: boolean) => void;
}

export interface ChatInterfaceProps {
  onPlaylistGenerated: (playlist: GeneratedPlaylist, originalPrompt: string, sessionId: string) => void;
}