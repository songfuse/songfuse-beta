/**
 * Fix Broken Cover Images Script
 * 
 * This script finds playlists with temporary DALL-E URLs and migrates them to Supabase storage
 */

import { db } from './db';
import { playlists } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { storeAiGeneratedCover } from './services/coverImageStorage';

async function fixBrokenCoverImages() {
  try {
    console.log('🔍 Finding playlists with temporary DALL-E URLs...');
    
    // Find all playlists with temporary DALL-E URLs
    const result = await db.execute(`
      SELECT id, title, cover_image_url as "coverImageUrl"
      FROM playlists 
      WHERE cover_image_url LIKE '%oaidalleapiprodscus.blob.core.windows.net%'
      ORDER BY id DESC
    `);
    
    const playlistsWithTempUrls = result.rows as Array<{
      id: number;
      title: string;
      coverImageUrl: string;
    }>;
    
    console.log(`Found ${playlistsWithTempUrls.length} playlists with temporary DALL-E URLs`);
    
    if (playlistsWithTempUrls.length === 0) {
      console.log('✅ No broken cover images found!');
      return;
    }
    
    let migrated = 0;
    let failed = 0;
    
    // Process each playlist
    for (const playlist of playlistsWithTempUrls) {
      console.log(`\n📤 Fixing playlist ${playlist.id}: "${playlist.title}"`);
      console.log(`Current temp URL: ${playlist.coverImageUrl.substring(0, 100)}...`);
      
      try {
        // Store the temporary image in Supabase storage
        const supabaseUrl = await storeAiGeneratedCover(playlist.coverImageUrl);
        
        if (supabaseUrl && supabaseUrl.includes('supabase')) {
          // Update the playlist record with the new Supabase URL
          await db
            .update(playlists)
            .set({ coverImageUrl: supabaseUrl })
            .where(eq(playlists.id, playlist.id));
          
          console.log(`✅ Successfully migrated playlist ${playlist.id} to Supabase`);
          console.log(`New URL: ${supabaseUrl}`);
          migrated++;
        } else {
          console.error(`❌ Failed to get valid Supabase URL for playlist ${playlist.id}`);
          failed++;
        }
      } catch (error) {
        console.error(`❌ Error migrating playlist ${playlist.id}:`, error);
        failed++;
      }
    }
    
    console.log(`\n🎉 Migration completed!`);
    console.log(`✅ Successfully migrated: ${migrated} playlists`);
    console.log(`❌ Failed to migrate: ${failed} playlists`);
    
  } catch (error) {
    console.error('❌ Error in migration script:', error);
    throw error;
  }
}

// Run the migration if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  fixBrokenCoverImages()
    .then(() => {
      console.log('\n🎉 Cover image fix completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Cover image fix failed:', error);
      process.exit(1);
    });
}

export { fixBrokenCoverImages };