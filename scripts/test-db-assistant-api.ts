#!/usr/bin/env tsx

/**
 * Test script for the database-enabled assistant using API endpoint
 * This script tests the new assistant functionality via HTTP requests
 */

import { config } from 'dotenv';

// Load environment variables
config();

async function testAssistantAPI() {
  const testPrompts = [
    "Create a happy summer playlist with upbeat songs",
    "Make a playlist of rock music from the 2000s",
    "Generate a playlist of electronic dance music",
    "Create a chill playlist for studying",
    "Make a workout playlist with high energy songs"
  ];

  console.log('🧪 Testing Database-Enabled Assistant via API...\n');

  for (let i = 0; i < testPrompts.length; i++) {
    const prompt = testPrompts[i];
    console.log(`Test ${i + 1}: ${prompt}`);
    console.log('─'.repeat(50));
    
    try {
      const startTime = Date.now();
      
      const response = await fetch('http://localhost:5000/_songfuse_api/playlist/db-assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          userId: 1,
          sessionId: `test-${Date.now()}`
        })
      });
      
      const result = await response.json();
      const duration = Date.now() - startTime;
      
      if (result.success) {
        console.log(`✅ Success! Generated ${result.songs?.length || 0} songs in ${duration}ms`);
        console.log(`🎵 First 5 songs: ${result.songs?.slice(0, 5).join(', ') || 'None'}`);
        console.log(`📝 Message: ${result.message}`);
      } else {
        console.log(`❌ Failed: ${result.error}`);
        console.log(`📝 Message: ${result.message}`);
      }
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
    
    console.log('\n');
  }
}

async function main() {
  console.log('🚀 Starting API test...');
  console.log('Make sure your server is running on localhost:5000');
  console.log('Run: npm run dev\n');
  
  await testAssistantAPI();
}

main();
