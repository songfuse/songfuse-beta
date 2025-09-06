/**
 * Script to process a large batch of 2000 tracks for release date generation
 * This is a one-time script created specifically for this task
 */

import { main } from './process-release-dates';

// Run the main function with a custom configuration for 2000 tracks
main({
  MAX_BATCHES: 1,
  BATCH_SIZE: 2000,
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