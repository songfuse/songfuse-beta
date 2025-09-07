CREATE TYPE "public"."platform" AS ENUM('spotify', 'deezer', 'apple_music', 'amazon_music', 'tidal', 'youtube', 'other');--> statement-breakpoint
CREATE TABLE "album_platform_ids" (
	"id" serial PRIMARY KEY NOT NULL,
	"album_id" integer NOT NULL,
	"platform" "platform" NOT NULL,
	"platform_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "albums" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"release_date" timestamp,
	"cover_image" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "albums_to_artists" (
	"album_id" integer NOT NULL,
	"artist_id" integer NOT NULL,
	"is_primary" boolean DEFAULT false,
	CONSTRAINT "albums_to_artists_album_id_artist_id_pk" PRIMARY KEY("album_id","artist_id")
);
--> statement-breakpoint
CREATE TABLE "artist_platform_ids" (
	"id" serial PRIMARY KEY NOT NULL,
	"artist_id" integer NOT NULL,
	"platform" "platform" NOT NULL,
	"platform_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artists" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"picture" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"session_id" text NOT NULL,
	"content" text NOT NULL,
	"is_user" boolean NOT NULL,
	"timestamp" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "credit_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"type" text NOT NULL,
	"description" text,
	"related_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "genres" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "genres_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "news_articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"link" text NOT NULL,
	"description" text,
	"content" text,
	"pub_date" timestamp,
	"source" text,
	"source_name" text,
	"guid" text,
	"categories" json,
	"image_url" text,
	"created_at" timestamp DEFAULT now(),
	"last_fetched" timestamp DEFAULT now(),
	CONSTRAINT "news_articles_link_unique" UNIQUE("link")
);
--> statement-breakpoint
CREATE TABLE "playlist_tracks" (
	"id" serial PRIMARY KEY NOT NULL,
	"playlist_id" integer NOT NULL,
	"track_id" integer NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "playlist_tracks_playlist_id_track_id_unique" UNIQUE("playlist_id","track_id")
);
--> statement-breakpoint
CREATE TABLE "playlists" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"spotify_id" text,
	"cover_image_url" text,
	"social_image_url" text,
	"og_image_url" text,
	"thumbnail_image_url" text,
	"small_image_url" text,
	"created_at" timestamp DEFAULT now(),
	"spotify_url" text,
	"is_public" boolean DEFAULT true,
	"article_title" varchar,
	"article_link" varchar
);
--> statement-breakpoint
CREATE TABLE "saved_prompts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "smart_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"share_id" text NOT NULL,
	"playlist_id" integer NOT NULL,
	"promoted_track_id" integer NOT NULL,
	"custom_cover_image" text,
	"title" text NOT NULL,
	"description" text,
	"views" integer DEFAULT 0,
	"social_image_url" text,
	"open_graph_image_url" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "smart_links_share_id_unique" UNIQUE("share_id"),
	CONSTRAINT "smart_links_playlist_id_unique" UNIQUE("playlist_id")
);
--> statement-breakpoint
CREATE TABLE "songs" (
	"id" serial PRIMARY KEY NOT NULL,
	"playlist_id" integer NOT NULL,
	"spotify_id" text NOT NULL,
	"title" text NOT NULL,
	"artist" text NOT NULL,
	"album" text,
	"album_image_url" text,
	"duration_ms" integer,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "track_platform_ids" (
	"id" serial PRIMARY KEY NOT NULL,
	"track_id" integer NOT NULL,
	"platform" "platform" NOT NULL,
	"platform_id" text NOT NULL,
	"platform_url" text
);
--> statement-breakpoint
CREATE TABLE "tracks" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"album_id" integer,
	"duration" integer,
	"explicit" boolean DEFAULT false,
	"popularity" integer,
	"preview_url" text,
	"release_date" timestamp,
	"embedding" json,
	"tempo" integer,
	"energy" integer,
	"danceability" integer,
	"valence" integer,
	"acousticness" integer,
	"instrumentalness" integer,
	"liveness" integer,
	"speechiness" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tracks_songs" (
	"song_id" integer NOT NULL,
	"track_id" integer NOT NULL,
	CONSTRAINT "tracks_songs_song_id_track_id_pk" PRIMARY KEY("song_id","track_id")
);
--> statement-breakpoint
CREATE TABLE "tracks_to_artists" (
	"track_id" integer NOT NULL,
	"artist_id" integer NOT NULL,
	"is_primary" boolean DEFAULT false,
	CONSTRAINT "tracks_to_artists_track_id_artist_id_pk" PRIMARY KEY("track_id","artist_id")
);
--> statement-breakpoint
CREATE TABLE "tracks_to_genres" (
	"track_id" integer NOT NULL,
	"genre_id" integer NOT NULL,
	CONSTRAINT "tracks_to_genres_track_id_genre_id_pk" PRIMARY KEY("track_id","genre_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"name" text,
	"spotify_id" text,
	"spotify_access_token" text,
	"spotify_refresh_token" text,
	"token_expires_at" timestamp,
	"credits" integer DEFAULT 5 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "playlist_tracks" ADD CONSTRAINT "playlist_tracks_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_tracks" ADD CONSTRAINT "playlist_tracks_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE no action ON UPDATE no action;