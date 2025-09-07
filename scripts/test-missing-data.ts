#!/usr/bin/env tsx

/**
 * Test script to check for tracks with missing data
 * This is a dry-run version that only reports what would be fixed
 */

import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq, isNull, or, sql } from 'drizzle-orm';
import * as schema from '../shared/schema';

// Database connection
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({ connectionString });
const db = drizzle(pool, { schema });

interface TrackWithMissingData {
  id: number;
  title: string;
  spotifyId: string | null;
  hasArtists: boolean;
  hasAlbum: boolean;
  albumId: number | null;
  albumTitle: string | null;
}

async function findTracksWithMissingData(): Promise<TrackWithMissingData[]> {
  console.log('🔍 Finding tracks with missing data...');
  
  try {
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
        )`.as('hasAlbum'),
        albumTitle: sql<string | null>`(
          SELECT title 
          FROM albums 
          WHERE id = tracks.album_id 
          LIMIT 1
        )`.as('albumTitle')
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
      .limit(50); // Limit for testing
    
    return tracks;
  } catch (error) {
    console.error('❌ Error finding tracks with missing data:', error);
    return [];
  }
}

async function main() {
  console.log('🔍 Testing missing track data detection...\n');
  
  const tracks = await findTracksWithMissingData();
  
  if (tracks.length === 0) {
    console.log('✅ No tracks with missing data found!');
    return;
  }
  
  console.log(`📊 Found ${tracks.length} tracks with missing data:\n`);
  
  let missingArtists = 0;
  let missingAlbums = 0;
  let missingSpotifyIds = 0;
  
  tracks.forEach((track, index) => {
    console.log(`${index + 1}. "${track.title}" (ID: ${track.id})`);
    
    if (!track.spotifyId) {
      console.log('   ❌ No Spotify ID');
      missingSpotifyIds++;
    } else {
      console.log(`   🎵 Spotify ID: ${track.spotifyId}`);
    }
    
    if (!track.hasArtists) {
      console.log('   ❌ Missing artists');
      missingArtists++;
    } else {
      console.log('   ✅ Has artists');
    }
    
    if (!track.hasAlbum) {
      console.log('   ❌ Missing album');
      missingAlbums++;
      if (track.albumId) {
        console.log(`   📝 Album ID exists (${track.albumId}) but no title: "${track.albumTitle || 'NULL'}"`);
      }
    } else {
      console.log(`   ✅ Has album: "${track.albumTitle}"`);
    }
    
    console.log('');
  });
  
  console.log('📊 Summary:');
  console.log(`   Total tracks with issues: ${tracks.length}`);
  console.log(`   Missing artists: ${missingArtists}`);
  console.log(`   Missing albums: ${missingAlbums}`);
  console.log(`   Missing Spotify IDs: ${missingSpotifyIds}`);
  console.log(`   Can be fixed (have Spotify ID): ${tracks.filter(t => t.spotifyId).length}`);
  
  console.log('\n💡 To fix these tracks, run: npm run fix-track-data');
}

// Run the script
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
}

export { main as testMissingData };
