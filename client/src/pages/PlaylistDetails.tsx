import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Header from "@/components/Header";
import SidebarNav from "@/components/SidebarNav";
import Layout from "../components/Layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { usePlaylistUpdate } from "@/contexts/PlaylistUpdateContext";
import PlaylistDetailsComponent from "@/components/PlaylistDetailsUpdated";
import MetaTags from "@/components/MetaTags";
import { apiRequest } from "@/lib/queryClient";
import { createSlug } from "@/lib/utils";
import { SpotifyTrack } from "@shared/schema";

interface PlaylistDetailsProps {
  id: string;
  slug?: string;
}

interface PlaylistData {
  id?: number;
  spotifyId: string;
  title: string;
  description?: string;
  coverImage?: string;
  coverImageUrl?: string; // Add this field to match server response 
  tracks: SpotifyTrack[];
  spotifyUrl: string;
  spotifyImageUrl?: string; // URL for Spotify's cover image
  isPublic?: boolean; // Playlist visibility flag
  articleTitle?: string; // Title of the article that inspired this playlist
  articleLink?: string; // Link to the article that inspired this playlist
}

const PlaylistDetails = ({ id, slug }: PlaylistDetailsProps) => {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { lastUpdatedPlaylistId, resetNotification } = usePlaylistUpdate();
  
  const { 
    data: playlist,
    isLoading, 
    isError,
    refetch 
  } = useQuery<PlaylistData>({
    queryKey: [`/api/playlist/${id}`, user?.id],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/playlist/${id}?userId=${user?.id}`);
      return response.json();
    },
    enabled: !!user && !!id
  });
  
  // Handle redirection to SEO-friendly URL if needed
  useEffect(() => {
    if (playlist && !slug && typeof window !== 'undefined') {
      const titleSlug = createSlug(playlist.title);
      // Only redirect if we're not already on the correct URL
      if (window.location.pathname !== `/playlist/${id}/${titleSlug}`) {
        setLocation(`/playlist/${id}/${titleSlug}`, { 
          replace: true // Replace instead of pushing to avoid back button issues
        });
      }
    }
  }, [playlist, slug, id, setLocation]);
  
  // Listen for playlist updates from other components
  useEffect(() => {
    if (lastUpdatedPlaylistId && lastUpdatedPlaylistId === parseInt(id, 10)) {
      console.log(`Playlist ${id} was updated elsewhere, refreshing data...`);
      // Invalidate the cache for this playlist to force a refetch
      queryClient.invalidateQueries({ queryKey: [`/api/playlist/${id}`, user?.id] });
      // Refetch the playlist data
      refetch();
      // Reset the notification to avoid duplicate refreshes
      resetNotification();
    }
  }, [lastUpdatedPlaylistId, id, user?.id, queryClient, refetch, resetNotification]);

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-bold text-foreground mb-2">Not logged in</h2>
            <p className="text-muted-foreground mb-4">Please log in to view playlist details</p>
            <Button 
              onClick={() => setLocation("/login")}
              className="bg-primary hover:bg-primary/80 text-primary-foreground"
            >
              Log in
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // Fetch playlists for sidebar - using same query key as sidebar
  const { data: playlists = [] } = useQuery({
    queryKey: ['/api/playlists-with-counts', user?.id],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/playlists-with-counts?userId=${user?.id}`);
      return response.json();
    },
    enabled: !!user,
    refetchOnWindowFocus: false,
    refetchOnMount: false, // Use cached data from other pages
    staleTime: 5 * 60 * 1000, // 5 minutes - same as sidebar
  });

  return (
    <Layout playlists={playlists} backgroundImage={playlist?.coverImage}>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        
        {isLoading ? (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-6">
              <Skeleton className="w-full md:w-48 lg:w-60 aspect-square bg-muted" />
              <div className="flex-1">
                <Skeleton className="h-8 w-3/4 bg-muted mb-3" />
                <Skeleton className="h-4 w-full bg-muted mb-1" />
                <Skeleton className="h-4 w-full bg-muted mb-1" />
                <Skeleton className="h-4 w-2/3 bg-muted mb-4" />
                <Skeleton className="h-4 w-1/3 bg-muted" />
              </div>
            </div>
            <Skeleton className="h-[400px] w-full bg-muted" />
          </div>
        ) : isError ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">Failed to load playlist details</p>
            <Button 
              onClick={() => refetch()}
              variant="outline"
              className="border-border text-foreground hover:bg-muted"
            >
              Try Again
            </Button>
          </div>
        ) : playlist ? (
          <>
            <MetaTags 
              title={`${playlist.title} | Songfuse Playlist`}
              description={playlist.description || `A playlist of ${playlist.tracks.length} songs curated with AI by Songfuse.`}
              imageUrl={playlist.coverImage || playlist.coverImageUrl || playlist.spotifyImageUrl}
              type="music.playlist"
              url={`${window.location.origin}/playlist/${id}/${createSlug(playlist.title)}`}
            />
            <PlaylistDetailsComponent
              title={playlist.title}
              description={playlist.description}
              coverImage={playlist.coverImage || playlist.coverImageUrl}
              tracks={playlist.tracks}
              spotifyUrl={playlist.spotifyUrl}
              spotifyImageUrl={playlist.spotifyImageUrl}
              playlistId={playlist.id || parseInt(id)}
              isPublic={playlist.isPublic}
              articleTitle={playlist.articleTitle}
              articleLink={playlist.articleLink}
              onSongRemoved={() => refetch()}
            />
          </>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Playlist not found</p>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default PlaylistDetails;
