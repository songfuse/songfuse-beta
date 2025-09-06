#!/usr/bin/env tsx

import { Command } from 'commander';
import fs from 'fs';
import { importTracksFromJson } from './import-tracks.js';
import { queueExistingTracks, resolveTrackById } from './resolve-track-platforms.js';

const program = new Command();

program
  .name('track-tools')
  .description('Tools for managing track data in Songfuse')
  .version('1.0.0');

// Command to import tracks from JSON
program
  .command('import')
  .description('Import tracks from a JSON file')
  .argument('<file>', 'Path to JSON file with track data')
  .action(async (file) => {
    try {
      // Check if file exists
      if (!fs.existsSync(file)) {
        console.error(`File not found: ${file}`);
        process.exit(1);
      }
      
      console.log(`Importing tracks from ${file}...`);
      await importTracksFromJson(file);
      console.log('Import completed successfully');
    } catch (error) {
      console.error('Import failed:', error);
      process.exit(1);
    }
  });

// Command to resolve platform IDs for all tracks
program
  .command('resolve-all')
  .description('Resolve platform IDs for all tracks with Spotify IDs')
  .action(async () => {
    try {
      console.log('Resolving platform IDs for all tracks...');
      await queueExistingTracks();
      console.log('Resolution process started (runs in background)');
    } catch (error) {
      console.error('Resolution failed:', error);
      process.exit(1);
    }
  });

// Command to resolve platform IDs for a specific track
program
  .command('resolve')
  .description('Resolve platform IDs for a specific track')
  .argument('<id>', 'Track ID to resolve')
  .action(async (id) => {
    try {
      const trackId = parseInt(id);
      if (isNaN(trackId)) {
        console.error('Track ID must be a number');
        process.exit(1);
      }
      
      console.log(`Resolving platform IDs for track ${trackId}...`);
      await resolveTrackById(trackId);
      console.log('Resolution process started (runs in background)');
    } catch (error) {
      console.error('Resolution failed:', error);
      process.exit(1);
    }
  });

// Run the program
program.parse();