import React, { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Play, ExternalLink, Clock, Music, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FaSpotify, FaYoutube, FaApple, FaAmazon } from "react-icons/fa";
import { SiTidal, SiPandora } from "react-icons/si";
import { SpotifyFollowButton } from "@/components/SpotifyFollowButton";

interface SmartLinkData {
  id: number;
  shareId: string;
  playlist: {
    id: number;
    title: string;
    description?: string;
    coverImageUrl?: string;
    thumbnailImageUrl?: string;
    smallImageUrl?: string;
    socialImageUrl?: string;
    ogImageUrl?: string;
    articleTitle?: string;
    articleLink?: string;
  };
  promotedTrack?: {
    id: number;
    title: string;
    artist: string;
    album?: string;
    albumCover?: string;
    duration?: number;
  };
  title: string;
  description?: string;
  customCoverImage?: string;
  views: number;
  createdAt: string;
}

interface Track {
  id: number;
  title: string;
  artist: string;
  album?: string;
  albumCover?: string;
  duration?: number;
  position: number;
}

// Utility function to create URL-friendly slugs from playlist titles
function createSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
    .trim()
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-'); // Replace multiple hyphens with single hyphen
}

interface SmartLinkPublicProps {
  shareId?: string;
  playlistId?: string;
  title?: string;
}

export default function SmartLinkPublic({ shareId, playlistId, title }: SmartLinkPublicProps) {
  console.log('SmartLinkPublic component rendered with props:', { shareId, playlistId, title });
  
  const params = useParams();
  const [isScrolled, setIsScrolled] = useState(false);

  // Scroll effect for album cover
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const shouldShrink = scrollTop > 100; // Start shrinking after 100px scroll
      setIsScrolled(shouldShrink);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  
  // Handle both new format (/share/playlistId/title) and legacy format (/share/shareId)
  const finalShareId = shareId || params.shareId;
  const finalPlaylistId = playlistId || params.playlistId;

  // Check for SSR preload data
  const preloadData = (window as any).__PRELOAD_DATA__;
  
  // For the new format, we need to find the smart link by playlist ID
  // For the legacy format, we can use the shareId directly
  const queryKey = finalPlaylistId 
    ? [`/api/playlists/${finalPlaylistId}/smart-link`]
    : [`/api/smart-links/${finalShareId}`];
  
  const { data: smartLinkResponse, isLoading, error } = useQuery({
    queryKey,
    queryFn: async () => {
      console.log(`Making API request to: ${queryKey[0]}`);
      const response = await fetch(queryKey[0] as string, {
        credentials: "include",
        headers: {
          "Accept": "application/json"
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('API Response received:', data);
      return data;
    },
    enabled: !!(finalShareId || finalPlaylistId) && !preloadData,
    initialData: preloadData?.smartLink || preloadData?.playlist ? {
      playlist: preloadData.playlist,
      ...preloadData.smartLink
    } : undefined,
    refetchInterval: 15000, // Refetch every 15 seconds to get updated view counts
    refetchIntervalInBackground: true, // Continue refetching even when tab is not active
    retry: 3, // Retry failed requests 3 times
    retryDelay: 1000, // Wait 1 second between retries
    staleTime: 30000, // Consider data stale after 30 seconds
    gcTime: 300000, // Keep in cache for 5 minutes
  });

  // Extract smart link data from response
  // Handle both nested structure (with .smartLink) and flat structure
  const smartLink = smartLinkResponse?.smartLink || smartLinkResponse;
  
  // If we have a nested structure, also extract the promoted track
  const promotedTrack = smartLinkResponse?.promotedTrack || smartLink?.promotedTrack;
  
  // If we have a promoted track at the root level, add it to the smartLink object
  const finalSmartLink = promotedTrack && !smartLink?.promotedTrack 
    ? { ...smartLink, promotedTrack }
    : smartLink;
  
  // Debug the response structure
  console.log('API Response structure:', {
    hasSmartLink: !!smartLinkResponse?.smartLink,
    hasExists: 'exists' in (smartLinkResponse || {}),
    responseKeys: smartLinkResponse ? Object.keys(smartLinkResponse) : 'no response',
    finalSmartLinkKeys: finalSmartLink ? Object.keys(finalSmartLink) : 'no finalSmartLink'
  });

  // Optimistically update view count when component mounts (simulating a new visit)
  useEffect(() => {
    if (finalSmartLink && !preloadData) {
      // This simulates the view count increment that happens on the server
      // The actual increment happens on the server, but we show it immediately in the UI
      console.log(`Smart link "${finalSmartLink.title}" viewed - view count: ${finalSmartLink.views || 0}`);
    }
  }, [finalSmartLink, preloadData]);

  // Debug logging
  console.log('SmartLinkPublic Debug:', {
    smartLinkResponse,
    finalSmartLink,
    finalPlaylistId,
    finalShareId,
    queryKey,
    isLoading,
    error
  });

  // Extract tracks directly from smart link data - no need for separate playlist query
  const tracks = finalSmartLink?.playlist?.tracks || finalSmartLink?.tracks || [];

  // URL correction logic: if we have playlist data and are using the new format,
  // check if the URL matches the correct title slug
  React.useEffect(() => {
    if (finalSmartLink && finalPlaylistId && finalSmartLink.playlist?.title) {
      const correctSlug = createSlug(finalSmartLink.playlist.title);
      const currentTitle = params.title;
      
      // If the current title doesn't match the correct slug, redirect
      if (currentTitle !== correctSlug) {
        const correctUrl = `/share/${finalPlaylistId}/${correctSlug}`;
        window.history.replaceState(null, '', correctUrl);
      }
    }
  }, [finalSmartLink, finalPlaylistId, params.title]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white">Loading smart link...</p>
          {error && (
            <div className="mt-4 p-4 bg-red-900/20 border border-red-500/30 rounded-lg">
              <p className="text-red-400 text-sm">Error: {error.message}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!finalSmartLink) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 flex items-center justify-center">
        <div className="text-center max-w-md">
          <Music className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Smart Link Not Found</h1>
          <p className="text-muted-foreground mb-6">
            This smart link doesn't exist or may have been removed.
          </p>
          <div className="text-xs text-gray-500 mb-4">
            <p>Debug info:</p>
            <p>PlaylistId: {finalPlaylistId}</p>
            <p>ShareId: {finalShareId}</p>
            <p>Response: {JSON.stringify(smartLinkResponse, null, 2)}</p>
          </div>
          <Button asChild>
            <a href="/">Discover Playlists</a>
          </Button>
        </div>
      </div>
    );
  }

  const coverImage = finalSmartLink.customCoverImage || finalSmartLink.playlist?.coverImageUrl;
  
  // Function to get optimized thumbnail for smaller displays
  const getOptimizedCoverImage = (url: string, size: 'sm' | 'md' | 'lg' = 'md') => {
    if (!url) return url;
    
    // Use stored resized URLs from the playlist data if available
    if (finalSmartLink?.playlist) {
      const playlist = finalSmartLink.playlist;
      
      if (size === 'sm' && playlist.thumbnailImageUrl) {
        return playlist.thumbnailImageUrl; // 64x64
      } else if (size === 'md' && playlist.smallImageUrl) {
        return playlist.smallImageUrl; // 150x150
      } else if (size === 'lg' && playlist.socialImageUrl) {
        return playlist.socialImageUrl; // 400x400
      }
    }
    
    // Fallback to original URL if no resized version is available
    return url;
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <div 
      className="min-h-screen relative"
      style={{
        backgroundImage: coverImage ? `url(${coverImage})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed'
      }}
    >
      {/* Blurred overlay */}
      <div className="absolute inset-0 backdrop-blur-xl bg-[#0000008c]" />
      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Hero Section */}
          <div className="mb-8">
            <div className="flex flex-col md:flex-row md:items-center space-y-6 md:space-y-0 md:space-x-8">
              {/* Album Cover */}
              <div className="flex-shrink-0 mx-auto md:mx-0">
                <div
                  className={`rounded-2xl shadow-2xl bg-gradient-to-br from-primary/10 to-primary/5 bg-cover bg-center transition-all duration-500 ease-in-out ${
                    isScrolled ? 'w-32 h-32' : 'w-64 h-64'
                  }`}
                  style={{
                    backgroundImage: coverImage ? `url(${getOptimizedCoverImage(coverImage, isScrolled ? 'sm' : 'md')})` : undefined,
                  }}
                />
              </div>

              {/* Content */}
              <div className="flex-1 text-center md:text-left">
                <h1 className="text-4xl font-bold mb-3">{finalSmartLink.title}</h1>
                {finalSmartLink.description && (
                  <p className="mb-4 text-[#ffffff] text-[16px] leading-relaxed max-w-2xl">{finalSmartLink.description}</p>
                )}
                
                {/* Metrics */}
                <div className="flex items-center justify-center md:justify-start space-x-4 text-sm text-[#ffffff] mb-6">
                  <div className="flex items-center space-x-1">
                    <User className="h-4 w-4" />
                    <span>{finalSmartLink.views || 0} views</span>
                  </div>
                  <Separator orientation="vertical" className="h-4" />
                  <div className="flex items-center space-x-1">
                    <Music className="h-4 w-4" />
                    <span>{tracks?.length || 0} tracks</span>
                  </div>
                </div>

                {/* Spotify Follow Button */}
                {finalSmartLink.playlist?.spotifyId && (
                  <div className="flex justify-center md:justify-start">
                    <SpotifyFollowButton 
                      spotifyId={finalSmartLink.playlist.spotifyId}
                      playlistTitle={finalSmartLink.title}
                      variant="large"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Spotify Playlist Embed */}
            {finalSmartLink.playlist?.spotifyId && (
              <div className="mt-8 mb-8">
                <div className="bg-black/20 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
                  <div className="flex justify-center">
                    <iframe
                      src={`https://open.spotify.com/embed/playlist/${finalSmartLink.playlist.spotifyId}?utm_source=generator&theme=0`}
                      width="100%"
                      height="380"
                      frameBorder="0"
                      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                      loading="lazy"
                      className="rounded-xl max-w-2xl"
                      title={`Spotify playlist: ${finalSmartLink.title}`}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Featured Track Hero Section */}
            {finalSmartLink.promotedTrack && (
              <div className="mt-8 relative">
                {/* Hero Background with Album Cover */}
                <div className="relative bg-gradient-to-br from-purple-900/20 via-pink-900/20 to-red-900/20 dark:from-purple-900/40 dark:via-pink-900/40 dark:to-red-900/40 rounded-2xl overflow-hidden border border-purple-500/20 shadow-2xl">
                  {/* Blurred Album Cover Background */}
                  {finalSmartLink.promotedTrack.albumCover && (
                    <div className="absolute inset-0">
                      <img
                        src={finalSmartLink.promotedTrack.albumCover}
                        alt="Background"
                        className="w-full h-full object-cover blur-3xl scale-110"
                      />
                      {/* Dark overlay for readability */}
                      <div className="absolute inset-0 bg-gradient-to-br from-black/60 via-black/40 to-black/60"></div>
                    </div>
                  )}
                  {/* Animated background pattern */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-black/15 to-transparent animate-pulse"></div>
                  
                  <CardContent className="relative p-4 md:p-8">
                    {/* Featured Badge - Top Right Corner */}
                    <Badge className="absolute top-2 right-2 md:top-4 md:right-4 inline-flex items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent hover:bg-primary/80 bg-gradient-to-r from-purple-600 to-pink-600 text-white border-0 px-2 py-1 md:px-3 md:py-1 font-semibold shadow-lg text-[8px] md:text-[10px] z-10">✨ Featured Track
</Badge>
                    
                    {/* Main Content */}
                    <div className="flex flex-col md:flex-row md:items-center space-y-4 md:space-y-0 md:space-x-6">
                      {/* Large Album Cover */}
                      <div className="relative group mx-auto md:mx-0">
                        {finalSmartLink.promotedTrack.albumCover ? (
                          <div className="relative">
                            <img
                              src={getOptimizedCoverImage(finalSmartLink.promotedTrack.albumCover, 'sm')}
                              alt={finalSmartLink.promotedTrack.album || 'Album cover'}
                              className="w-24 h-24 sm:w-32 sm:h-32 md:w-40 md:h-40 rounded-xl object-cover shadow-2xl transition-all duration-300"
                            />
                            {/* Glow effect */}
                            <div className="absolute inset-0 rounded-xl bg-gradient-to-tr from-purple-400/20 to-pink-400/20 group-hover:from-purple-400/30 group-hover:to-pink-400/30 transition-all duration-300"></div>
                          </div>
                        ) : (
                          <div className="w-24 h-24 sm:w-32 sm:h-32 md:w-40 md:h-40 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-2xl">
                            <Music className="h-6 w-6 sm:h-8 sm:w-8 md:h-12 md:w-12 text-white" />
                          </div>
                        )}
                      </div>
                      
                      {/* Track Info */}
                      <div className="flex-1 min-w-0 text-center md:text-left">
                        <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white mb-1 leading-tight line-clamp-2">
                          {finalSmartLink.promotedTrack.title}
                        </h2>
                        <p className="text-base sm:text-lg text-purple-200 mb-1 font-medium">
                          {finalSmartLink.promotedTrack.artist}
                        </p>
                        {finalSmartLink.promotedTrack.album && (
                          <p className="text-xs sm:text-sm text-white/60 mb-3">
                            {finalSmartLink.promotedTrack.album}
                          </p>
                        )}
                        
                        {/* Platform Links */}
                        <div className="flex flex-col space-y-3 md:flex-row md:items-center md:space-y-0 md:space-x-4">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-2 space-y-2 sm:space-y-0">
                            <span className="text-xs sm:text-sm text-white/80 font-medium text-center sm:text-left">Listen on:</span>
                            <div className="flex items-center justify-center space-x-2 flex-wrap gap-1">
                              {/* Spotify */}
                              <button
                                onClick={finalSmartLink.promotedTrack.spotifyId ? () => window.open(`https://open.spotify.com/track/${finalSmartLink.promotedTrack.spotifyId}`, '_blank') : undefined}
                                className={`group relative w-10 h-10 rounded-full transition-all duration-300 flex items-center justify-center shadow-lg ${
                                  finalSmartLink.promotedTrack.spotifyId 
                                    ? 'bg-[#1DB954] hover:bg-[#1ed760] hover:shadow-xl hover:scale-110 cursor-pointer' 
                                    : 'bg-gray-600 cursor-not-allowed opacity-50'
                                }`}
                                title={finalSmartLink.promotedTrack.spotifyId ? "Listen on Spotify - Stream this track now" : "Not available on Spotify"}
                                disabled={!finalSmartLink.promotedTrack.spotifyId}
                              >
                                <FaSpotify className="w-5 h-5 text-white" />
                              </button>
                              
                              {/* YouTube */}
                              <button
                                onClick={finalSmartLink.promotedTrack.youtubeId ? () => window.open(`https://www.youtube.com/watch?v=${finalSmartLink.promotedTrack.youtubeId}`, '_blank') : undefined}
                                className={`group relative w-10 h-10 rounded-full transition-all duration-300 flex items-center justify-center shadow-lg ${
                                  finalSmartLink.promotedTrack.youtubeId 
                                    ? 'bg-[#FF0000] hover:bg-[#ff1a1a] hover:shadow-xl hover:scale-110 cursor-pointer' 
                                    : 'bg-gray-600 cursor-not-allowed opacity-50'
                                }`}
                                title={finalSmartLink.promotedTrack.youtubeId ? "Watch on YouTube - Free with ads" : "Not available on YouTube"}
                                disabled={!finalSmartLink.promotedTrack.youtubeId}
                              >
                                <FaYoutube className="w-5 h-5 text-white" />
                              </button>

                              {/* Apple Music */}
                              <button
                                onClick={finalSmartLink.promotedTrack.appleMusicId ? () => window.open(`https://music.apple.com/song/${finalSmartLink.promotedTrack.appleMusicId}`, '_blank') : undefined}
                                className={`group relative w-10 h-10 rounded-full transition-all duration-300 flex items-center justify-center shadow-lg ${
                                  finalSmartLink.promotedTrack.appleMusicId 
                                    ? 'bg-gradient-to-br from-[#fa57c1] to-[#9900ff] hover:from-[#fb6cc7] hover:to-[#a814ff] hover:shadow-xl hover:scale-110 cursor-pointer' 
                                    : 'bg-gray-600 cursor-not-allowed opacity-50'
                                }`}
                                title={finalSmartLink.promotedTrack.appleMusicId ? "Listen on Apple Music - High quality audio" : "Not available on Apple Music"}
                                disabled={!finalSmartLink.promotedTrack.appleMusicId}
                              >
                                <FaApple className="w-5 h-5 text-white" />
                              </button>

                              {/* Deezer */}
                              <button
                                onClick={finalSmartLink.promotedTrack.deezerId ? () => window.open(`https://www.deezer.com/track/${finalSmartLink.promotedTrack.deezerId}`, '_blank') : undefined}
                                className={`group relative w-10 h-10 rounded-full transition-all duration-300 flex items-center justify-center shadow-lg ${
                                  finalSmartLink.promotedTrack.deezerId 
                                    ? 'bg-[#FF5500] hover:bg-[#ff6619] hover:shadow-xl hover:scale-110 cursor-pointer' 
                                    : 'bg-gray-600 cursor-not-allowed opacity-50'
                                }`}
                                title={finalSmartLink.promotedTrack.deezerId ? "Stream on Deezer - Discover new music" : "Not available on Deezer"}
                                disabled={!finalSmartLink.promotedTrack.deezerId}
                              >
                                <Music className="w-5 h-5 text-white" />
                              </button>

                              {/* Amazon Music */}
                              <button
                                onClick={finalSmartLink.promotedTrack.amazonMusicId ? () => window.open(`https://music.amazon.com/albums/${finalSmartLink.promotedTrack.amazonMusicId}`, '_blank') : undefined}
                                className={`group relative w-10 h-10 rounded-full transition-all duration-300 flex items-center justify-center shadow-lg ${
                                  finalSmartLink.promotedTrack.amazonMusicId 
                                    ? 'bg-[#00A8E1] hover:bg-[#1ab8f1] hover:shadow-xl hover:scale-110 cursor-pointer' 
                                    : 'bg-gray-600 cursor-not-allowed opacity-50'
                                }`}
                                title={finalSmartLink.promotedTrack.amazonMusicId ? "Play on Amazon Music - Prime member benefits" : "Not available on Amazon Music"}
                                disabled={!finalSmartLink.promotedTrack.amazonMusicId}
                              >
                                <FaAmazon className="w-5 h-5 text-white" />
                              </button>

                              {/* Tidal */}
                              <button
                                onClick={finalSmartLink.promotedTrack.tidalId ? () => window.open(`https://tidal.com/browse/track/${finalSmartLink.promotedTrack.tidalId}`, '_blank') : undefined}
                                className={`group relative w-10 h-10 rounded-full transition-all duration-300 flex items-center justify-center shadow-lg ${
                                  finalSmartLink.promotedTrack.tidalId 
                                    ? 'bg-[#000000] hover:bg-[#1a1a1a] hover:shadow-xl hover:scale-110 cursor-pointer' 
                                    : 'bg-gray-600 cursor-not-allowed opacity-50'
                                }`}
                                title={finalSmartLink.promotedTrack.tidalId ? "Stream on Tidal - Hi-Fi lossless quality" : "Not available on Tidal"}
                                disabled={!finalSmartLink.promotedTrack.tidalId}
                              >
                                <SiTidal className="w-5 h-5 text-white" />
                              </button>

                              {/* Pandora */}
                              <button
                                onClick={finalSmartLink.promotedTrack.pandoraId ? () => window.open(`https://www.pandora.com/track/${finalSmartLink.promotedTrack.pandoraId}`, '_blank') : undefined}
                                className={`group relative w-10 h-10 rounded-full transition-all duration-300 flex items-center justify-center shadow-lg ${
                                  finalSmartLink.promotedTrack.pandoraId 
                                    ? 'bg-[#005483] hover:bg-[#0066a0] hover:shadow-xl hover:scale-110 cursor-pointer' 
                                    : 'bg-gray-600 cursor-not-allowed opacity-50'
                                }`}
                                title={finalSmartLink.promotedTrack.pandoraId ? "Listen on Pandora - Personalized radio" : "Not available on Pandora"}
                                disabled={!finalSmartLink.promotedTrack.pandoraId}
                              >
                                <SiPandora className="w-5 h-5 text-white" />
                              </button>
                            </div>
                          </div>

                        </div>
                      </div>
                    </div>
                  </CardContent>
                </div>
              </div>
            )}

            {/* YouTube Video Embed - Below Featured Track */}
            {finalSmartLink.promotedTrack?.youtubeId && (
              <div className="mt-8">
                <Card className="bg-black/40 border-white/10 overflow-hidden">
                  <CardContent className="p-0">
                    <div className="aspect-video">
                      <iframe
                        src={`https://www.youtube.com/embed/${finalSmartLink.promotedTrack.youtubeId}?rel=0&modestbranding=1&fs=1&cc_load_policy=0&iv_load_policy=3&autohide=1`}
                        title={`${finalSmartLink.promotedTrack.title} - ${finalSmartLink.promotedTrack.artist}`}
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                        className="w-full h-full"
                      />
                    </div>
                    <div className="p-4 bg-gradient-to-r from-red-600/10 to-red-500/10 border-t border-red-500/20">
                      <div className="flex items-center space-x-2">
                        <FaYoutube className="w-5 h-5 text-red-500" />
                        <span className="text-sm text-white/80">
                          Watch "{finalSmartLink.promotedTrack.title}" on YouTube
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>

          {/* Playlist Section */}
          <div className="mb-8">

            
            {/* Article Reference */}
            {finalSmartLink.playlist?.articleTitle && finalSmartLink.playlist?.articleLink && (
              <div className="mt-3 dark:bg-gray-800/80 p-2 mb-6 bg-black/30 rounded-[4px]">
                <p className="text-xs text-[#ffffffcc]">
                  <span className="font-semibold">Inspired by article: </span>
                  <a href={finalSmartLink.playlist.articleLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
                    {finalSmartLink.playlist.articleTitle}
                  </a>
                </p>
              </div>
            )}



            {/* Track List - Including Featured Track */}
            <div className="space-y-1">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-white/90 mb-2">Complete Playlist</h3>
                <p className="text-sm text-white/60">
                  {finalSmartLink.promotedTrack ? 
                    `${tracks?.length || 0} tracks • Featured track highlighted` : 
                    `${tracks?.length || 0} tracks`
                  }
                </p>
              </div>
              
              {tracks && tracks.length > 0 ? (
                tracks.map((track: Track, index: number) => {
                  const isPromotedTrack = finalSmartLink.promotedTrack && track.id === finalSmartLink.promotedTrack.id;
                  return (
                    <div key={track.id} className={`flex items-center p-3 rounded-lg transition-all duration-300 group border ${
                      isPromotedTrack 
                        ? 'bg-gradient-to-r from-purple-600/20 to-pink-600/20 border-purple-400/30 hover:border-purple-400/50' 
                        : 'hover:bg-white/5 border-white/5 hover:border-white/10'
                    }`}>
                      {/* Track index */}
                      <div className="w-10 flex items-center justify-center text-white/70 text-sm mr-3 font-medium">
                        <span>{index + 1}</span>
                      </div>
                      
                      {/* Album Cover */}
                      <div className="h-12 w-12 bg-white/10 rounded mr-3 flex-shrink-0 overflow-hidden relative">
                        {track.albumCover ? (
                          <img 
                            src={track.albumCover}
                            alt={track.album || 'Album cover'} 
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-white/10 flex items-center justify-center">
                            <Music className="h-5 w-5 text-white/50" />
                          </div>
                        )}
                      </div>
                      
                      {/* Track title and artist */}
                      <div className="flex-1 min-w-0 mr-2">
                        <div className="text-white text-sm font-medium line-clamp-2 leading-tight">
                          {track.title}
                        </div>
                        <div className="text-white/70 text-sm truncate">
                          {track.artist}
                        </div>
                      </div>
                      
                      {/* Album name (hidden on mobile) */}
                      <div className="hidden md:flex flex-1 min-w-0 mr-4">
                        <div className="text-white/60 text-sm truncate">
                          {track.album || ''}
                        </div>
                      </div>
                      
                      {/* Duration */}
                      <div className="text-white/70 text-sm font-mono min-w-0">
                        {track.duration ? formatDuration(track.duration) : ''}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-12">
                  <Music className="h-16 w-16 text-white/50 mx-auto mb-6" />
                  <p className="text-white/70 text-lg">No tracks available</p>
                </div>
              )}
            </div>
          </div>

          {/* Action Bar */}
          {finalSmartLink.playlist?.spotifyId && (
            <div className="border-t border-white/10 bg-black/20 backdrop-blur-sm">
              <div className="max-w-4xl mx-auto px-4 py-6">
                <div className="flex flex-col sm:flex-row items-center justify-between space-y-4 sm:space-y-0">
                  <div className="text-center sm:text-left">
                    <h3 className="text-white font-semibold text-lg mb-1">Like this playlist?</h3>
                    <p className="text-white/70 text-sm">Follow it on Spotify to keep it in your library</p>
                  </div>
                  <SpotifyFollowButton 
                    spotifyId={finalSmartLink.playlist.spotifyId}
                    playlistTitle={finalSmartLink.title}
                    variant="default"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="text-center py-8">
            <p className="text-[#ffffff] text-[12px]">
              Created with <a href="/" className="text-[#ffffff] underline hover:text-gray-300">SongFuse</a> - AI-powered playlist generation
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}