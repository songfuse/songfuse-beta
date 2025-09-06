import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";

export default function EnhancedPlaylistTest() {
  const { user } = useAuth();
  const userId = user?.id;
  
  const [prompt, setPrompt] = useState('Create a playlist with synthwave and retro electronic music from the 80s');
  const [excludeExplicit, setExcludeExplicit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playlist, setPlaylist] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('input');

  const handleGenerate = async () => {
    if (!userId) {
      setError('You must be logged in to create a playlist');
      return;
    }
    
    if (!prompt.trim()) {
      setError('Please enter a prompt');
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      // Call our enhanced playlist generation endpoint
      const response = await fetch('/api/playlist/generate-enhanced', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          userId,
          excludeExplicit,
          sessionId: `test-${Date.now()}`
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Error generating playlist: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Unknown error generating playlist');
      }
      
      // Set the playlist data and switch to results tab
      setPlaylist(data);
      setActiveTab('results');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      console.error('Error generating playlist:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-8">Enhanced Playlist Test</h1>
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="input">Input</TabsTrigger>
          <TabsTrigger value="results" disabled={!playlist}>Results</TabsTrigger>
        </TabsList>
        
        <TabsContent value="input">
          <Card>
            <CardHeader>
              <CardTitle>Create Playlist</CardTitle>
              <CardDescription>
                Generate a playlist using our enhanced track matching algorithm
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              <div>
                <Label htmlFor="prompt">What kind of playlist do you want?</Label>
                <Textarea
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe the playlist you want to create..."
                  className="h-32 mt-2"
                />
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch
                  id="exclude-explicit"
                  checked={excludeExplicit}
                  onCheckedChange={setExcludeExplicit}
                />
                <Label htmlFor="exclude-explicit">Exclude explicit content</Label>
              </div>
            </CardContent>
            <CardFooter>
              <Button 
                onClick={handleGenerate} 
                disabled={loading || !userId}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  'Generate Playlist'
                )}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        <TabsContent value="results">
          {playlist && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>{playlist.playlist.title}</CardTitle>
                  <CardDescription>
                    {playlist.playlist.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="p-4 bg-muted rounded-md mb-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="font-semibold text-lg">Playlist Info</h3>
                        <p className="text-sm text-muted-foreground">Method: {playlist.usedMcp ? 'Vector Search (MCP)' : 'Standard Search'}</p>
                      </div>
                      <div className="text-right">
                        <p>{playlist.playlist.tracks.length} tracks</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    {playlist.playlist.tracks.map((track: any, index: number) => (
                      <div 
                        key={`${track.id}-${index}`} 
                        className="p-3 rounded-md hover:bg-muted flex justify-between items-center"
                      >
                        <div className="flex-1">
                          <p className="font-medium">{track.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {track.artists?.map((a: any) => a.name).join(', ')}
                          </p>
                        </div>
                        <div className="flex items-center space-x-2">
                          {track.explicit && (
                            <span className="bg-destructive text-destructive-foreground text-xs px-2 py-1 rounded">
                              Explicit
                            </span>
                          )}
                          {track.external_urls?.spotify && (
                            <a 
                              href={track.external_urls.spotify}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline text-sm"
                            >
                              Spotify
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
                <CardFooter>
                  <Button 
                    onClick={() => setActiveTab('input')} 
                    variant="outline" 
                    className="w-full"
                  >
                    Create Another Playlist
                  </Button>
                </CardFooter>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}