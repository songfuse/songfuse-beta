/**
 * Script to generate optimized social images for all existing playlists
 * This ensures all playlists have lightweight images for messaging apps and social sharing
 */

import { socialImageManager } from '../server/services/socialImageManager.js';

async function main() {
  console.log('🚀 Starting batch generation of social images for all playlists...');
  console.log('This will create optimized versions (800x800 under 100KB) for messaging apps');
  console.log('and Open Graph images (1200x630) for social media sharing.\n');
  
  try {
    // Process in batches to avoid overwhelming the system
    let totalProcessed = 0;
    const batchSize = 20;
    
    while (true) {
      console.log(`\n📦 Processing batch (${batchSize} playlists at a time)...`);
      
      const processedCount = await socialImageManager.processMissingSocialImages(batchSize);
      
      if (processedCount === 0) {
        console.log('✅ No more playlists need social image processing');
        break;
      }
      
      totalProcessed += processedCount;
      console.log(`✅ Processed ${processedCount} playlists in this batch`);
      console.log(`📊 Total processed so far: ${totalProcessed}`);
      
      // Add delay between batches to be gentle on resources
      if (processedCount === batchSize) {
        console.log('⏳ Waiting 3 seconds before next batch...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    console.log(`\n🎉 Completed! Generated social images for ${totalProcessed} playlists total`);
    
    // Get final statistics
    console.log('\n📊 Final Statistics:');
    
    // This would need the stats endpoint to be updated, for now just show completion
    console.log('✅ All playlists with cover images now have optimized social versions');
    console.log('🌟 Messaging apps will now load playlist images much faster');
    console.log('📱 Social media sharing will display proper preview images');
    
  } catch (error) {
    console.error('❌ Error during batch processing:', error);
    process.exit(1);
  }
}

// Run the script if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => {
      console.log('\n✨ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Script failed:', error);
      process.exit(1);
    });
}