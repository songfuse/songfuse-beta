import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { usePlaylistUpdate } from '@/contexts/PlaylistUpdateContext';
import { usePlaylistCreator } from '@/contexts/PlaylistCreatorContext';
import { apiRequest } from '@/lib/queryClient';
import { ExternalLink, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface ImportResult {
  success: boolean;
  playlistId?: number;
  trackCount?: number;
  message?: string;
  error?: string;
}

const SpotifyPlaylistImporter: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { triggerSidebarRefresh } = usePlaylistUpdate();
  const { closeCreator } = usePlaylistCreator();
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const handleImport = async () => {
    if (!user) {
      toast({
        title: "Not logged in",
        description: "Please log in to import playlists",
        variant: "destructive"
      });
      return;
    }

    if (!playlistUrl.trim()) {
      toast({
        title: "URL required",
        description: "Please enter a Spotify playlist URL",
        variant: "destructive"
      });
      return;
    }

    setIsImporting(true);
    setImportResult(null);

    try {
      const result = await apiRequest('POST', '/api/spotify/import-playlist', {
        userId: user.id,
        playlistUrl: playlistUrl.trim()
      });

      setImportResult({
        success: true,
        playlistId: result.playlistId,
        trackCount: result.trackCount,
        message: result.message
      });

      toast({
        title: "Playlist imported!",
        description: `Successfully imported playlist with ${result.trackCount} tracks`,
      });

      // Trigger playlist list refresh
      triggerSidebarRefresh();
      
      // Close the creator if it's open
      closeCreator();

    } catch (error: any) {
      console.error('Import error:', error);
      
      let errorMessage = 'Failed to import playlist';
      
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      // Provide more helpful error messages
      if (errorMessage.includes('404') || errorMessage.includes('not found')) {
        errorMessage = 'Playlist not found. Please check that the URL is correct and the playlist is public.';
      } else if (errorMessage.includes('401') || errorMessage.includes('authentication')) {
        errorMessage = 'Spotify API authentication failed. Please check server configuration.';
      } else if (errorMessage.includes('403') || errorMessage.includes('Access denied')) {
        errorMessage = 'Access denied. You may not have permission to access this playlist.';
      } else if (errorMessage.includes('Invalid') && errorMessage.includes('URL')) {
        errorMessage = 'Invalid Spotify playlist URL. Please use a valid Spotify playlist URL or ID.';
      } else if (errorMessage.includes('not configured')) {
        errorMessage = 'Spotify API not configured. Please contact support.';
      } else if (errorMessage.includes('Spotify connection required')) {
        errorMessage = 'Please connect your Spotify account to import playlists.';
      } else if (errorMessage.includes('service account not configured')) {
        errorMessage = 'Spotify import service is temporarily unavailable. Please try again later or contact support.';
      }
      
      setImportResult({
        success: false,
        error: errorMessage
      });

      toast({
        title: "Import failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleReset = () => {
    setPlaylistUrl('');
    setImportResult(null);
  };

  const isValidSpotifyUrl = (url: string): boolean => {
    const patterns = [
      /spotify\.com\/playlist\/([a-zA-Z0-9]+)/,
      /spotify:playlist:([a-zA-Z0-9]+)/,
      /^([a-zA-Z0-9]+)$/
    ];
    return patterns.some(pattern => pattern.test(url));
  };

  const isUrlValid = playlistUrl.trim() && isValidSpotifyUrl(playlistUrl.trim());

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 w-12 h-12 bg-[#1DB954] rounded-full flex items-center justify-center">
          <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z"/>
          </svg>
        </div>
        <CardTitle className="text-xl">Import from Spotify</CardTitle>
        <CardDescription>
          Import a playlist from Spotify by pasting its URL or ID
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {!importResult ? (
          <>
            <div className="space-y-2">
              <label htmlFor="playlist-url" className="text-sm font-medium">
                Spotify Playlist URL or ID
              </label>
              <Input
                id="playlist-url"
                type="text"
                placeholder="https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"
                value={playlistUrl}
                onChange={(e) => setPlaylistUrl(e.target.value)}
                className={!isUrlValid && playlistUrl.trim() ? 'border-red-500' : ''}
              />
              {playlistUrl.trim() && !isUrlValid && (
                <p className="text-sm text-red-500">
                  Please enter a valid Spotify playlist URL or ID
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleImport}
                disabled={!isUrlValid || isImporting}
                className="flex-1 bg-[#1DB954] hover:bg-[#1ed760] text-white"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z"/>
                    </svg>
                    Import Playlist
                  </>
                )}
              </Button>
            </div>

            <div className="text-xs text-muted-foreground text-center">
              <p>Supported formats:</p>
              <p>• https://open.spotify.com/playlist/...</p>
              <p>• spotify:playlist:...</p>
              <p>• Playlist ID only</p>
            </div>
          </>
        ) : (
          <div className="text-center space-y-4">
            {importResult.success ? (
              <>
                <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-green-600">Import Successful!</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {importResult.message}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleReset}
                    variant="outline"
                    className="flex-1"
                  >
                    Import Another
                  </Button>
                  {importResult.playlistId && (
                    <Button
                      onClick={() => window.location.href = `/playlist/${importResult.playlistId}`}
                      className="flex-1 bg-[#1DB954] hover:bg-[#1ed760] text-white"
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      View Playlist
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                  <AlertCircle className="w-8 h-8 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-red-600">Import Failed</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {importResult.error}
                  </p>
                </div>
                <Button
                  onClick={handleReset}
                  variant="outline"
                  className="w-full"
                >
                  Try Again
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SpotifyPlaylistImporter;
