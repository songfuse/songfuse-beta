/**
 * Unify Cover Image Column
 * 
 * This script standardizes the playlist cover image storage by:
 * 1. Ensuring all playlists use the standard cover_image_url column (snake_case)
 * 2. Copying values from the duplicate coverimageurl column if needed
 * 3. Removing the legacy coverimageurl column
 */

import { db } from './db';
import { sql } from 'drizzle-orm';

async function unifyCoverImageColumn() {
  console.log('🔄 Starting cover image column unification...');
  
  try {
    // Step 1: Check if both columns exist 
    console.log('Checking existing columns...');
    const columnCheck = await db.execute(sql`
      SELECT column_name
      FROM information_schema.columns 
      WHERE table_name = 'playlists' 
      AND column_name IN ('cover_image_url', 'coverimageurl')
    `);
    
    const columns = columnCheck.rows.map(row => row.column_name);
    console.log(`Found columns: ${columns.join(', ')}`);
    
    if (!columns.includes('cover_image_url')) {
      throw new Error("Standard column 'cover_image_url' is missing! Cannot proceed.");
    }
    
    if (!columns.includes('coverimageurl')) {
      console.log("Legacy column 'coverimageurl' not found. No migration needed.");
      return;
    }
    
    // Step 2: Copy values from legacy column to standard column where needed
    console.log('Copying missing values from legacy column to standard column...');
    await db.execute(sql`
      UPDATE playlists
      SET cover_image_url = coverimageurl
      WHERE cover_image_url IS NULL 
      AND coverimageurl IS NOT NULL
    `);
    
    // Step 3: Count affected playlists
    const countResult = await db.execute(sql`
      SELECT COUNT(*) as total FROM playlists
    `);
    const total = parseInt(countResult.rows[0].total);
    
    // Step 4: Drop the legacy column
    console.log('Removing legacy column...');
    await db.execute(sql`
      ALTER TABLE playlists
      DROP COLUMN coverimageurl
    `);
    
    console.log(`
✅ Cover image column unification complete!
- All playlists now use the standard 'cover_image_url' column
- Processed ${total} playlists
- Removed the legacy 'coverimageurl' column
    `);
    
  } catch (error) {
    console.error('❌ Error during cover image column unification:', error);
    throw error;
  }
}

// Run the migration
unifyCoverImageColumn()
  .then(() => {
    console.log('✅ Migration completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });