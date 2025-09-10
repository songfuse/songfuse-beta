import { SpotifyServiceAccount } from './server/services/spotifyServiceAccount.ts';
import { playlistStorage } from './server/playlist_storage_simplified.ts';
import * as spotify from './server/spotify-fixed.ts';

async function addTracksToPlaylist() {
  try {
    // Initialize Spotify service account
    SpotifyServiceAccount.initialize();
    
    // Get the playlist from database
    const playlist = await playlistStorage.getPlaylist(605);
    console.log('Playlist:', playlist.title);
    
    // Get playlist tracks
    const tracks = await playlistStorage.getPlaylistTracks(605);
    console.log(`Found ${tracks.length} tracks`);
    
    // Get Spotify service account token
    const serviceAccessToken = await SpotifyServiceAccount.getAccessToken();
    
    // Process tracks
    const trackUris = tracks.map(track => {
      // Get Spotify ID from platformIds array
      const spotifyPlatformId = track.platformIds?.find(p => p.platform === 'spotify');
      if (!spotifyPlatformId?.platformId) {
        console.error("Missing Spotify ID for track:", track.title);
        return null;
      }
      // Clean up ID to ensure proper format
      const cleanId = spotifyPlatformId.platformId.replace('spotify:track:', '');
      const uri = `spotify:track:${cleanId}`;
      console.log(`Track: ${track.title} -> URI: ${uri}`);
      return uri;
    }).filter(uri => uri !== null);
    
    console.log(`Generated ${trackUris.length} track URIs out of ${tracks.length} tracks`);
    
    // Add tracks to the existing Spotify playlist
    await spotify.addTracksToPlaylist(serviceAccessToken, '3Fx1FaOIyE0hRlVK8CI1Bd', trackUris);
    console.log(`Successfully added ${trackUris.length} tracks to Spotify playlist`);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

addTracksToPlaylist();
