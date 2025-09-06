import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2, Music, ExternalLink, ThumbsUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Interface for news items from the API
interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  content?: string;
  contentSnippet?: string;
  description?: string;
  imageUrl?: string;
  source: string;
  sourceName: string;
  guid?: string;
  categories?: string[];
}

interface MusicNewsFeedProps {
  onCreatePlaylist: (prompt: string, articleData?: {title: string, link: string}) => void;
}

const MusicNewsFeed = ({ onCreatePlaylist }: MusicNewsFeedProps) => {
  const { toast } = useToast();
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState<number | null>(null);

  // Fetch music news from the API
  const { data, isLoading, isError, error } = useQuery<{ success: boolean; data: NewsItem[]; lastUpdated?: string; cached?: boolean }>({
    queryKey: ['/api/music-news'],
    queryFn: async () => {
      console.log("Fetching music news from API...");
      const response = await fetch('/api/music-news');
      if (!response.ok) {
        console.error("Failed to fetch music news:", response.status, response.statusText);
        throw new Error('Failed to fetch music news');
      }
      const result = await response.json();
      console.log("Music news data received:", result);
      return result;
    },
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Format the last updated timestamp
  const formatLastUpdated = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
      
      if (diffInHours < 1) {
        return "Updated just now";
      } else if (diffInHours < 24) {
        return `Updated ${diffInHours} hour${diffInHours === 1 ? '' : 's'} ago`;
      } else {
        const diffInDays = Math.floor(diffInHours / 24);
        return `Updated ${diffInDays} day${diffInDays === 1 ? '' : 's'} ago`;
      }
    } catch (e) {
      return "Recently updated";
    }
  };

  // Format the publication date
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      // If the date is today, show only the time
      const today = new Date();
      if (
        date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear()
      ) {
        return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }
      
      // If the date is within the last 7 days, show the day name
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      if (date > sevenDaysAgo) {
        return date.toLocaleDateString([], { weekday: 'long' }) + 
               ` at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }
      
      // Otherwise show the full date
      return date.toLocaleDateString([], { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });
    } catch (e) {
      console.error("Error formatting date:", e);
      return dateString;
    }
  };

  // Handle creating a playlist from a news item
  const handleCreatePlaylist = (newsItem: NewsItem, index: number) => {
    console.log("handleCreatePlaylist called with:", { newsItem: newsItem.title, index });
    
    try {
      setIsCreatingPlaylist(index);
      
      // Generate a detailed prompt based on the news content that will produce better playlist results
      let prompt = `Create a thematic playlist based on this music news article: "${newsItem.title}"`;
      
      // Add detailed formatting to guide the AI in creating a relevant playlist
      prompt += `\n\nPlease create a playlist that captures the musical style, era, artists, and mood related to this news story.`;
      
      // Add more context from the content if available
      if (newsItem.contentSnippet) {
        // Use the entire content snippet for better context
        prompt += `\n\nArticle content: ${newsItem.contentSnippet}`;
        
        // Extract any artist names mentioned in the article
        const artistMatches = newsItem.contentSnippet.match(/([A-Z][a-z]+ [A-Z][a-z]+|The [A-Z][a-z]+)/g);
        if (artistMatches && artistMatches.length > 0) {
          // Filter duplicates using object keys for compatibility
          const artistSet: {[key: string]: boolean} = {};
          const uniqueArtists = artistMatches.filter(artist => {
            if (!artistSet[artist]) {
              artistSet[artist] = true;
              return true;
            }
            return false;
          });
          prompt += `\n\nMentioned artists: ${uniqueArtists.join(', ')}`;
        }
      }
      
      // Add source information for better context
      if (newsItem.sourceName) {
        prompt += `\n\nFrom music publication: ${newsItem.sourceName}`;
      }
      
      // Add categories if available
      if (newsItem.categories && newsItem.categories.length > 0) {
        prompt += `\n\nMusical categories: ${newsItem.categories.join(', ')}`;
      }
      
      // Request variety in the generated playlist
      prompt += `\n\nPlease include a mix of well-known tracks and relevant deep cuts. Include songs that relate to the article's theme while ensuring musical variety and flow.`;
      
      console.log("Generated prompt:", prompt);
      console.log("Article data:", { title: newsItem.title, link: newsItem.link });
      
      // Call the provided callback with the detailed prompt and article metadata
      if (typeof onCreatePlaylist === 'function') {
        console.log("Calling onCreatePlaylist function...");
        onCreatePlaylist(prompt, {
          title: newsItem.title,
          link: newsItem.link
        });
        console.log("onCreatePlaylist function called successfully");
      } else {
        console.error("onCreatePlaylist is not a function:", onCreatePlaylist);
        throw new Error("onCreatePlaylist is not a function");
      }
      
      // Show a toast notification
      toast({
        title: "Creating News-Inspired Playlist",
        description: `Generating a playlist based on: "${newsItem.title}"`,
        duration: 5000,
      });
      
      // Reset the loading state after a delay
      setTimeout(() => {
        setIsCreatingPlaylist(null);
      }, 3000);
    } catch (error) {
      console.error("Error in handleCreatePlaylist:", error);
      
      // Show error toast
      toast({
        title: "Error Creating Playlist",
        description: "There was an error creating the playlist. Please try again.",
        variant: "destructive",
        duration: 5000,
      });
      
      // Reset loading state
      setIsCreatingPlaylist(null);
    }
  };

  // Extract a summary from the content
  const getSummary = (newsItem: NewsItem): string => {
    let text = '';
    
    // Try to use the contentSnippet first
    if (newsItem.contentSnippet) {
      text = newsItem.contentSnippet;
    }
    // If no contentSnippet, try to use the description
    else if (newsItem.description) {
      text = newsItem.description;
    }
    // If nothing else is available, use the title
    else {
      return `Read more about ${newsItem.title}`;
    }
    
    // Remove HTML tags and decode any remaining entities
    const strippedText = text
      .replace(/<[^>]*>?/gm, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ') // Replace non-breaking spaces
      .replace(/&amp;/g, '&') // Replace &amp;
      .replace(/&lt;/g, '<') // Replace &lt;
      .replace(/&gt;/g, '>') // Replace &gt;
      .replace(/&quot;/g, '"') // Replace &quot;
      .replace(/&#39;/g, "'") // Replace &#39;
      .replace(/&#8230;/g, '...') // Replace &#8230; (ellipsis)
      .replace(/&#8217;/g, "'") // Replace &#8217; (right single quote)
      .trim();
    
    return strippedText.slice(0, 150) + (strippedText.length > 150 ? '...' : '');
  };

  return (
    <Card className="w-full bg-card border-border">
      <CardContent className="pt-6 text-left">
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
            <p className="text-muted-foreground">
              Fetching the latest music news...
            </p>
          </div>
        )}
        
        {isError && (
          <div className="py-8 text-muted-foreground">
            <p className="mb-2">Failed to load music news.</p>
            <p className="text-sm">
              {error instanceof Error ? error.message : 'Unknown error occurred'}
            </p>
          </div>
        )}
        
        {!isLoading && !isError && data && data.data && data.data.length === 0 && (
          <div className="py-8 text-muted-foreground">
            <Music className="w-8 h-8 mb-2 opacity-50" />
            <p>No music news available at the moment.</p>
            <p className="text-sm mt-1">Check back later for updates!</p>
          </div>
        )}
        
        {!isLoading && !isError && data && data.data && data.data.length > 0 && (
          <div className="space-y-8">
            {data && data.data && data.data.slice(0, 10).map((newsItem, index) => (
              <div key={newsItem.guid || newsItem.link + index} className="relative">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    {newsItem.sourceName && (
                      <div className="flex items-center">
                        <div className="w-7 h-7 bg-primary/10 rounded-full overflow-hidden flex items-center justify-center mr-2">
                          <Music className="w-4 h-4 text-primary" />
                        </div>
                        <div className="text-sm">
                          <span>In </span>
                          <span className="font-medium">{newsItem.sourceName}</span>
                          <span className="text-muted-foreground text-xs ml-1 mr-1">•</span>
                          <span className="text-muted-foreground text-xs">{formatDate(newsItem.pubDate)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="md:flex-1">
                      <h3 className="text-xl md:text-2xl font-bold mb-2 leading-tight hover:text-primary transition-colors">
                        {newsItem.title}
                      </h3>
                      
                      <p className="text-muted-foreground mb-3">
                        {getSummary(newsItem)}
                      </p>
                      
                      <div className="flex flex-wrap gap-3 items-center mt-4">
                        <button
                          className="text-sm text-primary hover:text-primary/80 hover:underline inline-flex items-center gap-1 font-medium"
                          onClick={() => window.open(newsItem.link, '_blank')}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Read Article
                        </button>
                        
                        <Button
                          variant="secondary"
                          size="sm"
                          className="rounded-full"
                          onClick={() => handleCreatePlaylist(newsItem, index)}
                          disabled={isCreatingPlaylist !== null}
                        >
                          {isCreatingPlaylist === index ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                              Creating...
                            </>
                          ) : (
                            <>
                              <Music className="w-4 h-4 mr-1" />
                              Create Playlist
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                    
                    {/* Image (if available) */}
                    {newsItem.imageUrl && (
                      <div className="md:w-1/3 max-w-[240px]">
                        <div className="w-full aspect-square overflow-hidden rounded-md bg-muted">
                          <img 
                            src={newsItem.imageUrl} 
                            alt={newsItem.title} 
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              // Hide broken images
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {index < data.data.length - 1 && <Separator className="my-6" />}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MusicNewsFeed;