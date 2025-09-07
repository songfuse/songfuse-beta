#!/usr/bin/env tsx

/**
 * Simple test for the database-enabled assistant
 */

import { config } from 'dotenv';

// Load environment variables
config();

async function testSimple() {
  try {
    console.log('🧪 Testing Database Assistant...');
    
    const response = await fetch('http://localhost:5000/_songfuse_api/playlist/db-assistant', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: 'Create a test playlist with 5 songs'
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Success!');
      console.log(`🎵 Generated ${result.songs?.length || 0} songs`);
      console.log(`📝 Message: ${result.message}`);
      console.log(`🎵 First 5 songs: ${result.songs?.slice(0, 5).join(', ') || 'None'}`);
    } else {
      console.log('❌ Failed:', result.error);
    }
    
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

testSimple();
