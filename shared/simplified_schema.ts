import { relations } from 'drizzle-orm';
import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  boolean,
  unique,
  primaryKey,
  pgEnum,
  json,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// === User-related tables ===

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull(),
  spotifyId: text('spotify_id'),
  spotifyAccessToken: text('spotify_access_token'),
  spotifyRefreshToken: text('spotify_refresh_token'),
  spotifyTokenExpiry: timestamp('spotify_token_expiry'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  playlists: many(playlists),
}));

// === Playlist-related tables ===

export const playlists = pgTable('playlists', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  spotifyId: text('spotify_id'),
  title: text('title').notNull(),
  description: text('description'),
  coverImageUrl: text('cover_image_url'),
  isPublic: boolean('is_public').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const playlistsRelations = relations(playlists, ({ one, many }) => ({
  user: one(users, {
    fields: [playlists.userId],
    references: [users.id],
  }),
  tracks: many(playlistTracks),
}));

// === Track-related tables ===

export const tracks = pgTable('tracks', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  albumId: integer('album_id').references(() => albums.id),
  duration: integer('duration'),
  explicit: boolean('explicit').default(false),
  popularity: integer('popularity'),
  previewUrl: text('preview_url'),
  releaseDate: timestamp('release_date'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  embedding: json('embedding'),
  tempo: integer('tempo'),
  energy: integer('energy'),
  danceability: integer('danceability'),
  valence: integer('valence'),
  acousticness: integer('acousticness'),
  instrumentalness: integer('instrumentalness'),
  liveness: integer('liveness'),
  speechiness: integer('speechiness'),
});

export const tracksRelations = relations(tracks, ({ one, many }) => ({
  album: one(albums, {
    fields: [tracks.albumId],
    references: [albums.id],
  }),
  artists: many(tracksToArtists),
  genres: many(tracksToGenres),
  platforms: many(trackPlatformIds),
  playlists: many(playlistTracks),
}));

// === SIMPLIFIED playlist-track relationship table ===

export const playlistTracks = pgTable('playlist_tracks', {
  id: serial('id').primaryKey(),
  playlistId: integer('playlist_id')
    .references(() => playlists.id, { onDelete: 'cascade' })
    .notNull(),
  trackId: integer('track_id')
    .references(() => tracks.id)
    .notNull(),
  position: integer('position').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
  return {
    // Prevent duplicate tracks in a playlist
    uniquePlaylistTrack: unique().on(table.playlistId, table.trackId),
  };
});

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

// === Supporting tables for tracks ===

export const albums = pgTable('albums', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  coverImage: text('cover_image'),
  releaseDate: timestamp('release_date'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const albumsRelations = relations(albums, ({ many }) => ({
  tracks: many(tracks),
  artists: many(albumsToArtists),
}));

export const artists = pgTable('artists', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  picture: text('picture'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const artistsRelations = relations(artists, ({ many }) => ({
  tracks: many(tracksToArtists),
  albums: many(albumsToArtists),
}));

export const genres = pgTable('genres', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const genresRelations = relations(genres, ({ many }) => ({
  tracks: many(tracksToGenres),
}));

// === Junction tables ===

export const tracksToArtists = pgTable('tracks_to_artists', {
  trackId: integer('track_id')
    .references(() => tracks.id)
    .notNull(),
  artistId: integer('artist_id')
    .references(() => artists.id)
    .notNull(),
  isPrimary: boolean('is_primary').default(false),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.trackId, table.artistId] }),
  };
});

export const tracksToArtistsRelations = relations(tracksToArtists, ({ one }) => ({
  track: one(tracks, {
    fields: [tracksToArtists.trackId],
    references: [tracks.id],
  }),
  artist: one(artists, {
    fields: [tracksToArtists.artistId],
    references: [artists.id],
  }),
}));

export const tracksToGenres = pgTable('tracks_to_genres', {
  trackId: integer('track_id')
    .references(() => tracks.id)
    .notNull(),
  genreId: integer('genre_id')
    .references(() => genres.id)
    .notNull(),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.trackId, table.genreId] }),
  };
});

export const tracksToGenresRelations = relations(tracksToGenres, ({ one }) => ({
  track: one(tracks, {
    fields: [tracksToGenres.trackId],
    references: [tracks.id],
  }),
  genre: one(genres, {
    fields: [tracksToGenres.genreId],
    references: [genres.id],
  }),
}));

export const albumsToArtists = pgTable('albums_to_artists', {
  albumId: integer('album_id')
    .references(() => albums.id)
    .notNull(),
  artistId: integer('artist_id')
    .references(() => artists.id)
    .notNull(),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.albumId, table.artistId] }),
  };
});

export const albumsToArtistsRelations = relations(albumsToArtists, ({ one }) => ({
  album: one(albums, {
    fields: [albumsToArtists.albumId],
    references: [albums.id],
  }),
  artist: one(artists, {
    fields: [albumsToArtists.artistId],
    references: [artists.id],
  }),
}));

// === Platform IDs for multi-platform support ===

export const platformEnum = pgEnum('platform', [
  'spotify',
  'apple',
  'youtube',
  'deezer',
  'tidal',
  'amazon',
  'pandora',
]);

export const trackPlatformIds = pgTable('track_platform_ids', {
  id: serial('id').primaryKey(),
  trackId: integer('track_id')
    .references(() => tracks.id)
    .notNull(),
  platform: platformEnum('platform').notNull(),
  platformId: text('platform_id').notNull(),
  platformUrl: text('platform_url'),
}, (table) => {
  return {
    uniquePlatformId: unique().on(table.platform, table.platformId),
  };
});

export const trackPlatformIdsRelations = relations(trackPlatformIds, ({ one }) => ({
  track: one(tracks, {
    fields: [trackPlatformIds.trackId],
    references: [tracks.id],
  }),
}));

// === Types and Schemas ===

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export const insertUserSchema = createInsertSchema(users);

export type Playlist = typeof playlists.$inferSelect;
export type InsertPlaylist = typeof playlists.$inferInsert;
export const insertPlaylistSchema = createInsertSchema(playlists);

export type Track = typeof tracks.$inferSelect;
export type InsertTrack = typeof tracks.$inferInsert;
export const insertTrackSchema = createInsertSchema(tracks);

export type PlaylistTrack = typeof playlistTracks.$inferSelect;
export type InsertPlaylistTrack = typeof playlistTracks.$inferInsert;
export const insertPlaylistTrackSchema = createInsertSchema(playlistTracks);

export type Artist = typeof artists.$inferSelect;
export type InsertArtist = typeof artists.$inferInsert;
export const insertArtistSchema = createInsertSchema(artists);

export type Genre = typeof genres.$inferSelect;
export type InsertGenre = typeof genres.$inferInsert;
export const insertGenreSchema = createInsertSchema(genres);

export type Album = typeof albums.$inferSelect;
export type InsertAlbum = typeof albums.$inferInsert;
export const insertAlbumSchema = createInsertSchema(albums);