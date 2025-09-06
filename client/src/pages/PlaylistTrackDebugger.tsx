import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Track {
  id: number;
  name: string;
  spotifyId: string | null;
  position: number;
  artists: Array<{ id: number; name: string }>;
  album: { name: string };
  duration_ms: number;
  audio_features: {
    danceability: number;
    energy: number;
    tempo: number;
    valence: number;
    acousticness: number;
    instrumentalness: number;
    liveness: number;
    speechiness: number;
  };
}

interface Playlist {
  id: number;
  title: string;
  description: string | null;
  coverImage: string | null;
  spotifyId: string | null;
  spotifyUrl: string | null;
  tracks: Track[];
}

export default function PlaylistTrackDebugger() {
  const [, setLocation] = useLocation();
  const [playlistId, setPlaylistId] = useState('264');
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Function to fetch playlist data with tracks
  const fetchPlaylist = async (id: string) => {
    if (!id) return;
    
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`/api/direct-db/playlist/${id}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch playlist: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('Received playlist data:', data);
      setPlaylist(data);
    } catch (err) {
      console.error('Error fetching playlist:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Initial load of the default playlist
  useEffect(() => {
    fetchPlaylist(playlistId);
  }, []);

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Playlist Track Debugger</h1>
      
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Load Playlist</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4">
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <Label htmlFor="playlistId">Playlist ID</Label>
              <Input
                type="text"
                id="playlistId"
                value={playlistId}
                onChange={(e) => setPlaylistId(e.target.value)}
                placeholder="Enter playlist ID"
              />
            </div>
            <Button onClick={() => fetchPlaylist(playlistId)} disabled={loading}>
              {loading ? 'Loading...' : 'Load Playlist'}
            </Button>
            <Button variant="outline" onClick={() => setLocation('/')}>
              Return Home
            </Button>
          </div>
        </CardContent>
      </Card>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
          <strong>Error:</strong> {error}
        </div>
      )}
      
      {playlist && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Playlist Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p><strong>Title:</strong> {playlist.title}</p>
                  <p><strong>ID:</strong> {playlist.id}</p>
                  <p><strong>Description:</strong> {playlist.description || 'No description'}</p>
                  <p><strong>Spotify ID:</strong> {playlist.spotifyId || 'None'}</p>
                  <p><strong>Tracks:</strong> {playlist.tracks.length}</p>
                </div>
                {playlist.coverImage && (
                  <div className="flex justify-center">
                    <img
                      src={playlist.coverImage}
                      alt="Playlist Cover"
                      className="max-w-[200px] max-h-[200px] object-cover rounded"
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Track Data</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableCaption>Tracks for playlist {playlist.title}</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Position</TableHead>
                      <TableHead>Track ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Spotify ID</TableHead>
                      <TableHead>Artist</TableHead>
                      <TableHead>Album</TableHead>
                      <TableHead>Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {playlist.tracks.map((track) => (
                      <TableRow key={`${track.id}-${track.position}`}>
                        <TableCell>{track.position}</TableCell>
                        <TableCell>{track.id}</TableCell>
                        <TableCell>{track.name}</TableCell>
                        <TableCell>{track.spotifyId || 'None'}</TableCell>
                        <TableCell>
                          {track.artists.map(a => a.name).join(', ')}
                        </TableCell>
                        <TableCell>{track.album?.name || 'Unknown'}</TableCell>
                        <TableCell>
                          {Math.floor(track.duration_ms / 60000)}:
                          {String(Math.floor((track.duration_ms % 60000) / 1000)).padStart(2, '0')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Audio Features</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableCaption>Audio features for tracks</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Position</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Danceability</TableHead>
                      <TableHead>Energy</TableHead>
                      <TableHead>Tempo</TableHead>
                      <TableHead>Valence</TableHead>
                      <TableHead>Acousticness</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {playlist.tracks.map((track) => (
                      <TableRow key={`features-${track.id}-${track.position}`}>
                        <TableCell>{track.position}</TableCell>
                        <TableCell>{track.name}</TableCell>
                        <TableCell>{track.audio_features?.danceability.toFixed(2) || 'N/A'}</TableCell>
                        <TableCell>{track.audio_features?.energy.toFixed(2) || 'N/A'}</TableCell>
                        <TableCell>{track.audio_features?.tempo.toFixed(0) || 'N/A'}</TableCell>
                        <TableCell>{track.audio_features?.valence.toFixed(2) || 'N/A'}</TableCell>
                        <TableCell>{track.audio_features?.acousticness.toFixed(2) || 'N/A'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Raw JSON Data</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-gray-100 p-4 rounded-md overflow-x-auto max-h-[400px] text-xs">
                {JSON.stringify(playlist, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}