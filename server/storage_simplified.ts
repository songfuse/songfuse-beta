import { db } from './db';
import { 
  users, playlists, tracks, playlistTracks, artists, genres, 
  trackPlatformIds, albums, tracksToArtists, tracksToGenres,
  type User, type InsertUser, type Playlist, type InsertPlaylist
} from "../shared/simplified_schema";
import { eq, and, desc, like, sql, or, ne, isNull, asc, inArray } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserBySpotifyId(spotifyId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<User>): Promise<User | undefined>;
  
  // Playlist operations
  createPlaylist(playlist: InsertPlaylist): Promise<Playlist>;
  getPlaylist(id: number): Promise<Playlist | undefined>;
  getPlaylistBySpotifyId(spotifyId: string): Promise<Playlist | undefined>;
  getPlaylistsByUserId(userId: number): Promise<Playlist[]>;
  getPlaylistsByTitle(userId: number, title: string): Promise<Playlist[]>;
  updatePlaylist(id: number, updates: Partial<Playlist>): Promise<Playlist | undefined>;
  deletePlaylist(id: number): Promise<boolean>;
  getPublicPlaylists(limit?: number, offset?: number, excludeUserId?: number): Promise<Playlist[]>;
  searchPlaylists(query: string, limit?: number, offset?: number, excludeUserId?: number): Promise<Playlist[]>;
  searchPlaylistsByArtist(artistName: string, limit?: number, offset?: number): Promise<Playlist[]>;
  
  // Playlist tracks operations
  getPlaylistTracks(playlistId: number): Promise<Array<{ track: any, position: number }>>;
  addTrackToPlaylist(playlistId: number, trackId: number, position: number): Promise<boolean>;
  updateTrackPosition(playlistId: number, trackId: number, newPosition: number): Promise<boolean>;
  removeTrackFromPlaylist(playlistId: number, trackId: number): Promise<boolean>;
  clearPlaylistTracks(playlistId: number): Promise<boolean>;
  
  // Track operations
  getTracksByIds(trackIds: number[]): Promise<any[]>;
  searchTracks(query: string, limit?: number, offset?: number, excludeExplicit?: boolean): Promise<any[]>;
  findTrackByPlatformId(platform: string, platformId: string): Promise<any | undefined>;
}

export class DatabaseStorage implements IStorage {
  // === User operations ===
  
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }
  
  async getUserBySpotifyId(spotifyId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.spotifyId, spotifyId));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }
  
  async updateUser(id: number, updates: Partial<User>): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set({...updates, updatedAt: new Date()})
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }
  
  // === Playlist operations ===
  
  async createPlaylist(playlist: InsertPlaylist): Promise<Playlist> {
    const [newPlaylist] = await db
      .insert(playlists)
      .values(playlist)
      .returning();
    return newPlaylist;
  }
  
  async getPlaylist(id: number): Promise<Playlist | undefined> {
    const [playlist] = await db.select().from(playlists).where(eq(playlists.id, id));
    return playlist;
  }
  
  async getPlaylistBySpotifyId(spotifyId: string): Promise<Playlist | undefined> {
    const [playlist] = await db.select().from(playlists).where(eq(playlists.spotifyId, spotifyId));
    return playlist;
  }
  
  async getPlaylistsByUserId(userId: number): Promise<Playlist[]> {
    try {
      return db.select()
        .from(playlists)
        .where(eq(playlists.userId, userId))
        .orderBy(desc(playlists.createdAt)); // Order by creation date, newest first
    } catch (error: any) {
      console.error(`Error fetching playlists for user ID ${userId}:`, error);
      throw new Error(`Failed to fetch user playlists: ${error.message}`);
    }
  }
  
  async getPlaylistsByTitle(userId: number, title: string): Promise<Playlist[]> {
    try {
      // Get playlists with the exact same title for this user, ordered by newest first
      return db.select()
        .from(playlists)
        .where(
          and(
            eq(playlists.userId, userId),
            eq(playlists.title, title)
          )
        )
        .orderBy(desc(playlists.createdAt)); // Order by creation date, newest first
    } catch (error: any) {
      console.error(`Error fetching playlists by title "${title}" for user ${userId}:`, error);
      throw new Error(`Failed to fetch playlists by title: ${error.message}`);
    }
  }
  
  async updatePlaylist(id: number, updates: Partial<Playlist>): Promise<Playlist | undefined> {
    const [updatedPlaylist] = await db
      .update(playlists)
      .set({...updates, updatedAt: new Date()})
      .where(eq(playlists.id, id))
      .returning();
    return updatedPlaylist;
  }
  
  async deletePlaylist(id: number): Promise<boolean> {
    try {
      // First delete all playlist tracks (cascade should handle this, but being explicit)
      await db.delete(playlistTracks).where(eq(playlistTracks.playlistId, id));
      
      // Then delete the playlist itself
      await db.delete(playlists).where(eq(playlists.id, id));
      
      return true;
    } catch (error) {
      console.error(`Error deleting playlist ${id}:`, error);
      return false;
    }
  }
  
  async getPublicPlaylists(limit = 20, offset = 0, excludeUserId?: number): Promise<Playlist[]> {
    try {
      let query = db.select()
        .from(playlists)
        .where(eq(playlists.isPublic, true));
      
      if (excludeUserId) {
        query = query.where(ne(playlists.userId, excludeUserId));
      }
      
      return query
        .orderBy(desc(playlists.createdAt))
        .limit(limit)
        .offset(offset);
    } catch (error: any) {
      console.error('Error fetching public playlists:', error);
      throw new Error(`Failed to fetch public playlists: ${error.message}`);
    }
  }
  
  async searchPlaylists(query: string, limit = 20, offset = 0, excludeUserId?: number): Promise<Playlist[]> {
    try {
      // Split the query into words for better matching
      const terms = query.toLowerCase().split(/\s+/).filter(term => term.length > 0);
      
      if (terms.length === 0) {
        return this.getPublicPlaylists(limit, offset, excludeUserId);
      }
      
      // Create a condition for each term to match against title or description
      const conditions = terms.flatMap(term => [
        like(playlists.title, `%${term}%`),
        like(playlists.description, `%${term}%`)
      ]);
      
      let query = db.select()
        .from(playlists)
        .where(and(
          eq(playlists.isPublic, true),
          or(...conditions)
        ));
        
      // If excludeUserId is provided, add a condition to exclude that user's playlists
      if (excludeUserId) {
        query = query.where(ne(playlists.userId, excludeUserId));
      }
      
      return query
        .orderBy(desc(playlists.createdAt))
        .limit(limit)
        .offset(offset);
    } catch (error: any) {
      console.error(`Error searching playlists with query '${query}':`, error);
      throw new Error(`Failed to search playlists: ${error.message}`);
    }
  }
  
  async searchPlaylistsByArtist(artistName: string, limit = 20, offset = 0): Promise<Playlist[]> {
    try {
      // Find track_ids that have this artist
      const artistTracks = await db.select({ 
          trackId: tracksToArtists.trackId 
        })
        .from(tracksToArtists)
        .innerJoin(artists, eq(tracksToArtists.artistId, artists.id))
        .where(like(artists.name, `%${artistName}%`));
      
      if (artistTracks.length === 0) {
        return [];
      }
      
      const trackIds = artistTracks.map(t => t.trackId);
      
      // Find playlist_ids that contain these tracks
      const playlistsWithArtist = await db.select({ 
          playlistId: playlistTracks.playlistId 
        })
        .from(playlistTracks)
        .where(inArray(playlistTracks.trackId, trackIds))
        .groupBy(playlistTracks.playlistId);
      
      if (playlistsWithArtist.length === 0) {
        return [];
      }
      
      const playlistIds = playlistsWithArtist.map(p => p.playlistId);
      
      // Now fetch those playlists if they're public
      return db.select()
        .from(playlists)
        .where(and(
          eq(playlists.isPublic, true),
          inArray(playlists.id, playlistIds) 
        ))
        .orderBy(desc(playlists.createdAt))
        .limit(limit)
        .offset(offset);
    } catch (error: any) {
      console.error(`Error searching playlists by artist '${artistName}':`, error);
      throw new Error(`Failed to search playlists by artist: ${error.message}`);
    }
  }
  
  // === Playlist tracks operations ===
  
  async getPlaylistTracks(playlistId: number): Promise<Array<{ track: any, position: number }>> {
    try {
      const results = await db.select({
        track: tracks,
        position: playlistTracks.position,
      })
      .from(playlistTracks)
      .innerJoin(tracks, eq(playlistTracks.trackId, tracks.id))
      .where(eq(playlistTracks.playlistId, playlistId))
      .orderBy(asc(playlistTracks.position));
      
      // For each track, fetch related info like artists, genres, and platform IDs
      const enrichedResults = await Promise.all(results.map(async (result) => {
        // Get track artists
        const trackArtists = await db.select({
          artist: artists
        })
        .from(tracksToArtists)
        .innerJoin(artists, eq(tracksToArtists.artistId, artists.id))
        .where(eq(tracksToArtists.trackId, result.track.id));
        
        // Get track genres
        const trackGenres = await db.select({
          genre: genres
        })
        .from(tracksToGenres)
        .innerJoin(genres, eq(tracksToGenres.genreId, genres.id))
        .where(eq(tracksToGenres.trackId, result.track.id));
        
        // Get platform IDs
        const platformIds = await db.select()
        .from(trackPlatformIds)
        .where(eq(trackPlatformIds.trackId, result.track.id));
        
        // Get album
        const [albumData] = result.track.albumId ? await db.select()
          .from(albums)
          .where(eq(albums.id, result.track.albumId)) : [null];
        
        return {
          track: {
            ...result.track,
            artists: trackArtists.map(a => a.artist),
            genres: trackGenres.map(g => g.genre),
            platformIds: platformIds,
            album: albumData
          },
          position: result.position
        };
      }));
      
      return enrichedResults;
    } catch (error) {
      console.error(`Error fetching tracks for playlist ${playlistId}:`, error);
      return [];
    }
  }
  
  async addTrackToPlaylist(playlistId: number, trackId: number, position: number): Promise<boolean> {
    try {
      await db.insert(playlistTracks)
        .values({
          playlistId,
          trackId,
          position
        })
        .onConflictDoUpdate({
          target: [playlistTracks.playlistId, playlistTracks.trackId],
          set: { position }
        });
      return true;
    } catch (error) {
      console.error(`Error adding track ${trackId} to playlist ${playlistId}:`, error);
      return false;
    }
  }
  
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
      console.error(`Error updating track position for track ${trackId} in playlist ${playlistId}:`, error);
      return false;
    }
  }
  
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
  
  // === Track operations ===
  
  async getTracksByIds(trackIds: number[]): Promise<any[]> {
    if (trackIds.length === 0) return [];
    
    try {
      return db.select()
        .from(tracks)
        .where(inArray(tracks.id, trackIds));
    } catch (error) {
      console.error(`Error fetching tracks by IDs:`, error);
      return [];
    }
  }
  
  async searchTracks(query: string, limit = 20, offset = 0, excludeExplicit = false): Promise<any[]> {
    try {
      // Normalize the query
      const normalizedQuery = query.toLowerCase().trim();
      
      if (!normalizedQuery) {
        return [];
      }
      
      // First, search for tracks by title
      let trackQuery = db.select({
        track: tracks,
      })
      .from(tracks);
      
      // Add explicit filter if needed
      if (excludeExplicit) {
        trackQuery = trackQuery.where(eq(tracks.explicit, false));
      }
      
      // Add title search
      trackQuery = trackQuery.where(like(tracks.title, `%${normalizedQuery}%`))
        .orderBy(desc(tracks.popularity))
        .limit(limit)
        .offset(offset);
      
      const titleResults = await trackQuery;
      
      // If we have enough results from the title search, return those
      if (titleResults.length >= limit) {
        return titleResults.map(r => r.track);
      }
      
      // Otherwise, also search by artist name to fill in remaining slots
      const artistLimit = limit - titleResults.length;
      const artistOffset = 0; // Start from the beginning for artist search
      
      const artistTracks = await db.select({
        track: tracks,
      })
      .from(tracks)
      .innerJoin(tracksToArtists, eq(tracks.id, tracksToArtists.trackId))
      .innerJoin(artists, eq(tracksToArtists.artistId, artists.id))
      .where(
        and(
          like(artists.name, `%${normalizedQuery}%`),
          excludeExplicit ? eq(tracks.explicit, false) : undefined
        )
      )
      .orderBy(desc(tracks.popularity))
      .limit(artistLimit)
      .offset(artistOffset);
      
      // Combine results, ensuring no duplicates
      const seenIds = new Set(titleResults.map(r => r.track.id));
      const combinedResults = [
        ...titleResults.map(r => r.track),
        ...artistTracks
          .filter(r => !seenIds.has(r.track.id))
          .map(r => r.track)
      ];
      
      return combinedResults;
    } catch (error) {
      console.error(`Error searching tracks with query '${query}':`, error);
      return [];
    }
  }
  
  async findTrackByPlatformId(platform: string, platformId: string): Promise<any | undefined> {
    try {
      const [result] = await db.select({
        track: tracks,
      })
      .from(tracks)
      .innerJoin(trackPlatformIds, eq(tracks.id, trackPlatformIds.trackId))
      .where(
        and(
          eq(trackPlatformIds.platform, platform),
          eq(trackPlatformIds.platformId, platformId)
        )
      );
      
      return result?.track;
    } catch (error) {
      console.error(`Error finding track with platform ID ${platformId} (${platform}):`, error);
      return undefined;
    }
  }
}

export const storage = new DatabaseStorage();