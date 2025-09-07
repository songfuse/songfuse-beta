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
  
  const { data: smartLinkResponse, isLoading } = useQuery({
    queryKey,
    enabled: !!(finalShareId || finalPlaylistId) && !preloadData,
    initialData: preloadData?.smartLink || preloadData?.playlist ? {
      playlist: preloadData.playlist,
      ...preloadData.smartLink
    } : undefined,
    refetchInterval: 15000, // Refetch every 15 seconds to get updated view counts
    refetchIntervalInBackground: true, // Continue refetching even when tab is not active
  });

  // Optimistically update view count when component mounts (simulating a new visit)
  useEffect(() => {
    if (smartLink && !preloadData) {
      // This simulates the view count increment that happens on the server
      // The actual increment happens on the server, but we show it immediately in the UI
      console.log(`Smart link "${smartLink.title}" viewed - view count: ${smartLink.views || 0}`);
    }
  }, [smartLink, preloadData]);

  // Extract smart link data from response
  const smartLink = smartLinkResponse?.smartLink || smartLinkResponse;

  // Extract tracks directly from smart link data - no need for separate playlist query
  const tracks = smartLink?.playlist?.tracks || smartLink?.tracks || [];

  // URL correction logic: if we have playlist data and are using the new format,
  // check if the URL matches the correct title slug
  React.useEffect(() => {
    if (smartLink && finalPlaylistId && smartLink.playlist?.title) {
      const correctSlug = createSlug(smartLink.playlist.title);
      const currentTitle = params.title;
      
      // If the current title doesn't match the correct slug, redirect
      if (currentTitle !== correctSlug) {
        const correctUrl = `/share/${finalPlaylistId}/${correctSlug}`;
        window.history.replaceState(null, '', correctUrl);
      }
    }
  }, [smartLink, finalPlaylistId, params.title]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white">Loading smart link...</p>
        </div>
      </div>
    );
  }

  if (!smartLink) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 flex items-center justify-center">
        <div className="text-center max-w-md">
          <Music className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Smart Link Not Found</h1>
          <p className="text-muted-foreground mb-6">
            This smart link doesn't exist or may have been removed.
          </p>
          <Button asChild>
            <a href="/">Discover Playlists</a>
          </Button>
        </div>
      </div>
    );
  }

  const coverImage = smartLink.customCoverImage || smartLink.playlist?.coverImageUrl;
  
  // Function to get optimized thumbnail for smaller displays
  const getOptimizedCoverImage = (url: string, size: 'sm' | 'md' | 'lg' = 'md') => {
    if (!url) return url;
    
    const sizeMap = {
      sm: 128,   // For small album covers
      md: 256,   // For medium displays
      lg: 512    // For large displays (hero)
    };
    
    const targetSize = sizeMap[size];
    
    // For Supabase images, use thumbnail service for smaller sizes
    if (url.includes('supabase.co') && url.includes('playlist-covers') && (size === 'sm' || size === 'md')) {
      return `/api/thumbnail?url=${encodeURIComponent(url)}&size=${targetSize}`;
    }
    
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
                <h1 className="text-4xl font-bold mb-3">{smartLink.title}</h1>
                {smartLink.description && (
                  <p className="mb-4 text-[#ffffff] text-[16px] leading-relaxed max-w-2xl">{smartLink.description}</p>
                )}
                
                {/* Metrics */}
                <div className="flex items-center justify-center md:justify-start space-x-4 text-sm text-[#ffffff] mb-6">
                  <div className="flex items-center space-x-1">
                    <User className="h-4 w-4" />
                    <span>{smartLink.views || 0} views</span>
                  </div>
                  <Separator orientation="vertical" className="h-4" />
                  <div className="flex items-center space-x-1">
                    <Music className="h-4 w-4" />
                    <span>{tracks?.length || 0} tracks</span>
                  </div>
                </div>

                {/* Spotify Follow Button */}
                {smartLink.playlist?.spotifyId && (
                  <div className="flex justify-center md:justify-start">
                    <SpotifyFollowButton 
                      spotifyId={smartLink.playlist.spotifyId}
                      playlistTitle={smartLink.title}
                      variant="large"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Spotify Playlist Embed */}
            {smartLink.playlist?.spotifyId && (
              <div className="mt-8 mb-8">
                <div className="bg-black/20 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
                  <div className="flex justify-center">
                    <iframe
                      src={`https://open.spotify.com/embed/playlist/${smartLink.playlist.spotifyId}?utm_source=generator&theme=0`}
                      width="100%"
                      height="380"
                      frameBorder="0"
                      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                      loading="lazy"
                      className="rounded-xl max-w-2xl"
                      title={`Spotify playlist: ${smartLink.title}`}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Featured Track Hero Section */}
            {smartLink.promotedTrack && (
              <div className="mt-8 relative">
                {/* Hero Background with Album Cover */}
                <div className="relative bg-gradient-to-br from-purple-900/20 via-pink-900/20 to-red-900/20 dark:from-purple-900/40 dark:via-pink-900/40 dark:to-red-900/40 rounded-2xl overflow-hidden border border-purple-500/20 shadow-2xl">
                  {/* Blurred Album Cover Background */}
                  {smartLink.promotedTrack.albumCover && (
                    <div className="absolute inset-0">
                      <img
                        src={smartLink.promotedTrack.albumCover}
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
                        {smartLink.promotedTrack.albumCover ? (
                          <div className="relative">
                            <img
                              src={getOptimizedCoverImage(smartLink.promotedTrack.albumCover, 'sm')}
                              alt={smartLink.promotedTrack.album || 'Album cover'}
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
                          {smartLink.promotedTrack.title}
                        </h2>
                        <p className="text-base sm:text-lg text-purple-200 mb-1 font-medium">
                          {smartLink.promotedTrack.artist}
                        </p>
                        {smartLink.promotedTrack.album && (
                          <p className="text-xs sm:text-sm text-white/60 mb-3">
                            {smartLink.promotedTrack.album}
                          </p>
                        )}
                        
                        {/* Platform Links */}
                        <div className="flex flex-col space-y-3 md:flex-row md:items-center md:space-y-0 md:space-x-4">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-2 space-y-2 sm:space-y-0">
                            <span className="text-xs sm:text-sm text-white/80 font-medium text-center sm:text-left">Listen on:</span>
                            <div className="flex items-center justify-center space-x-2 flex-wrap gap-1">
                              {/* Spotify */}
                              <button
                                onClick={smartLink.promotedTrack.spotifyId ? () => window.open(`https://open.spotify.com/track/${smartLink.promotedTrack.spotifyId}`, '_blank') : undefined}
                                className={`group relative w-10 h-10 rounded-full transition-all duration-300 flex items-center justify-center shadow-lg ${
                                  smartLink.promotedTrack.spotifyId 
                                    ? 'bg-[#1DB954] hover:bg-[#1ed760] hover:shadow-xl hover:scale-110 cursor-pointer' 
                                    : 'bg-gray-600 cursor-not-allowed opacity-50'
                                }`}
                                title={smartLink.promotedTrack.spotifyId ? "Listen on Spotify - Stream this track now" : "Not available on Spotify"}
                                disabled={!smartLink.promotedTrack.spotifyId}
                              >
                                <FaSpotify className="w-5 h-5 text-white" />
                              </button>
                              
                              {/* YouTube */}
                              <button
                                onClick={smartLink.promotedTrack.youtubeId ? () => window.open(`https://www.youtube.com/watch?v=${smartLink.promotedTrack.youtubeId}`, '_blank') : undefined}
                                className={`group relative w-10 h-10 rounded-full transition-all duration-300 flex items-center justify-center shadow-lg ${
                                  smartLink.promotedTrack.youtubeId 
                                    ? 'bg-[#FF0000] hover:bg-[#ff1a1a] hover:shadow-xl hover:scale-110 cursor-pointer' 
                                    : 'bg-gray-600 cursor-not-allowed opacity-50'
                                }`}
                                title={smartLink.promotedTrack.youtubeId ? "Watch on YouTube - Free with ads" : "Not available on YouTube"}
                                disabled={!smartLink.promotedTrack.youtubeId}
                              >
                                <FaYoutube className="w-5 h-5 text-white" />
                              </button>

                              {/* Apple Music */}
                              <button
                                onClick={smartLink.promotedTrack.appleMusicId ? () => window.open(`https://music.apple.com/song/${smartLink.promotedTrack.appleMusicId}`, '_blank') : undefined}
                                className={`group relative w-10 h-10 rounded-full transition-all duration-300 flex items-center justify-center shadow-lg ${
                                  smartLink.promotedTrack.appleMusicId 
                                    ? 'bg-gradient-to-br from-[#fa57c1] to-[#9900ff] hover:from-[#fb6cc7] hover:to-[#a814ff] hover:shadow-xl hover:scale-110 cursor-pointer' 
                                    : 'bg-gray-600 cursor-not-allowed opacity-50'
                                }`}
                                title={smartLink.promotedTrack.appleMusicId ? "Listen on Apple Music - High quality audio" : "Not available on Apple Music"}
                                disabled={!smartLink.promotedTrack.appleMusicId}
                              >
                                <FaApple className="w-5 h-5 text-white" />
                              </button>

                              {/* Deezer */}
                              <button
                                onClick={smartLink.promotedTrack.deezerId ? () => window.open(`https://www.deezer.com/track/${smartLink.promotedTrack.deezerId}`, '_blank') : undefined}
                                className={`group relative w-10 h-10 rounded-full transition-all duration-300 flex items-center justify-center shadow-lg ${
                                  smartLink.promotedTrack.deezerId 
                                    ? 'bg-[#FF5500] hover:bg-[#ff6619] hover:shadow-xl hover:scale-110 cursor-pointer' 
                                    : 'bg-gray-600 cursor-not-allowed opacity-50'
                                }`}
                                title={smartLink.promotedTrack.deezerId ? "Stream on Deezer - Discover new music" : "Not available on Deezer"}
                                disabled={!smartLink.promotedTrack.deezerId}
                              >
                                <Music className="w-5 h-5 text-white" />
                              </button>

                              {/* Amazon Music */}
                              <button
                                onClick={smartLink.promotedTrack.amazonMusicId ? () => window.open(`https://music.amazon.com/albums/${smartLink.promotedTrack.amazonMusicId}`, '_blank') : undefined}
                                className={`group relative w-10 h-10 rounded-full transition-all duration-300 flex items-center justify-center shadow-lg ${
                                  smartLink.promotedTrack.amazonMusicId 
                                    ? 'bg-[#00A8E1] hover:bg-[#1ab8f1] hover:shadow-xl hover:scale-110 cursor-pointer' 
                                    : 'bg-gray-600 cursor-not-allowed opacity-50'
                                }`}
                                title={smartLink.promotedTrack.amazonMusicId ? "Play on Amazon Music - Prime member benefits" : "Not available on Amazon Music"}
                                disabled={!smartLink.promotedTrack.amazonMusicId}
                              >
                                <FaAmazon className="w-5 h-5 text-white" />
                              </button>

                              {/* Tidal */}
                              <button
                                onClick={smartLink.promotedTrack.tidalId ? () => window.open(`https://tidal.com/browse/track/${smartLink.promotedTrack.tidalId}`, '_blank') : undefined}
                                className={`group relative w-10 h-10 rounded-full transition-all duration-300 flex items-center justify-center shadow-lg ${
                                  smartLink.promotedTrack.tidalId 
                                    ? 'bg-[#000000] hover:bg-[#1a1a1a] hover:shadow-xl hover:scale-110 cursor-pointer' 
                                    : 'bg-gray-600 cursor-not-allowed opacity-50'
                                }`}
                                title={smartLink.promotedTrack.tidalId ? "Stream on Tidal - Hi-Fi lossless quality" : "Not available on Tidal"}
                                disabled={!smartLink.promotedTrack.tidalId}
                              >
                                <SiTidal className="w-5 h-5 text-white" />
                              </button>

                              {/* Pandora */}
                              <button
                                onClick={smartLink.promotedTrack.pandoraId ? () => window.open(`https://www.pandora.com/track/${smartLink.promotedTrack.pandoraId}`, '_blank') : undefined}
                                className={`group relative w-10 h-10 rounded-full transition-all duration-300 flex items-center justify-center shadow-lg ${
                                  smartLink.promotedTrack.pandoraId 
                                    ? 'bg-[#005483] hover:bg-[#0066a0] hover:shadow-xl hover:scale-110 cursor-pointer' 
                                    : 'bg-gray-600 cursor-not-allowed opacity-50'
                                }`}
                                title={smartLink.promotedTrack.pandoraId ? "Listen on Pandora - Personalized radio" : "Not available on Pandora"}
                                disabled={!smartLink.promotedTrack.pandoraId}
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
            {smartLink.promotedTrack?.youtubeId && (
              <div className="mt-8">
                <Card className="bg-black/40 border-white/10 overflow-hidden">
                  <CardContent className="p-0">
                    <div className="aspect-video">
                      <iframe
                        src={`https://www.youtube.com/embed/${smartLink.promotedTrack.youtubeId}?rel=0&modestbranding=1&fs=1&cc_load_policy=0&iv_load_policy=3&autohide=1`}
                        title={`${smartLink.promotedTrack.title} - ${smartLink.promotedTrack.artist}`}
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
                          Watch "{smartLink.promotedTrack.title}" on YouTube
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
            {smartLink.playlist?.articleTitle && smartLink.playlist?.articleLink && (
              <div className="mt-3 dark:bg-gray-800/80 p-2 mb-6 bg-black/30 rounded-[4px]">
                <p className="text-xs text-[#ffffffcc]">
                  <span className="font-semibold">Inspired by article: </span>
                  <a href={smartLink.playlist.articleLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
                    {smartLink.playlist.articleTitle}
                  </a>
                </p>
              </div>
            )}



            {/* Track List - Including Featured Track */}
            <div className="space-y-1">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-white/90 mb-2">Complete Playlist</h3>
                <p className="text-sm text-white/60">
                  {smartLink.promotedTrack ? 
                    `${tracks?.length || 0} tracks • Featured track highlighted` : 
                    `${tracks?.length || 0} tracks`
                  }
                </p>
              </div>
              
              {tracks && tracks.length > 0 ? (
                tracks.map((track: Track, index: number) => {
                  const isPromotedTrack = smartLink.promotedTrack && track.id === smartLink.promotedTrack.id;
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
          {smartLink.playlist?.spotifyId && (
            <div className="border-t border-white/10 bg-black/20 backdrop-blur-sm">
              <div className="max-w-4xl mx-auto px-4 py-6">
                <div className="flex flex-col sm:flex-row items-center justify-between space-y-4 sm:space-y-0">
                  <div className="text-center sm:text-left">
                    <h3 className="text-white font-semibold text-lg mb-1">Like this playlist?</h3>
                    <p className="text-white/70 text-sm">Follow it on Spotify to keep it in your library</p>
                  </div>
                  <SpotifyFollowButton 
                    spotifyId={smartLink.playlist.spotifyId}
                    playlistTitle={smartLink.title}
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