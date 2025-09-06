import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { apiRequest } from '@/lib/queryClient';
import { Loader2, RefreshCw, CheckCircle2, Search, Music } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { SpotifyTrack } from '@/types';

interface Song {
  title: string;
  artist: string;
  album?: string;
}

interface ParsedSong {
  title: string;
  artist: string;
  album: string;
  searchQuery: string;
}

interface SearchResult {
  track: SpotifyTrack;
  status: 'found' | 'not_found';
}

// Function to parse raw song strings in various formats
function parseSongString(songString: string): ParsedSong {
  // Format: "Title:>Artist:>Album" or "Title:>Artist"
  if (songString.includes(':>')) {
    const parts = songString.split(':>');
    const title = parts[0] || '';
    const artist = parts[1] || '';
    const album = parts[2] || 'Unknown Album';
    
    return {
      title,
      artist,
      album,
      searchQuery: `${title} ${artist}`.trim()
    };
  }
  
  // Format: "Title by Artist"
  if (songString.includes(' by ')) {
    const [title, artist] = songString.split(' by ');
    return {
      title: title || '',
      artist: artist || '',
      album: 'Unknown Album',
      searchQuery: songString
    };
  }
  
  // Format: Just a string (assume it's all title)
  return {
    title: songString,
    artist: '',
    album: 'Unknown Album',
    searchQuery: songString
  };
}

// Parse songs from the assistant response
function parseSongsFromResponse(response: any): ParsedSong[] {
  if (!response) return [];
  
  // If response has a songs array
  if (response.songs && Array.isArray(response.songs)) {
    return response.songs.map((song: any) => {
      // If song is a string
      if (typeof song === 'string') {
        return parseSongString(song);
      }
      
      // If song is an object
      if (typeof song === 'object') {
        const title = song.title || song.name || '';
        const artist = song.artist || song.artists || '';
        const album = song.album || 'Unknown Album';
        
        return {
          title,
          artist,
          album,
          searchQuery: `${title} ${artist}`.trim()
        };
      }
      
      // Fallback
      return {
        title: String(song),
        artist: '',
        album: 'Unknown Album',
        searchQuery: String(song)
      };
    });
  }
  
  // If the response is wrapped in text or has a different format
  // Try to extract a JSON block from the text
  if (response.text) {
    const text = response.text;
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
    
    if (jsonMatch && jsonMatch[1]) {
      try {
        const jsonData = JSON.parse(jsonMatch[1]);
        if (jsonData.songs && Array.isArray(jsonData.songs)) {
          return jsonData.songs.map((song: any) => {
            if (typeof song === 'string') {
              return parseSongString(song);
            }
            
            const title = song.title || song.name || '';
            const artist = song.artist || song.artists || '';
            const album = song.album || 'Unknown Album';
            
            return {
              title,
              artist,
              album,
              searchQuery: `${title} ${artist}`.trim()
            };
          });
        }
      } catch (e) {
        console.error('Failed to parse JSON from text', e);
      }
    }
  }
  
  return [];
}

export default function DirectAssistantTest() {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState<any>(null);
  const [timing, setTiming] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [parsedSongs, setParsedSongs] = useState<ParsedSong[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [playlistTitle, setPlaylistTitle] = useState('');
  const [playlistDescription, setPlaylistDescription] = useState('');
  const [isSavingPlaylist, setIsSavingPlaylist] = useState(false);
  const [playlistSaved, setPlaylistSaved] = useState(false);
  const [playlistId, setPlaylistId] = useState<number | null>(null);
  
  const { toast } = useToast();

  // Mutation for the direct assistant API call
  const directAssistantMutation = useMutation({
    mutationFn: async (prompt: string) => {
      // Use the special bypassed endpoint
      const url = '/_songfuse_api/playlist/direct-assistant';
      console.log(`Making API request to ${url} with prompt: ${prompt.substring(0, 30)}...`);
      
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ prompt })
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
      } catch (error) {
        console.error("Fetch error:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log('Direct Assistant API response:', data);
      
      // Set the response data
      if (data.success) {
        let responseData: any;
        
        if (data.response) {
          responseData = data.response;
        } else if (data.rawResponse) {
          try {
            // Try to parse the raw response as JSON
            responseData = JSON.parse(data.rawResponse);
          } catch (e) {
            // If parsing fails, just show the raw text
            responseData = { text: data.rawResponse };
          }
        }
        
        setResponse(responseData);
        
        // Extract title and description if available
        if (responseData.title) {
          setPlaylistTitle(responseData.title);
        } else {
          // Use the user's prompt as a fallback title
          setPlaylistTitle(`Playlist based on "${prompt.substring(0, 30)}..."`);
        }
        
        if (responseData.description) {
          setPlaylistDescription(responseData.description);
        }
        
        // Parse songs from the response
        const songs = parseSongsFromResponse(responseData);
        setParsedSongs(songs);
        
        // Set timing information if available
        if (data.timing) {
          setTiming(data.timing);
        }
        
        setError(null);
      } else {
        setError(data.message || 'Unknown error');
        setResponse(null);
      }
    },
    onError: (error: any) => {
      console.error('Direct Assistant API error:', error);
      setError(error.message || 'Failed to communicate with Assistant API');
      setResponse(null);
    }
  });
  
  // Mutation for searching songs in the database
  const searchSongsMutation = useMutation({
    mutationFn: async (songs: ParsedSong[]) => {
      // Prepare search parameters
      const searchParams = songs.map(song => ({
        title: song.title,
        artist: song.artist,
        query: song.searchQuery
      }));
      
      console.log('Searching for songs with params:', searchParams);
      
      const response = await fetch('/api/discover/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ songs: searchParams })
      });
      
      // Log the raw response for debugging
      const responseText = await response.text();
      console.log('Raw search response:', responseText);
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}\nResponse: ${responseText}`);
      }
      
      // Parse JSON manually since we already read the text
      try {
        return JSON.parse(responseText);
      } catch (err) {
        console.error('Error parsing JSON response:', err);
        throw new Error(`Invalid JSON response: ${responseText}`);
      }
    },
    onSuccess: (data) => {
      console.log('Search results received:', data);
      
      if (data.results && Array.isArray(data.results)) {
        setSearchResults(data.results);
        console.log(`Found ${data.results.filter(r => r.status === 'found').length} out of ${data.results.length} songs`);
        
        // Show success or partial success toast
        const foundCount = data.results.filter(r => r.status === 'found').length;
        if (foundCount > 0) {
          toast({
            title: `Found ${foundCount} songs`,
            description: foundCount === data.results.length 
              ? 'All songs were found in our database.' 
              : `${foundCount} out of ${data.results.length} songs were found.`,
            variant: 'default'
          });
        } else {
          toast({
            title: 'No songs found',
            description: 'None of the songs were found in our database. Try a different prompt.',
            variant: 'destructive'
          });
        }
      } else {
        console.error('Invalid results format:', data);
        toast({
          title: 'Invalid search results',
          description: 'The search results were not in the expected format.',
          variant: 'destructive'
        });
      }
      
      setIsSearching(false);
    },
    onError: (error) => {
      console.error('Error searching for songs:', error);
      toast({
        title: 'Error searching for songs',
        description: 'There was a problem finding matches in our database.',
        variant: 'destructive'
      });
      setIsSearching(false);
    }
  });
  
  // Mutation for saving the playlist to the database
  const savePlaylistMutation = useMutation({
    mutationFn: async (playlistData: { 
      title: string; 
      description: string; 
      tracks: any[];
      coverImage?: string;
      isPublic?: boolean;
    }) => {
      const response = await fetch('/api/playlist/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(playlistData)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    },
    onSuccess: (data) => {
      if (data.id) {
        setPlaylistId(data.id);
        setPlaylistSaved(true);
        toast({
          title: 'Playlist saved!',
          description: 'Your playlist has been saved successfully.',
          variant: 'default'
        });
      }
      setIsSavingPlaylist(false);
    },
    onError: (error) => {
      console.error('Error saving playlist:', error);
      toast({
        title: 'Error saving playlist',
        description: 'There was a problem saving your playlist.',
        variant: 'destructive'
      });
      setIsSavingPlaylist(false);
    }
  });

  // Handle form submission to generate playlist
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    
    // Clear previous results
    setResponse(null);
    setTiming(null);
    setError(null);
    setParsedSongs([]);
    setSearchResults([]);
    setPlaylistTitle('');
    setPlaylistDescription('');
    setPlaylistSaved(false);
    setPlaylistId(null);
    
    // Call the API
    directAssistantMutation.mutate(prompt);
  };

  // Handle searching for songs in database
  const handleSearchSongs = () => {
    if (parsedSongs.length === 0) {
      toast({
        title: 'No songs to search',
        description: 'Please generate a playlist first.',
        variant: 'destructive'
      });
      return;
    }
    
    setIsSearching(true);
    searchSongsMutation.mutate(parsedSongs);
  };
  
  // Handle saving the playlist to database
  const handleSavePlaylist = () => {
    // Get all found tracks from search results
    const foundTracks = searchResults
      .filter(result => result.status === 'found')
      .map(result => result.track);
    
    if (foundTracks.length === 0) {
      toast({
        title: 'No tracks found',
        description: 'Please search for songs first.',
        variant: 'destructive'
      });
      return;
    }
    
    // Prepare playlist data
    const playlistData = {
      title: playlistTitle || `Playlist based on "${prompt.substring(0, 30)}..."`,
      description: playlistDescription || `Generated from prompt: ${prompt.substring(0, 100)}...`,
      tracks: foundTracks,
      isPublic: true
    };
    
    setIsSavingPlaylist(true);
    savePlaylistMutation.mutate(playlistData);
  };
  
  // Find matches between parsed songs and search results
  const getMatchStatus = (index: number): 'found' | 'not_found' | 'pending' => {
    if (!searchResults.length) return 'pending';
    const result = searchResults[index];
    return result ? result.status : 'pending';
  };
  
  // Format timestamp for display
  const formatTime = (timeString: string) => {
    if (!timeString) return '';
    const date = new Date(timeString);
    return date.toLocaleTimeString();
  };

  return (
    <div className="container py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Direct Assistant API Test</h1>
      <p className="mb-4 text-muted-foreground">
        This page tests the direct Assistant API implementation with special route prefixing to bypass Vite middleware.
      </p>
      
      <form onSubmit={handleSubmit} className="space-y-4 mb-8">
        <div className="space-y-2">
          <label htmlFor="prompt" className="text-sm font-medium">
            Enter your prompt for playlist generation:
          </label>
          <Textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Create a playlist of songs about space travel with a mix of rock and electronic music"
            className="min-h-[120px]"
          />
        </div>
        
        <Button 
          type="submit" 
          disabled={directAssistantMutation.isPending || !prompt.trim()}
          className="w-full"
        >
          {directAssistantMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating Playlist...
            </>
          ) : 'Generate Playlist with Assistant API'}
        </Button>
      </form>
      
      {directAssistantMutation.isPending && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Processing Request</CardTitle>
            <CardDescription>Please wait while we generate your playlist...</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </CardContent>
        </Card>
      )}
      
      {error && (
        <Card className="mb-8 border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{error}</p>
          </CardContent>
        </Card>
      )}
      
      {response && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Assistant API Response</CardTitle>
            <CardDescription>
              {timing && `Generated in ${timing.duration.toFixed(2)}s (${timing.pollCount} polls)`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Display playlist title and description if available */}
            {response.title && (
              <div>
                <h3 className="text-xl font-bold">{response.title}</h3>
                {response.description && <p className="text-sm text-muted-foreground">{response.description}</p>}
              </div>
            )}
            
            {/* Display songs if available */}
            {response.songs && response.songs.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2">Songs</h4>
                <ul className="space-y-1">
                  {response.songs.map((song: any, index: number) => (
                    <li key={index} className="flex">
                      <span className="w-6 text-muted-foreground">{index + 1}.</span>
                      <span>
                        {typeof song === 'string' 
                          ? song 
                          : `${song.title || song.name || ''} ${song.artist ? `by ${song.artist}` : ''}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* Fallback for unexpected response format */}
            {!response.songs && !response.title && response.text && (
              <pre className="bg-muted p-4 rounded-md overflow-auto max-h-[400px] text-sm">
                {response.text}
              </pre>
            )}
          </CardContent>
          
          {timing && (
            <>
              <Separator />
              <CardFooter className="pt-4 text-xs text-muted-foreground">
                <div className="w-full space-y-1">
                  <div className="flex justify-between">
                    <span>Start Time:</span>
                    <span>{formatTime(timing.startTime)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>End Time:</span>
                    <span>{formatTime(timing.endTime)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Duration:</span>
                    <span>{timing.duration.toFixed(2)} seconds</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Poll Count:</span>
                    <span>{timing.pollCount}</span>
                  </div>
                </div>
              </CardFooter>
            </>
          )}
        </Card>
      )}
      
      {/* Parsed Songs and Search Results */}
      {parsedSongs.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Parsed Songs</span>
              <div className="flex space-x-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleSearchSongs}
                  disabled={isSearching || searchResults.length > 0}
                >
                  {isSearching ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Searching...
                    </>
                  ) : (
                    <>
                      <Search className="mr-2 h-4 w-4" />
                      Search Database
                    </>
                  )}
                </Button>
                {searchResults.length > 0 && (
                  <Button 
                    variant="default" 
                    size="sm" 
                    onClick={handleSavePlaylist}
                    disabled={isSavingPlaylist || playlistSaved}
                  >
                    {isSavingPlaylist ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : playlistSaved ? (
                      <>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Playlist Saved
                      </>
                    ) : (
                      <>
                        <Music className="mr-2 h-4 w-4" />
                        Save Playlist
                      </>
                    )}
                  </Button>
                )}
              </div>
            </CardTitle>
            <CardDescription>
              {parsedSongs.length} songs extracted from the Assistant response
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 text-left font-medium">#</th>
                    <th className="py-2 text-left font-medium">Title</th>
                    <th className="py-2 text-left font-medium">Artist</th>
                    <th className="py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedSongs.map((song, index) => (
                    <tr key={index} className="border-b border-muted">
                      <td className="py-3 text-sm text-muted-foreground">{index + 1}</td>
                      <td className="py-3 text-sm">{song.title}</td>
                      <td className="py-3 text-sm">{song.artist}</td>
                      <td className="py-3 text-sm">
                        {searchResults.length > 0 ? (
                          <Badge variant={
                            getMatchStatus(index) === 'found' ? 'default' : 
                            getMatchStatus(index) === 'not_found' ? 'destructive' : 'outline'
                          }>
                            {getMatchStatus(index) === 'found' ? 'Found' : 
                             getMatchStatus(index) === 'not_found' ? 'Not Found' : 'Pending'}
                          </Badge>
                        ) : (
                          <Badge variant="outline">Pending Search</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {/* Playlist Information */}
              {searchResults.length > 0 && (
                <div className="mt-6 p-4 bg-muted rounded-md">
                  <h3 className="text-lg font-semibold mb-2">Playlist Summary</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">Total Songs:</span>
                      <span className="text-sm">{parsedSongs.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">Found Songs:</span>
                      <span className="text-sm">{searchResults.filter(r => r.status === 'found').length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">Missing Songs:</span>
                      <span className="text-sm">{searchResults.filter(r => r.status === 'not_found').length}</span>
                    </div>
                    
                    {playlistSaved && playlistId && (
                      <div className="mt-4 pt-4 border-t border-border">
                        <p className="text-sm text-center">
                          Playlist saved successfully! View it in <a href={`/playlist/${playlistId}`} className="text-primary font-medium">My Playlists</a>.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}