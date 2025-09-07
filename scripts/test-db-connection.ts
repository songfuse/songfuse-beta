#!/usr/bin/env tsx

/**
 * Test script to check database connection
 */

import { config } from 'dotenv';
import { sql } from 'drizzle-orm';

// Load environment variables first
config();

// Import after loading environment variables
import { db } from '../server/db';
import { tracks } from '@shared/schema';

async function testDatabaseConnection() {
  try {
    console.log('🔍 Testing database connection...');
    
    // Test basic database connection
    const result = await db.select({ count: sql`count(*)` }).from(tracks);
    console.log('✅ Database connection successful!');
    console.log(`📊 Total tracks in database: ${result[0]?.count || 0}`);
    
    // Test a simple query
    const sampleTracks = await db.select({
      id: tracks.id,
      title: tracks.title
    }).from(tracks).limit(5);
    
    console.log('🎵 Sample tracks:');
    sampleTracks.forEach(track => {
      console.log(`  - ${track.id}: ${track.title}`);
    });
    
  } catch (error) {
    console.error('❌ Database connection failed:', error);
  }
}

testDatabaseConnection();
