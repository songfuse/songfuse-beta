import { 
  InsertUser, User, Playlist, InsertPlaylist, Song, InsertSong, 
  ChatMessage, InsertChatMessage, SavedPrompt, InsertSavedPrompt,
  SpotifyTrack, GeneratedPlaylist 
} from "@shared/schema";

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserBySpotifyId(spotifyId: string): Promise<User | undefined>;
  getUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, data: Partial<InsertUser>): Promise<User>;

  // Playlist methods
  getPlaylist(id: number): Promise<Playlist | undefined>;
  getPlaylistBySpotifyId(spotifyId: string): Promise<Playlist | undefined>;
  getPlaylistsByUserId(userId: number): Promise<Playlist[]>;
  createPlaylist(playlist: InsertPlaylist): Promise<Playlist>;
  updatePlaylist(id: number, data: Partial<InsertPlaylist>): Promise<Playlist>;
  deletePlaylist(id: number): Promise<boolean>;

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
}

// Import the Drizzle database connection
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import { users, playlists, songs, chatMessages, savedPrompts } from "@shared/schema";

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
      if ('coverImageUrl' in data) formattedData.coverImageUrl = data.coverImageUrl || null;

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
}

export const storage = new DatabaseStorage();