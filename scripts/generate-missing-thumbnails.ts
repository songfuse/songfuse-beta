/**
 * Script to generate missing thumbnails for existing playlists
 * This ensures all playlists have optimized image versions for better performance
 */

import pkg from 'pg';
const { Pool } = pkg;
import { generateThumbnailsForExistingCover, getThumbnailUrl } from '../server/services/supabaseStorage';

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('🔄 Starting thumbnail generation for existing playlists...');

    // Get all playlists that have cover images but might be missing thumbnails
    const playlistsResult = await pool.query(`
      SELECT id, title, cover_image_url, thumbnail_image_url, small_image_url, social_image_url, og_image_url
      FROM playlists 
      WHERE cover_image_url IS NOT NULL 
        AND cover_image_url != ''
        AND cover_image_url LIKE '%supabase.co%'
      ORDER BY id DESC
    `);

    const playlists = playlistsResult.rows;
    console.log(`Found ${playlists.length} playlists with cover images`);

    if (playlists.length === 0) {
      console.log('No playlists found that need thumbnail generation');
      return;
    }

    let processedCount = 0;
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    // Process playlists one by one to avoid overwhelming the system
    for (const playlist of playlists) {
      processedCount++;
      console.log(`\n📝 Processing ${processedCount}/${playlists.length}: Playlist ${playlist.id} - ${playlist.title}`);

      try {
        // Check if all thumbnail versions already exist
        const hasAllThumbnails = 
          playlist.thumbnail_image_url && 
          playlist.small_image_url && 
          playlist.social_image_url && 
          playlist.og_image_url;

        if (hasAllThumbnails) {
          // Verify that the actual files exist by testing thumbnail URL
          const thumbnailUrl = getThumbnailUrl(playlist.cover_image_url, 'thumb');
          const thumbnailTest = await fetch(thumbnailUrl);
          
          if (thumbnailTest.ok) {
            console.log(`✅ All thumbnails already exist and accessible for playlist ${playlist.id}, skipping`);
            skippedCount++;
            continue;
          } else {
            console.log(`⚠️  Database has thumbnail URLs but files don't exist, regenerating...`);
          }
        }

        // Generate thumbnails for this playlist
        console.log(`🎨 Generating thumbnails for: ${playlist.cover_image_url}`);
        const thumbnails = await generateThumbnailsForExistingCover(
          playlist.cover_image_url, 
          playlist.id
        );

        if (thumbnails) {
          // Update the database with the new thumbnail URLs
          await pool.query(`
            UPDATE playlists 
            SET 
              thumbnail_image_url = $1,
              small_image_url = $2,
              social_image_url = $3,
              og_image_url = $4
            WHERE id = $5
          `, [
            thumbnails.thumbnail,
            thumbnails.small,
            thumbnails.social,
            thumbnails.openGraph,
            playlist.id
          ]);

          successCount++;
          console.log(`✅ Generated and saved thumbnails for playlist ${playlist.id}`);
          console.log(`   - Thumbnail (64x64): ${thumbnails.thumbnail.substring(0, 80)}...`);
          console.log(`   - Small (150x150): ${thumbnails.small.substring(0, 80)}...`);
          console.log(`   - Social (400x400): ${thumbnails.social.substring(0, 80)}...`);
          console.log(`   - Open Graph (1200x630): ${thumbnails.openGraph.substring(0, 80)}...`);
        } else {
          errorCount++;
          console.log(`❌ Failed to generate thumbnails for playlist ${playlist.id}`);
        }

        // Add a small delay to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (error) {
        errorCount++;
        console.error(`❌ Error processing playlist ${playlist.id}:`, error);
      }
    }

    console.log('\n📊 Thumbnail generation summary:');
    console.log(`   Total processed: ${processedCount}`);
    console.log(`   Successfully generated: ${successCount}`);
    console.log(`   Skipped (already exists): ${skippedCount}`);
    console.log(`   Errors: ${errorCount}`);

    // Final verification - check how many playlists now have complete thumbnail sets
    const finalStatsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_with_covers,
        COUNT(thumbnail_image_url) as with_thumbnails,
        COUNT(small_image_url) as with_small,
        COUNT(social_image_url) as with_social,
        COUNT(og_image_url) as with_og
      FROM playlists 
      WHERE cover_image_url IS NOT NULL AND cover_image_url LIKE '%supabase.co%';
    `);

    const finalStats = finalStatsResult.rows[0];
    console.log('\n📈 Final image optimization statistics:');
    console.log(`   Playlists with covers: ${finalStats.total_with_covers}`);
    console.log(`   With thumbnails (64x64): ${finalStats.with_thumbnails} (${Math.round((finalStats.with_thumbnails / finalStats.total_with_covers) * 100)}%)`);
    console.log(`   With small images (150x150): ${finalStats.with_small} (${Math.round((finalStats.with_small / finalStats.total_with_covers) * 100)}%)`);
    console.log(`   With social images (400x400): ${finalStats.with_social} (${Math.round((finalStats.with_social / finalStats.total_with_covers) * 100)}%)`);
    console.log(`   With OG images (1200x630): ${finalStats.with_og} (${Math.round((finalStats.with_og / finalStats.total_with_covers) * 100)}%)`);

    console.log('\n✅ Thumbnail generation script completed successfully!');

  } catch (error) {
    console.error('❌ Fatal error in thumbnail generation script:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run script if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => {
      console.log('Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

export { main };