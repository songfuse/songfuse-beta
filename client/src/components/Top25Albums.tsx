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
    <Card className="w-full bg-card border-border">
      <CardContent className="pt-6 text-left">
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
            {/* Header with last updated info */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-foreground">
                Apple Music Top 25 Albums (US)
              </h2>
              <p className="text-sm text-muted-foreground">
                Updated: {data.updated ? new Date(data.updated).toLocaleDateString() : 'Today'}
              </p>
            </div>
            
            {/* Albums Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {data.data.map((album, index) => (
                <Card key={album.id} className="relative overflow-hidden hover:shadow-lg transition-shadow">
                  <CardContent className="p-4">
                    {/* Chart Position Badge */}
                    <div className="absolute top-2 left-2 z-10">
                      <Badge variant="secondary" className="bg-primary/90 text-primary-foreground">
                        <Hash className="w-3 h-3 mr-1" />
                        {formatChartPosition(album.chartPosition)}
                      </Badge>
                    </div>
                    

                    
                    {/* Album Cover */}
                    <div className="relative mb-3">
                      <img
                        src={album.coverImage}
                        alt={`${album.title} by ${album.artist}`}
                        className="w-full aspect-square object-cover rounded-md"
                        onError={(e) => {
                          // Fallback to a lower resolution if high-res fails
                          const target = e.target as HTMLImageElement;
                          if (!target.src.includes('100x100bb')) {
                            target.src = album.coverImage.replace('300x300bb', '100x100bb');
                          }
                        }}
                      />
                    </div>
                    
                    {/* Album Info */}
                    <div className="space-y-2">
                      <h3 className="font-semibold text-sm line-clamp-2 text-foreground">
                        {album.title}
                      </h3>
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {album.artist}
                      </p>
                      
                      {/* Genre and Release Date */}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-xs">
                          {album.genre}
                        </Badge>
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(album.releaseDate)}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                  
                  <CardFooter className="pt-0 pb-4 px-4 space-y-2">
                    {/* Create Playlist Button */}
                    <Button
                      onClick={() => handleCreatePlaylist(album, index)}
                      disabled={isCreatingPlaylist === index}
                      className="w-full"
                      size="sm"
                    >
                      {isCreatingPlaylist === index ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Creating Playlist...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-2" />
                          Create Playlist
                        </>
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default Top25Albums;