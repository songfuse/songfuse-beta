import { db } from './db';
import { 
  users,
  playlists,
  songs,
  chatMessages,
  savedPrompts,
  artists,
  albums,
  tracks,
  trackPlatformIds,
  genres,
  tracksToArtists,
  tracksToGenres,
  albumsToArtists,
  artistPlatformIds,
  albumPlatformIds
} from '@shared/schema';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

// Setup for WebSocket support
neonConfig.webSocketConstructor = ws;

async function runMigration() {
  console.log('Starting database migration...');
  
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  try {
    // Create all tables
    console.log('Creating tables if they do not exist...');
    
    // Create a connection to the database
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = drizzle(pool);
    
    // Run migration
    await migrate(client, { migrationsFolder: './drizzle' });
    
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run migration if this is the main module
// Use this for ES modules
const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  runMigration().then(() => {
    console.log('Done');
    process.exit(0);
  }).catch(error => {
    console.error('Migration script error:', error);
    process.exit(1);
  });
}

export { runMigration };