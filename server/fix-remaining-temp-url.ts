/**
 * Fix the remaining playlist with temporary DALL-E URL
 * 
 * This script migrates playlist 530 from temporary DALL-E URL to permanent Supabase storage
 */

import { db } from './db';
import { playlists } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { storeAiGeneratedCoverWithOptimization, updatePlaylistWithAllImageSizes } from './services/supabaseStorage';

async function fixRemainingTempUrl() {
  try {
    console.log('🔍 Finding playlist 530 with temporary DALL-E URL...');
    
    // Get playlist 530 specifically
    const playlist = await db
      .select()
      .from(playlists)
      .where(eq(playlists.id, 530))
      .limit(1);
    
    if (!playlist[0]) {
      console.log('❌ Playlist 530 not found');
      return;
    }
    
    const coverUrl = playlist[0].coverImageUrl;
    
    if (!coverUrl || !coverUrl.includes('oaidalleapiprodscus')) {
      console.log('✅ Playlist 530 does not have a temporary DALL-E URL');
      return;
    }
    
    console.log(`📤 Migrating playlist 530: "${playlist[0].title}"`);
    console.log(`Current temp URL: ${coverUrl.substring(0, 100)}...`);
    
    try {
      // Store the temporary image in Supabase storage with full optimization
      const optimizedImages = await storeAiGeneratedCoverWithOptimization(coverUrl, 530);
      
      if (optimizedImages && optimizedImages.original.includes('supabase')) {
        // Update the playlist record with ALL optimized image URLs
        await updatePlaylistWithAllImageSizes(530, optimizedImages);
        
        console.log(`✅ Successfully migrated playlist 530 with full optimization`);
        console.log(`New Supabase URL: ${optimizedImages.original}`);
        console.log(`Generated thumbnails: ${optimizedImages.thumbnail}, ${optimizedImages.small}`);
        console.log(`Generated social images: ${optimizedImages.social}, ${optimizedImages.openGraph}`);
      } else {
        console.log('❌ Failed to get valid optimized Supabase URLs');
      }
    } catch (migrationError) {
      console.error(`❌ Failed to migrate playlist 530:`, migrationError);
      
      // The temporary URL might have expired, so we can't recover it
      console.log('🔄 Attempting to clear the expired URL...');
      await db
        .update(playlists)
        .set({ coverImageUrl: null })
        .where(eq(playlists.id, 530));
      console.log('✅ Cleared expired URL from playlist 530');
    }
    
  } catch (error) {
    console.error('❌ Error in fix script:', error);
  }
}

// Run the fix
fixRemainingTempUrl()
  .then(() => {
    console.log('\n🎉 Fix script completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fix script failed:', error);
    process.exit(1);
  });

export { fixRemainingTempUrl };