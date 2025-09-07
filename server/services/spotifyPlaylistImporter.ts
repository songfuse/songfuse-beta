import { db } from '../db';
import { 
  playlists, tracks, artists, albums, playlistTracks, 
  trackPlatformIds, artistPlatformIds, albumPlatformIds,
  tracksToArtists, albumsToArtists, tracksToGenres,
  type InsertPlaylist, type InsertTrack, type InsertArtist, type InsertAlbum,
  type InsertPlaylistTrack, type InsertTrackPlatformId, type InsertArtistPlatformId, 
  type InsertAlbumPlatformId, type InsertTrackToArtist, type InsertAlbumToArtist
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import * as spotify from '../spotify-fixed';
import { SpotifyServiceAccount } from './spotifyServiceAccount';

export interface SpotifyPlaylistData {
  id: string;
  name: string;
  description: string;
  images: Array<{ url: string; width?: number; height?: number }>;
  tracks: {
    items: Array<{
      track: {
        id: string;
        name: string;
        artists: Array<{ id: string; name: string }>;
        album: {
          id: string;
          name: string;
          images: Array<{ url: string; width?: number; height?: number }>;
          release_date: string;
        };
        duration_ms: number;
        preview_url?: string;
        explicit?: boolean;
        popularity?: number;
        external_urls: { spotify: string };
      };
    }>;
  };
  external_urls: { spotify: string };
}

export class SpotifyPlaylistImporter {
  /**
   * Extract Spotify playlist ID from various URL formats
   */
  static extractPlaylistId(playlistUrl: string): string | null {
    console.log(`Extracting playlist ID from: ${playlistUrl}`);
    
    const patterns = [
      /spotify\.com\/playlist\/([a-zA-Z0-9]+)/,
      /spotify:playlist:([a-zA-Z0-9]+)/,
      /^([a-zA-Z0-9]+)$/ // Direct ID
    ];

    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];
      const match = playlistUrl.match(pattern);
      if (match) {
        console.log(`Matched pattern ${i + 1}, extracted ID: ${match[1]}`);
        return match[1];
      }
    }

    console.log(`No valid playlist ID found in: ${playlistUrl}`);
    return null;
  }

  /**
   * Fetch playlist data from Spotify API
   */
  static async fetchPlaylistData(accessToken: string, playlistId: string): Promise<SpotifyPlaylistData> {
    const playlistUrl = `https://api.spotify.com/v1/playlists/${playlistId}`;
    
    console.log(`Fetching Spotify playlist: ${playlistId}`);
    console.log(`API URL: ${playlistUrl}`);
    
    const response = await fetch(playlistUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log(`Spotify API response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Spotify API error: ${response.status} ${response.statusText}`);
      console.error(`Error details: ${errorText}`);
      
      if (response.status === 404) {
        throw new Error(`Playlist not found. Please check that the playlist ID is correct and the playlist is public or you have access to it.`);
      } else if (response.status === 401) {
        throw new Error(`Spotify authentication failed. Please reconnect your Spotify account.`);
      } else if (response.status === 403) {
        throw new Error(`Access denied. You may not have permission to access this playlist.`);
      } else {
        throw new Error(`Failed to fetch playlist: ${response.status} ${response.statusText}`);
      }
    }

    return await response.json();
  }

  /**
   * Find or create an artist in the database
   */
  static async findOrCreateArtist(artistData: { id: string; name: string }): Promise<number> {
    // First, try to find by Spotify ID
    const existingBySpotifyId = await db
      .select()
      .from(artists)
      .innerJoin(artistPlatformIds, eq(artists.id, artistPlatformIds.artistId))
      .where(and(
        eq(artistPlatformIds.platform, 'spotify'),
        eq(artistPlatformIds.platformId, artistData.id)
      ))
      .limit(1);

    if (existingBySpotifyId.length > 0) {
      return existingBySpotifyId[0].artists.id;
    }

    // Try to find by name
    const existingByName = await db
      .select()
      .from(artists)
      .where(eq(artists.name, artistData.name))
      .limit(1);

    if (existingByName.length > 0) {
      // Add Spotify platform ID if not exists
      await db.insert(artistPlatformIds).values({
        artistId: existingByName[0].id,
        platform: 'spotify',
        platformId: artistData.id
      }).onConflictDoNothing();
      
      return existingByName[0].id;
    }

    // Create new artist
    try {
      const [newArtist] = await db
        .insert(artists)
        .values({ name: artistData.name })
        .returning();
      
      // Add Spotify platform ID
      await db.insert(artistPlatformIds).values({
        artistId: newArtist.id,
        platform: 'spotify',
        platformId: artistData.id
      }).onConflictDoNothing();
      
      return newArtist.id;
    } catch (error: any) {
      // If there's a conflict, try to find the artist again
      if (error.code === '23505') { // Unique constraint violation
        const existingByName = await db
          .select()
          .from(artists)
          .where(eq(artists.name, artistData.name))
          .limit(1);
        
        if (existingByName.length > 0) {
          // Add Spotify platform ID if not exists
          await db.insert(artistPlatformIds).values({
            artistId: existingByName[0].id,
            platform: 'spotify',
            platformId: artistData.id
          }).onConflictDoNothing();
          
          return existingByName[0].id;
        }
      }
      throw error;
    }
  }

  /**
   * Find or create an album in the database
   */
  static async findOrCreateAlbum(albumData: {
    id: string;
    name: string;
    images: Array<{ url: string; width?: number; height?: number }>;
    release_date: string;
  }): Promise<number> {
    // First, try to find by Spotify ID
    const existingBySpotifyId = await db
      .select()
      .from(albums)
      .innerJoin(albumPlatformIds, eq(albums.id, albumPlatformIds.albumId))
      .where(and(
        eq(albumPlatformIds.platform, 'spotify'),
        eq(albumPlatformIds.platformId, albumData.id)
      ))
      .limit(1);

    if (existingBySpotifyId.length > 0) {
      return existingBySpotifyId[0].albums.id;
    }

    // Try to find by name
    const existingByName = await db
      .select()
      .from(albums)
      .where(eq(albums.title, albumData.name))
      .limit(1);

    if (existingByName.length > 0) {
      // Add Spotify platform ID if not exists
      await db.insert(albumPlatformIds).values({
        albumId: existingByName[0].id,
        platform: 'spotify',
        platformId: albumData.id
      }).onConflictDoNothing();
      
      return existingByName[0].id;
    }

    // Create new album
    const [newAlbum] = await db
      .insert(albums)
      .values({
        title: albumData.name,
        coverImage: this.selectBestImage(albumData.images),
        releaseDate: albumData.release_date ? new Date(albumData.release_date) : null
      })
      .returning();

    // Add Spotify platform ID
    await db.insert(albumPlatformIds).values({
      albumId: newAlbum.id,
      platform: 'spotify',
      platformId: albumData.id
    });

    return newAlbum.id;
  }

  /**
   * Find or create a track in the database
   */
  static async findOrCreateTrack(trackData: {
    id: string;
    name: string;
    artists: Array<{ id: string; name: string }>;
    album: {
      id: string;
      name: string;
      images: Array<{ url: string; width?: number; height?: number }>;
      release_date: string;
    };
    duration_ms: number;
    preview_url?: string;
    explicit?: boolean;
    popularity?: number;
    external_urls: { spotify: string };
  }): Promise<number> {
    // First, try to find by Spotify ID
    const existingBySpotifyId = await db
      .select()
      .from(tracks)
      .innerJoin(trackPlatformIds, eq(tracks.id, trackPlatformIds.trackId))
      .where(and(
        eq(trackPlatformIds.platform, 'spotify'),
        eq(trackPlatformIds.platformId, trackData.id)
      ))
      .limit(1);

    if (existingBySpotifyId.length > 0) {
      return existingBySpotifyId[0].tracks.id;
    }

    // Create album first
    const albumId = await this.findOrCreateAlbum(trackData.album);

    // Create track
    const [newTrack] = await db
      .insert(tracks)
      .values({
        title: trackData.name,
        albumId: albumId,
        duration: Math.floor(trackData.duration_ms / 1000),
        explicit: trackData.explicit || false,
        popularity: trackData.popularity || 0,
        previewUrl: trackData.preview_url || null
      })
      .returning();

    // Add Spotify platform ID
    await db.insert(trackPlatformIds).values({
      trackId: newTrack.id,
      platform: 'spotify',
      platformId: trackData.id,
      platformUrl: trackData.external_urls.spotify
    });

    // Create artist relationships
    for (let i = 0; i < trackData.artists.length; i++) {
      const artistData = trackData.artists[i];
      const artistId = await this.findOrCreateArtist(artistData);
      
      await db.insert(tracksToArtists).values({
        trackId: newTrack.id,
        artistId: artistId,
        isPrimary: i === 0 // First artist is primary
      }).onConflictDoNothing();

      // Also add artist to album if not already there
      await db.insert(albumsToArtists).values({
        albumId: albumId,
        artistId: artistId,
        isPrimary: i === 0
      }).onConflictDoNothing();
    }

    return newTrack.id;
  }

  /**
   * Select the best image from an array of images
   */
  static selectBestImage(images: Array<{ url: string; width?: number; height?: number }>): string | null {
    if (!images || images.length === 0) {
      return null;
    }

    // Look for square images first
    const squareImage = images.find(img => img.width && img.height && img.width === img.height);
    if (squareImage) {
      return squareImage.url;
    }

    // Return the first image
    return images[0].url;
  }

  /**
   * Import a Spotify playlist for a user using service account (transparent to user)
   */
  static async importPlaylistWithServiceAccount(
    userId: number,
    playlistUrl: string
  ): Promise<{ playlistId: number; trackCount: number }> {
    console.log(`Starting playlist import for user ${userId} using service account`);
    console.log(`Playlist URL: ${playlistUrl}`);
    
    // Check if service account is configured
    if (!SpotifyServiceAccount.isConfigured()) {
      throw new Error('Spotify service account not configured. Please contact support.');
    }

    // Get access token from service account
    const accessToken = await SpotifyServiceAccount.getAccessToken();
    
    return this.importPlaylist(userId, accessToken, playlistUrl);
  }

  /**
   * Import a Spotify playlist
   */
  static async importPlaylist(
    userId: number,
    accessToken: string,
    playlistUrl: string
  ): Promise<{ playlistId: number; trackCount: number }> {
    console.log(`Starting playlist import for user ${userId}`);
    console.log(`Playlist URL: ${playlistUrl}`);
    
    // Extract playlist ID from URL
    const spotifyPlaylistId = this.extractPlaylistId(playlistUrl);
    if (!spotifyPlaylistId) {
      throw new Error('Invalid Spotify playlist URL. Please use a valid Spotify playlist URL or ID.');
    }
    
    console.log(`Extracted Spotify playlist ID: ${spotifyPlaylistId}`);

    // Check if playlist already exists
    const existingPlaylist = await db
      .select()
      .from(playlists)
      .where(and(
        eq(playlists.userId, userId),
        eq(playlists.spotifyId, spotifyPlaylistId)
      ))
      .limit(1);

    if (existingPlaylist.length > 0) {
      throw new Error('Playlist already imported');
    }

    // Fetch playlist data from Spotify
    const playlistData = await this.fetchPlaylistData(accessToken, spotifyPlaylistId);

    // Create playlist
    const [newPlaylist] = await db
      .insert(playlists)
      .values({
        userId: userId,
        title: playlistData.name,
        description: playlistData.description || null,
        spotifyId: spotifyPlaylistId,
        spotifyUrl: playlistData.external_urls.spotify,
        coverImageUrl: this.selectBestImage(playlistData.images),
        isPublic: false // Imported playlists are private by default
      })
      .returning();

    // Process tracks
    let trackCount = 0;
    for (let i = 0; i < playlistData.tracks.items.length; i++) {
      const item = playlistData.tracks.items[i];
      
      // Skip null tracks (removed tracks)
      if (!item.track) {
        continue;
      }

      try {
        // Find or create track
        const trackId = await this.findOrCreateTrack(item.track);

        // Add to playlist
        await db.insert(playlistTracks).values({
          playlistId: newPlaylist.id,
          trackId: trackId,
          position: i + 1
        }).onConflictDoNothing();

        trackCount++;
      } catch (error) {
        console.error(`Error processing track ${item.track.name}:`, error);
        // Continue with other tracks
      }
    }

    return {
      playlistId: newPlaylist.id,
      trackCount: trackCount
    };
  }
}
