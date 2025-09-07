import { pgTable, text, serial, integer, json, timestamp, boolean, primaryKey, pgEnum, varchar, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";
import { z } from "zod";

// Storing user credentials and Spotify tokens
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name"), // User's full name
  spotifyId: text("spotify_id"),
  spotifyAccessToken: text("spotify_access_token"),
  spotifyRefreshToken: text("spotify_refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  credits: integer("credits").default(5).notNull(), // Users start with 5 credits
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  name: true,
  spotifyId: true,
  spotifyAccessToken: true,
  spotifyRefreshToken: true,
  tokenExpiresAt: true,
  credits: true,
});

// Credit transactions table to track credit usage and purchases
export const creditTransactions = pgTable("credit_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  amount: integer("amount").notNull(), // Positive for purchases, negative for usage
  type: text("type").notNull(), // 'purchase', 'playlist_creation', 'smart_link_creation', 'bonus'
  description: text("description"), // Description of the transaction
  relatedId: integer("related_id"), // ID of related playlist or smart link
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCreditTransactionSchema = createInsertSchema(creditTransactions).pick({
  userId: true,
  amount: true,
  type: true,
  description: true,
  relatedId: true,
});

// Playlist details
export const playlists = pgTable("playlists", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  spotifyId: text("spotify_id"),
  coverImageUrl: text("cover_image_url"),
  socialImageUrl: text("social_image_url"), // Optimized for messaging apps (800x800, under 100KB)
  ogImageUrl: text("og_image_url"), // Optimized for social media cards (1200x630)
  thumbnailImageUrl: text("thumbnail_image_url"), // 64x64 - very small thumbnails for UI previews
  smallImageUrl: text("small_image_url"),         // 150x150 - card views and listings
  createdAt: timestamp("created_at").defaultNow(),
  spotifyUrl: text("spotify_url"),
  isPublic: boolean("is_public").default(true), // Default to public for discovery
  articleTitle: varchar("article_title"), // Title of the news article that inspired this playlist
  articleLink: varchar("article_link"), // Link to the original news article
});

export const insertPlaylistSchema = createInsertSchema(playlists).pick({
  userId: true,
  title: true,
  description: true,
  spotifyId: true,
  spotifyUrl: true,
  coverImageUrl: true,
  socialImageUrl: true,
  ogImageUrl: true,
  thumbnailImageUrl: true,
  smallImageUrl: true,
  isPublic: true,
  articleTitle: true,
  articleLink: true,
});

// Songs in a playlist
export const songs = pgTable("songs", {
  id: serial("id").primaryKey(),
  playlistId: integer("playlist_id").notNull(),
  spotifyId: text("spotify_id").notNull(),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  album: text("album"),
  albumImageUrl: text("album_image_url"),
  durationMs: integer("duration_ms"),
  position: integer("position").notNull(),
});

export const insertSongSchema = createInsertSchema(songs).pick({
  playlistId: true,
  spotifyId: true,
  title: true,
  artist: true,
  album: true,
  albumImageUrl: true,
  durationMs: true,
  position: true,
});

// Chat message history
export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  sessionId: text("session_id").notNull(),
  content: text("content").notNull(),
  isUser: boolean("is_user").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).pick({
  userId: true,
  sessionId: true,
  content: true,
  isUser: true,
});

// Saved prompts/ideas
export const savedPrompts = pgTable("saved_prompts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSavedPromptSchema = createInsertSchema(savedPrompts).pick({
  userId: true,
  content: true,
});

// Define types from schemas
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Playlist = typeof playlists.$inferSelect;
export type InsertPlaylist = z.infer<typeof insertPlaylistSchema>;

export type Song = typeof songs.$inferSelect;
export type InsertSong = z.infer<typeof insertSongSchema>;

export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;

export type SavedPrompt = typeof savedPrompts.$inferSelect;
export type InsertSavedPrompt = z.infer<typeof insertSavedPromptSchema>;

export type CreditTransaction = typeof creditTransactions.$inferSelect;
export type InsertCreditTransaction = z.infer<typeof insertCreditTransactionSchema>;

// News caching table - stores music news for daily refresh
export const newsArticles = pgTable("news_articles", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  link: text("link").notNull().unique(),
  description: text("description"),
  content: text("content"),
  pubDate: timestamp("pub_date"),
  source: text("source"),
  sourceName: text("source_name"),
  guid: text("guid"),
  categories: json("categories").$type<string[]>(),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  lastFetched: timestamp("last_fetched").defaultNow(),
});

export const insertNewsArticleSchema = createInsertSchema(newsArticles).pick({
  title: true,
  link: true,
  description: true,
  content: true,
  pubDate: true,
  source: true,
  sourceName: true,
  guid: true,
  categories: true,
  imageUrl: true,
});

export type NewsArticle = typeof newsArticles.$inferSelect;
export type InsertNewsArticle = z.infer<typeof insertNewsArticleSchema>;

// Music Database Schema

// Enum for music service platforms
export const platformEnum = pgEnum('platform', [
  'spotify', 
  'deezer', 
  'apple_music', 
  'amazon_music', 
  'tidal', 
  'youtube', 
  'other'
]);

// Artists table
export const artists = pgTable("artists", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  picture: text("picture"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertArtistSchema = createInsertSchema(artists).pick({
  name: true,
  picture: true,
});

// Artist platform IDs
export const artistPlatformIds = pgTable("artist_platform_ids", {
  id: serial("id").primaryKey(),
  artistId: integer("artist_id").notNull(),
  platform: platformEnum("platform").notNull(),
  platformId: text("platform_id").notNull(),
});

export const insertArtistPlatformIdSchema = createInsertSchema(artistPlatformIds).pick({
  artistId: true,
  platform: true,
  platformId: true,
});

// Albums table
export const albums = pgTable("albums", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  releaseDate: timestamp("release_date"),
  coverImage: text("cover_image"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAlbumSchema = createInsertSchema(albums).pick({
  title: true,
  releaseDate: true,
  coverImage: true,
});

// Album platform IDs
export const albumPlatformIds = pgTable("album_platform_ids", {
  id: serial("id").primaryKey(),
  albumId: integer("album_id").notNull(),
  platform: platformEnum("platform").notNull(),
  platformId: text("platform_id").notNull(),
});

export const insertAlbumPlatformIdSchema = createInsertSchema(albumPlatformIds).pick({
  albumId: true,
  platform: true,
  platformId: true,
});

// Album-Artist relation table (many-to-many)
export const albumsToArtists = pgTable("albums_to_artists", {
  albumId: integer("album_id").notNull(),
  artistId: integer("artist_id").notNull(),
  isPrimary: boolean("is_primary").default(false), // Whether this is the main artist
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.albumId, table.artistId] }),
  };
});

export const insertAlbumToArtistSchema = createInsertSchema(albumsToArtists);

// Genres table
export const genres = pgTable("genres", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const insertGenreSchema = createInsertSchema(genres).pick({
  name: true,
});

// Main tracks table
export const tracks = pgTable("tracks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  albumId: integer("album_id"),
  // Note: We don't store Spotify ID here directly, but in track_platform_ids table
  duration: integer("duration"), // Duration in seconds
  explicit: boolean("explicit").default(false),
  popularity: integer("popularity"), // Custom popularity score (0-100)
  previewUrl: text("preview_url"), // URL to a preview of the track
  releaseDate: timestamp("release_date"),
  // Vector embeddings for similarity search (stored as array)
  embedding: json("embedding"), // OpenAI embedding dimensions (stored as JSON array)
  
  // Audio features for enhanced playlist matching
  tempo: integer("tempo"), // Beats per minute
  energy: integer("energy"), // Energy level 0-100
  danceability: integer("danceability"), // Danceability level 0-100
  valence: integer("valence"), // Positivity/happiness level 0-100
  acousticness: integer("acousticness"), // Acoustic level 0-100
  instrumentalness: integer("instrumentalness"), // Instrumental level 0-100
  liveness: integer("liveness"), // Live performance probability 0-100
  speechiness: integer("speechiness"), // Spoken word content 0-100
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTrackSchema = createInsertSchema(tracks).pick({
  title: true,
  albumId: true,
  duration: true,
  explicit: true,
  popularity: true,
  previewUrl: true,
  releaseDate: true,
  embedding: true,
  tempo: true,
  energy: true,
  danceability: true,
  valence: true,
  acousticness: true,
  instrumentalness: true,
  liveness: true,
  speechiness: true,
});

// Track platform IDs
export const trackPlatformIds = pgTable("track_platform_ids", {
  id: serial("id").primaryKey(),
  trackId: integer("track_id").notNull(),
  platform: platformEnum("platform").notNull(),
  platformId: text("platform_id").notNull(),
  platformUrl: text("platform_url"), // URL to play the track on the platform
});

export const insertTrackPlatformIdSchema = createInsertSchema(trackPlatformIds).pick({
  trackId: true,
  platform: true,
  platformId: true,
  platformUrl: true,
});

// Track-Artist relation table (many-to-many)
export const tracksToArtists = pgTable("tracks_to_artists", {
  trackId: integer("track_id").notNull(),
  artistId: integer("artist_id").notNull(),
  isPrimary: boolean("is_primary").default(false), // Whether this is the main artist
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.trackId, table.artistId] }),
  };
});

export const insertTrackToArtistSchema = createInsertSchema(tracksToArtists);

// Track-Genre relation table (many-to-many)
export const tracksToGenres = pgTable("tracks_to_genres", {
  trackId: integer("track_id").notNull(),
  genreId: integer("genre_id").notNull(),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.trackId, table.genreId] }),
  };
});

export const insertTrackToGenreSchema = createInsertSchema(tracksToGenres);

// Update songs table to reference our tracks table
export const tracksSongs = pgTable("tracks_songs", {
  songId: integer("song_id").notNull(),
  trackId: integer("track_id").notNull(),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.songId, table.trackId] }),
  };
});

// New simplified playlist_tracks table to directly link playlists and tracks
export const playlistTracks = pgTable("playlist_tracks", {
  id: serial("id").primaryKey(),
  playlistId: integer("playlist_id")
    .references(() => playlists.id, { onDelete: 'cascade' })
    .notNull(),
  trackId: integer("track_id")
    .references(() => tracks.id)
    .notNull(),
  position: integer("position").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => {
  return {
    // Prevent duplicate tracks in a playlist
    uniquePlaylistTrack: unique().on(table.playlistId, table.trackId),
  };
});

// Define relations
export const playlistTracksRelations = relations(playlistTracks, ({ one }) => ({
  playlist: one(playlists, {
    fields: [playlistTracks.playlistId],
    references: [playlists.id],
  }),
  track: one(tracks, {
    fields: [playlistTracks.trackId],
    references: [tracks.id],
  }),
}));

export const artistsRelations = relations(artists, ({ many }) => ({
  platforms: many(artistPlatformIds),
  albums: many(albumsToArtists),
  tracks: many(tracksToArtists),
}));

export const albumsRelations = relations(albums, ({ many }) => ({
  platforms: many(albumPlatformIds),
  artists: many(albumsToArtists),
  tracks: many(tracks),
}));

export const tracksRelations = relations(tracks, ({ one, many }) => ({
  album: one(albums, {
    fields: [tracks.albumId],
    references: [albums.id],
  }),
  platforms: many(trackPlatformIds),
  artists: many(tracksToArtists),
  genres: many(tracksToGenres),
  songs: many(tracksSongs),
  playlists: many(playlistTracks),
}));

// Create insert/select types for new tables
export type Artist = typeof artists.$inferSelect;
export type InsertArtist = z.infer<typeof insertArtistSchema>;

export type ArtistPlatformId = typeof artistPlatformIds.$inferSelect;
export type InsertArtistPlatformId = z.infer<typeof insertArtistPlatformIdSchema>;

export type Album = typeof albums.$inferSelect;
export type InsertAlbum = z.infer<typeof insertAlbumSchema>;

export type AlbumPlatformId = typeof albumPlatformIds.$inferSelect;
export type InsertAlbumPlatformId = z.infer<typeof insertAlbumPlatformIdSchema>;

export type Genre = typeof genres.$inferSelect;
export type InsertGenre = z.infer<typeof insertGenreSchema>;

export type Track = typeof tracks.$inferSelect;
export type InsertTrack = z.infer<typeof insertTrackSchema>;

export type TrackPlatformId = typeof trackPlatformIds.$inferSelect;
export type InsertTrackPlatformId = z.infer<typeof insertTrackPlatformIdSchema>;

export type PlaylistTrack = typeof playlistTracks.$inferSelect;
export const insertPlaylistTrackSchema = createInsertSchema(playlistTracks).pick({
  playlistId: true,
  trackId: true,
  position: true,
});
export type InsertPlaylistTrack = z.infer<typeof insertPlaylistTrackSchema>;

// Keep existing API response types for compatibility
export type SpotifyTrack = {
  id: string;
  name: string;
  artists: { name: string; id?: string }[];
  album: { 
    name: string;
    images: { url: string }[];
  };
  duration_ms: number;
  preview_url?: string; // URL to a 30-second preview of the track (might be null)
  explicit?: boolean;   // Whether the track has explicit content
  popularity?: number;  // Track popularity score (0-100)
  
  // Internal database ID reference
  dbId?: number;        // Our internal database ID for the track
  
  // Multi-platform support
  platforms?: {
    [platform: string]: {
      id: string;
      url?: string;
    }
  };
  
  // Audio features
  audio_features?: {
    tempo?: number;       // Tempo in BPM
    energy?: number;      // Energy level 0-100
    danceability?: number; // Danceability level 0-100
    valence?: number;     // Positivity/happiness level 0-100
    acousticness?: number; // Acoustic level 0-100
    instrumentalness?: number; // Instrumental level 0-100
    liveness?: number;    // Live performance probability 0-100
    speechiness?: number; // Spoken word content 0-100
  };
};

export type GeneratedPlaylist = {
  title: string;
  description: string;
  coverImageUrl: string;
  tracks: SpotifyTrack[];
  originalPrompt?: string; // Store the original prompt that generated this playlist
  isPublic?: boolean; // Whether the playlist is public or private
};

// Smart Links table for shareable playlist pages with promoted songs
export const smartLinks = pgTable("smart_links", {
  id: serial("id").primaryKey(),
  shareId: text("share_id").notNull().unique(), // Unique identifier for the URL (e.g., "abc123")
  playlistId: integer("playlist_id").notNull().unique(), // Only one smart link per playlist
  promotedTrackId: integer("promoted_track_id").notNull(), // The track being promoted
  customCoverImage: text("custom_cover_image"), // Optional custom cover for promoted song
  title: text("title").notNull(), // Custom title for the smart link
  description: text("description"), // Custom description for the smart link
  views: integer("views").default(0), // Track how many times it's been viewed
  socialImageUrl: text("social_image_url"), // Optimized 800x800 social sharing image
  openGraphImageUrl: text("open_graph_image_url"), // Optimized 1200x630 Open Graph image
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSmartLinkSchema = createInsertSchema(smartLinks).pick({
  shareId: true,
  playlistId: true,
  promotedTrackId: true,
  customCoverImage: true,
  title: true,
  description: true,
});

export type SmartLink = typeof smartLinks.$inferSelect;
export type InsertSmartLink = typeof smartLinks.$inferInsert;
