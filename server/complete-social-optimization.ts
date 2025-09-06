/**
 * Complete Social Image Optimization
 * 
 * Quick script to finish optimizing social images for remaining playlists
 */

import { db } from './db';
import { socialImageOptimizer } from './services/socialImageOptimizer';
import { updatePlaylistSocialImages } from './services/coverImageStorage';

async function completeOptimization() {
  try {
    console.log('🔍 Finding remaining playlists that need social optimization...');
    
    const result = await db.execute(`
      SELECT id, title, cover_image_url as "coverImageUrl"
      FROM playlists 
      WHERE cover_image_url IS NOT NULL 
        AND cover_image_url != ''
        AND cover_image_url != '/images/covers/default-cover.png'
        AND (social_image_url IS NULL OR og_image_url IS NULL)
      ORDER BY id DESC
      LIMIT 10
    `);
    
    const remainingPlaylists = result.rows as Array<{id: number; title: string; coverImageUrl: string}>;
    
    console.log(`Found ${remainingPlaylists.length} playlists to optimize`);
    
    for (const playlist of remainingPlaylists) {
      console.log(`\n📸 Optimizing playlist ${playlist.id}: "${playlist.title}"`);
      
      try {
        const optimizedImages = await socialImageOptimizer.createOptimizedSocialImages(
          playlist.coverImageUrl, 
          playlist.id
        );
        
        await updatePlaylistSocialImages(
          playlist.id, 
          optimizedImages.socialUrl, 
          optimizedImages.openGraphUrl
        );
        
        console.log(`✅ Completed optimization for playlist ${playlist.id}`);
        
      } catch (error) {
        console.error(`❌ Failed playlist ${playlist.id}:`, error.message);
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Final status check
    const finalResult = await db.execute(`
      SELECT COUNT(*) as fully_optimized
      FROM playlists 
      WHERE cover_image_url IS NOT NULL 
        AND social_image_url IS NOT NULL 
        AND og_image_url IS NOT NULL
    `);
    
    const optimized = (finalResult.rows[0] as any).fully_optimized;
    console.log(`\n🎉 Social optimization complete! ${optimized} playlists fully optimized.`);
    
  } catch (error) {
    console.error('Error completing optimization:', error);
  }
}

completeOptimization()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));