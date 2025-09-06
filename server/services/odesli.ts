/**
 * Odesli API Service
 * 
 * This service handles the platform resolution process using the Odesli API
 * It allows tracking songs across multiple music platforms
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
import { trackPlatformIds } from '@shared/schema';

interface OdesliPlatformLink {
  entityUniqueId: string;
  url: string;
  nativeAppUriMobile?: string;
  nativeAppUriDesktop?: string;
}

interface OdesliResponse {
  entityUniqueId: string;
  userCountry: string;
  linksByPlatform: {
    [key: string]: OdesliPlatformLink;
  };
  entitiesByUniqueId: {
    [key: string]: {
      id: string;
      type: string;
      title?: string;
      artistName?: string;
      thumbnailUrl?: string;
      thumbnailWidth?: number;
      thumbnailHeight?: number;
      apiProvider: string;
      platforms: string[];
    }
  };
}

// Task management
interface OdesliTask {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'stopped';
  created: Date;
  lastUpdated: Date;
  totalTracks: number;
  processedTracks: number;
  failedTracks: number;
  message?: string;
  progressDetails?: string;
}

// Keep track of tasks
const tasks: Record<string, OdesliTask> = {};

/**
 * Get database statistics for platform coverage
 */
export async function getDatabasePlatformStats() {
  try {
    // Get count of all tracks in the database
    const totalResult = await db.execute(sql`SELECT COUNT(*) as count FROM tracks`);
    const totalCount = totalResult.rows[0].count || '0';
    const totalTracks = parseInt(String(totalCount));
    
    // Get count of tracks with each platform ID
    const spotifyResult = await db.execute(sql`
      SELECT COUNT(DISTINCT track_id) as count 
      FROM track_platform_ids 
      WHERE platform = 'spotify'
    `);
    
    const appleMusicResult = await db.execute(sql`
      SELECT COUNT(DISTINCT track_id) as count 
      FROM track_platform_ids 
      WHERE platform = 'apple_music'
    `);
    
    const youtubeResult = await db.execute(sql`
      SELECT COUNT(DISTINCT track_id) as count 
      FROM track_platform_ids 
      WHERE platform = 'youtube'
    `);
    
    const amazonMusicResult = await db.execute(sql`
      SELECT COUNT(DISTINCT track_id) as count 
      FROM track_platform_ids 
      WHERE platform = 'amazon_music'
    `);
    
    const tidalResult = await db.execute(sql`
      SELECT COUNT(DISTINCT track_id) as count 
      FROM track_platform_ids 
      WHERE platform = 'tidal'
    `);
    
    const deezerResult = await db.execute(sql`
      SELECT COUNT(DISTINCT track_id) as count 
      FROM track_platform_ids 
      WHERE platform = 'deezer'
    `);
    
    // Calculate tracks needing resolution (have Spotify ID but missing other platforms)
    const needsResolutionResult = await db.execute(sql`
      SELECT COUNT(DISTINCT t.track_id) as count
      FROM track_platform_ids t
      WHERE t.platform = 'spotify'
      AND NOT EXISTS (
        SELECT 1 FROM track_platform_ids
        WHERE track_id = t.track_id
        AND platform IN ('apple_music', 'youtube', 'amazon_music', 'tidal', 'deezer')
        LIMIT 1
      )
    `);
    
    // Compile all statistics into a response object
    const stats = {
      totalTracks,
      tracksWithSpotify: parseInt(String(spotifyResult.rows[0].count || '0')),
      tracksWithAppleMusic: parseInt(String(appleMusicResult.rows[0].count || '0')),
      tracksWithYouTube: parseInt(String(youtubeResult.rows[0].count || '0')),
      tracksWithAmazonMusic: parseInt(String(amazonMusicResult.rows[0].count || '0')),
      tracksWithTidal: parseInt(String(tidalResult.rows[0].count || '0')),
      tracksWithDeezer: parseInt(String(deezerResult.rows[0].count || '0')),
      tracksNeedingResolution: parseInt(String(needsResolutionResult.rows[0].count || '0')),
      lastUpdated: new Date().toISOString()
    };
    
    return stats;
  } catch (error) {
    console.error("Error fetching platform statistics:", error);
    throw error;
  }
}

/**
 * Start a new Odesli resolution task
 */
export async function startOdesliResolution(): Promise<OdesliTask> {
  try {
    // Check if there's an active task
    const activeTask = Object.values(tasks).find(
      task => task.status === 'queued' || task.status === 'processing'
    );
    
    if (activeTask) {
      return activeTask;
    }
    
    // Get tracks needing resolution (have Spotify ID but missing other platforms)
    const tracksResult = await db.execute(sql`
      SELECT DISTINCT t.track_id, p.platform_id as spotify_id, tr.title
      FROM track_platform_ids t
      JOIN track_platform_ids p ON t.track_id = p.track_id AND p.platform = 'spotify'
      JOIN tracks tr ON t.track_id = tr.id
      WHERE t.platform = 'spotify'
      AND NOT EXISTS (
        SELECT 1 FROM track_platform_ids
        WHERE track_id = t.track_id
        AND platform IN ('apple_music', 'youtube', 'amazon_music', 'tidal', 'deezer')
        LIMIT 1
      )
      ORDER BY t.track_id
      LIMIT 1000
    `);
    
    const tracks = tracksResult.rows;
    
    if (tracks.length === 0) {
      return {
        id: `odesli-${Date.now()}`,
        status: 'completed',
        created: new Date(),
        lastUpdated: new Date(),
        totalTracks: 0,
        processedTracks: 0,
        failedTracks: 0,
        message: 'No tracks found needing platform resolution'
      };
    }
    
    // Create a new task
    const taskId = `odesli-${Date.now()}`;
    const task: OdesliTask = {
      id: taskId,
      status: 'queued',
      created: new Date(),
      lastUpdated: new Date(),
      totalTracks: tracks.length,
      processedTracks: 0,
      failedTracks: 0,
      message: `Started processing ${tracks.length} tracks`
    };
    
    // Store the task
    tasks[taskId] = task;
    
    // Process tracks in the background
    setTimeout(() => processOdesliTracks(taskId, tracks), 0);
    
    return task;
  } catch (error) {
    console.error("Error starting Odesli resolution:", error);
    throw error;
  }
}

/**
 * Process tracks for Odesli platform resolution
 */
async function processOdesliTracks(taskId: string, tracks: any[]) {
  const task = tasks[taskId];
  if (!task) return;
  
  task.status = 'processing';
  task.lastUpdated = new Date();
  
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const BATCH_SIZE = 5;
  const DELAY_BETWEEN_TRACKS = 2000; // 2 seconds to avoid rate limits
  
  try {
    // Process tracks in batches
    for (let i = 0; i < tracks.length; i += BATCH_SIZE) {
      // Check if the task has been stopped
      if (task.status === 'stopped') {
        console.log(`Task ${taskId} has been stopped after processing ${task.processedTracks} tracks`);
        return;
      }
      
      const batchTracks = tracks.slice(i, i + BATCH_SIZE);
      
      // Process each track in the batch
      for (const track of batchTracks) {
        try {
          // Update task progress
          task.progressDetails = `Processing track ${task.processedTracks + 1}/${task.totalTracks}: ${track.title}`;
          task.lastUpdated = new Date();
          
          // Get song links from Odesli
          const spotifyUrl = `https://open.spotify.com/track/${track.spotify_id}`;
          const odesliResponse = await fetch(`https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(spotifyUrl)}`);
          
          if (!odesliResponse.ok) {
            console.error(`Failed to get song links for track ${track.track_id}:`, odesliResponse.statusText);
            task.failedTracks++;
            continue;
          }
          
          const songData: OdesliResponse = await odesliResponse.json();
          
          // Extract platform-specific IDs
          const platforms: Record<string, { platformId: string, platformUrl: string | null }> = {};
          
          // Process Spotify (already have it but include for completeness)
          if (songData.linksByPlatform?.spotify) {
            platforms.spotify = {
              platformId: songData.linksByPlatform.spotify.entityUniqueId.split('::').pop() || '',
              platformUrl: songData.linksByPlatform.spotify.url
            };
          }
          
          // Process YouTube
          if (songData.linksByPlatform?.youtube) {
            platforms.youtube = {
              platformId: songData.linksByPlatform.youtube.entityUniqueId.split('::').pop() || '',
              platformUrl: songData.linksByPlatform.youtube.url
            };
          }
          
          // Process Apple Music
          if (songData.linksByPlatform?.appleMusic) {
            platforms.apple_music = {
              platformId: songData.linksByPlatform.appleMusic.entityUniqueId.split('::').pop() || '',
              platformUrl: songData.linksByPlatform.appleMusic.url
            };
          }
          
          // Process Amazon Music
          if (songData.linksByPlatform?.amazonMusic) {
            platforms.amazon_music = {
              platformId: songData.linksByPlatform.amazonMusic.entityUniqueId.split('::').pop() || '',
              platformUrl: songData.linksByPlatform.amazonMusic.url
            };
          }
          
          // Process Tidal
          if (songData.linksByPlatform?.tidal) {
            platforms.tidal = {
              platformId: songData.linksByPlatform.tidal.entityUniqueId.split('::').pop() || '',
              platformUrl: songData.linksByPlatform.tidal.url
            };
          }
          
          // Process Deezer
          if (songData.linksByPlatform?.deezer) {
            platforms.deezer = {
              platformId: songData.linksByPlatform.deezer.entityUniqueId.split('::').pop() || '',
              platformUrl: songData.linksByPlatform.deezer.url
            };
          }
          
          // Save platform IDs to database
          for (const [platform, data] of Object.entries(platforms)) {
            // Skip if we don't have a platform ID
            if (!data.platformId) continue;
            
            // Check if the platform ID already exists for this track
            const existingResult = await db.execute(sql`
              SELECT id FROM track_platform_ids
              WHERE track_id = ${track.track_id}
              AND platform = ${platform}
            `);
            
            if (existingResult.rows.length === 0) {
              // Insert new platform ID
              await db.execute(sql`
                INSERT INTO track_platform_ids (track_id, platform, platform_id, platform_url)
                VALUES (${track.track_id}, ${platform}, ${data.platformId}, ${data.platformUrl})
              `);
            }
          }
          
          task.processedTracks++;
          task.lastUpdated = new Date();
          
        } catch (trackError) {
          console.error(`Error processing track ${track.track_id}:`, trackError);
          task.failedTracks++;
        }
        
        // Add delay between tracks to avoid rate limits
        await delay(DELAY_BETWEEN_TRACKS);
      }
    }
    
    // Update task status
    task.status = 'completed';
    task.lastUpdated = new Date();
    task.message = `Completed processing ${task.processedTracks} tracks (${task.failedTracks} failed)`;
    console.log(`Task ${taskId} completed: ${task.message}`);
    
  } catch (error) {
    console.error(`Error in Odesli resolution task ${taskId}:`, error);
    task.status = 'failed';
    task.lastUpdated = new Date();
    task.message = error instanceof Error ? error.message : 'Unknown error';
  }
}

/**
 * Stop an active Odesli resolution task
 */
export function stopOdesliTask(taskId: string): boolean {
  const task = tasks[taskId];
  if (!task) return false;
  
  if (task.status === 'processing' || task.status === 'queued') {
    task.status = 'stopped';
    task.lastUpdated = new Date();
    task.message = `Task stopped after processing ${task.processedTracks} of ${task.totalTracks} tracks`;
    return true;
  }
  
  return false;
}

/**
 * Get an Odesli task by ID
 */
export function getOdesliTask(taskId: string): OdesliTask | null {
  return tasks[taskId] || null;
}

/**
 * Get all Odesli tasks
 */
export function getAllOdesliTasks(): Record<string, OdesliTask> {
  return { ...tasks };
}