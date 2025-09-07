import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, Music, Play, Calendar, Hash } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Interface for album items from Apple Music API
interface Album {
  id: string;
  title: string;
  artist: string;
  releaseDate: string;
  chartPosition: number;
  genre: string;
  coverImage: string;
  appleUrl: string;
  isExplicit: boolean;
  artistId: string;
  description?: string;
}

interface Top25AlbumsProps {
  onCreatePlaylist: (prompt: string, albumData?: {title: string, artist: string, genre: string}) => void;
}

const Top25Albums = ({ onCreatePlaylist }: Top25AlbumsProps) => {
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState<number | null>(null);
  const { toast } = useToast();

  // Fetch top albums data
  const { data, isLoading, isError, error } = useQuery<{
    success: boolean;
    data: Album[];
    count: number;
    updated: string;
    message: string;
  }>({
    queryKey: ['/api/top-albums'],
    refetchInterval: 6 * 60 * 60 * 1000, // Refetch every 6 hours
    staleTime: 3 * 60 * 60 * 1000, // Consider stale after 3 hours
  });

  // Format date for display
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
    } catch {
      return dateString;
    }
  };

  // Format chart position with ordinal suffix
  const formatChartPosition = (position: number) => {
    const suffix = ['th', 'st', 'nd', 'rd'][position % 10 > 3 ? 0 : position % 10];
    return `${position}${suffix}`;
  };

  // Handle creating a playlist from an album
  const handleCreatePlaylist = async (album: Album, index: number) => {
    console.log("Creating playlist from album:", { album: album.title, artist: album.artist, index });
    
    try {
      setIsCreatingPlaylist(index);
      
      // Generate a detailed prompt based on the album information
      let prompt = `Create a playlist inspired by the trending album "${album.title}" by ${album.artist}.`;
      
      prompt += `\n\nAlbum Details:`;
      prompt += `\n- Genre: ${album.genre}`;
      prompt += `\n- Release Date: ${album.releaseDate}`;
      prompt += `\n- Current Chart Position: #${album.chartPosition} in US`;
      if (album.isExplicit) {
        prompt += `\n- Content: Explicit`;
      }
      
      prompt += `\n\nCreate a playlist that captures the musical style, energy, and current trending appeal of this album. Include songs that would appeal to fans of ${album.artist} and the ${album.genre} genre.`;
      
      // Add genre-specific guidance
      if (album.genre.toLowerCase().includes('hip-hop') || album.genre.toLowerCase().includes('rap')) {
        prompt += ` Focus on contemporary hip-hop and rap tracks with similar flow and production style.`;
      } else if (album.genre.toLowerCase().includes('pop')) {
        prompt += ` Focus on contemporary pop hits with catchy melodies and modern production.`;
      } else if (album.genre.toLowerCase().includes('country')) {
        prompt += ` Focus on modern country music with similar storytelling and instrumentation.`;
      } else if (album.genre.toLowerCase().includes('latin')) {
        prompt += ` Focus on Latin music with similar rhythms, language, and cultural elements.`;
      } else if (album.genre.toLowerCase().includes('r&b') || album.genre.toLowerCase().includes('soul')) {
        prompt += ` Focus on contemporary R&B and soul music with smooth vocals and modern production.`;
      }
      
      prompt += `\n\nThe playlist should reflect why this album is currently trending and popular in the US charts.`;
      
      // Album metadata for playlist context
      const albumData = {
        title: album.title,
        artist: album.artist,
        genre: album.genre
      };
      
      console.log("Generated album playlist prompt:", prompt);
      
      // Call the callback to create the playlist
      onCreatePlaylist(prompt, albumData);
      
      toast({
        title: "Playlist Creation Started",
        description: `Creating a playlist inspired by "${album.title}" by ${album.artist}`,
      });
      
    } catch (error) {
      console.error("Error creating playlist from album:", error);
      toast({
        title: "Error",
        description: "Failed to create playlist. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingPlaylist(null);
    }
  };

  return (
    <Card className="w-full">
      <CardContent className="p-2">
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
            <p className="text-muted-foreground">
              Loading Top 25 Albums from Apple Music...
            </p>
          </div>
        )}
        
        {isError && (
          <div className="py-8 text-muted-foreground">
            <p className="mb-2">Failed to load top albums.</p>
            <p className="text-sm">
              {error instanceof Error ? error.message : 'Unknown error occurred'}
            </p>
          </div>
        )}
        
        {!isLoading && !isError && data && data.data && data.data.length === 0 && (
          <div className="py-8 text-muted-foreground">
            <Music className="w-8 h-8 mb-2 opacity-50" />
            <p>No top albums available at the moment.</p>
            <p className="text-sm mt-1">Check back later for updates!</p>
          </div>
        )}
        
        {!isLoading && !isError && data && data.data && data.data.length > 0 && (
          <div className="space-y-6">
            
            {/* Chart List */}
            <div className="space-y-2">
              {data.data.map((album, index) => (
                <div key={album.id} className={`flex items-center gap-4 p-4 rounded-lg border transition-all duration-200 group ${
                  album.chartPosition <= 3 
                    ? 'bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-200 hover:from-yellow-100 hover:to-orange-100' 
                    : 'bg-card hover:bg-muted/50'
                }`}>
                  {/* Chart Position */}
                  <div className="flex-shrink-0 w-12 text-center">
                    <div className={`text-2xl font-bold ${
                      album.chartPosition <= 3 
                        ? 'bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent' 
                        : album.chartPosition <= 10
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                    }`}>
                      {album.chartPosition}
                    </div>
                    {album.chartPosition <= 3 && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {album.chartPosition === 1 ? 'Top 1' : album.chartPosition === 2 ? 'Top 2' : 'Top 3'}
                      </div>
                    )}
                    {album.chartPosition > 3 && album.chartPosition <= 10 && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Top 10
                      </div>
                    )}
                  </div>

                  {/* Album Cover */}
                  <div className="flex-shrink-0">
                    <img
                      src={album.coverImage}
                      alt={`${album.title} by ${album.artist}`}
                      className="w-32 h-32 object-cover rounded-md shadow-sm"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        if (!target.src.includes('100x100bb')) {
                          target.src = album.coverImage.replace('300x300bb', '100x100bb');
                        }
                      }}
                    />
                  </div>

                  {/* Album Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-base text-foreground truncate group-hover:text-primary transition-colors">
                          {album.title}
                        </h3>
                        <p className="text-sm text-muted-foreground truncate">
                          {album.artist}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {album.genre}
                          </Badge>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="w-3 h-3" />
                            {formatDate(album.releaseDate)}
                          </div>
                        </div>
                        
                        {/* Album Description */}
                        {album.description && (
                          <p className="text-xs text-muted-foreground mt-2 line-clamp-2 leading-relaxed">
                            {album.description}
                          </p>
                        )}
                      </div>
                      
                      {/* Create Playlist Button */}
                      <div className="flex-shrink-0 ml-4">
                        <Button
                          onClick={() => handleCreatePlaylist(album, index)}
                          disabled={isCreatingPlaylist === index}
                          size="sm"
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          {isCreatingPlaylist === index ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Creating...
                            </>
                          ) : (
                            <>
                              <Play className="w-4 h-4 mr-2" />
                              Create Playlist
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default Top25Albums;