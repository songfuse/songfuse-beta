import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SpotifyTrack } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import SimpleSpotifyEmbed from "./SimpleSpotifyEmbed";
import MusicSpinner from "./MusicSpinner";

interface TrackReplacerProps {
  track: SpotifyTrack;
  sessionId: string;
  onSelect: (newTrack: SpotifyTrack) => void;
  onCancel: () => void;
}

interface AlternateSuggestion {
  track: SpotifyTrack;
  reason: string;
}

const TrackReplacer = ({ track, sessionId, onSelect, onCancel }: TrackReplacerProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AlternateSuggestion[]>([]);
  const [customQuery, setCustomQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Function to get alternative tracks
  const fetchAlternatives = async (custom?: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const resp = await apiRequest(
        "POST",
        "/api/track/replace",
        { 
          sessionId,
          trackId: track.id,
          artistName: track.artists[0]?.name,
          trackName: track.name,
          customQuery: custom || undefined
        }
      );
      
      const response = await resp.json();
      
      if (response && response.alternatives && response.alternatives.length) {
        setSuggestions(response.alternatives);
      } else {
        setError("No alternative tracks found. Try a different query.");
      }
    } catch (err) {
      console.error("Error fetching alternative tracks:", err);
      setError("Failed to get alternative tracks. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Load alternatives on mount
  useEffect(() => {
    fetchAlternatives();
  }, []);

  // Handle custom query search
  const handleCustomSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (customQuery.trim()) {
      fetchAlternatives(customQuery);
    }
  };

  // Debug: log track information including database ID
  useEffect(() => {
    console.log("TrackReplacer - Original track info:", {
      name: track.name,
      id: track.id,
      dbId: track.dbId,
      artists: track.artists.map(a => a.name).join(", ")
    });
  }, [track]);

  // Enhanced onSelect handler to debug track info
  const handleTrackSelect = (newTrack: SpotifyTrack) => {
    console.log("TrackReplacer - Selected replacement track:", {
      name: newTrack.name,
      id: newTrack.id,
      dbId: newTrack.dbId,
      artists: newTrack.artists.map(a => a.name).join(", ")
    });
    onSelect(newTrack);
  };
  
  return (
    <Card className="p-3 bg-card/30 border-muted space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium">Replace track: {track.name}</h4>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={onCancel}
          className="h-8 w-8 p-0 rounded-full"
          title="Close"
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-4 w-4" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </Button>
      </div>
      
      <form onSubmit={handleCustomSearch} className="flex gap-2">
        <Input
          type="text"
          placeholder="Search for a specific song or vibe"
          value={customQuery}
          onChange={(e) => setCustomQuery(e.target.value)}
          className="text-sm"
        />
        <Button 
          type="submit" 
          size="sm"
          disabled={isLoading || !customQuery.trim()}
          variant="outline"
        >
          {isLoading ? (
            <MusicSpinner type="equalizer" size="sm" />
          ) : (
            "Search"
          )}
        </Button>
      </form>
      
      {error && (
        <div className="text-destructive text-sm p-2 rounded bg-destructive/10">
          {error}
        </div>
      )}
      
      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-4 gap-2">
            <MusicSpinner type="waveform" size="lg" color="hsl(var(--primary))" />
            <span className="text-sm text-muted-foreground">Finding alternatives...</span>
          </div>
        ) : suggestions.length > 0 ? (
          suggestions.map((suggestion, index) => (
            <div 
              key={suggestion.track.id + index}
              className="border border-muted rounded-md p-2 hover:bg-accent/10 transition-colors cursor-pointer"
              onClick={() => handleTrackSelect(suggestion.track)}
            >
              <div className="flex items-center gap-2">
                {suggestion.track.album.images[0]?.url && (
                  <img 
                    src={suggestion.track.album.images[0].url} 
                    alt={suggestion.track.album.name} 
                    className="w-12 h-12 rounded object-cover" 
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {suggestion.track.name}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {suggestion.track.artists.map(a => a.name).join(", ")}
                  </div>
                  <div className="text-xs text-muted-foreground/80 italic mt-1">
                    {suggestion.reason}
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : !error && (
          <div className="text-center text-muted-foreground py-4 text-sm">
            No alternatives found. Try searching for something specific.
          </div>
        )}
      </div>
      
      <div className="flex justify-between items-center mt-4">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button 
          variant="default" 
          size="sm" 
          onClick={() => fetchAlternatives()}
          disabled={isLoading}
        >
          {isLoading ? <MusicSpinner type="note" size="sm" /> : "More Suggestions"}
        </Button>
      </div>
    </Card>
  );
};

export default TrackReplacer;