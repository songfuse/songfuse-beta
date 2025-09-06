/**
 * Script to process a smaller batch of 100 tracks for release date generation
 * This is a more manageable size for demonstration purposes
 */

import { main } from './process-release-dates';

// Run the main function with a custom configuration for 100 tracks
main({
  MAX_BATCHES: 1,
  BATCH_SIZE: 100,
  DELAY_BETWEEN_BATCHES: 0
})
  .then((processedCount) => {
    console.log(`Successfully processed ${processedCount} tracks`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error running batch process:', error);
    process.exit(1);
  });