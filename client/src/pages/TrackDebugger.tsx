import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";

// This is a debug page to help troubleshoot track display issues
export default function TrackDebugger() {
  const [playlistId, setPlaylistId] = useState('264');
  const [normalResponse, setNormalResponse] = useState<any>(null);
  const [directResponse, setDirectResponse] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchPlaylist = async (useDirectMode = false) => {
    setIsLoading(true);
    setError('');
    
    try {
      const endpoint = useDirectMode 
        ? `/api/playlist-direct/${playlistId}` 
        : `/api/playlist/${playlistId}?userId=1`;
      
      console.log(`Fetching from ${endpoint}`);
      const response = await fetch(endpoint);
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('API response:', data);
      
      if (useDirectMode) {
        setDirectResponse(data);
      } else {
        setNormalResponse(data);
      }
    } catch (err) {
      console.error('Error fetching playlist:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch playlist');
    } finally {
      setIsLoading(false);
    }
  };

  const renderTrackList = (tracks: any[] = []) => {
    if (!tracks || tracks.length === 0) {
      return <p className="text-muted-foreground italic">No tracks found</p>;
    }

    return (
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {tracks.map((track, index) => (
          <div key={`${track.id}-${index}`} className="p-3 bg-secondary/20 rounded-md">
            <p className="font-medium">{track.name}</p>
            <p className="text-xs">
              {track.artists && track.artists.map((a: any) => a.name).join(', ')}
            </p>
            <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <p>ID: {track.id}</p>
              <p>Position: {track.position}</p>
              <p>Spotify ID: {track.spotifyId || 'None'}</p>
              <p>Duration: {Math.floor((track.duration_ms || track.duration || 0) / 1000)}s</p>
            </div>
            {track.audio_features && (
              <div className="mt-2 pt-2 border-t border-border/60">
                <p className="text-xs font-medium mb-1">Audio Features:</p>
                <div className="grid grid-cols-4 gap-1 text-[10px]">
                  {Object.entries(track.audio_features).map(([key, value]: [string, any]) => (
                    <p key={key}>{key}: {typeof value === 'number' ? value.toFixed(2) : value}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="container py-10 space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Playlist Track Debugger</h1>
        <p className="text-muted-foreground">Troubleshoot track display issues with different API endpoints</p>
      </div>

      <div className="flex gap-4 items-end max-w-md mx-auto">
        <div className="flex-1">
          <label className="text-sm font-medium mb-1 block">Playlist ID</label>
          <Input 
            value={playlistId} 
            onChange={(e) => setPlaylistId(e.target.value)}
            placeholder="Enter playlist ID"
          />
        </div>
        <Button 
          onClick={() => fetchPlaylist(false)} 
          disabled={isLoading}
        >
          Fetch Normal
        </Button>
        <Button 
          onClick={() => fetchPlaylist(true)} 
          disabled={isLoading}
          variant="secondary"
        >
          Fetch Direct
        </Button>
      </div>

      {error && (
        <div className="p-4 bg-destructive/20 text-destructive rounded-md">
          {error}
        </div>
      )}

      <Tabs defaultValue="normal">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="normal">Normal API</TabsTrigger>
          <TabsTrigger value="direct">Direct Database</TabsTrigger>
        </TabsList>
        
        <TabsContent value="normal">
          <Card>
            <CardHeader>
              <CardTitle>Normal API Response</CardTitle>
              <CardDescription>
                Using standard API endpoint
              </CardDescription>
            </CardHeader>
            <CardContent>
              {normalResponse ? (
                <>
                  <div className="mb-4">
                    <h3 className="text-lg font-bold">{normalResponse.title}</h3>
                    <p className="text-sm text-muted-foreground mb-2">ID: {normalResponse.id}</p>
                    <p className="text-sm line-clamp-2">{normalResponse.description}</p>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Tracks ({normalResponse.tracks?.length || 0})</h4>
                    {renderTrackList(normalResponse.tracks)}
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground italic">No data fetched yet</p>
              )}
            </CardContent>
            <CardFooter>
              <div className="text-xs text-muted-foreground">
                Response size: {normalResponse ? JSON.stringify(normalResponse).length : 0} bytes
              </div>
            </CardFooter>
          </Card>
        </TabsContent>
        
        <TabsContent value="direct">
          <Card>
            <CardHeader>
              <CardTitle>Direct Database Response</CardTitle>
              <CardDescription>
                Using emergency direct database endpoint
              </CardDescription>
            </CardHeader>
            <CardContent>
              {directResponse ? (
                <>
                  <div className="mb-4">
                    <h3 className="text-lg font-bold">{directResponse.title}</h3>
                    <p className="text-sm text-muted-foreground mb-2">ID: {directResponse.id}</p>
                    <p className="text-sm line-clamp-2">{directResponse.description}</p>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Tracks ({directResponse.tracks?.length || 0})</h4>
                    {renderTrackList(directResponse.tracks)}
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground italic">No data fetched yet</p>
              )}
            </CardContent>
            <CardFooter>
              <div className="text-xs text-muted-foreground">
                Response size: {directResponse ? JSON.stringify(directResponse).length : 0} bytes
              </div>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}