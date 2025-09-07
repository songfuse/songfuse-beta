#!/usr/bin/env tsx

/**
 * Fix Missing Track Data Script
 * 
 * This script finds tracks with missing artist or album information and
 * retrieves the missing data from Spotify API, then updates the database.
 */

import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq, isNull, or, and, sql } from 'drizzle-orm';
import * as schema from '../shared/schema';

// Database connection
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({ connectionString });
const db = drizzle(pool, { schema });

// Spotify API configuration
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
  console.error('❌ SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET environment variables are required');
  process.exit(1);
}

interface TrackWithMissingData {
  id: number;
  title: string;
  spotifyId: string | null;
  hasArtists: boolean;
  hasAlbum: boolean;
  albumId: number | null;
}

interface SpotifyTrackData {
  id: string;
  name: string;
  artists: Array<{ id: string; name: string }>;
  album: {
    id: string;
    name: string;
    images: Array<{ url: string }>;
    release_date: string;
  };
  duration_ms: number;
  explicit: boolean;
  popularity: number;
  preview_url: string | null;
}

interface SpotifyArtistData {
  id: string;
  name: string;
  images?: Array<{ url: string }>;
  genres: string[];
}

interface SpotifyAlbumData {
  id: string;
  name: string;
  images?: Array<{ url: string }>;
  release_date: string;
  artists: Array<{ id: string; name: string }>;
}

/**
 * Get Spotify access token using client credentials flow
 */
async function getSpotifyToken(): Promise<string | null> {
  try {
    console.log('🔑 Getting Spotify access token...');
    const authString = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
    
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Failed to get Spotify token: ${response.status} ${response.statusText}`);
      console.error(`Error details: ${errorText}`);
      return null;
    }
    
    const data = await response.json() as { access_token: string };
    console.log('✅ Successfully obtained Spotify access token');
    return data.access_token;
  } catch (error) {
    console.error('❌ Error getting Spotify token:', error);
    return null;
  }
}

/**
 * Find tracks with missing artist or album information
 */
async function findTracksWithMissingData(): Promise<TrackWithMissingData[]> {
  console.log('🔍 Finding tracks with missing data...');
  
  try {
    // Query tracks that either:
    // 1. Have no artists associated (no entries in tracks_to_artists)
    // 2. Have no album (album_id is null)
    // 3. Have album_id but the album has no title or cover image
    
    const tracks = await db
      .select({
        id: schema.tracks.id,
        title: schema.tracks.title,
        albumId: schema.tracks.albumId,
        spotifyId: sql<string | null>`(
          SELECT platform_id 
          FROM track_platform_ids 
          WHERE track_id = tracks.id AND platform = 'spotify' 
          LIMIT 1
        )`.as('spotifyId'),
        hasArtists: sql<boolean>`(
          SELECT COUNT(*) > 0 
          FROM tracks_to_artists 
          WHERE track_id = tracks.id
        )`.as('hasArtists'),
        hasAlbum: sql<boolean>`(
          CASE 
            WHEN tracks.album_id IS NULL THEN false
            ELSE (
              SELECT COUNT(*) > 0 
              FROM albums 
              WHERE id = tracks.album_id 
              AND title IS NOT NULL 
              AND title != ''
            )
          END
        )`.as('hasAlbum')
      })
      .from(schema.tracks)
      .where(
        or(
          // No artists
          sql`NOT (
            SELECT COUNT(*) > 0 
            FROM tracks_to_artists 
            WHERE track_id = tracks.id
          )`,
          // No album or album has no title
          or(
            isNull(schema.tracks.albumId),
            sql`(
              SELECT COUNT(*) = 0 
              FROM albums 
              WHERE id = tracks.album_id 
              AND title IS NOT NULL 
              AND title != ''
            )`
          )
        )
      )
      .limit(1000); // Process in batches
    
    console.log(`📊 Found ${tracks.length} tracks with missing data`);
    return tracks;
  } catch (error) {
    console.error('❌ Error finding tracks with missing data:', error);
    return [];
  }
}

/**
 * Get track information from Spotify API with retry logic
 */
async function getSpotifyTrackInfo(spotifyId: string, token: string, retryCount = 0): Promise<SpotifyTrackData | null> {
  const maxRetries = 3;
  const baseDelay = 1000;
  
  try {
    const cleanId = spotifyId.includes(':') ? spotifyId.split(':').pop() : spotifyId;
    
    console.log(`🎵 Fetching track info from Spotify for ID: ${cleanId}`);
    const response = await fetch(`https://api.spotify.com/v1/tracks/${cleanId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      let errorMessage = '';
      try {
        const errorObj = await response.json() as { error?: { message?: string; status?: number } };
        errorMessage = errorObj.error?.message || response.statusText;
      } catch (e) {
        errorMessage = await response.text();
      }
      
      // Handle rate limiting
      if (response.status === 429 && retryCount < maxRetries) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '1', 10);
        const delay = retryAfter * 1000 || Math.min(baseDelay * Math.pow(2, retryCount), 10000);
        
        console.log(`⏳ Rate limited. Retrying after ${delay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return getSpotifyTrackInfo(spotifyId, token, retryCount + 1);
      } else if (response.status === 404) {
        console.log(`⚠️ Track not found on Spotify: ${cleanId}`);
        return null;
      }
      
      console.error(`❌ Spotify API error (${response.status}): ${errorMessage}`);
      return null;
    }
    
    const trackData = await response.json() as SpotifyTrackData;
    return trackData;
  } catch (error) {
    console.error(`❌ Error fetching track info for ${spotifyId}:`, error);
    return null;
  }
}

/**
 * Get artist information from Spotify API
 */
async function getSpotifyArtistInfo(artistId: string, token: string, retryCount = 0): Promise<SpotifyArtistData | null> {
  const maxRetries = 3;
  const baseDelay = 1000;
  
  try {
    console.log(`👤 Fetching artist info from Spotify for ID: ${artistId}`);
    const response = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      let errorMessage = '';
      try {
        const errorObj = await response.json() as { error?: { message?: string; status?: number } };
        errorMessage = errorObj.error?.message || response.statusText;
      } catch (e) {
        errorMessage = await response.text();
      }
      
      if (response.status === 429 && retryCount < maxRetries) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '1', 10);
        const delay = retryAfter * 1000 || Math.min(baseDelay * Math.pow(2, retryCount), 10000);
        
        console.log(`⏳ Rate limited on artist request. Retrying after ${delay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return getSpotifyArtistInfo(artistId, token, retryCount + 1);
      } else if (response.status === 404) {
        console.log(`⚠️ Artist not found on Spotify: ${artistId}`);
        return null;
      }
      
      console.error(`❌ Spotify API error (${response.status}): ${errorMessage}`);
      return null;
    }
    
    const artistData = await response.json() as SpotifyArtistData;
    return artistData;
  } catch (error) {
    console.error(`❌ Error fetching artist info for ${artistId}:`, error);
    return null;
  }
}

/**
 * Create or update artist in database
 */
async function upsertArtist(artistData: SpotifyArtistData): Promise<number> {
  try {
    console.log(`🔍 Looking up artist: "${artistData.name}" (Spotify ID: ${artistData.id})`);
    
    // First, try to find by Spotify ID
    const existingBySpotifyId = await db
      .select({ 
        id: schema.artists.id,
        name: schema.artists.name
      })
      .from(schema.artists)
      .innerJoin(
        schema.artistPlatformIds,
        eq(schema.artistPlatformIds.artistId, schema.artists.id)
      )
      .where(
        and(
          eq(schema.artistPlatformIds.platform, 'spotify'),
          eq(schema.artistPlatformIds.platformId, artistData.id)
        )
      )
      .limit(1);
    
    if (existingBySpotifyId.length > 0) {
      console.log(`✅ Found existing artist by Spotify ID: ${existingBySpotifyId[0].name} (ID: ${existingBySpotifyId[0].id})`);
      return existingBySpotifyId[0].id;
    }
    
    // Then try to find by name
    const existingByName = await db
      .select({ 
        id: schema.artists.id,
        name: schema.artists.name
      })
      .from(schema.artists)
      .where(eq(schema.artists.name, artistData.name))
      .limit(1);
    
    if (existingByName.length > 0) {
      console.log(`✅ Found existing artist by name: ${existingByName[0].name} (ID: ${existingByName[0].id})`);
      
      // Add platform ID if not exists
      await db
        .insert(schema.artistPlatformIds)
        .values({
          artistId: existingByName[0].id,
          platform: 'spotify',
          platformId: artistData.id
        })
        .onConflictDoNothing();
      
      return existingByName[0].id;
    }
    
    // Create new artist with error handling for duplicates
    console.log(`➕ Creating new artist: ${artistData.name}`);
    try {
      const newArtist = await db
        .insert(schema.artists)
        .values({
          name: artistData.name,
          picture: artistData.images?.[0]?.url || null
        })
        .returning({ id: schema.artists.id });
      
      // Add platform ID
      await db
        .insert(schema.artistPlatformIds)
        .values({
          artistId: newArtist[0].id,
          platform: 'spotify',
          platformId: artistData.id
        });
      
      console.log(`✅ Created new artist: ${artistData.name} (ID: ${newArtist[0].id})`);
      return newArtist[0].id;
    } catch (insertError: any) {
      // If it's a duplicate key error, try to find the existing artist
      if (insertError.code === '23505') {
        console.log(`⚠️ Artist already exists, looking up by name: ${artistData.name}`);
        const existingArtist = await db
          .select({ id: schema.artists.id })
          .from(schema.artists)
          .where(eq(schema.artists.name, artistData.name))
          .limit(1);
        
        if (existingArtist.length > 0) {
          console.log(`✅ Found existing artist: ${artistData.name} (ID: ${existingArtist[0].id})`);
          
          // Add platform ID if not exists
          await db
            .insert(schema.artistPlatformIds)
            .values({
              artistId: existingArtist[0].id,
              platform: 'spotify',
              platformId: artistData.id
            })
            .onConflictDoNothing();
          
          return existingArtist[0].id;
        } else {
          throw insertError; // Re-throw if we can't find the existing artist
        }
      } else {
        throw insertError; // Re-throw if it's not a duplicate key error
      }
    }
  } catch (error) {
    console.error(`❌ Error upserting artist ${artistData.name}:`, error);
    throw error;
  }
}

/**
 * Create or update album in database
 */
async function upsertAlbum(albumData: SpotifyAlbumData): Promise<number> {
  try {
    // Check if album already exists
    const existingAlbum = await db
      .select({ id: schema.albums.id })
      .from(schema.albums)
      .where(eq(schema.albums.title, albumData.name))
      .limit(1);
    
    if (existingAlbum.length > 0) {
      // Update existing album
      await db
        .update(schema.albums)
        .set({
          coverImage: albumData.images?.[0]?.url || null,
          releaseDate: albumData.release_date ? new Date(albumData.release_date) : null,
          updatedAt: new Date()
        })
        .where(eq(schema.albums.id, existingAlbum[0].id));
      
      // Update platform ID
      await db
        .insert(schema.albumPlatformIds)
        .values({
          albumId: existingAlbum[0].id,
          platform: 'spotify',
          platformId: albumData.id
        })
        .onConflictDoNothing();
      
      return existingAlbum[0].id;
    } else {
      // Create new album
      const newAlbum = await db
        .insert(schema.albums)
      .values({
        title: albumData.name,
        coverImage: albumData.images?.[0]?.url || null,
        releaseDate: albumData.release_date ? new Date(albumData.release_date) : null
      })
        .returning({ id: schema.albums.id });
      
      // Add platform ID
      await db
        .insert(schema.albumPlatformIds)
        .values({
          albumId: newAlbum[0].id,
          platform: 'spotify',
          platformId: albumData.id
        });
      
      return newAlbum[0].id;
    }
  } catch (error) {
    console.error(`❌ Error upserting album ${albumData.name}:`, error);
    throw error;
  }
}

/**
 * Process a single track and update its missing data
 */
async function processTrack(track: TrackWithMissingData, token: string): Promise<boolean> {
  try {
    console.log(`\n🎵 Processing track: "${track.title}" (ID: ${track.id})`);
    
    // If no Spotify ID, we can't fetch data
    if (!track.spotifyId) {
      console.log(`⚠️ No Spotify ID for track "${track.title}", skipping`);
      return false;
    }
    
    // Get track data from Spotify
    const spotifyData = await getSpotifyTrackInfo(track.spotifyId, token);
    if (!spotifyData) {
      console.log(`❌ Could not fetch Spotify data for track "${track.title}"`);
      return false;
    }
    
    let updated = false;
    
    // Update track basic info
    await db
      .update(schema.tracks)
      .set({
        duration: Math.floor(spotifyData.duration_ms / 1000),
        explicit: spotifyData.explicit,
        popularity: spotifyData.popularity,
        previewUrl: spotifyData.preview_url,
        updatedAt: new Date()
      })
      .where(eq(schema.tracks.id, track.id));
    
    // Handle missing artists
    if (!track.hasArtists && spotifyData.artists.length > 0) {
      console.log(`👥 Adding ${spotifyData.artists.length} artist(s) to track`);
      
      for (let i = 0; i < spotifyData.artists.length; i++) {
        const artist = spotifyData.artists[i];
        
        // Get or create artist
        const artistId = await upsertArtist(artist);
        
        // Link artist to track
        await db
          .insert(schema.tracksToArtists)
          .values({
            trackId: track.id,
            artistId: artistId,
            isPrimary: i === 0 // First artist is primary
          })
          .onConflictDoNothing();
      }
      updated = true;
    }
    
    // Handle missing album
    if (!track.hasAlbum && spotifyData.album) {
      console.log(`💿 Adding album "${spotifyData.album.name}" to track`);
      
      // Get or create album
      const albumId = await upsertAlbum(spotifyData.album);
      
      // Update track with album ID
      await db
        .update(schema.tracks)
        .set({
          albumId: albumId,
          updatedAt: new Date()
        })
        .where(eq(schema.tracks.id, track.id));
      
      // Link album artists to album
      for (const albumArtist of spotifyData.album.artists) {
        const artistId = await upsertArtist(albumArtist);
        
        await db
          .insert(schema.albumsToArtists)
          .values({
            albumId: albumId,
            artistId: artistId,
            isPrimary: spotifyData.album.artists.indexOf(albumArtist) === 0
          })
          .onConflictDoNothing();
      }
      
      updated = true;
    }
    
    if (updated) {
      console.log(`✅ Successfully updated track "${track.title}"`);
    } else {
      console.log(`ℹ️ No updates needed for track "${track.title}"`);
    }
    
    return updated;
  } catch (error) {
    console.error(`❌ Error processing track "${track.title}":`, error);
    return false;
  }
}

/**
 * Main function to process all tracks with missing data
 */
async function main() {
  console.log('🚀 Starting track data fix script...\n');
  
  // Get Spotify token
  const token = await getSpotifyToken();
  if (!token) {
    console.error('❌ Could not get Spotify access token. Exiting.');
    process.exit(1);
  }
  
  // Find tracks with missing data
  const tracksWithMissingData = await findTracksWithMissingData();
  
  if (tracksWithMissingData.length === 0) {
    console.log('✅ No tracks with missing data found!');
    return;
  }
  
  console.log(`\n📊 Processing ${tracksWithMissingData.length} tracks with missing data...\n`);
  
  let processed = 0;
  let updated = 0;
  let errors = 0;
  
  // Process tracks in batches to avoid rate limiting
  const batchSize = 10;
  for (let i = 0; i < tracksWithMissingData.length; i += batchSize) {
    const batch = tracksWithMissingData.slice(i, i + batchSize);
    
    console.log(`\n📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(tracksWithMissingData.length / batchSize)} (${batch.length} tracks)`);
    
    for (const track of batch) {
      try {
        const wasUpdated = await processTrack(track, token);
        if (wasUpdated) updated++;
        processed++;
        
        // Small delay between tracks to be respectful to Spotify API
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`❌ Error processing track ${track.id}:`, error);
        errors++;
      }
    }
    
    // Longer delay between batches
    if (i + batchSize < tracksWithMissingData.length) {
      console.log('⏳ Waiting before next batch...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log('\n📊 Summary:');
  console.log(`   Total tracks processed: ${processed}`);
  console.log(`   Tracks updated: ${updated}`);
  console.log(`   Errors: ${errors}`);
  console.log(`   Success rate: ${((processed - errors) / processed * 100).toFixed(1)}%`);
  
  console.log('\n✅ Script completed!');
}

// Run the script
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
}

export { main as fixMissingTrackData };
