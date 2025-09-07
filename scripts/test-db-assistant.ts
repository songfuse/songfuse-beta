#!/usr/bin/env tsx

/**
 * Test script for the database-enabled assistant
 * This script tests the new assistant functionality
 */

import { generatePlaylistWithDBAssistant } from '../server/services/assistant-with-db';

async function testAssistant() {
  const testPrompts = [
    "Create a happy summer playlist with upbeat songs",
    "Make a playlist of rock music from the 2000s",
    "Generate a playlist of electronic dance music",
    "Create a chill playlist for studying",
    "Make a workout playlist with high energy songs"
  ];

  console.log('🧪 Testing Database-Enabled Assistant...\n');

  for (let i = 0; i < testPrompts.length; i++) {
    const prompt = testPrompts[i];
    console.log(`Test ${i + 1}: ${prompt}`);
    console.log('─'.repeat(50));
    
    try {
      const startTime = Date.now();
      const result = await generatePlaylistWithDBAssistant({
        prompt,
        assistantId: process.env.OPENAI_ASSISTANT_ID_DB
      });
      const duration = Date.now() - startTime;
      
      if (result.success) {
        console.log(`✅ Success! Generated ${result.songs?.length || 0} songs in ${duration}ms`);
        console.log(`🎵 First 5 songs: ${result.songs?.slice(0, 5).join(', ') || 'None'}`);
      } else {
        console.log(`❌ Failed: ${result.error}`);
      }
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
    
    console.log('\n');
  }
}

async function main() {
  if (!process.env.OPENAI_ASSISTANT_ID_DB) {
    console.error('❌ OPENAI_ASSISTANT_ID_DB environment variable not set');
    console.log('Run: npm run setup-db-assistant first');
    process.exit(1);
  }
  
  await testAssistant();
}

main();
