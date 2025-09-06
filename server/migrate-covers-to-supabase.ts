/**
 * Migrate Local Cover Images to Supabase Storage
 * 
 * This script finds playlists with local cover images and migrates them to Supabase storage
 * for better scalability and consistency.
 */

import { db } from './db';
import { playlists } from '@shared/schema';
import { eq, like } from 'drizzle-orm';
import { storeAiGeneratedCover } from './services/coverImageStorage';

/**
 * Migrate all local cover images to Supabase storage
 */
async function migrateLocalCoversToSupabase() {
  try {
    console.log('🔍 Finding playlists with local cover images...');
    
    // Find all playlists with local cover images (starting with /images/)
    const result = await db.execute(`
      SELECT id, title, cover_image_url as "coverImageUrl"
      FROM playlists 
      WHERE cover_image_url LIKE '/images/%'
      ORDER BY id DESC
    `);
    
    const playlistsWithLocalCovers = result.rows as Array<{
      id: number;
      title: string;
      coverImageUrl: string;
    }>;
    
    console.log(`Found ${playlistsWithLocalCovers.length} playlists with local cover images`);
    
    if (playlistsWithLocalCovers.length === 0) {
      console.log('✅ No local cover images to migrate!');
      return;
    }
    
    let migrated = 0;
    let failed = 0;
    
    // Process each playlist
    for (const playlist of playlistsWithLocalCovers) {
      console.log(`\n📤 Migrating playlist ${playlist.id}: "${playlist.title}"`);
      console.log(`Current local URL: ${playlist.coverImageUrl}`);
      
      try {
        // Use the existing storeAiGeneratedCover function to migrate to Supabase
        // This function handles reading local files and uploading to cloud storage
        const supabaseUrl = await storeAiGeneratedCover(playlist.coverImageUrl, playlist.id);
        
        if (supabaseUrl && supabaseUrl.includes('supabase')) {
          console.log(`✅ Successfully migrated playlist ${playlist.id} to Supabase: ${supabaseUrl}`);
          migrated++;
        } else if (supabaseUrl && !supabaseUrl.includes('supabase')) {
          console.log(`⚠️ Playlist ${playlist.id} still using local storage: ${supabaseUrl}`);
          // This means it fell back to local storage
        } else {
          console.log(`❌ Failed to migrate playlist ${playlist.id}`);
          failed++;
        }
      } catch (error) {
        console.error(`❌ Error migrating playlist ${playlist.id}:`, error.message);
        failed++;
      }
      
      // Add a small delay to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`\n📊 Migration Summary:`);
    console.log(`✅ Migrated to Supabase: ${migrated} playlists`);
    console.log(`❌ Failed: ${failed} playlists`);
    console.log(`📁 Total processed: ${playlistsWithLocalCovers.length} playlists`);
    
  } catch (error) {
    console.error('Error migrating cover images to Supabase:', error);
  }
}

// Run the migration
migrateLocalCoversToSupabase()
  .then(() => {
    console.log('\n🎉 Cover image migration to Supabase completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });

export { migrateLocalCoversToSupabase };