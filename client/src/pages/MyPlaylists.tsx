import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Header from "@/components/Header";
import SidebarNav from "@/components/SidebarNav";
import Layout from "../components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { usePlaylistUpdate } from "@/contexts/PlaylistUpdateContext";
import { usePlaylistCreator } from "@/contexts/PlaylistCreatorContext";
import { apiRequest } from "@/lib/queryClient";
import { createSlug } from "@/lib/utils";
import PlaylistCard from "../components/PlaylistCard";
import PlaylistCoverPlaceholder from "../components/PlaylistCoverPlaceholder";
import SpotifyPlaylistCover from "../components/SpotifyPlaylistCover";
import SpotifyBadge from "../components/SpotifyBadge";
import SearchForm from "../components/SearchForm";
import { Search } from "lucide-react";

interface Playlist {
  id: number;
  spotifyId: string;
  title: string;
  description: string;
  coverImage?: string;
  trackCount?: number;
  spotifyUrl: string;
  spotifyImageUrl?: string;
}

const MyPlaylists = () => {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { lastUpdatedPlaylistId, resetNotification } = usePlaylistUpdate();
  const { openCreator } = usePlaylistCreator();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [searchType, setSearchType] = useState<"title" | "description">("title");
  
  // Search form submission
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(inputValue.trim());
  };

  // Fetch user's playlists with accurate track counts  
  const { 
    data: playlists = [], 
    isLoading, 
    isError, 
    refetch 
  } = useQuery({
    queryKey: ['/api/playlists-with-counts', user?.id],
    queryFn: async () => {
      // Use the regular playlists endpoint
      try {
        console.log(`Making GET request to /api/playlists-with-counts?userId=${user?.id}`);
        const response = await fetch(`/api/playlists-with-counts?userId=${user?.id}`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch from direct counts API: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Enhanced logging to debug the issue
        console.log('Playlists from direct counts API:', data);
        if (data && data.length > 0) {
          // Log the first playlist's cover image specifically
          console.log('First playlist details:', {
            id: data[0].id,
            title: data[0].title,
            coverImage: data[0].coverImage,
            trackCount: data[0].trackCount,
            hasSpotifyId: !!data[0].spotifyId,
            hasSpotifyImageUrl: !!data[0].spotifyImageUrl
          });
        }
        
        return data;
      } catch (directError) {
        // More detailed error logging to identify the issue
        console.warn("Error with direct counts endpoint, falling back to original:", directError);
        console.error("Direct counts API error details:", {
          message: directError instanceof Error ? directError.message : String(directError),
          stack: directError instanceof Error ? directError.stack : undefined,
          name: directError instanceof Error ? directError.name : undefined,
        });
        
        // Debug CORS issues
        if (directError instanceof TypeError && directError.message.includes('Failed to fetch')) {
          console.error("Possible CORS or network issue detected");
        }
        
        // Fallback to original endpoint
        try {
          console.log(`Falling back to original endpoint: /api/playlists?userId=${user?.id}`);
          const response = await fetch(`/api/playlists?userId=${user?.id}`);
          if (!response.ok) {
            throw new Error(`Failed to fetch playlists: ${response.status}`);
          }
          
          const data = await response.json();
          console.log('Playlists from API (fallback):', data);
          if (data && data.length > 0) {
            // Log the first playlist's cover image for comparison
            console.log('First playlist details from fallback:', {
              id: data[0].id,
              title: data[0].title,
              coverImage: data[0].coverImage,
              trackCount: data[0].length, // original endpoint might use 'length' instead of 'trackCount'
              hasSpotifyId: !!data[0].spotifyId,
              hasSpotifyImageUrl: !!data[0].spotifyImageUrl
            });
          }
          return data;
        } catch (fallbackError) {
          console.error("Both APIs failed:", fallbackError);
          throw fallbackError;
        }
      }
    },
    enabled: !!user,
    refetchInterval: 30000, // Reduced: Refresh every 30 seconds to ensure track counts are current
    refetchOnWindowFocus: false, // Don't refetch on window focus to reduce image loading
    staleTime: 25000 // Consider data stale after 25 seconds
  });
  
  // Listen for playlist updates from other components
  useEffect(() => {
    if (lastUpdatedPlaylistId) {
      console.log(`A playlist was updated (ID: ${lastUpdatedPlaylistId}), refreshing playlist list...`);
      // Invalidate the playlists query to trigger a refetch
      queryClient.invalidateQueries({ queryKey: ['/api/playlists-with-counts', user?.id] });
      // Refresh the playlists
      refetch();
      // Reset the notification to avoid duplicate refreshes
      resetNotification();
    }
  }, [lastUpdatedPlaylistId, user?.id, queryClient, refetch, resetNotification]);
  
  // Listen for custom events from playlist creation
  useEffect(() => {
    const handlePlaylistCreated = () => {
      console.log("MyPlaylists: Received playlist-created or sidebar-refresh event, fetching playlists");
      if (user) {
        // Invalidate the playlists query to trigger a refetch
        queryClient.invalidateQueries({ queryKey: ['/api/playlists-with-counts', user?.id] });
        // Refresh the playlists
        refetch();
      }
    };
    
    // Add event listeners for both events
    window.addEventListener('playlist-created', handlePlaylistCreated);
    window.addEventListener('sidebar-refresh-requested', handlePlaylistCreated);
    
    // Clean up listeners when component unmounts
    return () => {
      window.removeEventListener('playlist-created', handlePlaylistCreated);
      window.removeEventListener('sidebar-refresh-requested', handlePlaylistCreated);
    };
  }, [queryClient, refetch, user]);
  
  // Filter playlists based on search (title and description only)
  const filteredPlaylists = playlists.filter((playlist: Playlist) => {
    if (!searchQuery) return true;
    
    const query = searchQuery.toLowerCase();
    
    if (searchType === "title") {
      return playlist.title.toLowerCase().includes(query);
    } else if (searchType === "description") {
      return playlist.description && playlist.description.toLowerCase().includes(query);
    }
    
    return false;
  });

  const handleDeletePlaylist = async (id: number) => {
    if (!user || !id) return;
    
    try {
      setDeletingId(id);
      console.log(`Making DELETE request to /api/v2/playlist/${id}?userId=${user.id} with headers:`, {
        "Accept": "application/json"
      });
      
      // Try v2 endpoint first, fall back to original if needed
      try {
        await apiRequest("DELETE", `/api/v2/playlist/${id}?userId=${user.id}`, {
          headers: {
            "Accept": "application/json"
          }
        });
      } catch (v2Error) {
        console.warn("Error with v2 endpoint for deletion, falling back to original:", v2Error);
        await apiRequest("DELETE", `/api/playlist/${id}?userId=${user.id}`);
      }
      
      toast({
        title: "Playlist deleted",
        description: "Your playlist has been successfully deleted.",
      });
      
      refetch();
    } catch (error) {
      console.error("Error deleting playlist:", error);
      toast({
        title: "Delete failed",
        description: "Failed to delete playlist. Please try again.",
        variant: "destructive"
      });
    } finally {
      setDeletingId(null);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-bold text-foreground mb-2">Not logged in</h2>
            <p className="text-muted-foreground mb-4">Please log in to view your playlists</p>
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

  return (
    <Layout playlists={playlists}>
      <div className="container px-2 py-4 max-w-6xl">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <h1 className="font-bold bg-gradient-to-r from-teal-400 to-[#1DB954] text-transparent bg-clip-text text-2xl md:text-3xl lg:text-[40px] leading-normal py-1">My Playlists</h1>
            {!isLoading && !isError && (
              <span className="text-sm text-muted-foreground font-normal bg-muted border-border px-2 py-0.5 rounded-full">
                {playlists.length} {playlists.length === 1 ? 'playlist' : 'playlists'}
              </span>
            )}
          </div>
          
          {/* Search Form */}
          <SearchForm
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            inputValue={inputValue}
            setInputValue={setInputValue}
            searchType={searchType}
            setSearchType={setSearchType}
            onSearch={handleSearch}
          />
        </div>
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-6">
          {[...Array(9)].map((_, i) => (
            <Card key={i} className="bg-card border-border overflow-hidden h-full flex flex-col">
              <Skeleton className="aspect-square w-full bg-accent" />
              <div className="p-4 pb-2">
                <Skeleton className="h-5 w-3/4 bg-accent mb-2" />
              </div>
              <div className="px-4 pb-2 flex-grow">
                <Skeleton className="h-4 w-full bg-accent mb-2" />
                <Skeleton className="h-4 w-2/3 bg-accent" />
              </div>
              <div className="px-4 pb-4">
                <Skeleton className="h-3 w-1/3 bg-accent" />
              </div>
            </Card>
          ))}
        </div>
      ) : isError ? (
        <div className="text-center py-12">
          <div className="h-16 w-16 bg-accent rounded-full mx-auto overflow-hidden mb-4 flex items-center justify-center">
            <span className="text-3xl">⚠️</span>
          </div>
          <h3 className="text-xl font-bold mb-3 text-red-400">Failed to load playlists</h3>
          <p className="text-muted-foreground mb-4">There was a problem retrieving your playlists</p>
          <Button 
            onClick={() => refetch()}
            className="bg-[#1DB954] hover:bg-[#1ed760] text-white"
          >
            Try Again
          </Button>
        </div>
      ) : playlists.length === 0 ? (
        <div className="text-center py-16 max-w-md mx-auto">
          <h2 className="text-2xl font-bold mb-3 bg-gradient-to-r from-teal-400 to-[#1DB954] text-transparent bg-clip-text">No playlists yet</h2>
          <p className="text-muted-foreground mb-6">Create your first AI-powered playlist and it will appear here</p>
          <Button 
            onClick={() => openCreator()}
            className="bg-[#1DB954] hover:bg-[#1ed760] text-white"
          >
            Create New Playlist
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {searchQuery && filteredPlaylists.length === 0 ? (
            <div className="md:col-span-2 lg:col-span-3 xl:col-span-4 text-center py-10">
              <div className="h-20 w-20 bg-muted rounded-full mx-auto overflow-hidden mb-6 flex items-center justify-center">
                <Search className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-foreground">No playlists found</h3>
              <p className="text-muted-foreground mb-6">No playlists matching "{searchQuery}" were found</p>
              <Button 
                onClick={() => {
                  setSearchQuery("");
                  setInputValue("");
                }}
                className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 dark:bg-card dark:hover:bg-accent dark:text-white shadow-sm font-medium px-6"
              >
                Clear Search
              </Button>
            </div>
          ) : (
            filteredPlaylists.map((playlist: Playlist) => (
              <Card key={`playlist-${playlist.id}`} className="bg-card border-border hover:bg-muted transition-colors overflow-hidden h-full flex flex-col group">
                <div className="aspect-square w-full overflow-hidden relative">
                  {/* 
                    Priority order for cover images:
                    1. Songfuse-generated cover (AI-generated or user-uploaded)
                    2. Fallback to placeholder if no Songfuse cover is available
                    3. Never use Spotify cover if we already have a Songfuse cover
                  */}
                  <PlaylistCoverPlaceholder 
                    size="md" 
                    imageUrl={playlist.coverImage}
                    spotifyImageUrl={playlist.spotifyImageUrl}
                    altText={playlist.title}
                  />
                  
                  {/* Display Spotify badge when playlist has a Spotify URL */}
                  {playlist.spotifyUrl && <SpotifyBadge />}
                  {/* Action buttons overlay (visible on hover) */}
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-60 transition-opacity flex items-center justify-center opacity-0 group-hover:opacity-100">
                    {playlist.spotifyUrl && (
                      <Button 
                        onClick={() => window.open(playlist.spotifyUrl, "_blank")}
                        className="bg-[#1DB954] hover:bg-[#1ed760] text-white mr-2"
                        size="sm"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </Button>
                    )}
                    <Button
                      onClick={() => setLocation(`/playlist/${playlist.id}/${createSlug(playlist.title)}`)}
                      variant="secondary"
                      className="bg-[#555] hover:bg-[#666] text-white mr-2"
                      size="sm"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </Button>
                    {playlist.id && (
                      <Button 
                        onClick={() => handleDeletePlaylist(playlist.id)}
                        variant="destructive"
                        size="sm"
                        disabled={deletingId === playlist.id}
                      >
                        {deletingId === playlist.id ? (
                          <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
                
                <div className="flex flex-col flex-grow" onClick={() => setLocation(`/playlist/${playlist.id}/${createSlug(playlist.title)}`)}>
                  <div className="p-4 pb-2">
                    <h3 className="text-lg line-clamp-1 font-bold">{playlist.title}</h3>
                  </div>
                  
                  <div className="px-4 pb-2 flex-grow">
                    {playlist.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{playlist.description}</p>
                    )}
                  </div>
                  
                  <div className="px-4 pb-4 text-xs text-muted-foreground">
                    <div className="flex justify-end w-full items-center">
                      <div className="flex items-center">
                        <span>{playlist.trackCount !== undefined ? `${playlist.trackCount} songs` : '0 songs'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}
      </div>
    </Layout>
  );
};

export default MyPlaylists;
