#!/usr/bin/env tsx

/**
 * Environment Setup Script
 * This script helps you set up the .env file with the correct structure
 */

import fs from 'fs';
import path from 'path';

function setupEnvironment() {
  console.log('🔧 Setting up environment configuration...\n');

  const envPath = path.join(process.cwd(), '.env');
  
  // Check if .env file already exists
  if (fs.existsSync(envPath)) {
    console.log('✅ .env file already exists');
    
    // Read and display current content (without sensitive values)
    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split('\n');
    
    console.log('\n📋 Current .env file structure:');
    lines.forEach(line => {
      if (line.trim() && !line.startsWith('#')) {
        const [key] = line.split('=');
        if (key) {
          console.log(`  ${key}=***`);
        }
      } else if (line.trim()) {
        console.log(`  ${line}`);
      }
    });
    
    // Check if OPENAI_API_KEY is set
    if (content.includes('OPENAI_API_KEY=') && !content.includes('OPENAI_API_KEY=your_openai_api_key')) {
      console.log('\n✅ OPENAI_API_KEY appears to be configured');
    } else {
      console.log('\n⚠️  OPENAI_API_KEY needs to be configured');
    }
    
  } else {
    console.log('❌ .env file not found');
    console.log('\n📝 Creating .env template...');
    
    const envTemplate = `# Database
DATABASE_URL=your_postgresql_connection_string

# OpenAI
OPENAI_API_KEY=your_openai_api_key

# Spotify (optional)
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=http://localhost:3000/api/auth/callback

# WhatsApp (optional)
WHATSAPP_ACCESS_TOKEN=your_whatsapp_access_token
WHATSAPP_VERIFY_TOKEN=your_verify_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id

# Supabase (if using Supabase)
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# Production OpenAI Key (optional)
OPENAI_API_KEY_PROD=your_production_openai_api_key`;

    try {
      fs.writeFileSync(envPath, envTemplate);
      console.log('✅ .env template created successfully!');
      console.log('\n📝 Next steps:');
      console.log('1. Edit the .env file and replace "your_openai_api_key" with your actual OpenAI API key');
      console.log('2. Set other environment variables as needed');
      console.log('3. Restart your application');
    } catch (error) {
      console.error('❌ Failed to create .env file:', error);
    }
  }
  
  console.log('\n🔍 Environment variable check:');
  console.log(`NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
  console.log(`OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '***' + process.env.OPENAI_API_KEY.slice(-4) : 'NOT SET'}`);
  console.log(`DATABASE_URL: ${process.env.DATABASE_URL ? 'SET' : 'NOT SET'}`);
  
  console.log('\n💡 Tips:');
  console.log('- Get your OpenAI API key from: https://platform.openai.com/account/api-keys');
  console.log('- Make sure to restart your application after updating .env');
  console.log('- The .env file should be in the root directory of your project');
}

// Run the setup
setupEnvironment();
