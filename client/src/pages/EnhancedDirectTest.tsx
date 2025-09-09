import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSpotify } from '@/hooks/useSpotify';
import { GeneratedPlaylist } from '@shared/schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Music, Play, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function EnhancedDirectTest() {
  const { user } = useAuth();
  const { generatePlaylistWithEnhancedDirect, isLoading } = useSpotify();
  const { toast } = useToast();
  
  const [prompt, setPrompt] = useState('');
  const [playlist, setPlaylist] = useState<GeneratedPlaylist | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionId] = useState(`test-${Date.now()}`);

  const handleGenerate = async () => {
    if (!user) {
      setError('You must be logged in to create a playlist');
      return;
    }
    
    if (!prompt.trim()) {
      setError('Please enter a prompt');
      return;
    }
    
    try {
      setError(null);
      setPlaylist(null);
      
      console.log('Generating playlist with Enhanced Direct API...');
      const result = await generatePlaylistWithEnhancedDirect(prompt, sessionId);
      
      if (result && result.playlist) {
        setPlaylist(result.playlist);
        toast({
          title: "Playlist Generated!",
          description: result.message,
        });
      } else {
        setError('Failed to generate playlist');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      console.error('Error generating playlist:', err);
    }
  };

  const testPrompts = [
    "songs by The Beatles",
    "punk rock playlist",
    "happy summer music",
    "high energy workout music",
    "surprise me with random songs"
  ];

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Enhanced Direct API Test</h1>
        <p className="text-muted-foreground">
          Test the new Enhanced Direct API with AI-powered playlist generation
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Section */}
        <Card>
          <CardHeader>
            <CardTitle>Generate Playlist</CardTitle>
            <CardDescription>
              Enter a prompt to generate an AI-powered playlist
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Input
                placeholder="e.g., songs by The Beatles, punk rock playlist, happy summer music..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleGenerate()}
                disabled={isLoading}
              />
            </div>
            
            <Button 
              onClick={handleGenerate} 
              disabled={isLoading || !prompt.trim()}
              className="w-full"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Music className="mr-2 h-4 w-4" />
                  Generate Playlist
                </>
              )}
            </Button>

            {/* Quick Test Buttons */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Quick Tests:</p>
              <div className="flex flex-wrap gap-2">
                {testPrompts.map((testPrompt) => (
                  <Button
                    key={testPrompt}
                    variant="outline"
                    size="sm"
                    onClick={() => setPrompt(testPrompt)}
                    disabled={isLoading}
                  >
                    {testPrompt}
                  </Button>
                ))}
              </div>
            </div>

            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results Section */}
        <Card>
          <CardHeader>
            <CardTitle>Generated Playlist</CardTitle>
            <CardDescription>
              {playlist ? `Generated using Enhanced Direct API` : 'No playlist generated yet'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {playlist ? (
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-lg">{playlist.title}</h3>
                  <p className="text-sm text-muted-foreground">{playlist.description}</p>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {playlist.tracks.length} tracks
                  </Badge>
                  <Badge variant="outline">
                    Enhanced Direct API
                  </Badge>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium">Tracks:</h4>
                  <div className="max-h-60 overflow-y-auto space-y-1">
                    {playlist.tracks.map((track, index) => (
                      <div key={track.id} className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                        <span className="text-sm font-mono w-8">{index + 1}.</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{track.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {track.artists.map(a => a.name).join(', ')} • {track.album.name}
                          </p>
                        </div>
                        <Button size="sm" variant="ghost">
                          <Play className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button className="flex-1">
                    <Save className="mr-2 h-4 w-4" />
                    Save Playlist
                  </Button>
                  <Button variant="outline">
                    <Play className="mr-2 h-4 w-4" />
                    Play All
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Music className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Enter a prompt to generate a playlist</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
