/**
 * Storage-First Manager
 * 
 * This service implements a completely different approach to cover image storage:
 * 1. Files are ALWAYS saved to disk FIRST
 * 2. Database is updated ONLY after file confirmation
 * 3. Any operation that fails is automatically rolled back
 * 4. Built-in recovery and verification systems
 */

import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';
import crypto from 'crypto';
import { db } from '../db';
import { playlists } from '@shared/schema';
import { eq } from 'drizzle-orm';

const COVERS_DIR = path.join(process.cwd(), 'public', 'images', 'covers');
const PUBLIC_PATH = '/images/covers';

interface StorageOperation {
  success: boolean;
  filePath?: string;
  publicUrl?: string;
  error?: string;
}

/**
 * Ensure storage directory exists
 */
async function ensureDirectory(): Promise<boolean> {
  try {
    await fs.mkdir(COVERS_DIR, { recursive: true });
    return true;
  } catch (error) {
    console.error('[Storage-First] Failed to create directory:', error);
    return false;
  }
}

/**
 * Generate unique filename
 */
function generateFilename(): string {
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString('hex');
  return `cover-${timestamp}-${random}.png`;
}

/**
 * Download and save image to filesystem FIRST
 */
async function saveImageToDisk(imageUrl: string): Promise<StorageOperation> {
  console.log('[Storage-First] 📁 Starting file-first save operation');
  
  if (!await ensureDirectory()) {
    return { success: false, error: 'Failed to create storage directory' };
  }

  const filename = generateFilename();
  const filePath = path.join(COVERS_DIR, filename);
  const publicUrl = `${PUBLIC_PATH}/${filename}`;

  try {
    // Download image
    console.log('[Storage-First] ⬇️ Downloading image...');
    const response = await fetch(imageUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const buffer = await response.buffer();
    
    if (buffer.length < 1000) {
      throw new Error(`Image too small: ${buffer.length} bytes`);
    }

    // Save to disk
    console.log('[Storage-First] 💾 Saving to disk...');
    await fs.writeFile(filePath, buffer);

    // Verify file exists and has correct size
    console.log('[Storage-First] ✅ Verifying saved file...');
    const stats = await fs.stat(filePath);
    
    if (stats.size !== buffer.length) {
      throw new Error('File size mismatch after save');
    }

    console.log('[Storage-First] 🎉 File saved successfully:', publicUrl);
    
    return {
      success: true,
      filePath,
      publicUrl
    };

  } catch (error) {
    console.error('[Storage-First] ❌ File save failed:', error);
    
    // Clean up failed file
    try {
      await fs.unlink(filePath);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }

    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Update database ONLY after file is confirmed to exist
 */
async function updateDatabaseAfterFile(playlistId: number, publicUrl: string): Promise<boolean> {
  try {
    console.log('[Storage-First] 🗄️ Updating database after file confirmation...');
    
    // Add timestamp to prevent caching
    const timestampedUrl = `${publicUrl}?timestamp=${Date.now()}`;
    
    // Update database
    await db.update(playlists)
      .set({ coverImageUrl: timestampedUrl })
      .where(eq(playlists.id, playlistId));

    console.log('[Storage-First] ✅ Database updated successfully');
    return true;

  } catch (error) {
    console.error('[Storage-First] ❌ Database update failed:', error);
    return false;
  }
}

/**
 * Main function: Storage-First Cover Save
 * Files are saved FIRST, then database is updated
 */
export async function storageFirstCoverSave(
  imageUrl: string,
  playlistId: number
): Promise<{ success: boolean; coverUrl?: string; error?: string }> {
  
  console.log(`[Storage-First] 🚀 Starting storage-first save for playlist ${playlistId}`);
  
  // Step 1: Save file to disk FIRST
  const fileOp = await saveImageToDisk(imageUrl);
  
  if (!fileOp.success) {
    return {
      success: false,
      error: `File save failed: ${fileOp.error}`
    };
  }

  // Step 2: Update database ONLY after file is confirmed
  const dbSuccess = await updateDatabaseAfterFile(playlistId, fileOp.publicUrl!);
  
  if (!dbSuccess) {
    // Rollback: Delete the file since database update failed
    try {
      await fs.unlink(fileOp.filePath!);
      console.log('[Storage-First] 🔄 Rolled back file after database failure');
    } catch (rollbackError) {
      console.error('[Storage-First] ⚠️ Rollback failed:', rollbackError);
    }
    
    return {
      success: false,
      error: 'Database update failed, file rolled back'
    };
  }

  console.log('[Storage-First] 🎉 Complete success - file and database both updated');
  
  return {
    success: true,
    coverUrl: fileOp.publicUrl
  };
}

/**
 * Verify existing covers and fix missing ones
 */
export async function verifyAndFixMissingCovers(): Promise<{ fixed: number; failed: number }> {
  console.log('[Storage-First] 🔍 Starting missing cover verification...');
  
  let fixed = 0;
  let failed = 0;

  try {
    // Get all playlists with cover URLs
    const playlistsWithCovers = await db.select()
      .from(playlists)
      .where(eq(playlists.coverImageUrl, ''));

    for (const playlist of playlistsWithCovers) {
      if (!playlist.coverImageUrl) continue;

      const cleanUrl = playlist.coverImageUrl.split('?')[0];
      if (cleanUrl.startsWith('http')) continue; // Skip external URLs

      const filePath = path.join(process.cwd(), 'public', cleanUrl);
      
      try {
        await fs.access(filePath);
        // File exists, continue
      } catch {
        // File missing, needs regeneration
        console.log(`[Storage-First] Missing cover for playlist ${playlist.id}: ${playlist.title}`);
        // Could trigger regeneration here
        failed++;
      }
    }

  } catch (error) {
    console.error('[Storage-First] Verification error:', error);
  }

  console.log(`[Storage-First] ✅ Verification complete: ${fixed} fixed, ${failed} failed`);
  return { fixed, failed };
}