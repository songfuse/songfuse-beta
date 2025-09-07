import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink, Calendar, Clock, Music } from "lucide-react";
import Layout from "@/components/Layout";
import { useAuth } from "@/contexts/AuthContext";
import PlaylistCoverPlaceholder from "../components/PlaylistCoverPlaceholder";
import SpotifyBadge from "../components/SpotifyBadge";
import SimplePlaylistEmbed from "@/components/SimplePlaylistEmbed";
import MetaTags from "@/components/MetaTags";

// Helper function to create slug from playlist title
export function createSlugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Remove consecutive hyphens
    .trim();
}

type Song = {
  id: number;
  playlistId: number;
  spotifyId: string;
  title: string;
  artist: string;
  album: string | null;
  albumImageUrl: string | null;
  durationMs: number | null;
  position: number;
};

type PlaylistWithSongs = {
  playlist: {
    id: number;
    userId: number;
    title: string;
    description: string | null;
    spotifyId: string | null;
    spotifyUrl: string | null;
    spotifyImageUrl: string | null;
    coverImageUrl: string | null;
    createdAt: string;
    isPublic: boolean;
    articleTitle?: string | null;
    articleLink?: string | null;
  };
  songs: Song[];
  creatorName: string;
};

export default function DiscoverPlaylistDetail(props: { id?: string, slug?: string }) {
  const params = useParams();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isLoggedIn = !!user;
  
  // Get ID from either props or URL params
  const playlistId = props.id || params.id;

  // Fetch user's playlists for the sidebar (only if logged in)
  const { data: userPlaylists, isLoading: loadingPlaylists } = useQuery({
    queryKey: ["/api/playlists", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const response = await fetch(`/api/playlists?userId=${user.id}`);
      if (!response.ok) throw new Error("Failed to fetch user playlists");
      return response.json();
    },
    enabled: isLoggedIn,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/discover/playlist", playlistId],
    queryFn: async () => {
      const response = await fetch(`/api/discover/playlist/${playlistId}`);
      if (!response.ok) throw new Error("Failed to fetch playlist");
      return response.json() as Promise<PlaylistWithSongs>;
    },
    enabled: !!playlistId,
  });
  
  // Redirect to the SEO-friendly URL if we're on the ID-only URL and have the playlist data
  useEffect(() => {
    if (data?.playlist && !props.slug && typeof window !== 'undefined') {
      const titleSlug = createSlugFromTitle(data.playlist.title);
      // Only redirect if we're not already on the correct URL
      if (window.location.pathname !== `/discover/playlist/${playlistId}/${titleSlug}`) {
        setLocation(`/discover/playlist/${playlistId}/${titleSlug}`, { 
          replace: true // Replace instead of pushing to avoid back button issues
        });
      }
    }
  }, [data, playlistId, props.slug, setLocation]);

  const formattedDate = data?.playlist?.createdAt 
    ? new Date(data.playlist.createdAt).toLocaleDateString() 
    : null;

  // Calculate total duration
  const totalDurationMs = data?.songs?.reduce(
    (total, song) => total + (song.durationMs || 0), 
    0
  ) || 0;

  const formatDuration = (duration: number) => {
    if (!duration || duration === 0) return '0:00';
    
    // Convert to seconds - if value is >= 1000, treat as milliseconds, otherwise as seconds
    const totalSeconds = duration >= 1000 ? Math.floor(duration / 1000) : duration;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatTotalDuration = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (hours > 0) {
      return `${hours} hr ${remainingMinutes} min`;
    }
    return `${minutes} min`;
  };

  return (
    <Layout playlists={isLoggedIn ? userPlaylists : []}>
      <div className="container px-2 py-4 max-w-6xl">
        
        {!isLoggedIn && (
          <div className="mb-6 p-4 rounded-lg bg-card shadow-md border border-border dark:bg-muted dark:border-border flex flex-col md:flex-row gap-4 items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-2 bg-gradient-to-r from-primary to-primary/80 text-transparent bg-clip-text">Love this playlist?</h3>
              <p className="text-muted-foreground">Log in to create your own playlists or save this one to your account!</p>
            </div>
            <div>
              <Button 
                className="bg-primary hover:bg-primary/80 text-white font-medium transition-colors"
                onClick={() => window.location.href = "/login"}
              >
                Log In to SongFuse
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center items-center my-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
          </div>
        ) : error || !data ? (
          <div className="text-center text-red-500 py-8">
            <p>Error loading playlist. It may have been deleted or is no longer public.</p>
            <Button 
              variant="link" 
              className="mt-4 text-primary"
              onClick={() => window.location.href = "/discover"}
            >
              Return to Discover
            </Button>
          </div>
        ) : (
          <>
            <MetaTags 
              title={`${data.playlist.title} | Songfuse Public Playlist`}
              description={data.playlist.description || `A playlist of ${data.songs.length} songs curated by ${data.creatorName || 'a Songfuse user'}.`}
              imageUrl={data.playlist.coverImageUrl || data.playlist.spotifyImageUrl || ''}
              type="music.playlist"
              url={typeof window !== 'undefined' 
                ? `${window.location.origin}/discover/playlist/${playlistId}/${createSlugFromTitle(data.playlist.title)}` 
                : ''}
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Playlist Info */}
              <div className="md:col-span-1">
                <div className="sticky top-24">
                  <div className="mb-6 w-full max-w-[300px] mx-auto">
                    {/* 
                      Priority order for cover images:
                      1. Songfuse-generated cover (AI-generated or user-uploaded)
                      2. Fallback to placeholder if no Songfuse cover is available
                      3. Never use Spotify cover if we already have a Songfuse cover
                    */}
                    <div className="rounded-lg shadow-lg overflow-hidden relative">
                      <PlaylistCoverPlaceholder 
                        size="lg" 
                        imageUrl={data.playlist.coverImageUrl || undefined}
                        spotifyImageUrl={data.playlist.spotifyImageUrl || undefined}
                        altText={data.playlist.title}
                      />
                      
                      {/* Display Spotify badge when playlist has a Spotify URL */}
                      {data.playlist.spotifyUrl && <SpotifyBadge />}
                    </div>
                  </div>

                  <h1 className="font-bold mb-3 bg-gradient-to-r from-teal-400 to-primary text-transparent bg-clip-text text-[40px]">{data.playlist.title}</h1>

                  {data.playlist.description && (
                    <p className="text-muted-foreground mb-4">{data.playlist.description}</p>
                  )}

                  <div className="text-sm text-muted-foreground mb-1">
                    Created by <span className="text-foreground font-medium">{data.creatorName}</span>
                  </div>

                  <div className="flex flex-col space-y-2 text-sm text-muted-foreground mb-6">
                    <div className="flex items-center">
                      <Music className="h-4 w-4 mr-2" />
                      {data.songs.length} songs
                    </div>

                    <div className="flex items-center">
                      <Clock className="h-4 w-4 mr-2" />
                      {formatTotalDuration(totalDurationMs)}
                    </div>

                    <div className="flex items-center">
                      <Calendar className="h-4 w-4 mr-2" />
                      {formattedDate}
                    </div>
                    
                    {/* Article information if available */}
                    {(data.playlist.articleTitle || data.playlist.articleLink) && (
                      <div className="mt-3 bg-gray-100 dark:bg-gray-800 rounded-md p-2 border border-gray-200 dark:border-gray-700">
                        <p className="text-xs text-foreground/80">
                          <span className="font-semibold">Inspired by article: </span>
                          {data.playlist.articleLink ? (
                            <a 
                              href={data.playlist.articleLink} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              {data.playlist.articleTitle || data.playlist.articleLink}
                            </a>
                          ) : (
                            <span>{data.playlist.articleTitle}</span>
                          )}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-col space-y-3">
                    {data.playlist.spotifyUrl && (
                      <Button 
                        className="bg-[#1DB954] hover:bg-[#1DB954]/80 text-white font-medium flex items-center gap-2"
                        onClick={() => window.open(data.playlist.spotifyUrl || '', "_blank")}
                      >
                        <ExternalLink className="h-4 w-4" />
                        Open in Spotify
                      </Button>
                    )}

                    {/* Clone button removed as requested */}
                  </div>
                </div>
              </div>

              {/* Songs List */}
              <div className="md:col-span-2">
                <Card className="bg-card/40 border-border overflow-hidden">
                  {/* Spotify Embed - shown if playlist has a Spotify URL */}
                  {data.playlist.spotifyUrl && (
                    <div className="w-full mb-2">
                      <div className="w-full rounded-lg overflow-hidden">
                        <SimplePlaylistEmbed playlistUrl={data.playlist.spotifyUrl || ''} mini={true} />
                      </div>
                    </div>
                  )}
                  {data.songs.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No songs in this playlist.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {data.songs.map((song, index) => {
                        return (
                          <div key={`${song.id}-${index}`} className="flex flex-col rounded-md hover:bg-accent/5 transition-all duration-300">
                            <div className="flex items-center p-2">
                              <div className="w-8 flex items-center justify-center text-muted-foreground text-sm mr-2">
                                {index + 1}
                              </div>

                              <div className="h-10 w-10 bg-muted rounded mr-3 flex-shrink-0 overflow-hidden relative">
                                {song.albumImageUrl ? (
                                  <img 
                                    src={song.albumImageUrl} 
                                    alt={song.title} 
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                  />
                                ) : (
                                  <div className="w-full h-full bg-muted/80 flex items-center justify-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                                    </svg>
                                  </div>
                                )}
                              </div>

                              <div className="flex-1 min-w-0 mr-2">
                                <div className="text-foreground text-sm font-medium break-normal">
                                  {song.title}
                                </div>
                                <div className="text-muted-foreground text-xs break-normal mt-1">
                                  {song.artist}
                                </div>
                              </div>

                              <div className="text-muted-foreground text-sm mr-2">
                                {song.durationMs ? formatDuration(song.durationMs) : '-'}
                              </div>

                              {/* Add Spotify link if available */}
                              {song.spotifyId && (
                                <a 
                                  href={`https://open.spotify.com/track/${song.spotifyId}`}
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-muted-foreground hover:text-[#1DB954] p-2 ml-2" 
                                  title="Open in Spotify"
                                >
                                  <svg 
                                    viewBox="0 0 24 24" 
                                    className="h-5 w-5" 
                                    fill="currentColor"
                                  >
                                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.48.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                                  </svg>
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}