import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Play, Eye, Music, Headphones } from "lucide-react";
import { SiSpotify, SiApplemusic, SiYoutube, SiAmazonmusic, SiTidal } from "react-icons/si";

interface SmartLinkData {
  id: number;
  shareId: string;
  playlistId: number;
  promotedTrackId: number;
  customCoverImage?: string;
  title: string;
  description?: string;
  views: number;
  playlist: {
    id: number;
    title: string;
    description?: string;
    coverImageUrl?: string;
  };
  songs: Array<{
    id: number;
    title: string;
    artist: string;
    album?: string;
    duration?: number;
    spotifyId?: string;
    youtubeId?: string;
    appleMusicId?: string;
    amazonMusicId?: string;
    tidalId?: string;
    deezerId?: string;
  }>;
}

const platformConfig = {
  spotify: {
    icon: SiSpotify,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    name: "Spotify",
    baseUrl: "https://open.spotify.com/track/"
  },
  apple: {
    icon: SiApplemusic,
    color: "text-gray-800",
    bgColor: "bg-gray-800/10", 
    name: "Apple Music",
    baseUrl: "https://music.apple.com/song/"
  },
  youtube: {
    icon: SiYoutube,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    name: "YouTube",
    baseUrl: "https://youtube.com/watch?v="
  },
  amazon: {
    icon: SiAmazonmusic,
    color: "text-blue-600",
    bgColor: "bg-blue-600/10",
    name: "Amazon Music",
    baseUrl: "https://music.amazon.com/tracks/"
  },
  tidal: {
    icon: SiTidal,
    color: "text-cyan-600",
    bgColor: "bg-cyan-600/10",
    name: "Tidal",
    baseUrl: "https://tidal.com/browse/track/"
  },
  deezer: {
    icon: Music,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    name: "Deezer",
    baseUrl: "https://deezer.com/track/"
  }
};

export default function SmartLink() {
  const [, params] = useRoute('/share/:shareId');
  const shareId = params?.shareId;

  const { data: smartLinkData, isLoading, error } = useQuery<SmartLinkData>({
    queryKey: ['/api/smart-links', shareId],
    enabled: !!shareId,
    refetchInterval: 15000, // Refetch every 15 seconds to get updated view counts
    refetchIntervalInBackground: true, // Continue refetching even when tab is not active
  });

  const [currentTrack, setCurrentTrack] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="animate-spin w-8 h-8 border-2 border-white border-t-transparent rounded-full mx-auto mb-4"></div>
          <p>Loading shared playlist...</p>
        </div>
      </div>
    );
  }

  if (error || !smartLinkData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-white text-center max-w-md mx-auto p-6">
          <Music className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <h1 className="text-2xl font-bold mb-2">Playlist Not Found</h1>
          <p className="text-gray-300">This shared playlist link may have expired or been removed.</p>
        </div>
      </div>
    );
  }

  const promotedTrack = smartLinkData.songs.find(song => song.id === smartLinkData.promotedTrackId);
  const otherTracks = smartLinkData.songs.filter(song => song.id !== smartLinkData.promotedTrackId);

  const getPlatformLinks = (song: SmartLinkData['songs'][0]) => {
    const links = [];
    
    // Check for new platformLinks format first (from external songs)
    if ((song as any).platformLinks) {
      return Object.entries((song as any).platformLinks).map(([platform, data]: [string, any]) => ({
        platform: platform.replace('_', ''),
        id: data.id,
        url: data.url
      }));
    }
    
    // Fallback to old format for existing tracks
    if (song.spotifyId) links.push({ platform: 'spotify', id: song.spotifyId });
    if (song.appleMusicId) links.push({ platform: 'apple', id: song.appleMusicId });
    if (song.youtubeId) links.push({ platform: 'youtube', id: song.youtubeId });
    if (song.amazonMusicId) links.push({ platform: 'amazon', id: song.amazonMusicId });
    if (song.tidalId) links.push({ platform: 'tidal', id: song.tidalId });
    if (song.deezerId) links.push({ platform: 'deezer', id: song.deezerId });
    return links;
  };

  const coverImage = smartLinkData.customCoverImage || smartLinkData.playlist.coverImageUrl;

  return (
    <div 
      className="min-h-screen bg-cover bg-center bg-fixed relative"
      style={{
        backgroundImage: coverImage ? `url(${coverImage})` : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      }}
    >
      {/* Blurred overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
      
      <div className="relative z-10 container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 text-white/80 mb-4">
            <Eye className="w-4 h-4" />
            <span className="text-sm">{smartLinkData.views} views</span>
          </div>
          
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-4 drop-shadow-lg">
            {smartLinkData.title}
          </h1>
          
          {smartLinkData.description && (
            <p className="text-xl text-white/90 max-w-2xl mx-auto mb-6 drop-shadow">
              {smartLinkData.description}
            </p>
          )}

          <div className="flex items-center justify-center gap-4 text-white/80">
            <div className="flex items-center gap-2">
              <Music className="w-4 h-4" />
              <span>{smartLinkData.songs.length} tracks</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="bg-white/10 border-white/20 text-white hover:bg-white/20"
              onClick={() => navigator.share?.({ 
                title: smartLinkData.title, 
                url: window.location.href 
              })}
            >
              Share
            </Button>
          </div>
        </div>

        {/* Promoted Track */}
        {promotedTrack && (
          <div className="max-w-4xl mx-auto mb-12">
            <div className="text-center mb-6">
              <Badge className="bg-gradient-to-r from-yellow-400 to-orange-500 text-black text-lg px-4 py-2">
                ⭐ Featured Track
              </Badge>
            </div>
            
            <Card className="bg-white/95 backdrop-blur border-0 shadow-2xl">
              <CardContent className="p-8">
                <div className="flex flex-col md:flex-row items-center gap-6">
                  <div className="w-24 h-24 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
                    <Play className="w-8 h-8 text-white" />
                  </div>
                  
                  <div className="flex-1 text-center md:text-left">
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">
                      {promotedTrack.title}
                    </h3>
                    <p className="text-lg text-gray-600 mb-4">
                      by {promotedTrack.artist}
                    </p>
                    
                    <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                      {getPlatformLinks(promotedTrack).map(({ platform, id, url }) => {
                        const config = platformConfig[platform as keyof typeof platformConfig];
                        const Icon = config.icon;
                        return (
                          <Button
                            key={platform}
                            variant="outline"
                            size="sm"
                            className={`${config.bgColor} ${config.color} border-current hover:bg-current hover:text-white transition-all`}
                            onClick={() => window.open(url || `${config.baseUrl}${id}`, '_blank')}
                          >
                            {config.name}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Full Playlist */}
        <div className="max-w-4xl mx-auto">
          <Card className="bg-white/95 backdrop-blur border-0 shadow-2xl">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center">
                  <Headphones className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">
                    {smartLinkData.playlist.title}
                  </h2>
                  <p className="text-gray-600">Complete Playlist</p>
                </div>
              </div>

              <div className="space-y-3">
                {smartLinkData.songs.map((song, index) => {
                  const isPromoted = song.id === smartLinkData.promotedTrackId;
                  const platformLinks = getPlatformLinks(song);
                  
                  return (
                    <div
                      key={song.id}
                      className={`p-4 rounded-lg transition-all ${
                        isPromoted 
                          ? 'bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-200' 
                          : 'bg-gray-50 hover:bg-gray-100'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 flex-1">
                          <div className="w-8 h-8 bg-gray-200 rounded flex items-center justify-center text-sm font-medium text-gray-600">
                            {index + 1}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-gray-900 truncate">
                                {song.title}
                              </h4>
                              {isPromoted && <span className="text-yellow-500">⭐</span>}
                            </div>
                            <p className="text-sm text-gray-600 truncate">
                              {song.artist}
                            </p>
                          </div>
                        </div>

                        <div className="flex gap-2 ml-4">
                          {platformLinks.slice(0, 3).map(({ platform, id, url }) => {
                            const config = platformConfig[platform as keyof typeof platformConfig];
                            const Icon = config.icon;
                            return (
                              <Button
                                key={platform}
                                variant="ghost"
                                size="sm"
                                className={`${config.color} hover:${config.bgColor} p-2`}
                                onClick={() => window.open(url || `${config.baseUrl}${id}`, '_blank')}
                              >
                                {config.name}
                              </Button>
                            );
                          })}
                          {platformLinks.length > 3 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-gray-500 hover:bg-gray-100 p-2"
                            >
                              More
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="text-center mt-12 text-white/60">
          <p className="text-sm">
            Powered by SongFuse - Create your own AI-powered playlists
          </p>
        </div>
      </div>
    </div>
  );
}