import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function DirectMatchTest() {
  const [trackTitles, setTrackTitles] = useState('Tron 1982 - New Retro Wave');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultStats, setResultStats] = useState<{
    success?: boolean;
    count?: number;
    requested?: number;
  }>({});

  const handleSearch = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Split the input by newlines and remove empty lines
      const titles = trackTitles
        .split('\n')
        .map(title => title.trim())
        .filter(title => title.length > 0);
      
      if (titles.length === 0) {
        setError('Please enter at least one track title.');
        setLoading(false);
        return;
      }
      
      // Use the direct endpoint to bypass any middleware issues
      const response = await fetch('/api/direct-exact-title-matches', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ titles }),
      });
      
      if (!response.ok) {
        throw new Error(`Error searching tracks: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Update state with the search results
      setResults(data.tracks || []);
      setResultStats({
        success: data.success,
        count: data.count,
        requested: data.requested
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      console.error('Error searching tracks:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-8">Direct Track Match Test</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Track Titles</CardTitle>
              <CardDescription>
                Enter track titles (one per line) to search for exact matches
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={trackTitles}
                onChange={(e) => setTrackTitles(e.target.value)}
                placeholder="Enter track titles here, one per line"
                className="h-64 font-mono"
              />
            </CardContent>
            <CardFooter>
              <Button 
                onClick={handleSearch} 
                disabled={loading}
                className="w-full"
              >
                {loading ? 'Searching...' : 'Search Tracks'}
              </Button>
            </CardFooter>
          </Card>
        </div>
        
        <div>
          <Card>
            <CardHeader>
              <CardTitle>
                Results {resultStats.count !== undefined ? `(${resultStats.count}/${resultStats.requested})` : ''}
              </CardTitle>
              <CardDescription>
                Exact matches found in the database
              </CardDescription>
            </CardHeader>
            <CardContent>
              {error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              {results.length === 0 && !loading && !error ? (
                <div className="text-center py-8 text-gray-500">
                  No results yet. Try searching for some tracks.
                </div>
              ) : (
                <div className="space-y-4">
                  {results.map((track, index) => (
                    <Card key={index} className="overflow-hidden">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-bold">{track.title}</h3>
                            {track.spotify_id && (
                              <div className="text-sm text-muted-foreground">
                                Spotify ID: {track.spotify_id}
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="mt-2 text-sm">
                          <div className="grid grid-cols-2 gap-2">
                            <div><strong>Track ID:</strong> {track.id}</div>
                            <div><strong>Explicit:</strong> {track.explicit ? 'Yes' : 'No'}</div>
                            <div><strong>Popularity:</strong> {track.popularity}</div>
                            <div><strong>Release Date:</strong> {track.release_date || 'Unknown'}</div>
                          </div>
                          
                          {track.spotify_url && (
                            <div className="mt-2">
                              <a 
                                href={track.spotify_url} 
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
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}