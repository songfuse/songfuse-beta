/**
 * Ensure All Playlists Have Optimized Social Images
 * 
 * This script scans all playlists and ensures they have optimized social sharing images:
 * - Social sharing: 800x800, under 100KB for messaging apps
 * - Open Graph: 1200x630 for Facebook/Twitter cards
 * 
 * It will generate missing social images for any playlist that has a cover image
 * but is missing optimized versions.
 */

import { db } from './db';
import { playlists } from '@shared/schema';
import { isNull, isNotNull, and } from 'drizzle-orm';
import { socialImageOptimizer } from './services/socialImageOptimizer';
import { updatePlaylistSocialImages } from './services/coverImageStorage';

interface PlaylistWithCover {
  id: number;
  title: string;
  coverImageUrl: string;
  socialImageUrl?: string;
  openGraphImageUrl?: string;
}

/**
 * Generate social images for all playlists that need them
 */
async function ensureAllPlaylistsHaveSocialImages() {
  try {
    console.log('🔍 Finding playlists that need social image optimization...');
    
    // Find all playlists with cover images but missing social images
    const result = await db.execute(`
      SELECT 
        id, 
        title, 
        cover_image_url as "coverImageUrl",
        social_image_url as "socialImageUrl",
        og_image_url as "openGraphImageUrl"
      FROM playlists 
      WHERE cover_image_url IS NOT NULL 
        AND cover_image_url != ''
        AND cover_image_url != '/images/covers/default-cover.png'
        AND (social_image_url IS NULL OR og_image_url IS NULL)
      ORDER BY id DESC
    `);
    
    const playlistsNeedingSocialImages = result.rows as PlaylistWithCover[];
    
    console.log(`Found ${playlistsNeedingSocialImages.length} playlists needing social image optimization`);
    
    if (playlistsNeedingSocialImages.length === 0) {
      console.log('✅ All playlists already have optimized social images!');
      return;
    }
    
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    
    for (const playlist of playlistsNeedingSocialImages) {
      console.log(`\n📸 Processing playlist ${playlist.id}: "${playlist.title}"`);
      console.log(`Cover image: ${playlist.coverImageUrl}`);
      
      try {
        // Generate optimized social images
        const optimizedImages = await socialImageOptimizer.createOptimizedSocialImages(
          playlist.coverImageUrl, 
          playlist.id
        );
        
        // Update database with social image URLs
        await updatePlaylistSocialImages(
          playlist.id, 
          optimizedImages.socialUrl, 
          optimizedImages.openGraphUrl
        );
        
        console.log(`✅ Generated social images for playlist ${playlist.id}`);
        console.log(`   Social: ${optimizedImages.socialUrl}`);
        console.log(`   Open Graph: ${optimizedImages.openGraphUrl}`);
        succeeded++;
        
      } catch (error) {
        console.error(`❌ Failed to generate social images for playlist ${playlist.id}:`, error.message);
        failed++;
      }
      
      processed++;
      
      // Add a delay to avoid overwhelming the system
      if (processed % 5 === 0) {
        console.log(`\n⏸️ Processed ${processed}/${playlistsNeedingSocialImages.length} playlists, taking a short break...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    console.log(`\n📊 Social Image Generation Summary:`);
    console.log(`✅ Successfully processed: ${succeeded} playlists`);
    console.log(`❌ Failed: ${failed} playlists`);
    console.log(`📁 Total processed: ${processed} playlists`);
    
  } catch (error) {
    console.error('Error ensuring social images for playlists:', error);
  }
}

/**
 * Check the status of social image coverage
 */
async function checkSocialImageCoverage() {
  try {
    console.log('📊 Checking social image coverage...');
    
    const result = await db.execute(`
      SELECT 
        COUNT(*) as total_playlists,
        COUNT(cover_image_url) as playlists_with_covers,
        COUNT(social_image_url) as playlists_with_social,
        COUNT(og_image_url) as playlists_with_og,
        COUNT(CASE WHEN cover_image_url IS NOT NULL AND social_image_url IS NOT NULL AND og_image_url IS NOT NULL THEN 1 END) as fully_optimized
      FROM playlists 
      WHERE cover_image_url IS NOT NULL 
        AND cover_image_url != ''
        AND cover_image_url != '/images/covers/default-cover.png'
    `);
    
    const stats = result.rows[0] as any;
    
    console.log(`📈 Social Image Coverage Report:`);
    console.log(`   Total playlists with covers: ${stats.total_playlists}`);
    console.log(`   Playlists with social images: ${stats.playlists_with_social}`);
    console.log(`   Playlists with OG images: ${stats.playlists_with_og}`);
    console.log(`   Fully optimized playlists: ${stats.fully_optimized}`);
    
    const coveragePercent = stats.total_playlists > 0 
      ? Math.round((stats.fully_optimized / stats.total_playlists) * 100)
      : 0;
    
    console.log(`   📊 Coverage: ${coveragePercent}%`);
    
    return {
      totalPlaylists: parseInt(stats.total_playlists),
      fullyOptimized: parseInt(stats.fully_optimized),
      coveragePercent
    };
    
  } catch (error) {
    console.error('Error checking social image coverage:', error);
    return null;
  }
}

// Run the script
async function main() {
  console.log('🚀 Starting social image optimization process...\n');
  
  // Check current coverage
  await checkSocialImageCoverage();
  
  console.log('\n🔧 Generating missing social images...');
  
  // Generate missing social images
  await ensureAllPlaylistsHaveSocialImages();
  
  console.log('\n🔍 Final coverage check...');
  
  // Check coverage again
  const finalStats = await checkSocialImageCoverage();
  
  if (finalStats && finalStats.coveragePercent === 100) {
    console.log('\n🎉 All playlists now have optimized social images!');
  } else {
    console.log('\n⚠️ Some playlists still need social image optimization.');
  }
}

main()
  .then(() => {
    console.log('\n✅ Social image optimization process completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Social image optimization failed:', error);
    process.exit(1);
  });

export { ensureAllPlaylistsHaveSocialImages, checkSocialImageCoverage };