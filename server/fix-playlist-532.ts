/**
 * Fix Playlist 532 - Migrate from Temporary DALL-E URL to Supabase Storage
 * 
 * This script fixes the newest playlist that still has a temporary DALL-E URL
 */

import { db } from './db';
import { playlists } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { storeAiGeneratedCoverWithOptimization } from './services/supabaseStorage';

async function fixPlaylist532() {
  try {
    console.log('🔍 Fixing playlist 532 with temporary DALL-E URL...');
    
    // Get playlist 532 specifically
    const result = await db
      .select()
      .from(playlists)
      .where(eq(playlists.id, 532))
      .limit(1);
    
    if (!result[0]) {
      console.log('❌ Playlist 532 not found');
      return;
    }
    
    const playlist = result[0];
    const coverUrl = playlist.coverImageUrl;
    
    if (!coverUrl || !coverUrl.includes('oaidalleapiprodscus')) {
      console.log('✅ Playlist 532 does not have a temporary DALL-E URL');
      console.log(`Current URL: ${coverUrl}`);
      return;
    }
    
    console.log(`📤 Migrating playlist 532: "${playlist.title}"`);
    console.log(`Current temp URL: ${coverUrl.substring(0, 100)}...`);
    
    try {
      // Store the temporary image in Supabase storage with full optimization
      const optimizedImages = await storeAiGeneratedCoverWithOptimization(coverUrl, 532);
      
      if (optimizedImages && optimizedImages.original.includes('supabase')) {
        // Update the playlist record with ALL optimized image URLs
        await db
          .update(playlists)
          .set({
            coverImageUrl: optimizedImages.original,
            thumbnailImageUrl: optimizedImages.thumbnail,
            smallImageUrl: optimizedImages.small,
            socialImageUrl: optimizedImages.social,
            ogImageUrl: optimizedImages.openGraph
          })
          .where(eq(playlists.id, 532));
        
        console.log(`✅ Successfully migrated playlist 532 with full optimization`);
        console.log(`New Supabase URL: ${optimizedImages.original}`);
        console.log(`Generated thumbnails: ${optimizedImages.thumbnail}, ${optimizedImages.small}`);
        console.log(`Generated social images: ${optimizedImages.social}, ${optimizedImages.openGraph}`);
        
        return true;
      } else {
        console.log('❌ Failed to migrate - no valid Supabase URL returned');
        return false;
      }
      
    } catch (migrationError) {
      console.error(`❌ Failed to migrate playlist 532:`, migrationError);
      
      // If the temporary URL has expired, we can't migrate it
      if (migrationError.message?.includes('403') || migrationError.message?.includes('expired')) {
        console.log('⚠️ The temporary DALL-E URL has expired and cannot be migrated');
        console.log('The cover image will be regenerated the next time the playlist is accessed');
      }
      
      return false;
    }
    
  } catch (error) {
    console.error('❌ Script failed:', error);
    return false;
  }
}

// Run the fix
fixPlaylist532()
  .then((success) => {
    console.log(`\n🏁 Migration completed: ${success ? 'SUCCESS' : 'FAILURE'}`);
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('Migration script failed:', error);
    process.exit(1);
  });

export { fixPlaylist532 };