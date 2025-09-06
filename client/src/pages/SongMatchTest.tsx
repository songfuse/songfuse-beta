import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function SongMatchTest() {
  const [input, setInput] = useState(`Tron 1982 - New Retro Wave by FM-84
Summer Nights by SIAMES
Midnight City by M83
Take on Me by a-ha
Smells Like Teen Spirit by Nirvana`);
  
  const [results, setResults] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('input');

  const parseSongsFromText = (text: string): Array<{ title: string; artist: string }> => {
    return text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        // Try to split by "by" to separate title and artist
        const byIndex = line.lastIndexOf(' by ');
        if (byIndex > 0) {
          return {
            title: line.substring(0, byIndex).trim(),
            artist: line.substring(byIndex + 4).trim()
          };
        }
        
        // Try to split by "-" if "by" is not found
        const dashIndex = line.lastIndexOf(' - ');
        if (dashIndex > 0) {
          return {
            title: line.substring(0, dashIndex).trim(),
            artist: line.substring(dashIndex + 3).trim()
          };
        }
        
        // If no separator found, use the whole line as the title
        return {
          title: line,
          artist: 'Unknown'
        };
      });
  };

  const handleSearch = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Parse input to get songs
      const songs = parseSongsFromText(input);
      
      if (songs.length === 0) {
        setError('Please enter at least one song.');
        setLoading(false);
        return;
      }
      
      // Call our improved API endpoint
      const response = await fetch('/api/find-tracks-by-songs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ songs }),
      });
      
      if (!response.ok) {
        throw new Error(`Error searching songs: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Update state with the search results
      setResults(data);
      setActiveTab('results');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      console.error('Error searching songs:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-8">Song Match Test</h1>
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="input">Input</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
        </TabsList>
        
        <TabsContent value="input">
          <Card>
            <CardHeader>
              <CardTitle>Song List</CardTitle>
              <CardDescription>
                Enter songs in format "Title by Artist" (one per line)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Enter songs, one per line, in format: Title by Artist"
                className="h-64 font-mono"
              />
            </CardContent>
            <CardFooter>
              <Button 
                onClick={handleSearch} 
                disabled={loading}
                className="w-full"
              >
                {loading ? 'Searching...' : 'Find Matches'}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        <TabsContent value="results">
          <Card>
            <CardHeader>
              <CardTitle>
                Results 
                {results.matchCount !== undefined && 
                  ` (${results.matchCount}/${results.requestedCount})`}
              </CardTitle>
              <CardDescription>
                Song matches found in the database
              </CardDescription>
            </CardHeader>
            <CardContent>
              {error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              {(!results.matches || Object.keys(results.matches).length === 0) && !loading && !error ? (
                <div className="text-center py-8 text-gray-500">
                  No results yet. Try searching for some songs.
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="bg-muted p-4 rounded-md">
                    <h3 className="font-semibold text-lg mb-2">Match Summary</h3>
                    <p>Found {results.matchCount} matches out of {results.requestedCount} requested songs</p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Match Rate: {results.matchCount && results.requestedCount 
                        ? Math.round((results.matchCount / results.requestedCount) * 100) 
                        : 0}%
                    </p>
                  </div>
                  
                  <div className="space-y-4">
                    {results.matches && Object.entries(results.matches).map(([songId, data]: [string, any]) => (
                      <Card key={songId} className="overflow-hidden">
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <h3 className="font-bold">{data.track.title}</h3>
                              {data.spotifyId && (
                                <div className="text-sm text-muted-foreground">
                                  Spotify ID: {data.spotifyId}
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="mt-2 text-sm">
                            <div className="grid grid-cols-2 gap-2">
                              <div><strong>Track ID:</strong> {data.track.id}</div>
                              <div><strong>Explicit:</strong> {data.track.explicit ? 'Yes' : 'No'}</div>
                              <div><strong>Popularity:</strong> {data.track.popularity}</div>
                              <div><strong>Release Date:</strong> {data.track.release_date || 'Unknown'}</div>
                            </div>
                            
                            {data.track.spotify_url && (
                              <div className="mt-2">
                                <a 
                                  href={data.track.spotify_url} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="text-primary hover:underline"
                                >
                                  Open in Spotify
                                </a>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button 
                onClick={() => setActiveTab('input')} 
                variant="outline" 
                className="w-full"
              >
                Back to Input
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}