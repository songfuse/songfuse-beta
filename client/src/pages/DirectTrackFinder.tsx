import { useState, FormEvent, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function DirectTrackFinder() {
  const [title, setTitle] = useState('');
  const [trackId, setTrackId] = useState('');
  const [bulkTitles, setBulkTitles] = useState('');
  const [titleResults, setTitleResults] = useState<any[]>([]);
  const [bulkResults, setBulkResults] = useState<Record<string, any>>({});
  const [spotifyIdResult, setSpotifyIdResult] = useState<any>(null);
  const [bourbonKissesResult, setBourbonKissesResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState({
    title: false,
    spotifyId: false,
    bulk: false,
    bourbonTest: false
  });
  const [error, setError] = useState({
    title: '',
    spotifyId: '',
    bulk: '',
    bourbonTest: ''
  });
  const [stats, setStats] = useState<{
    requested?: number;
    matched?: number;
    notMatched?: number;
  }>({});
  
  // Special test function to check if "Bourbon Kisses" is correctly found with ID 699
  const testBourbonKisses = async () => {
    setIsLoading({ ...isLoading, bourbonTest: true });
    setError({ ...error, bourbonTest: '' });
    setBourbonKissesResult(null);
    
    try {
      // Test the direct finder endpoint
      const directResponse = await fetch(`/api/direct/find-by-title?title=${encodeURIComponent("Bourbon Kisses")}`);
      
      if (!directResponse.ok) {
        throw new Error(`Error: ${directResponse.status}`);
      }
      
      const directData = await directResponse.json();
      console.log('Bourbon Kisses direct test result:', directData);
      
      // Test the assistant-playlist endpoint (uses the same method internally)
      const assistantResponse = await fetch('/api/test/assistant-track-matcher', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          title: "Bourbon Kisses",
          artist: "Cymande"
        }),
      });
      
      let assistantData = { success: false, message: 'Failed to fetch data' };
      if (assistantResponse.ok) {
        assistantData = await assistantResponse.json();
        console.log('Bourbon Kisses assistant test result:', assistantData);
      } else {
        console.error('Assistant endpoint error:', assistantResponse.status);
      }
      
      setBourbonKissesResult({
        direct: directData.matches || [],
        assistant: assistantData,
        timestamp: new Date().toISOString()
      });
      
      if (!directData.matches || directData.matches.length === 0) {
        setError({ ...error, bourbonTest: 'No matches found for Bourbon Kisses using direct finder' });
      }
    } catch (err) {
      console.error('Error testing Bourbon Kisses:', err);
      setError({ ...error, bourbonTest: `Error: ${err.message}` });
    } finally {
      setIsLoading({ ...isLoading, bourbonTest: false });
    }
  };
  
  // Run the test automatically when the component mounts
  useEffect(() => {
    testBourbonKisses();
  }, []);

  // Search tracks by exact title match
  const handleTitleSearch = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      setError({ ...error, title: 'Please enter a track title' });
      return;
    }

    setIsLoading({ ...isLoading, title: true });
    setError({ ...error, title: '' });
    
    try {
      const response = await fetch(`/api/direct/find-by-title?title=${encodeURIComponent(title)}`);
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Title search results:', data);
      
      setTitleResults(data.matches || []);
      
      if (data.matches?.length === 0) {
        setError({ ...error, title: 'No tracks found with this exact title' });
      }
    } catch (err) {
      console.error('Error searching by title:', err);
      setError({ ...error, title: `Error: ${err.message}` });
      setTitleResults([]);
    } finally {
      setIsLoading({ ...isLoading, title: false });
    }
  };

  // Get Spotify ID for a track
  const handleSpotifyIdLookup = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!trackId.trim()) {
      setError({ ...error, spotifyId: 'Please enter a track ID' });
      return;
    }

    setIsLoading({ ...isLoading, spotifyId: true });
    setError({ ...error, spotifyId: '' });
    
    try {
      const response = await fetch(`/api/direct/get-spotify-id?trackId=${encodeURIComponent(trackId)}`);
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Spotify ID lookup result:', data);
      
      setSpotifyIdResult(data);
      
      if (!data.success) {
        setError({ ...error, spotifyId: data.error || 'No Spotify ID found for this track' });
      }
    } catch (err) {
      console.error('Error looking up Spotify ID:', err);
      setError({ ...error, spotifyId: `Error: ${err.message}` });
      setSpotifyIdResult(null);
    } finally {
      setIsLoading({ ...isLoading, spotifyId: false });
    }
  };
  
  // Bulk search for multiple tracks by title
  const handleBulkSearch = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!bulkTitles.trim()) {
      setError({ ...error, bulk: 'Please enter at least one track title' });
      return;
    }

    setIsLoading({ ...isLoading, bulk: true });
    setError({ ...error, bulk: '' });
    setBulkResults({});
    setStats({});
    
    try {
      // Split the input by newlines and filter out empty lines
      const titles = bulkTitles
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
      
      if (titles.length === 0) {
        throw new Error('No valid titles found');
      }
      
      const response = await fetch('/api/direct/find-by-titles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ titles }),
      });
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Bulk title search results:', data);
      
      if (data.success) {
        setBulkResults(data.results || {});
        setStats(data.stats || {});
        
        if (data.stats.matched === 0) {
          setError({ ...error, bulk: 'No matching tracks found for any of the titles' });
        }
      } else {
        setError({ ...error, bulk: data.error || 'Failed to search for tracks' });
      }
    } catch (err) {
      console.error('Error in bulk title search:', err);
      setError({ ...error, bulk: `Error: ${err.message}` });
      setBulkResults({});
      setStats({});
    } finally {
      setIsLoading({ ...isLoading, bulk: false });
    }
  };

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-6">Direct Track Finder</h1>
      <p className="mb-8 text-muted-foreground">
        Simple track lookup with exact matching - no AI, no fuzzy matching, just direct database lookups.
      </p>

      {/* Bourbon Kisses Test Results */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-3">Bourbon Kisses Track Test</h2>
        <div className="border rounded-lg p-4 bg-slate-50 dark:bg-slate-900">
          <div className="flex justify-between items-center mb-3">
            <div>
              <h3 className="font-medium">Testing track "Bourbon Kisses" (ID: 699)</h3>
              <p className="text-sm text-muted-foreground">
                This is a direct test of the problematic track that was getting incorrect IDs
              </p>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={testBourbonKisses} 
              disabled={isLoading.bourbonTest}
            >
              {isLoading.bourbonTest ? "Testing..." : "Run Test Again"}
            </Button>
          </div>

          {error.bourbonTest && (
            <Alert variant="destructive" className="mb-3">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error.bourbonTest}</AlertDescription>
            </Alert>
          )}

          {isLoading.bourbonTest ? (
            <div className="text-center py-8">Loading results...</div>
          ) : bourbonKissesResult ? (
            <div className="space-y-3">
              <div>
                <h4 className="font-medium">Direct Finder Results:</h4>
                {bourbonKissesResult.direct.length > 0 ? (
                  <div className="space-y-2 mt-2">
                    {bourbonKissesResult.direct.map((track: any) => (
                      <div key={track.id} className="border rounded p-3 bg-white dark:bg-slate-800">
                        <div className="flex justify-between">
                          <div>
                            <p><span className="font-medium">Title:</span> {track.title}</p>
                            <p><span className="font-medium">ID:</span> {track.id}</p>
                          </div>
                          {track.id === 699 ? (
                            <span className="px-2 py-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 text-xs rounded-full font-medium">
                              ✓ Correct ID
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100 text-xs rounded-full font-medium">
                              ✗ Wrong ID
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm italic text-muted-foreground mt-1">No matches found with direct finder</p>
                )}
                
                <h4 className="font-medium mt-4">Assistant Playlist Test:</h4>
                {bourbonKissesResult.assistant ? (
                  <div className="space-y-2 mt-2">
                    {bourbonKissesResult.assistant.success ? (
                      <div className="border rounded p-3 bg-white dark:bg-slate-800">
                        <div className="flex justify-between">
                          <div>
                            <p><span className="font-medium">Title:</span> {bourbonKissesResult.assistant.track?.title}</p>
                            <p><span className="font-medium">ID:</span> {bourbonKissesResult.assistant.track?.id}</p>
                            <p><span className="font-medium">Spotify ID:</span> {bourbonKissesResult.assistant.track?.spotifyId || 'N/A'}</p>
                          </div>
                          {bourbonKissesResult.assistant.track?.id === 699 ? (
                            <span className="px-2 py-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 text-xs rounded-full font-medium">
                              ✓ Correct ID
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100 text-xs rounded-full font-medium">
                              ✗ Wrong ID
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="border rounded p-3 bg-red-50 dark:bg-red-900/20">
                        <p className="text-red-600 dark:text-red-400">Error: {bourbonKissesResult.assistant.message}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm italic text-muted-foreground mt-1">No assistant lookup result available</p>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                Test ran at: {new Date(bourbonKissesResult.timestamp).toLocaleString()}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      
      <Tabs defaultValue="single">
        <TabsList className="mb-6">
          <TabsTrigger value="single">Single Track</TabsTrigger>
          <TabsTrigger value="bulk">Bulk Search</TabsTrigger>
        </TabsList>
        
        <TabsContent value="single">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Title Search Form */}
            <Card>
              <CardHeader>
                <CardTitle>Find by Exact Title</CardTitle>
                <CardDescription>
                  Search for tracks with an exact title match
                </CardDescription>
              </CardHeader>
              
              <CardContent>
                <form onSubmit={handleTitleSearch} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Track Title</Label>
                    <Input
                      id="title"
                      placeholder="Enter exact track title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </div>
                  
                  {error.title && (
                    <p className="text-sm text-red-500">{error.title}</p>
                  )}
                  
                  <Button type="submit" disabled={isLoading.title}>
                    {isLoading.title ? 'Searching...' : 'Search'}
                  </Button>
                </form>
                
                {titleResults.length > 0 && (
                  <>
                    <Separator className="my-4" />
                    <div className="space-y-2">
                      <h3 className="font-medium">Results ({titleResults.length})</h3>
                      <ScrollArea className="h-56 rounded-md border p-4">
                        <div className="space-y-2">
                          {titleResults.map((track) => (
                            <div key={track.id} className="border rounded p-2">
                              <p className="font-medium">{track.title}</p>
                              <p className="text-sm text-muted-foreground">ID: {track.id}</p>
                              <Button 
                                variant="outline" 
                                size="sm"
                                className="mt-1"
                                onClick={() => setTrackId(track.id.toString())}
                              >
                                Use this ID
                              </Button>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
            
            {/* Spotify ID Lookup Form */}
            <Card>
              <CardHeader>
                <CardTitle>Get Spotify ID</CardTitle>
                <CardDescription>
                  Find the Spotify ID for a track by database ID
                </CardDescription>
              </CardHeader>
              
              <CardContent>
                <form onSubmit={handleSpotifyIdLookup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="trackId">Track ID</Label>
                    <Input
                      id="trackId"
                      placeholder="Enter track ID from database"
                      value={trackId}
                      onChange={(e) => setTrackId(e.target.value)}
                    />
                  </div>
                  
                  {error.spotifyId && (
                    <p className="text-sm text-red-500">{error.spotifyId}</p>
                  )}
                  
                  <Button type="submit" disabled={isLoading.spotifyId}>
                    {isLoading.spotifyId ? 'Looking up...' : 'Get Spotify ID'}
                  </Button>
                </form>
                
                {spotifyIdResult && spotifyIdResult.success && (
                  <>
                    <Separator className="my-4" />
                    <div className="space-y-2">
                      <h3 className="font-medium">Result</h3>
                      <div className="border rounded p-4">
                        <p><span className="font-medium">Track ID:</span> {spotifyIdResult.trackId}</p>
                        <p><span className="font-medium">Spotify ID:</span> {spotifyIdResult.spotifyId}</p>
                        
                        <div className="mt-2">
                          <a
                            href={`https://open.spotify.com/track/${spotifyIdResult.spotifyId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:underline text-sm"
                          >
                            Open in Spotify
                          </a>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
              
              <CardFooter className="flex justify-between text-xs text-muted-foreground">
                <span>No AI or fuzzy matching involved</span>
                <span>Direct database lookup only</span>
              </CardFooter>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="bulk">
          <Card>
            <CardHeader>
              <CardTitle>Bulk Title Search</CardTitle>
              <CardDescription>
                Search for multiple tracks at once by exact title match
              </CardDescription>
            </CardHeader>
            
            <CardContent>
              <form onSubmit={handleBulkSearch} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="bulkTitles">Track Titles (one per line)</Label>
                  <Textarea
                    id="bulkTitles"
                    placeholder="Enter track titles, one per line"
                    rows={8}
                    value={bulkTitles}
                    onChange={(e) => setBulkTitles(e.target.value)}
                    className="font-mono"
                  />
                </div>
                
                {error.bulk && (
                  <p className="text-sm text-red-500">{error.bulk}</p>
                )}
                
                <Button type="submit" disabled={isLoading.bulk}>
                  {isLoading.bulk ? 'Searching...' : 'Search All Titles'}
                </Button>
              </form>
              
              {Object.keys(bulkResults).length > 0 && (
                <>
                  <Separator className="my-4" />
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="font-medium">Results</h3>
                      {stats.requested && (
                        <span className="text-sm text-muted-foreground">
                          {stats.matched} / {stats.requested} titles found ({Math.round((stats.matched! / stats.requested!) * 100)}%)
                        </span>
                      )}
                    </div>
                    
                    <ScrollArea className="h-96 rounded-md border p-4">
                      <div className="space-y-4">
                        {Object.entries(bulkResults).map(([title, matches]) => (
                          <div key={title} className="border rounded p-3">
                            <div className="flex justify-between items-start mb-2">
                              <h4 className="font-semibold">{title}</h4>
                              <span className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-full">
                                {(matches as any[]).length} match{(matches as any[]).length !== 1 ? 'es' : ''}
                              </span>
                            </div>
                            
                            {(matches as any[]).length > 0 ? (
                              <div className="space-y-2">
                                {(matches as any[]).map((track) => (
                                  <div key={track.id} className="bg-gray-50 dark:bg-gray-900 p-2 rounded text-sm">
                                    <div className="flex justify-between">
                                      <span>ID: {track.id}</span>
                                      <Button 
                                        variant="ghost" 
                                        size="sm"
                                        className="h-6 px-2"
                                        onClick={() => setTrackId(track.id.toString())}
                                      >
                                        Use ID
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground italic">No matches found</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                </>
              )}
            </CardContent>
            
            <CardFooter className="flex justify-between text-xs text-muted-foreground">
              <span>No AI or fuzzy matching involved</span>
              <span>Exact title matches only</span>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}