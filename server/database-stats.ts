/**
 * Database Statistics and Odesli API Module
 * 
 * This module provides endpoints to retrieve database statistics about tracks 
 * and platform coverage. It also handles running and monitoring the Odesli process
 * for track platform resolution.
 */

import { Request, Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "./db";

// Track the active Odesli task
interface OdesliTask {
  id: string;
  status: string;
  created: Date;
  lastUpdated: Date;
  total: number;
  processed: number;
  failed: number;
  message?: string;
  details?: string;
}

// Keep track of tasks in memory
const odesliTasks: Record<string, OdesliTask> = {};

/**
 * Add database statistics routes to the Express application
 * @param app Express application
 */
export function addDatabaseStatsRoutes(app: any) {
  // Endpoint to get database statistics including platform coverage
  app.get("/api/admin/database-stats", async (req: Request, res: Response) => {
    try {
      console.log("Fetching database statistics...");
      
      // Get count of all tracks in the database
      const totalResult = await db.execute(sql`SELECT COUNT(*) as count FROM tracks`);
      const totalCount = totalResult.rows[0].count || '0';
      const totalTracks = parseInt(String(totalCount));
      
      // Get count of tracks with each platform ID by querying the track_platform_ids table
      // Count unique track IDs that actually exist in the tracks table to avoid counting duplicates or orphaned records
      const spotifyResult = await db.execute(sql`
        SELECT COUNT(DISTINCT t.id) as count 
        FROM tracks t
        INNER JOIN track_platform_ids p ON t.id = p.track_id
        WHERE p.platform = 'spotify'
      `);
      
      const appleMusicResult = await db.execute(sql`
        SELECT COUNT(DISTINCT t.id) as count 
        FROM tracks t
        INNER JOIN track_platform_ids p ON t.id = p.track_id
        WHERE p.platform = 'apple_music'
      `);
      
      const youtubeResult = await db.execute(sql`
        SELECT COUNT(DISTINCT t.id) as count 
        FROM tracks t
        INNER JOIN track_platform_ids p ON t.id = p.track_id
        WHERE p.platform = 'youtube'
      `);
      
      const amazonMusicResult = await db.execute(sql`
        SELECT COUNT(DISTINCT t.id) as count 
        FROM tracks t
        INNER JOIN track_platform_ids p ON t.id = p.track_id
        WHERE p.platform = 'amazon_music'
      `);
      
      const tidalResult = await db.execute(sql`
        SELECT COUNT(DISTINCT t.id) as count 
        FROM tracks t
        INNER JOIN track_platform_ids p ON t.id = p.track_id
        WHERE p.platform = 'tidal'
      `);
      
      const deezerResult = await db.execute(sql`
        SELECT COUNT(DISTINCT t.id) as count 
        FROM tracks t
        INNER JOIN track_platform_ids p ON t.id = p.track_id
        WHERE p.platform = 'deezer'
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
      
      console.log("Database statistics:", stats);
      
      res.json(stats);
    } catch (error) {
      console.error("Error fetching database statistics:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to fetch database statistics"
      });
    }
  });
  
  // Endpoint to run Odesli resolution
  app.post("/api/admin/run-odesli", async (req: Request, res: Response) => {
    try {
      console.log("Starting Odesli platform resolution process...");
      
      // Check if there's already a task running
      const activeTask = Object.values(odesliTasks).find(
        task => task.status === 'queued' || task.status === 'processing'
      );
      
      if (activeTask) {
        return res.json({
          success: true,
          message: "An Odesli platform resolution task is already running",
          taskId: activeTask.id,
          status: activeTask.status,
          progress: {
            total: activeTask.total,
            processed: activeTask.processed
          }
        });
      }
      
      // Find tracks that need resolution (have Spotify ID but missing other platforms)
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
        LIMIT 1000 -- Process a larger batch for efficiency
      `);
      
      const tracks = tracksResult.rows;
      
      if (tracks.length === 0) {
        return res.json({
          success: true,
          message: "No tracks found needing platform resolution",
          taskId: `odesli-${Date.now()}`,
          status: 'completed',
          progress: {
            total: 0,
            processed: 0
          }
        });
      }
      
      // Create a new task
      const taskId = `odesli-${Date.now()}`;
      const task: OdesliTask = {
        id: taskId,
        status: 'queued',
        created: new Date(),
        lastUpdated: new Date(),
        total: tracks.length,
        processed: 0,
        failed: 0,
        message: `Started processing ${tracks.length} tracks`
      };
      
      // Store the task
      odesliTasks[taskId] = task;
      
      // Start processing in the background
      setTimeout(() => processOdesliTracks(taskId, tracks), 0);
      
      return res.json({
        success: true,
        message: `Odesli platform resolution process started for ${tracks.length} tracks`,
        taskId,
        status: 'queued',
        progress: {
          total: tracks.length,
          processed: 0
        }
      });
    } catch (error) {
      console.error("Error starting Odesli resolution:", error);
      res.status(500).json({
        success: false,
        message: "Failed to start Odesli resolution"
      });
    }
  });
  
  // Endpoint to get task status
  app.get("/api/admin/platform-tasks/:taskId", async (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      
      const task = odesliTasks[taskId];
      if (!task) {
        return res.status(404).json({
          success: false,
          message: "Task not found"
        });
      }
      
      res.json({
        success: true,
        task: {
          id: task.id,
          status: task.status,
          created: task.created,
          lastUpdate: task.lastUpdated,
          total: task.total,
          processed: task.processed,
          failed: task.failed,
          message: task.message,
          details: task.details
        }
      });
    } catch (error) {
      console.error("Error checking task status:", error);
      res.status(500).json({
        success: false,
        message: "Failed to check task status"
      });
    }
  });
  
  // Endpoint to stop a task
  app.post("/api/admin/platform-tasks/:taskId/stop", async (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      
      const task = odesliTasks[taskId];
      if (!task || (task.status !== 'queued' && task.status !== 'processing')) {
        return res.status(400).json({
          success: false,
          message: "Task not found or not in a stoppable state"
        });
      }
      
      task.status = 'stopping';
      task.lastUpdated = new Date();
      task.message = `Task is being stopped after processing ${task.processed} of ${task.total} tracks`;
      
      res.json({
        success: true,
        message: "Task is being stopped"
      });
    } catch (error) {
      console.error("Error stopping task:", error);
      res.status(500).json({
        success: false,
        message: "Failed to stop task"
      });
    }
  });
}

/**
 * Process tracks for Odesli platform resolution
 */
async function processOdesliTracks(taskId: string, tracks: any[]) {
  const task = odesliTasks[taskId];
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
      if (task.status === 'stopping' || task.status === 'stopped') {
        console.log(`Task ${taskId} has been stopped after processing ${task.processed} tracks`);
        task.status = 'stopped';
        task.lastUpdated = new Date();
        return;
      }
      
      const batchTracks = tracks.slice(i, i + BATCH_SIZE);
      
      // Process each track in the batch
      for (const track of batchTracks) {
        try {
          // Update task progress
          task.details = `Processing track ${task.processed + 1}/${task.total}: ${track.title}`;
          task.lastUpdated = new Date();
          console.log(task.details);
          
          // Get song links from Odesli
          const spotifyUrl = `https://open.spotify.com/track/${track.spotify_id}`;
          const odesliResponse = await fetch(`https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(spotifyUrl)}`);
          
          if (!odesliResponse.ok) {
            console.error(`Failed to get song links for track ${track.track_id}:`, odesliResponse.statusText);
            task.failed++;
            continue;
          }
          
          const songData = await odesliResponse.json();
          
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
          
          task.processed++;
          task.lastUpdated = new Date();
          
        } catch (trackError) {
          console.error(`Error processing track ${track.track_id}:`, trackError);
          task.failed++;
        }
        
        // Add delay between tracks to avoid rate limits
        await delay(DELAY_BETWEEN_TRACKS);
      }
    }
    
    // Update task status
    task.status = 'completed';
    task.lastUpdated = new Date();
    task.message = `Completed processing ${task.processed} tracks (${task.failed} failed)`;
    console.log(`Task ${taskId} completed: ${task.message}`);
    
  } catch (error) {
    console.error(`Error in Odesli resolution task ${taskId}:`, error);
    task.status = 'failed';
    task.lastUpdated = new Date();
    task.message = error instanceof Error ? error.message : 'Unknown error';
  }
}