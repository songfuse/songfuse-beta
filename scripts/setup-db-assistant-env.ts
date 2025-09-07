#!/usr/bin/env tsx

/**
 * Setup script to create a new OpenAI Assistant with database access
 * This script creates the assistant and outputs the ID for use in environment variables
 */

import { config } from 'dotenv';
import { createAssistantWithDB } from '../server/services/assistant-with-db';

// Load environment variables from .env file
config({ path: '../.env' });

async function main() {
  try {
    console.log('🚀 Creating OpenAI Assistant with database access...');
    console.log('Database URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');
    console.log('OpenAI API Key:', process.env.OPENAI_API_KEY ? 'Set' : 'Not set');
    
    const assistantId = await createAssistantWithDB();
    
    console.log('\n✅ Assistant created successfully!');
    console.log(`📋 Assistant ID: ${assistantId}`);
    console.log('\n📝 Add this to your environment variables:');
    console.log(`OPENAI_ASSISTANT_ID_DB=${assistantId}`);
    console.log('\n🔧 You can now use the new database-enabled assistant by:');
    console.log('1. Setting the OPENAI_ASSISTANT_ID_DB environment variable');
    console.log('2. Using the /_songfuse_api/playlist/db-assistant endpoint');
    console.log('3. Or calling generatePlaylistWithDBAssistant() directly');
    
  } catch (error) {
    console.error('❌ Error creating assistant:', error);
    process.exit(1);
  }
}

main();
