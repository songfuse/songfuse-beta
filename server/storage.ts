import { 
  InsertUser, User, Playlist, InsertPlaylist, Song, InsertSong, 
  ChatMessage, InsertChatMessage, SavedPrompt, InsertSavedPrompt,
  SpotifyTrack, GeneratedPlaylist, SmartLink, InsertSmartLink,
  CreditTransaction, InsertCreditTransaction
} from "@shared/schema";
import {
  WhatsAppMessage, InsertWhatsAppMessage,
  WhatsAppSession, InsertWhatsAppSession,
  WhatsAppConfig, InsertWhatsAppConfig
} from "@shared/whatsapp-schema";

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserBySpotifyId(spotifyId: string): Promise<User | undefined>;
  getUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, data: Partial<InsertUser>): Promise<User>;
  updateUserTokens(userId: number, accessToken: string, refreshToken: string, expiresAt: Date): Promise<boolean>;

  // Playlist methods
  getPlaylist(id: number): Promise<Playlist | undefined>;
  getPlaylistBySpotifyId(spotifyId: string): Promise<Playlist | undefined>;
  getPlaylistsByUserId(userId: number): Promise<Playlist[]>;
  getPlaylistsByTitle(userId: number, title: string): Promise<Playlist[]>;
  createPlaylist(playlist: InsertPlaylist): Promise<Playlist>;
  updatePlaylist(id: number, data: Partial<InsertPlaylist>): Promise<Playlist>;
  deletePlaylist(id: number): Promise<boolean>;
  
  // Discover methods
  getPublicPlaylists(limit?: number, offset?: number): Promise<Playlist[]>;
  searchPlaylists(query: string, limit?: number, offset?: number): Promise<Playlist[]>;
  searchPlaylistsByArtist(artistName: string, limit?: number, offset?: number): Promise<Playlist[]>;
  getPlaylistWithSongs(id: number): Promise<{ playlist: Playlist, songs: Song[] } | undefined>;

  // Song methods
  getSongsByPlaylistId(playlistId: number): Promise<Song[]>;
  createSong(song: InsertSong): Promise<Song>;
  updateSong(id: number, data: Partial<InsertSong>): Promise<Song>;
  deleteSong(id: number): Promise<boolean>;
  deleteSongsByPlaylistId(playlistId: number): Promise<boolean>;

  // Chat messages methods
  getChatMessagesBySessionId(sessionId: string): Promise<ChatMessage[]>;
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;

  // Cover image methods for chat sessions
  storeCoverImageForSession(sessionId: string, coverImageUrl: string): Promise<boolean>;
  getCoverImageForSession(sessionId: string): Promise<string | null>;

  // Saved prompts methods
  getSavedPromptsByUserId(userId: number): Promise<SavedPrompt[]>;
  createSavedPrompt(prompt: InsertSavedPrompt): Promise<SavedPrompt>;
  deleteSavedPrompt(id: number): Promise<boolean>;

  // Smart Links methods
  getSmartLink(shareId: string): Promise<SmartLink | undefined>;
  createSmartLink(smartLink: InsertSmartLink): Promise<SmartLink>;
  updateSmartLinkViews(shareId: string): Promise<boolean>;
  getSmartLinksByUserId(userId: number): Promise<SmartLink[]>;

  // Credit management methods
  createCreditTransaction(transaction: InsertCreditTransaction): Promise<CreditTransaction>;
  getCreditTransactionsByUserId(userId: number, limit?: number): Promise<CreditTransaction[]>;

  // WhatsApp methods
  createWhatsAppMessage(message: InsertWhatsAppMessage): Promise<WhatsAppMessage>;
  getWhatsAppMessagesByPhone(phoneNumber: string): Promise<WhatsAppMessage[]>;
  createWhatsAppSession(session: InsertWhatsAppSession): Promise<WhatsAppSession>;
  getWhatsAppSessionByPhone(phoneNumber: string): Promise<WhatsAppSession | undefined>;
  updateWhatsAppSession(id: number, data: Partial<InsertWhatsAppSession>): Promise<WhatsAppSession>;
  createWhatsAppConfig(config: InsertWhatsAppConfig): Promise<WhatsAppConfig>;
  getActiveWhatsAppConfig(): Promise<WhatsAppConfig | undefined>;
}

// Import the Drizzle database connection
import { db } from "./db";
import { eq, and, desc, sql, like, or, not, ne, isNotNull } from "drizzle-orm";
import { users, playlists, songs, chatMessages, savedPrompts, smartLinks, playlistTracks, tracks, albums, artists, tracksToArtists, trackPlatformIds, creditTransactions } from "@shared/schema";
import { whatsappMessages, whatsappSessions, whatsappConfig } from "@shared/whatsapp-schema";

export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      return user;
    } catch (error) {
      console.error(`Error fetching user with ID ${id}:`, error);
      throw new Error(`Failed to fetch user: ${error.message}`);
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    try {
      const [user] = await db.select().from(users).where(eq(users.username, username));
      return user;
    } catch (error) {
      console.error(`Error fetching user by username ${username}:`, error);
      throw new Error(`Failed to fetch user by username: ${error.message}`);
    }
  }

  async getUserBySpotifyId(spotifyId: string): Promise<User | undefined> {
    if (!spotifyId) return undefined;
    try {
      const [user] = await db.select().from(users).where(eq(users.spotifyId, spotifyId));
      return user;
    } catch (error) {
      console.error(`Error fetching user by Spotify ID ${spotifyId}:`, error);
      throw new Error(`Failed to fetch user by Spotify ID: ${error.message}`);
    }
  }

  async getUsers(): Promise<User[]> {
    try {
      return db.select().from(users);
    } catch (error) {
      console.error('Error fetching all users:', error);
      throw new Error(`Failed to fetch users: ${error.message}`);
    }
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    // Handle nullable fields with proper types for PostgreSQL
    const formattedInsertUser = {
      ...insertUser,
      spotifyId: insertUser.spotifyId || null,
      spotifyAccessToken: insertUser.spotifyAccessToken || null,
      spotifyRefreshToken: insertUser.spotifyRefreshToken || null,
      tokenExpiresAt: insertUser.tokenExpiresAt || null
    };
    
    try {
      const [user] = await db.insert(users).values(formattedInsertUser).returning();
      return user;
    } catch (error: any) {
      console.error('Error creating user:', error);
      throw new Error(`Failed to create user: ${error.message}`);
    }
  }

  async updateUser(id: number, data: Partial<InsertUser>): Promise<User> {
    try {
      // Handle nullable fields with proper types for PostgreSQL
      const formattedData: Partial<User> = { ...data };
      
      // Explicitly set null values for nullable fields when they are undefined
      if ('spotifyId' in data) formattedData.spotifyId = data.spotifyId || null;
      if ('spotifyAccessToken' in data) formattedData.spotifyAccessToken = data.spotifyAccessToken || null;
      if ('spotifyRefreshToken' in data) formattedData.spotifyRefreshToken = data.spotifyRefreshToken || null;
      if ('tokenExpiresAt' in data) formattedData.tokenExpiresAt = data.tokenExpiresAt || null;
      
      const [updatedUser] = await db.update(users)
        .set(formattedData)
        .where(eq(users.id, id))
        .returning();
      
      if (!updatedUser) {
        throw new Error(`User with id ${id} not found`);
      }
      
      return updatedUser;
    } catch (error: any) {
      console.error(`Error updating user with ID ${id}:`, error);
      throw new Error(`Failed to update user: ${error.message}`);
    }
  }
  
  async updateUserTokens(userId: number, accessToken: string, refreshToken: string, expiresAt: Date): Promise<boolean> {
    try {
      console.log(`Updating Spotify tokens for user ${userId}`);
      
      const [updatedUser] = await db.update(users)
        .set({
          spotifyAccessToken: accessToken,
          spotifyRefreshToken: refreshToken,
          tokenExpiresAt: expiresAt
        })
        .where(eq(users.id, userId))
        .returning();
      
      if (!updatedUser) {
        console.error(`Failed to update tokens: User with id ${userId} not found`);
        return false;
      }
      
      console.log(`Successfully updated Spotify tokens for user ${userId}, expires at ${expiresAt.toISOString()}`);
      return true;
    } catch (error: any) {
      console.error(`Error updating tokens for user ${userId}:`, error);
      return false;
    }
  }

  // Playlist methods
  async getPlaylist(id: number): Promise<Playlist | undefined> {
    try {
      const [playlist] = await db.select().from(playlists).where(eq(playlists.id, id));
      return playlist;
    } catch (error: any) {
      console.error(`Error fetching playlist with ID ${id}:`, error);
      throw new Error(`Failed to fetch playlist: ${error.message}`);
    }
  }

  async getPlaylistBySpotifyId(spotifyId: string): Promise<Playlist | undefined> {
    if (!spotifyId) return undefined;
    try {
      const [playlist] = await db.select().from(playlists).where(eq(playlists.spotifyId, spotifyId));
      return playlist;
    } catch (error: any) {
      console.error(`Error fetching playlist by Spotify ID ${spotifyId}:`, error);
      throw new Error(`Failed to fetch playlist by Spotify ID: ${error.message}`);
    }
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

  async createPlaylist(insertPlaylist: InsertPlaylist): Promise<Playlist> {
    try {
      // Handle nullable fields with proper types for PostgreSQL
      const formattedInsertPlaylist = {
        ...insertPlaylist,
        spotifyId: insertPlaylist.spotifyId || null,
        description: insertPlaylist.description || null,
        coverImageUrl: insertPlaylist.coverImageUrl || null
        // The createdAt field is handled by the database default value
      };
      
      const [playlist] = await db.insert(playlists).values(formattedInsertPlaylist).returning();
      
      // Verify the cover image exists if one was provided
      if (playlist.coverImageUrl) {
        const { verifyAndEnsureCoverImage } = await import('./services/coverImageVerifier');
        try {
          const verifiedCoverUrl = await verifyAndEnsureCoverImage(playlist.id, playlist.coverImageUrl);
          
          // If the cover URL changed (e.g. if it was fixed), update the playlist
          if (verifiedCoverUrl !== playlist.coverImageUrl) {
            const [updatedPlaylist] = await db.update(playlists)
              .set({ coverImageUrl: verifiedCoverUrl })
              .where(eq(playlists.id, playlist.id))
              .returning();
            
            return updatedPlaylist;
          }
        } catch (verifyError) {
          console.error(`Error verifying cover image for new playlist ${playlist.id}:`, verifyError);
          // Continue with the original playlist - don't block creation because of cover errors
        }
      }
      
      return playlist;
    } catch (error: any) {
      console.error('Error creating playlist:', error);
      throw new Error(`Failed to create playlist: ${error.message}`);
    }
  }

  async updatePlaylist(id: number, data: Partial<InsertPlaylist>): Promise<Playlist> {
    try {
      // Handle nullable fields with proper types
      const formattedData: Partial<Playlist> = { ...data };
      if ('spotifyId' in data) formattedData.spotifyId = data.spotifyId || null;
      if ('description' in data) formattedData.description = data.description || null;
      
      // If updating cover image, verify it exists first
      if ('coverImageUrl' in data && data.coverImageUrl) {
        try {
          const { verifyAndEnsureCoverImage } = await import('./services/coverImageVerifier');
          const verifiedCoverUrl = await verifyAndEnsureCoverImage(id, data.coverImageUrl);
          formattedData.coverImageUrl = verifiedCoverUrl;
        } catch (verifyError) {
          console.error(`Error verifying cover image for playlist ${id}:`, verifyError);
          // Use the original URL if verification fails
          formattedData.coverImageUrl = data.coverImageUrl || null;
        }
      } else if ('coverImageUrl' in data) {
        // Handle null case
        formattedData.coverImageUrl = data.coverImageUrl || null;
      }

      const [updatedPlaylist] = await db.update(playlists)
        .set(formattedData)
        .where(eq(playlists.id, id))
        .returning();
      
      if (!updatedPlaylist) {
        throw new Error(`Playlist with id ${id} not found`);
      }
      
      return updatedPlaylist;
    } catch (error: any) {
      console.error(`Error updating playlist with ID ${id}:`, error);
      throw new Error(`Failed to update playlist: ${error.message}`);
    }
  }

  async deletePlaylist(id: number): Promise<boolean> {
    try {
      // First delete all songs in the playlist
      await this.deleteSongsByPlaylistId(id);
      
      // Then delete the playlist
      const [deletedPlaylist] = await db.delete(playlists)
        .where(eq(playlists.id, id))
        .returning();
      
      return !!deletedPlaylist;
    } catch (error: any) {
      console.error(`Error deleting playlist with ID ${id}:`, error);
      throw new Error(`Failed to delete playlist: ${error.message}`);
    }
  }

  // Discover methods
  async getPublicPlaylists(limit = 20, offset = 0, excludeUserId?: number, spotifyOnly = false): Promise<Playlist[]> {
    try {
      // Build conditions array
      const conditions = [eq(playlists.isPublic, true)];
      
      // If excludeUserId is provided, add a condition to exclude that user's playlists
      if (excludeUserId) {
        conditions.push(ne(playlists.userId, excludeUserId));
      }
      
      // If spotifyOnly is true, only return playlists with Spotify IDs
      if (spotifyOnly) {
        conditions.push(isNotNull(playlists.spotifyId));
      }
      
      return db.select()
        .from(playlists)
        .where(and(...conditions))
        .orderBy(desc(playlists.createdAt))
        .limit(limit)
        .offset(offset);
    } catch (error: any) {
      console.error('Error fetching public playlists:', error);
      throw new Error(`Failed to fetch public playlists: ${error.message}`);
    }
  }

  async searchPlaylists(searchQuery: string, limit = 20, offset = 0, excludeUserId?: number, spotifyOnly = false): Promise<Playlist[]> {
    try {
      // Split the query into words for better matching
      const terms = searchQuery.toLowerCase().split(/\s+/).filter(term => term.length > 0);
      
      if (terms.length === 0) {
        return this.getPublicPlaylists(limit, offset, excludeUserId, spotifyOnly);
      }
      
      console.log(`Searching playlists with terms: ${JSON.stringify(terms)}, spotifyOnly: ${spotifyOnly}`);
      
      // For each term, create a condition that checks if it's in the title OR description
      const termConditions = terms.map(term => 
        or(
          sql`LOWER(${playlists.title}) LIKE ${`%${term}%`}`,
          sql`LOWER(${playlists.description}) LIKE ${`%${term}%`}`
        )
      );
      
      // Build conditions array
      const conditions = [
        eq(playlists.isPublic, true),
        ...termConditions
      ];
      
      // If excludeUserId is provided, add a condition to exclude that user's playlists
      if (excludeUserId) {
        conditions.push(ne(playlists.userId, excludeUserId));
      }
      
      // If spotifyOnly is true, only return playlists with Spotify IDs
      if (spotifyOnly) {
        conditions.push(isNotNull(playlists.spotifyId));
      }
      
      return db.select()
        .from(playlists)
        .where(and(...conditions))
        .orderBy(desc(playlists.createdAt))
        .limit(limit)
        .offset(offset);
    } catch (error: any) {
      console.error(`Error searching playlists with query '${searchQuery}':`, error);
      throw new Error(`Failed to search playlists: ${error.message}`);
    }
  }

  async searchPlaylistsByArtist(artistName: string, limit = 20, offset = 0, userId?: number): Promise<Playlist[]> {
    try {
      const normalizedArtistName = artistName.trim().toLowerCase();
      console.log(`Searching for artist name (normalized): "${normalizedArtistName}"`);
      
      // First find playlists that contain tracks by this artist using the correct schema
      // We need to join: playlist_tracks -> tracks -> tracks_to_artists -> artists
      const playlistsWithArtist = await db.select({ 
          playlistId: playlistTracks.playlistId 
        })
        .from(playlistTracks)
        .innerJoin(tracks, eq(playlistTracks.trackId, tracks.id))
        .innerJoin(tracksToArtists, eq(tracks.id, tracksToArtists.trackId))
        .innerJoin(artists, eq(tracksToArtists.artistId, artists.id))
        .where(sql`LOWER(${artists.name}) LIKE ${`%${normalizedArtistName}%`}`)
        .groupBy(playlistTracks.playlistId);
      
      console.log(`Found ${playlistsWithArtist.length} playlists containing tracks by "${artistName}"`);
      
      if (playlistsWithArtist.length === 0) {
        return [];
      }
      
      const playlistIds = playlistsWithArtist.map(p => p.playlistId);
      
      // Now fetch those playlists with improved filtering
      let query = db.select()
        .from(playlists)
        .where(sql`${playlists.id} IN (${sql.join(playlistIds, sql`, `)})`);
        
      // If userId is provided, return that user's playlists or public playlists
      if (userId) {
        query = query.where(
          or(
            eq(playlists.userId, userId),
            eq(playlists.isPublic, true)
          )
        );
      } else {
        // Otherwise only show public playlists
        query = query.where(eq(playlists.isPublic, true));
      }
        
      return query
        .orderBy(desc(playlists.createdAt))
        .limit(limit)
        .offset(offset);
    } catch (error: any) {
      console.error(`Error searching playlists by artist '${artistName}':`, error);
      throw new Error(`Failed to search playlists by artist: ${error.message}`);
    }
  }

  async getPlaylistWithSongs(id: number): Promise<{ playlist: Playlist, songs: Song[] } | undefined> {
    try {
      // Get the playlist
      const playlist = await this.getPlaylist(id);
      
      if (!playlist) {
        return undefined;
      }
      
      // Make sure it's public or we're in an admin context
      if (!playlist.isPublic) {
        console.warn(`Attempted to access private playlist ${id}`);
        return undefined;
      }
      
      // Get the songs
      const playlistSongs = await this.getSongsByPlaylistId(id);
      
      return {
        playlist,
        songs: playlistSongs
      };
    } catch (error: any) {
      console.error(`Error fetching playlist with songs for ID ${id}:`, error);
      throw new Error(`Failed to fetch playlist with songs: ${error.message}`);
    }
  }

  // Song methods
  async getSongsByPlaylistId(playlistId: number): Promise<Song[]> {
    try {
      return db.select().from(songs)
        .where(eq(songs.playlistId, playlistId))
        .orderBy(songs.position);
    } catch (error: any) {
      console.error(`Error fetching songs for playlist ID ${playlistId}:`, error);
      throw new Error(`Failed to fetch playlist songs: ${error.message}`);
    }
  }

  async createSong(insertSong: InsertSong): Promise<Song> {
    try {
      // Handle nullable fields with proper types for PostgreSQL
      const formattedInsertSong = {
        ...insertSong,
        album: insertSong.album || null,
        albumImageUrl: insertSong.albumImageUrl || null,
        durationMs: insertSong.durationMs || null
      };
      
      const [song] = await db.insert(songs).values(formattedInsertSong).returning();
      return song;
    } catch (error: any) {
      console.error('Error creating song:', error);
      throw new Error(`Failed to create song: ${error.message}`);
    }
  }

  async updateSong(id: number, data: Partial<InsertSong>): Promise<Song> {
    try {
      // Handle nullable fields with proper types
      const formattedData: Partial<Song> = { ...data };
      if ('album' in data) formattedData.album = data.album || null;
      if ('albumImageUrl' in data) formattedData.albumImageUrl = data.albumImageUrl || null;
      if ('durationMs' in data) formattedData.durationMs = data.durationMs || null;

      const [updatedSong] = await db.update(songs)
        .set(formattedData)
        .where(eq(songs.id, id))
        .returning();
      
      if (!updatedSong) {
        throw new Error(`Song with id ${id} not found`);
      }
      
      return updatedSong;
    } catch (error: any) {
      console.error(`Error updating song with ID ${id}:`, error);
      throw new Error(`Failed to update song: ${error.message}`);
    }
  }

  async deleteSong(id: number): Promise<boolean> {
    try {
      const [deletedSong] = await db.delete(songs)
        .where(eq(songs.id, id))
        .returning();
      
      return !!deletedSong;
    } catch (error: any) {
      console.error(`Error deleting song with ID ${id}:`, error);
      throw new Error(`Failed to delete song: ${error.message}`);
    }
  }

  async deleteSongsByPlaylistId(playlistId: number): Promise<boolean> {
    try {
      await db.delete(songs).where(eq(songs.playlistId, playlistId));
      return true;
    } catch (error: any) {
      console.error(`Error deleting songs for playlist ID ${playlistId}:`, error);
      throw new Error(`Failed to delete playlist songs: ${error.message}`);
    }
  }

  // Chat messages methods
  async getChatMessagesBySessionId(sessionId: string): Promise<ChatMessage[]> {
    try {
      return db.select().from(chatMessages)
        .where(eq(chatMessages.sessionId, sessionId))
        .orderBy(chatMessages.timestamp);
    } catch (error: any) {
      console.error(`Error fetching chat messages for session ID ${sessionId}:`, error);
      throw new Error(`Failed to fetch chat messages: ${error.message}`);
    }
  }

  async createChatMessage(insertMessage: InsertChatMessage): Promise<ChatMessage> {
    // The timestamp is handled by the default value in the database schema
    try {
      const [message] = await db.insert(chatMessages).values(insertMessage).returning();
      return message;
    } catch (error: any) {
      console.error('Error creating chat message:', error);
      throw new Error(`Failed to create chat message: ${error.message}`);
    }
  }

  // Saved prompts methods
  async getSavedPromptsByUserId(userId: number): Promise<SavedPrompt[]> {
    try {
      return db.select().from(savedPrompts)
        .where(eq(savedPrompts.userId, userId))
        .orderBy(desc(savedPrompts.createdAt));
    } catch (error: any) {
      console.error('Error fetching saved prompts:', error);
      throw new Error(`Failed to fetch saved prompts: ${error.message}`);
    }
  }

  async createSavedPrompt(insertPrompt: InsertSavedPrompt): Promise<SavedPrompt> {
    // The createdAt is handled by the default value in the database schema
    try {
      const [prompt] = await db.insert(savedPrompts).values(insertPrompt).returning();
      return prompt;
    } catch (error: any) {
      console.error('Error creating saved prompt:', error);
      throw new Error(`Failed to create saved prompt: ${error.message}`);
    }
  }

  async deleteSavedPrompt(id: number): Promise<boolean> {
    try {
      const [deletedPrompt] = await db.delete(savedPrompts)
        .where(eq(savedPrompts.id, id))
        .returning();
      
      return !!deletedPrompt;
    } catch (error: any) {
      console.error(`Error deleting saved prompt with ID ${id}:`, error);
      throw new Error(`Failed to delete saved prompt: ${error.message}`);
    }
  }
  
  // Cover image methods for chat sessions
  async storeCoverImageForSession(sessionId: string, coverImageUrl: string): Promise<boolean> {
    try {
      // Find the most recent assistant message for this session (isUser = false means it's from assistant)
      const messages = await db.select()
        .from(chatMessages)
        .where(and(
          eq(chatMessages.sessionId, sessionId),
          eq(chatMessages.isUser, false)
        ))
        .orderBy(desc(chatMessages.timestamp))
        .limit(1);
        
      if (messages.length === 0) {
        // No assistant message found for this session
        console.warn(`No assistant message found for session ${sessionId} to store cover image`);
        return false;
      }
      
      // Update the message content to include the cover image URL
      const message = messages[0];
      const content = message.content || '';
      
      // Check if the message already contains JSON
      let jsonContent;
      try {
        jsonContent = JSON.parse(content);
        // If successful, add or update the coverImageUrl
        jsonContent.coverImageUrl = coverImageUrl;
      } catch (e) {
        // Content is not JSON, create a new JSON object
        jsonContent = {
          message: content,
          coverImageUrl
        };
      }
      
      // Update the message with the new content
      await db.update(chatMessages)
        .set({ content: JSON.stringify(jsonContent) })
        .where(eq(chatMessages.id, message.id));
        
      return true;
    } catch (error: any) {
      console.error(`Error storing cover image for session ${sessionId}:`, error);
      throw new Error(`Failed to store cover image: ${error.message}`);
    }
  }
  
  async getCoverImageForSession(sessionId: string): Promise<string | null> {
    try {
      // Find the most recent assistant message for this session (isUser = false means it's from assistant)
      const messages = await db.select()
        .from(chatMessages)
        .where(and(
          eq(chatMessages.sessionId, sessionId),
          eq(chatMessages.isUser, false)
        ))
        .orderBy(desc(chatMessages.timestamp))
        .limit(1);
        
      if (messages.length === 0) {
        // No assistant message found for this session
        return null;
      }
      
      const message = messages[0];
      const content = message.content || '';
      
      // Check if the message contains JSON with a coverImageUrl
      try {
        const jsonContent = JSON.parse(content);
        return jsonContent.coverImageUrl || null;
      } catch (e) {
        // Content is not JSON
        return null;
      }
    } catch (error: any) {
      console.error(`Error getting cover image for session ${sessionId}:`, error);
      return null;
    }
  }

  // Smart Links methods
  async getSmartLink(shareId: string): Promise<SmartLink | undefined> {
    try {
      const [smartLink] = await db.select().from(smartLinks).where(eq(smartLinks.shareId, shareId));
      return smartLink;
    } catch (error: any) {
      console.error(`Error fetching smart link with shareId ${shareId}:`, error);
      return undefined;
    }
  }

  async getSmartLinkByPlaylistId(playlistId: number): Promise<SmartLink | undefined> {
    try {
      const [smartLink] = await db.select().from(smartLinks).where(eq(smartLinks.playlistId, playlistId));
      return smartLink;
    } catch (error: any) {
      console.error(`Error fetching smart link for playlist ${playlistId}:`, error);
      return undefined;
    }
  }

  async getSmartLinkByShareId(shareId: string): Promise<any> {
    try {
      const [smartLink] = await db
        .select({
          id: smartLinks.id,
          shareId: smartLinks.shareId,
          title: smartLinks.title,
          description: smartLinks.description,
          customCoverImage: smartLinks.customCoverImage,
          views: smartLinks.views,
          createdAt: smartLinks.createdAt,
          playlist: {
            id: playlists.id,
            title: playlists.title,
            description: playlists.description,
            coverImageUrl: playlists.coverImageUrl,
            articleTitle: playlists.articleTitle,
            articleLink: playlists.articleLink,
            spotifyId: playlists.spotifyId,
          },
          promotedTrackId: smartLinks.promotedTrackId
        })
        .from(smartLinks)
        .innerJoin(playlists, eq(smartLinks.playlistId, playlists.id))
        .where(eq(smartLinks.shareId, shareId));

      if (!smartLink) {
        return null;
      }

      // Get promoted track info if available (using current tracks table structure)
      if (smartLink.promotedTrackId) {
        const [promotedTrackData] = await db
          .select({
            id: tracks.id,
            title: tracks.title,
            duration: tracks.duration,
            albumTitle: albums.title,
            albumCover: albums.coverImage,
          })
          .from(tracks)
          .leftJoin(albums, eq(tracks.albumId, albums.id))
          .where(eq(tracks.id, smartLink.promotedTrackId));

        if (promotedTrackData) {
          // Get artist names for the promoted track
          const artistQuery = await db
            .select({ name: artists.name })
            .from(tracksToArtists)
            .innerJoin(artists, eq(tracksToArtists.artistId, artists.id))
            .where(eq(tracksToArtists.trackId, promotedTrackData.id));
          
          const artistNames = artistQuery.map(a => a.name).join(', ') || 'Unknown Artist';

          // Get platform IDs for all streaming services
          const platformQueries = await Promise.all([
            db.select({ platformId: trackPlatformIds.platformId })
              .from(trackPlatformIds)
              .where(and(
                eq(trackPlatformIds.trackId, promotedTrackData.id),
                eq(trackPlatformIds.platform, 'spotify')
              ))
              .limit(1),
            db.select({ platformId: trackPlatformIds.platformId })
              .from(trackPlatformIds)
              .where(and(
                eq(trackPlatformIds.trackId, promotedTrackData.id),
                eq(trackPlatformIds.platform, 'youtube')
              ))
              .limit(1),
            db.select({ platformId: trackPlatformIds.platformId })
              .from(trackPlatformIds)
              .where(and(
                eq(trackPlatformIds.trackId, promotedTrackData.id),
                eq(trackPlatformIds.platform, 'apple_music')
              ))
              .limit(1),
            db.select({ platformId: trackPlatformIds.platformId })
              .from(trackPlatformIds)
              .where(and(
                eq(trackPlatformIds.trackId, promotedTrackData.id),
                eq(trackPlatformIds.platform, 'deezer')
              ))
              .limit(1),
            db.select({ platformId: trackPlatformIds.platformId })
              .from(trackPlatformIds)
              .where(and(
                eq(trackPlatformIds.trackId, promotedTrackData.id),
                eq(trackPlatformIds.platform, 'amazon_music')
              ))
              .limit(1),
            db.select({ platformId: trackPlatformIds.platformId })
              .from(trackPlatformIds)
              .where(and(
                eq(trackPlatformIds.trackId, promotedTrackData.id),
                eq(trackPlatformIds.platform, 'tidal')
              ))
              .limit(1),
            db.select({ platformId: trackPlatformIds.platformId })
              .from(trackPlatformIds)
              .where(and(
                eq(trackPlatformIds.trackId, promotedTrackData.id),
                eq(trackPlatformIds.platform, 'other')
              ))
              .limit(1),
          ]);

          const [spotifyResult, youtubeResult, appleMusicResult, deezerResult, amazonMusicResult, tidalResult, pandoraResult] = platformQueries;

          // For external songs, we need to get the track data from the platform links
          // Check if this is an external song by looking for Spotify platform ID
          const spotifyPlatformId = spotifyResult[0]?.platformId;
          
          if (spotifyPlatformId) {
            // This is likely an external song, get the platform URLs for better data
            const platformUrls = await db
              .select()
              .from(trackPlatformIds)
              .where(eq(trackPlatformIds.trackId, promotedTrackData.id));
            
            // Format platform links
            const platformLinks: any = {};
            platformUrls.forEach(link => {
              platformLinks[link.platform] = {
                id: link.platformId,
                url: link.platformUrl
              };
            });
            
            // Add the promoted track data to the smart link response
            (smartLink as any).promotedTrack = {
              id: promotedTrackData.id,
              title: promotedTrackData.title,
              artist: artistNames || 'Unknown Artist',
              album: promotedTrackData.albumTitle || 'Unknown Album',
              albumCover: promotedTrackData.albumCover,
              duration: promotedTrackData.duration,
              spotifyId: spotifyResult[0]?.platformId || null,
              youtubeId: youtubeResult[0]?.platformId?.replace('YOUTUBE_VIDEO::', '') || null,
              appleMusicId: appleMusicResult[0]?.platformId?.replace('ITUNES_SONG::', '') || null,
              deezerId: deezerResult[0]?.platformId?.replace('DEEZER_SONG::', '') || null,
              amazonMusicId: amazonMusicResult[0]?.platformId?.replace('AMAZON_SONG::', '') || null,
              tidalId: tidalResult[0]?.platformId?.replace('TIDAL_SONG::', '') || null,
              pandoraId: pandoraResult[0]?.platformId?.replace('PANDORA_SONG::', '') || null,
              platformLinks: platformLinks
            };
          } else {
            // Regular track
            (smartLink as any).promotedTrack = {
              id: promotedTrackData.id,
              title: promotedTrackData.title,
              artist: artistNames,
              album: promotedTrackData.albumTitle,
              albumCover: promotedTrackData.albumCover,
              duration: promotedTrackData.duration,
              spotifyId: spotifyResult[0]?.platformId || null,
              youtubeId: youtubeResult[0]?.platformId?.replace('YOUTUBE_VIDEO::', '') || null,
              appleMusicId: appleMusicResult[0]?.platformId?.replace('ITUNES_SONG::', '') || null,
              deezerId: deezerResult[0]?.platformId?.replace('DEEZER_SONG::', '') || null,
              amazonMusicId: amazonMusicResult[0]?.platformId?.replace('AMAZON_SONG::', '') || null,
              tidalId: tidalResult[0]?.platformId?.replace('TIDAL_SONG::', '') || null,
              pandoraId: pandoraResult[0]?.platformId?.replace('PANDORA_SONG::', '') || null,
            };
          }
        }
      }

      // Get all tracks for this playlist using the shareId (which maps to playlist internally)
      const playlistTracks = await this.getSmartLinkTracks(shareId);
      (smartLink as any).playlist.tracks = playlistTracks;

      return smartLink;
    } catch (error: any) {
      console.error('Error fetching smart link by share ID:', error);
      throw error;
    }
  }

  async getSmartLinkTracks(shareId: string): Promise<any[]> {
    try {
      let playlistId: number;
      
      // Check if this is a playlist-based shareId (format: "playlist-{id}")
      if (shareId.startsWith('playlist-')) {
        playlistId = parseInt(shareId.replace('playlist-', ''));
      } else {
        // First get the playlist ID from the smart link
        const [smartLink] = await db
          .select({ playlistId: smartLinks.playlistId })
          .from(smartLinks)
          .where(eq(smartLinks.shareId, shareId));

        if (!smartLink) {
          return [];
        }
        
        playlistId = smartLink.playlistId;
      }

      // Use the playlist_tracks table to get track data - simplified to avoid duplicates
      console.log(`Fetching tracks for playlist ID: ${playlistId}`);
      
      // Get track data without artist joins first to avoid duplicates
      const basicTracks = await db
        .select({
          id: playlistTracks.id,
          position: playlistTracks.position,
          trackId: tracks.id,
          title: tracks.title,
          duration: tracks.duration,
          albumTitle: albums.title,
          albumCover: albums.coverImage,
        })
        .from(playlistTracks)
        .innerJoin(tracks, eq(playlistTracks.trackId, tracks.id))
        .leftJoin(albums, eq(tracks.albumId, albums.id))
        .where(eq(playlistTracks.playlistId, playlistId))
        .orderBy(playlistTracks.position);

      // Now get artist names for each track
      const playlistTracksResults = [];
      for (const track of basicTracks) {
        const artistQuery = await db
          .select({ name: artists.name })
          .from(tracksToArtists)
          .innerJoin(artists, eq(tracksToArtists.artistId, artists.id))
          .where(eq(tracksToArtists.trackId, track.trackId));
        
        const artistNames = artistQuery.map(a => a.name).join(', ') || 'Unknown Artist';
        
        playlistTracksResults.push({
          id: track.id,
          position: track.position,
          track: {
            id: track.trackId,
            title: track.title,
            duration: track.duration,
          },
          album: {
            title: track.albumTitle,
            coverImageUrl: track.albumCover,
          },
          artist: {
            name: artistNames
          }
        });
      }
        
      console.log(`Found ${playlistTracksResults.length} tracks in playlist_tracks for playlist ${playlistId}`);

      if (playlistTracksResults.length > 0) {
        // Format duration from milliseconds or seconds to MM:SS
        const formatDuration = (duration: number): string => {
          if (!duration || duration === 0) return '0:00';
          
          // Convert to seconds - if value is >= 1000, treat as milliseconds, otherwise as seconds
          const totalSeconds = duration >= 1000 ? Math.floor(duration / 1000) : duration;
          const minutes = Math.floor(totalSeconds / 60);
          const seconds = totalSeconds % 60;
          return `${minutes}:${seconds.toString().padStart(2, '0')}`;
        };

        return playlistTracksResults.map(pt => {
          const rawDuration = pt.track.duration || 0;
          // Always ensure duration is in milliseconds for consistency
          // If value is very small (< 1000), assume it's in seconds and convert
          // If value is between 1000-10000, could be either - check if reasonable as seconds
          let durationMs: number;
          if (rawDuration === 0) {
            durationMs = 0;
          } else if (rawDuration < 1000) {
            // Definitely seconds, convert to milliseconds
            durationMs = rawDuration * 1000;
          } else if (rawDuration < 10000) {
            // Could be seconds (3-9 min songs) or milliseconds (very short clips)
            // If treating as seconds gives a reasonable song length (3-10 min), use that
            const asSeconds = rawDuration;
            if (asSeconds >= 60 && asSeconds <= 600) { // 1-10 minutes
              durationMs = asSeconds * 1000;
            } else {
              durationMs = rawDuration; // Keep as milliseconds
            }
          } else {
            // Large number, definitely milliseconds
            durationMs = rawDuration;
          }
          
          console.log(`Track "${pt.track.title}" - Duration: ${rawDuration} -> ${durationMs}ms`);
          return {
            id: pt.track.id,
            title: pt.track.title,
            artist: pt.artist?.name || 'Unknown Artist',
            album: pt.album?.title || 'Unknown Album',
            albumCover: pt.album?.coverImageUrl || null,
            duration: durationMs,
            formattedDuration: formatDuration(durationMs),
            position: pt.position
          };
        });
      }

      // Fallback to songs table if no playlist_tracks found
      const playlistSongs = await db
        .select()
        .from(songs)
        .where(eq(songs.playlistId, playlistId))
        .orderBy(songs.position);

      return playlistSongs.map(song => ({
        id: song.id,
        title: song.title,
        artist: song.artist,
        album: song.album,
        albumCover: song.albumImageUrl,
        duration: song.durationMs,
        position: song.position
      }));
    } catch (error: any) {
      console.error('Error fetching smart link tracks:', error);
      throw error;
    }
  }

  async incrementSmartLinkViews(shareId: string): Promise<void> {
    try {
      await db
        .update(smartLinks)
        .set({ views: sql`${smartLinks.views} + 1` })
        .where(eq(smartLinks.shareId, shareId));
    } catch (error: any) {
      console.error('Error incrementing smart link views:', error);
      throw error;
    }
  }

  async incrementSmartLinkViewsByPlaylistId(playlistId: number): Promise<void> {
    try {
      await db
        .update(smartLinks)
        .set({ views: sql`${smartLinks.views} + 1` })
        .where(eq(smartLinks.playlistId, playlistId));
    } catch (error: any) {
      console.error('Error incrementing smart link views by playlist ID:', error);
      throw error;
    }
  }

  async getSmartLinkByPlaylistId(playlistId: number): Promise<any> {
    try {
      const [smartLink] = await db
        .select({
          id: smartLinks.id,
          shareId: smartLinks.shareId,
          title: smartLinks.title,
          description: smartLinks.description,
          customCoverImage: smartLinks.customCoverImage,
          views: smartLinks.views,
          createdAt: smartLinks.createdAt,
          playlist: {
            id: playlists.id,
            title: playlists.title,
            description: playlists.description,
            coverImageUrl: playlists.coverImageUrl,
            articleTitle: playlists.articleTitle,
            articleLink: playlists.articleLink,
            spotifyId: playlists.spotifyId,
          },
          promotedTrackId: smartLinks.promotedTrackId
        })
        .from(smartLinks)
        .innerJoin(playlists, eq(smartLinks.playlistId, playlists.id))
        .where(eq(smartLinks.playlistId, playlistId))
        .orderBy(smartLinks.createdAt)
        .limit(1);

      if (!smartLink) {
        return null;
      }

      // Get promoted track info if available (using current tracks table structure)
      if (smartLink.promotedTrackId) {
        const [promotedTrackData] = await db
          .select({
            id: tracks.id,
            title: tracks.title,
            duration: tracks.duration,
            albumTitle: albums.title,
            albumCover: albums.coverImage,
          })
          .from(tracks)
          .leftJoin(albums, eq(tracks.albumId, albums.id))
          .where(eq(tracks.id, smartLink.promotedTrackId));

        if (promotedTrackData) {
          // Get artist names for the promoted track
          const artistQuery = await db
            .select({ name: artists.name })
            .from(tracksToArtists)
            .innerJoin(artists, eq(tracksToArtists.artistId, artists.id))
            .where(eq(tracksToArtists.trackId, promotedTrackData.id));
          
          const artistNames = artistQuery.map(a => a.name).join(', ') || 'Unknown Artist';

          // Get platform IDs for the promoted track
          const spotifyQuery = await db.select({ platformId: trackPlatformIds.platformId })
            .from(trackPlatformIds)
            .where(and(
              eq(trackPlatformIds.trackId, promotedTrackData.id),
              eq(trackPlatformIds.platform, 'spotify')
            ))
            .limit(1);
          
          const youtubeQuery = await db.select({ platformId: trackPlatformIds.platformId })
            .from(trackPlatformIds)
            .where(and(
              eq(trackPlatformIds.trackId, promotedTrackData.id),
              eq(trackPlatformIds.platform, 'youtube')
            ))
            .limit(1);

          // Get all platform IDs for the promoted track
          const [appleMusicQuery, deezerQuery, amazonQuery, tidalQuery, pandoraQuery] = await Promise.all([
            db.select({ platformId: trackPlatformIds.platformId })
              .from(trackPlatformIds)
              .where(and(
                eq(trackPlatformIds.trackId, promotedTrackData.id),
                eq(trackPlatformIds.platform, 'apple_music')
              ))
              .limit(1),
            db.select({ platformId: trackPlatformIds.platformId })
              .from(trackPlatformIds)
              .where(and(
                eq(trackPlatformIds.trackId, promotedTrackData.id),
                eq(trackPlatformIds.platform, 'deezer')
              ))
              .limit(1),
            db.select({ platformId: trackPlatformIds.platformId })
              .from(trackPlatformIds)
              .where(and(
                eq(trackPlatformIds.trackId, promotedTrackData.id),
                eq(trackPlatformIds.platform, 'amazon_music')
              ))
              .limit(1),
            db.select({ platformId: trackPlatformIds.platformId })
              .from(trackPlatformIds)
              .where(and(
                eq(trackPlatformIds.trackId, promotedTrackData.id),
                eq(trackPlatformIds.platform, 'tidal')
              ))
              .limit(1),
            db.select({ platformId: trackPlatformIds.platformId })
              .from(trackPlatformIds)
              .where(and(
                eq(trackPlatformIds.trackId, promotedTrackData.id),
                eq(trackPlatformIds.platform, 'other')
              ))
              .limit(1)
          ]);

          (smartLink as any).promotedTrack = {
            id: promotedTrackData.id,
            title: promotedTrackData.title,
            artist: artistNames,
            album: promotedTrackData.albumTitle,
            albumCover: promotedTrackData.albumCover,
            duration: promotedTrackData.duration,
            spotifyId: spotifyQuery[0]?.platformId || null,
            youtubeId: youtubeQuery[0]?.platformId?.replace('YOUTUBE_VIDEO::', '') || null,
            appleMusicId: appleMusicQuery[0]?.platformId?.replace('ITUNES_SONG::', '') || null,
            deezerId: deezerQuery[0]?.platformId?.replace('DEEZER_SONG::', '') || null,
            amazonMusicId: amazonQuery[0]?.platformId?.replace('AMAZON_SONG::', '') || null,
            tidalId: tidalQuery[0]?.platformId?.replace('TIDAL_SONG::', '') || null,
            pandoraId: pandoraQuery[0]?.platformId?.replace('PANDORA_SONG::', '') || null,
            previewUrl: null,
          };
        }
      }

      // Get all tracks for this playlist using the existing smart link tracks method
      const playlistTracks = await this.getSmartLinkTracks(`playlist-${playlistId}`);
      (smartLink as any).playlist.tracks = playlistTracks;

      return smartLink;
    } catch (error: any) {
      console.error('Error fetching smart link by playlist ID:', error);
      throw error;
    }
  }

  async createSmartLink(smartLink: InsertSmartLink): Promise<SmartLink> {
    try {
      // Use upsert to ensure only one smart link per playlist
      const [newSmartLink] = await db
        .insert(smartLinks)
        .values(smartLink)
        .onConflictDoUpdate({
          target: smartLinks.playlistId,
          set: {
            shareId: smartLink.shareId,
            promotedTrackId: smartLink.promotedTrackId,
            customCoverImage: smartLink.customCoverImage,
            title: smartLink.title,
            description: smartLink.description,
            updatedAt: new Date(),
          },
        })
        .returning();
      return newSmartLink;
    } catch (error: any) {
      console.error('Error creating smart link:', error);
      throw new Error(`Failed to create smart link: ${error.message}`);
    }
  }

  async updateSmartLinkViews(shareId: string): Promise<boolean> {
    try {
      const result = await db.update(smartLinks)
        .set({ views: sql`${smartLinks.views} + 1` })
        .where(eq(smartLinks.shareId, shareId));
      return true;
    } catch (error: any) {
      console.error(`Error updating views for smart link ${shareId}:`, error);
      return false;
    }
  }

  async getSmartLinksByUserId(userId: number): Promise<SmartLink[]> {
    try {
      // Join with playlists to get smart links for user's playlists
      const results = await db.select({
        id: smartLinks.id,
        shareId: smartLinks.shareId,
        playlistId: smartLinks.playlistId,
        promotedTrackId: smartLinks.promotedTrackId,
        customCoverImage: smartLinks.customCoverImage,
        title: smartLinks.title,
        description: smartLinks.description,
        views: smartLinks.views,
        socialImageUrl: smartLinks.socialImageUrl,
        openGraphImageUrl: smartLinks.openGraphImageUrl,
        createdAt: smartLinks.createdAt,
        updatedAt: smartLinks.updatedAt,
      })
      .from(smartLinks)
      .innerJoin(playlists, eq(smartLinks.playlistId, playlists.id))
      .where(eq(playlists.userId, userId))
      .orderBy(desc(smartLinks.createdAt));
      
      return results;
    } catch (error: any) {
      console.error(`Error fetching smart links for user ${userId}:`, error);
      return [];
    }
  }

  async getSmartLinkById(smartLinkId: number): Promise<SmartLink | undefined> {
    try {
      const [smartLink] = await db.select().from(smartLinks).where(eq(smartLinks.id, smartLinkId));
      return smartLink;
    } catch (error: any) {
      console.error(`Error fetching smart link with ID ${smartLinkId}:`, error);
      return undefined;
    }
  }

  async deleteSmartLink(smartLinkId: number): Promise<void> {
    try {
      await db.delete(smartLinks).where(eq(smartLinks.id, smartLinkId));
    } catch (error: any) {
      console.error(`Error deleting smart link with ID ${smartLinkId}:`, error);
      throw error;
    }
  }

  async updateSmartLink(shareId: string, updateData: Partial<InsertSmartLink>): Promise<SmartLink> {
    try {
      const [updatedSmartLink] = await db
        .update(smartLinks)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(eq(smartLinks.shareId, shareId))
        .returning();
        
      if (!updatedSmartLink) {
        throw new Error('Smart link not found');
      }
      
      return updatedSmartLink;
    } catch (error: any) {
      console.error(`Error updating smart link ${shareId}:`, error);
      throw new Error(`Failed to update smart link: ${error.message}`);
    }
  }

  async updateSmartLinkSocialImages(smartLinkId: number, socialImageUrl: string, openGraphImageUrl: string): Promise<void> {
    try {
      await db
        .update(smartLinks)
        .set({
          socialImageUrl,
          openGraphImageUrl,
          updatedAt: new Date()
        })
        .where(eq(smartLinks.id, smartLinkId));
    } catch (error: any) {
      console.error(`Error updating social images for smart link ${smartLinkId}:`, error);
      throw error;
    }
  }

  // Credit management methods
  async createCreditTransaction(transaction: InsertCreditTransaction): Promise<CreditTransaction> {
    try {
      const [newTransaction] = await db
        .insert(creditTransactions)
        .values(transaction)
        .returning();
      return newTransaction;
    } catch (error: any) {
      console.error('Error creating credit transaction:', error);
      throw new Error(`Failed to create credit transaction: ${error.message}`);
    }
  }

  async getCreditTransactionsByUserId(userId: number, limit = 50): Promise<CreditTransaction[]> {
    try {
      return await db
        .select()
        .from(creditTransactions)
        .where(eq(creditTransactions.userId, userId))
        .orderBy(desc(creditTransactions.createdAt))
        .limit(limit);
    } catch (error: any) {
      console.error(`Error fetching credit transactions for user ${userId}:`, error);
      return [];
    }
  }

  // WhatsApp methods
  async createWhatsAppMessage(message: InsertWhatsAppMessage): Promise<WhatsAppMessage> {
    try {
      const [newMessage] = await db
        .insert(whatsappMessages)
        .values(message)
        .returning();
      return newMessage;
    } catch (error: any) {
      console.error('Error creating WhatsApp message:', error);
      throw new Error(`Failed to create WhatsApp message: ${error.message}`);
    }
  }

  async getWhatsAppMessagesByPhone(phoneNumber: string): Promise<WhatsAppMessage[]> {
    try {
      return await db
        .select()
        .from(whatsappMessages)
        .where(eq(whatsappMessages.fromNumber, phoneNumber))
        .orderBy(desc(whatsappMessages.timestamp));
    } catch (error: any) {
      console.error(`Error fetching WhatsApp messages for ${phoneNumber}:`, error);
      return [];
    }
  }

  async createWhatsAppSession(session: InsertWhatsAppSession): Promise<WhatsAppSession> {
    try {
      const [newSession] = await db
        .insert(whatsappSessions)
        .values(session)
        .returning();
      return newSession;
    } catch (error: any) {
      console.error('Error creating WhatsApp session:', error);
      throw new Error(`Failed to create WhatsApp session: ${error.message}`);
    }
  }

  async getWhatsAppSessionByPhone(phoneNumber: string): Promise<WhatsAppSession | undefined> {
    try {
      const [session] = await db
        .select()
        .from(whatsappSessions)
        .where(and(
          eq(whatsappSessions.phoneNumber, phoneNumber),
          eq(whatsappSessions.isActive, true)
        ))
        .orderBy(desc(whatsappSessions.lastInteraction))
        .limit(1);
      return session;
    } catch (error: any) {
      console.error(`Error fetching WhatsApp session for ${phoneNumber}:`, error);
      return undefined;
    }
  }

  async updateWhatsAppSession(id: number, data: Partial<InsertWhatsAppSession>): Promise<WhatsAppSession> {
    try {
      const [updatedSession] = await db
        .update(whatsappSessions)
        .set({
          ...data,
          lastInteraction: new Date()
        })
        .where(eq(whatsappSessions.id, id))
        .returning();
      
      if (!updatedSession) {
        throw new Error('WhatsApp session not found');
      }
      
      return updatedSession;
    } catch (error: any) {
      console.error(`Error updating WhatsApp session ${id}:`, error);
      throw new Error(`Failed to update WhatsApp session: ${error.message}`);
    }
  }

  async createWhatsAppConfig(config: InsertWhatsAppConfig): Promise<WhatsAppConfig> {
    try {
      const [newConfig] = await db
        .insert(whatsappConfig)
        .values(config)
        .returning();
      return newConfig;
    } catch (error: any) {
      console.error('Error creating WhatsApp config:', error);
      throw new Error(`Failed to create WhatsApp config: ${error.message}`);
    }
  }

  async getActiveWhatsAppConfig(): Promise<WhatsAppConfig | undefined> {
    try {
      const [config] = await db
        .select()
        .from(whatsappConfig)
        .where(eq(whatsappConfig.isActive, true))
        .orderBy(desc(whatsappConfig.createdAt))
        .limit(1);
      return config;
    } catch (error: any) {
      console.error('Error fetching active WhatsApp config:', error);
      return undefined;
    }
  }

  // Track reordering functionality
  async updateTrackPosition(playlistId: number, trackId: number, newPosition: number): Promise<boolean> {
    try {
      await db
        .update(playlistTracks)
        .set({ position: newPosition })
        .where(
          and(
            eq(playlistTracks.playlistId, playlistId),
            eq(playlistTracks.trackId, trackId)
          )
        );
      return true;
    } catch (error: any) {
      console.error(`Error updating track position for playlist ${playlistId}, track ${trackId}:`, error);
      return false;
    }
  }

  async addTrackToPlaylist(playlistId: number, trackId: number, position: number): Promise<boolean> {
    try {
      console.log(`Adding track ${trackId} to playlist ${playlistId} at position ${position}`);
      
      await db.insert(playlistTracks).values({
        playlistId,
        trackId,
        position
      });
      
      console.log(`Successfully added track ${trackId} to playlist ${playlistId}`);
      return true;
    } catch (error: any) {
      console.error(`Error adding track ${trackId} to playlist ${playlistId}:`, error);
      return false;
    }
  }
}

export const storage = new DatabaseStorage();