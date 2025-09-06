/**
 * Entry point script to run database cleanup operations
 */

import { removeTracksWithoutGenres } from './clean-tracks';

async function runCleanup() {
  try {
    console.log('=== Starting database cleanup ===');
    console.log('Removing tracks without genres...');
    await removeTracksWithoutGenres();
    console.log('=== Database cleanup completed successfully ===');
  } catch (error) {
    console.error('Error during database cleanup:', error);
  }
}

runCleanup()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });