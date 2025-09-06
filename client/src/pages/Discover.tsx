import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useRoute } from "wouter";
import { Search, X } from "lucide-react";
import SpotifyBadge from "@/components/SpotifyBadge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Layout from "@/components/Layout";
import PlaylistCoverPlaceholder from "../components/PlaylistCoverPlaceholder";
import { createSlug } from "@/lib/utils";

type Playlist = {
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
  creatorName: string;
  songCount: number;
};

import { useAuth } from '@/contexts/AuthContext';

export default function Discover() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState<"title" | "description">("title");
  const [inputValue, setInputValue] = useState("");
  const { user } = useAuth(); // Get the current user from context
  const isLoggedIn = !!user;
  
  // Get query parameters from URL
  const [, params] = useRoute("/discover/:type/:query");
  const [, setLocation] = useLocation();

  // Fetch user's playlists for the sidebar section (only if logged in)
  const { data: userPlaylists, isLoading: loadingUserPlaylists } = useQuery({
    queryKey: ["/api/playlists", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const response = await fetch(`/api/playlists?userId=${user.id}`);
      if (!response.ok) throw new Error("Failed to fetch user playlists");
      return response.json();
    },
    enabled: isLoggedIn,
  });
  
  // Use the URL parameters if available - only on initial load
  useEffect(() => {
    if (params && !searchQuery) {
      const { type, query } = params;
      setSearchType(type === "description" ? "description" : "title");
      setSearchQuery(decodeURIComponent(query));
      setInputValue(decodeURIComponent(query));
    }
  }, [params, searchQuery]);
  
  // Fetch playlists based on search type and query
  const { data: playlists, isLoading, error, refetch } = useQuery({
    queryKey: ["/api/discover/search", searchQuery, user?.id, isLoggedIn],
    queryFn: async () => {
      // Always exclude current user's playlists and only show public playlists saved to Spotify
      const userIdParam = isLoggedIn && user?.id ? `userId=${user.id}` : '';
      // Always require public playlists for both logged-in and non-logged-in users
      const publicOnlyParam = 'isPublic=true';
      // Always require Spotify ID for all users
      const spotifyOnlyParam = 'spotifyOnly=true';
      
      // Create URL with appropriate query parameters
      let url = '';
      
      // If there's no search query, fetch all playlists
      if (!searchQuery || searchQuery.trim() === '') {
        url = `/api/discover/playlists`;
        // Add query params
        const params = [publicOnlyParam, spotifyOnlyParam];
        if (userIdParam) params.push(userIdParam);
        url += `?${params.join('&')}`;
      } 
      // For title/description search
      else {
        url = `/api/discover/search?q=${encodeURIComponent(searchQuery)}`;
        // Add additional params with & instead of ? since we already have a query param
        const additionalParams = [publicOnlyParam, spotifyOnlyParam];
        if (userIdParam) additionalParams.push(userIdParam);
        url += `&${additionalParams.join('&')}`;
      }
      
      console.log(`Fetching from URL: ${url}`);
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error(`Error fetching from ${url}:`, response.statusText);
        throw new Error(`Failed to fetch playlists: ${response.statusText}`);
      }
      
      return response.json();
    },
    enabled: true,
  });
  
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Don't process empty searches
    if (!inputValue || inputValue.trim() === '') {
      // If search is cleared, reset the URL to base discover page
      setLocation('/discover');
      setSearchQuery('');
      return;
    }
    
    // Trim whitespace from input
    const trimmedValue = inputValue.trim();
    
    // Update the search query state
    setSearchQuery(trimmedValue);
    
    // Manually trigger the refetch to ensure search results update
    refetch();
    
    // Update URL for shareable links
    setLocation(`/discover/${searchType}/${encodeURIComponent(trimmedValue)}`);
    
    console.log(`Performing ${searchType} search for: "${trimmedValue}"`);
  };
  
  return (
    <Layout playlists={isLoggedIn ? userPlaylists : []}>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex flex-col gap-8">
          <div className="w-full">
            <h1 className="font-bold mb-2 bg-gradient-to-r from-teal-400 to-[#1DB954] text-transparent bg-clip-text text-[40px]">
              Discover Playlists
            </h1>
        
        {/* Search Form */}
        <form onSubmit={handleSearch} className="flex flex-col gap-4 mb-8 md:flex-row">
          <div className="flex-1">
            <div className="relative w-full">
              <Input
                type="text"
                placeholder={searchType === "description" ? "Search by description..." : "Search by title..."}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSearch(e);
                  }
                }}
                className="bg-card border-border w-full text-foreground pr-10"
              />
              {inputValue && (
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/70 hover:text-foreground"
                  onClick={() => {
                    setInputValue("");
                    setSearchQuery(""); // Also clear the search query to reset results
                  }}
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          
          <div className="flex gap-2">
            <Select 
              value={searchType} 
              onValueChange={(value) => setSearchType(value as "title" | "description")}
            >
              <SelectTrigger className="bg-card border-border w-[180px] text-foreground">
                <SelectValue className="text-foreground" placeholder="Search by" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                <SelectItem value="title">Title</SelectItem>
                <SelectItem value="description">Description</SelectItem>
              </SelectContent>
            </Select>
            
            <Button type="submit" className="bg-primary hover:bg-primary/80">
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
          </div>
        </form>
        
        {/* Results */}
        <div className="mt-8">
          {isLoading ? (
            <div className="flex justify-center items-center my-12">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
            </div>
          ) : error ? (
            <div className="text-center text-red-500 py-8">
              <p>Error loading playlists. Please try again.</p>
            </div>
          ) : !playlists || playlists.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-lg text-muted-foreground">
                {searchQuery ? "No playlists found matching your search." : "No playlists available."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {playlists.map((playlist: Playlist) => (
                <div key={playlist.id} className="cursor-pointer" onClick={() => setLocation(`/discover/playlist/${playlist.id}`)}>
                  <PlaylistCard playlist={playlist} />
                </div>
              ))}
            </div>
          )}
        </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function PlaylistCard({ playlist }: { playlist: Playlist }) {
  const [imageError, setImageError] = useState(false);
  
  return (
    <Card className="bg-card border-border hover:bg-muted transition-colors overflow-hidden h-full flex flex-col relative">
      <div className="aspect-square w-full overflow-hidden">
        {/* 
          Priority order for cover images:
          1. Songfuse-generated cover (AI-generated or user-uploaded)
          2. Fallback to placeholder if no Songfuse cover is available
          3. Never use Spotify cover if we already have a Songfuse cover
        */}
        <PlaylistCoverPlaceholder 
          size="md" 
          imageUrl={playlist.coverImageUrl || undefined}
          spotifyImageUrl={playlist.spotifyImageUrl || undefined}
          altText={playlist.title}
        />
        
        {/* Spotify badge for playlists saved to Spotify */}
        {playlist.spotifyId && <SpotifyBadge />}
      </div>
      
      <CardHeader className="pb-2">
        <CardTitle className="text-lg line-clamp-1 font-bold">{playlist.title}</CardTitle>
      </CardHeader>
      
      <CardContent className="pb-2 flex-grow">
        {playlist.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{playlist.description}</p>
        )}
      </CardContent>
      
      <CardFooter className="text-xs text-muted-foreground pt-0">
        <div className="flex justify-between w-full">
          <span className="truncate max-w-[60%]">By {playlist.creatorName || 'Unknown'}</span>
          <span>{playlist.songCount !== undefined ? `${playlist.songCount} songs` : '0 songs'}</span>
        </div>
      </CardFooter>
    </Card>
  );
}
