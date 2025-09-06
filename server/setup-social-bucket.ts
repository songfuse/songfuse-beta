/**
 * Setup script to create the social-images bucket in Supabase
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

async function setupSocialBucket() {
  try {
    console.log('🔄 Creating social-images bucket...');
    
    // Create the bucket for social sharing images
    const { data, error } = await supabase.storage.createBucket('social-images', {
      public: true,
      allowedMimeTypes: ['image/jpeg', 'image/png'],
      fileSizeLimit: 200000, // 200KB limit for social sharing
    });
    
    if (error) {
      if (error.message.includes('already exists')) {
        console.log('✅ Social images bucket already exists');
        return;
      }
      throw error;
    }
    
    console.log('✅ Social images bucket created successfully');
  } catch (error) {
    console.error('❌ Error setting up social bucket:', error);
    throw error;
  }
}

// Run the setup
setupSocialBucket()
  .then(() => {
    console.log('🎉 Social bucket setup complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Setup failed:', error);
    process.exit(1);
  });