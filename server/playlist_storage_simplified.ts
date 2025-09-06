import { db } from './db';
import { 
  playlists, playlistTracks, tracks, trackPlatformIds, artists, albums,
  tracksToArtists, tracksToGenres,
  type Playlist, type InsertPlaylist, type PlaylistTrack, type InsertPlaylistTrack
} from '../shared/schema';
import { eq, and, desc, like, or, ne, asc, inArray } from 'drizzle-orm';

/**
 * Simplified playlist storage service that uses the direct playlist_tracks table
 * instead of songs + tracks_songs tables
 */
export class PlaylistStorage {
  /**
   * Create a new playlist
   */
  async createPlaylist(playlist: InsertPlaylist): Promise<Playlist> {
    const [newPlaylist] = await db
      .insert(playlists)
      .values(playlist)
      .returning();
    return newPlaylist;
  }
  
  /**
   * Get a playlist by its ID
   */
  async getPlaylist(id: number): Promise<Playlist | undefined> {
    const [playlist] = await db.select().from(playlists).where(eq(playlists.id, id));
    return playlist;
  }
  
  /**
   * Get a playlist by its Spotify ID
   */
  async getPlaylistBySpotifyId(spotifyId: string): Promise<Playlist | undefined> {
    const [playlist] = await db.select().from(playlists).where(eq(playlists.spotifyId, spotifyId));
    return playlist;
  }
  
  /**
   * Get all playlists for a user
   */
  async getPlaylistsByUserId(userId: number): Promise<Playlist[]> {
    try {
      return db.select()
        .from(playlists)
        .where(eq(playlists.userId, userId))
        .orderBy(desc(playlists.createdAt)); 
    } catch (error: any) {
      console.error(`Error fetching playlists for user ID ${userId}:`, error);
      throw new Error(`Failed to fetch user playlists: ${error.message}`);
    }
  }
  
  /**
   * Find playlists by title (for duplicate prevention)
   */
  async getPlaylistsByTitle(userId: number, title: string): Promise<Playlist[]> {
    try {
      return db.select()
        .from(playlists)
        .where(
          and(
            eq(playlists.userId, userId),
            eq(playlists.title, title)
          )
        )
        .orderBy(desc(playlists.createdAt)); 
    } catch (error: any) {
      console.error(`Error fetching playlists by title "${title}" for user ${userId}:`, error);
      throw new Error(`Failed to fetch playlists by title: ${error.message}`);
    }
  }
  
  /**
   * Update a playlist's information
   */
  async updatePlaylist(id: number, updates: Partial<Playlist>): Promise<Playlist | undefined> {
    const [updatedPlaylist] = await db
      .update(playlists)
      .set({...updates, createdAt: new Date()})
      .where(eq(playlists.id, id))
      .returning();
    return updatedPlaylist;
  }
  
  /**
   * Delete a playlist and all its tracks
   */
  async deletePlaylist(id: number): Promise<boolean> {
    try {
      // First delete all playlist tracks (cascade should handle this automatically,
      // but we're being explicit for clarity)
      await db.delete(playlistTracks).where(eq(playlistTracks.playlistId, id));
      
      // Then delete the playlist itself
      await db.delete(playlists).where(eq(playlists.id, id));
      
      return true;
    } catch (error) {
      console.error(`Error deleting playlist ${id}:`, error);
      return false;
    }
  }
  
  /**
   * Get all tracks in a playlist with their positions
   */
  async getPlaylistTracks(playlistId: number): Promise<Array<{ track: any, position: number }>> {
    try {
      console.log(`PlaylistStorage: Fetching tracks for playlist ID ${playlistId}`);
      
      // Get the tracks in the playlist with their positions
      const results = await db.select({
        track: tracks,
        position: playlistTracks.position,
      })
      .from(playlistTracks)
      .innerJoin(tracks, eq(playlistTracks.trackId, tracks.id))
      .where(eq(playlistTracks.playlistId, playlistId))
      .orderBy(asc(playlistTracks.position));
      
      console.log(`PlaylistStorage: Found ${results.length} raw tracks for playlist ID ${playlistId}`);
      
      if (results.length === 0) {
        console.log(`PlaylistStorage: No tracks found with Drizzle query for playlist ${playlistId}. Trying direct SQL.`);
        
        // Try a different query approach using a direct SQL query to debug the issue
        const rawResults = await db.execute(`
          SELECT pt.position, t.* 
          FROM playlist_tracks pt 
          JOIN tracks t ON pt.track_id = t.id 
          WHERE pt.playlist_id = ${playlistId} 
          ORDER BY pt.position ASC
        `);
        
        console.log(`PlaylistStorage: Direct SQL query executed for playlist ${playlistId}`);
        
        if (rawResults.rows && rawResults.rows.length > 0) {
          console.warn(`PlaylistStorage: Drizzle query returned no results but SQL found ${rawResults.rows.length} tracks. This indicates a potential ORM issue.`);
          
          // Use the raw results to build track objects for the response
          // This is a fallback mechanism when the ORM approach fails
          const fallbackResults = rawResults.rows.map((row: any) => {
            return {
              track: {
                id: row.id,
                title: row.title,
                duration: row.duration || 0,
                duration_ms: row.duration || 0, // Map database 'duration' to frontend 'duration_ms'
                explicit: row.explicit || false,
                popularity: row.popularity || 0,
                previewUrl: row.preview_url,
                // We don't have all the relationships but we have the essentials
              },
              position: row.position
            };
          });
          
          console.log(`PlaylistStorage: Created ${fallbackResults.length} fallback track objects`);
          return fallbackResults;
        } else {
          console.log(`PlaylistStorage: No tracks found with direct SQL query either for playlist ${playlistId}`);
        }
      }
      
      // For each track, fetch artists, genres, album, etc.
      const enrichedResults = await Promise.all(results.map(async (result) => {
        // Get track platform IDs
        const platforms = await db.select()
          .from(trackPlatformIds)
          .where(eq(trackPlatformIds.trackId, result.track.id));
        
        // Get artists
        const artistResults = await db.select({
          artist: artists,
          isPrimary: tracksToArtists.isPrimary,
        })
        .from(tracksToArtists)
        .innerJoin(artists, eq(tracksToArtists.artistId, artists.id))
        .where(eq(tracksToArtists.trackId, result.track.id));
        
        // Get album (if available)
        let album = null;
        if (result.track.albumId) {
          const [albumResult] = await db.select()
            .from(albums)
            .where(eq(albums.id, result.track.albumId));
          album = albumResult;
        }
        
        // Get genres
        const genreResults = await db.select()
          .from(tracksToGenres)
          .where(eq(tracksToGenres.trackId, result.track.id));
        
        // Build the enriched track object with proper duration mapping
        const enrichedTrack = {
          ...result.track,
          duration_ms: result.track.duration, // Map database 'duration' to frontend 'duration_ms'
          platforms: platforms.reduce((acc, p) => {
            acc[p.platform] = { id: p.platformId, url: p.platformUrl };
            return acc;
          }, {}),
          artists: artistResults.map(a => ({
            ...a.artist,
            isPrimary: a.isPrimary,
          })),
          album,
          genres: genreResults,
        };
        
        return {
          track: enrichedTrack,
          position: result.position
        };
      }));
      
      console.log(`PlaylistStorage: Enriched ${enrichedResults.length} tracks for playlist ID ${playlistId}`);
      return enrichedResults;
    } catch (error) {
      console.error(`Error fetching tracks for playlist ${playlistId}:`, error);
      console.error(error.stack);
      return [];
    }
  }
  
  /**
   * Add a track to a playlist
   */
  async addTrackToPlaylist(playlistId: number, trackId: number, position: number): Promise<boolean> {
    try {
      console.log(`Adding track ${trackId} to playlist ${playlistId} at position ${position}`);
      
      const playlistTrackData: InsertPlaylistTrack = {
        playlistId,
        trackId,
        position
      };
      
      // Check if the playlist exists first
      const playlist = await this.getPlaylist(playlistId);
      if (!playlist) {
        console.error(`Cannot add track to non-existent playlist: ${playlistId}`);
        return false;
      }
      
      // Check if the track exists
      const [trackExists] = await db.select().from(tracks).where(eq(tracks.id, trackId));
      if (!trackExists) {
        console.error(`Cannot add non-existent track ${trackId} to playlist ${playlistId}`);
        return false;
      }
      
      // Insert the playlist track relation with conflict handling
      await db.insert(playlistTracks)
        .values(playlistTrackData)
        .onConflictDoUpdate({
          target: [playlistTracks.playlistId, playlistTracks.trackId],
          set: { position }
        });
      
      console.log(`Successfully added track ${trackId} to playlist ${playlistId}`);
      return true;
    } catch (error) {
      console.error(`Error adding track ${trackId} to playlist ${playlistId}:`, error);
      return false;
    }
  }
  
  /**
   * Update a track's position in a playlist
   */
  async updateTrackPosition(playlistId: number, trackId: number, newPosition: number): Promise<boolean> {
    try {
      await db.update(playlistTracks)
        .set({ position: newPosition })
        .where(and(
          eq(playlistTracks.playlistId, playlistId),
          eq(playlistTracks.trackId, trackId)
        ));
      
      return true;
    } catch (error) {
      console.error(`Error updating position for track ${trackId} in playlist ${playlistId}:`, error);
      return false;
    }
  }
  
  /**
   * Remove a track from a playlist
   */
  async removeTrackFromPlaylist(playlistId: number, trackId: number): Promise<boolean> {
    try {
      await db.delete(playlistTracks)
        .where(and(
          eq(playlistTracks.playlistId, playlistId),
          eq(playlistTracks.trackId, trackId)
        ));
      
      return true;
    } catch (error) {
      console.error(`Error removing track ${trackId} from playlist ${playlistId}:`, error);
      return false;
    }
  }
  
  /**
   * Clear all tracks from a playlist
   */
  async clearPlaylistTracks(playlistId: number): Promise<boolean> {
    try {
      await db.delete(playlistTracks)
        .where(eq(playlistTracks.playlistId, playlistId));
      
      return true;
    } catch (error) {
      console.error(`Error clearing tracks from playlist ${playlistId}:`, error);
      return false;
    }
  }
  
  /**
   * Replace all tracks in a playlist
   */
  async replacePlaylistTracks(playlistId: number, trackData: Array<{ trackId: number, position: number }>): Promise<boolean> {
    try {
      // Start a transaction
      return await db.transaction(async (tx) => {
        // First, clear all existing tracks
        await tx.delete(playlistTracks)
          .where(eq(playlistTracks.playlistId, playlistId));
        
        // Then add all the new tracks
        if (trackData.length > 0) {
          const insertData = trackData.map(td => ({
            playlistId,
            trackId: td.trackId,
            position: td.position
          }));
          
          await tx.insert(playlistTracks).values(insertData);
        }
        
        return true;
      });
    } catch (error) {
      console.error(`Error replacing tracks in playlist ${playlistId}:`, error);
      return false;
    }
  }
  
  /**
   * Count the number of tracks in a playlist
   */
  async countPlaylistTracks(playlistId: number): Promise<number> {
    try {
      const result = await db
        .select({ count: db.fn.count() })
        .from(playlistTracks)
        .where(eq(playlistTracks.playlistId, playlistId));
      
      return Number(result[0].count) || 0;
    } catch (error) {
      console.error(`Error counting tracks in playlist ${playlistId}:`, error);
      return 0;
    }
  }
  
  /**
   * Find a track ID by Spotify ID
   */
  async findTrackIdBySpotifyId(spotifyId: string): Promise<number | null> {
    try {
      const [result] = await db
        .select({ trackId: trackPlatformIds.trackId })
        .from(trackPlatformIds)
        .where(
          and(
            eq(trackPlatformIds.platform, 'spotify'),
            eq(trackPlatformIds.platformId, spotifyId)
          )
        );
      
      return result?.trackId || null;
    } catch (error) {
      console.error(`Error finding track ID for Spotify ID ${spotifyId}:`, error);
      return null;
    }
  }
  
  /**
   * Find multiple track IDs by Spotify IDs
   * Returns a map of Spotify IDs to their corresponding internal track IDs
   */
  async findTrackIdsBySpotifyIds(spotifyIds: string[]): Promise<Record<string, number>> {
    try {
      if (!spotifyIds.length) {
        return {};
      }
      
      const results = await db
        .select({
          trackId: trackPlatformIds.trackId,
          platformId: trackPlatformIds.platformId
        })
        .from(trackPlatformIds)
        .where(
          and(
            eq(trackPlatformIds.platform, 'spotify'),
            inArray(trackPlatformIds.platformId, spotifyIds)
          )
        );
      
      // Create a map of Spotify IDs to track IDs
      const idMap: Record<string, number> = {};
      for (const result of results) {
        idMap[result.platformId] = result.trackId;
      }
      
      return idMap;
    } catch (error) {
      console.error(`Error finding track IDs for multiple Spotify IDs:`, error);
      return {};
    }
  }
  
  /**
   * Get a complete playlist with tracks
   */
  async getPlaylistWithTracks(playlistId: number): Promise<any> {
    try {
      const playlist = await this.getPlaylist(playlistId);
      if (!playlist) {
        return null;
      }
      
      const trackResults = await this.getPlaylistTracks(playlistId);
      const tracks = trackResults.map(result => ({
        ...result.track,
        position: result.position
      }));
      
      return {
        ...playlist,
        tracks
      };
    } catch (error) {
      console.error(`Error getting complete playlist ${playlistId}:`, error);
      return null;
    }
  }
}

// Create singleton instance
export const playlistStorage = new PlaylistStorage();