/**
 * Script to resolve track platform IDs using the Odesli API
 * This will process all tracks that have Spotify IDs but missing platform IDs for other services
 */
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { trackPlatformIds } from '@shared/schema';
import { eq } from 'drizzle-orm';

interface OdesliResponse {
  entityUniqueId: string;
  userCountry: string;
  linksByPlatform: {
    [key: string]: {
      entityUniqueId: string;
      url: string;
      nativeAppUriMobile?: string;
      nativeAppUriDesktop?: string;
    }
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

/**
 * List of tasks currently being processed
 */
const activeTasks: Map<string, { 
  status: string; 
  processed: number; 
  total: number;
  startTime: Date;
  lastUpdate: Date;
}> = new Map();

/**
 * Queue existing tracks for platform resolution
 * This function selects tracks with Spotify IDs but missing other platform IDs
 * and queues them for processing through the Odesli API
 */
export async function queueExistingTracks() {
  try {
    console.log("Starting platform resolution for existing tracks...");
    
    // Create a unique task ID based on timestamp
    const taskId = `platform-resolution-${Date.now()}`;
    
    // Register task with initial status
    activeTasks.set(taskId, { 
      status: 'starting', 
      processed: 0, 
      total: 0,
      startTime: new Date(),
      lastUpdate: new Date()
    });
    
    // Start the process in the background
    processTracksInBatches(taskId).catch(error => {
      console.error(`Error in platform resolution task ${taskId}:`, error);
      activeTasks.set(taskId, {
        ...activeTasks.get(taskId)!,
        status: 'failed',
        lastUpdate: new Date()
      });
    });
    
    return { taskId, status: 'started' };
  } catch (error) {
    console.error("Failed to queue existing tracks for platform resolution:", error);
    throw error;
  }
}

/**
 * Get the current status of a platform resolution task
 */
export function getTaskStatus(taskId: string) {
  const task = activeTasks.get(taskId);
  if (!task) {
    return { status: 'not_found' };
  }
  return {
    ...task,
    elapsedTime: Date.now() - task.startTime.getTime(),
    taskId
  };
}

/**
 * Get all active platform resolution tasks
 */
export function getAllTasks() {
  return Array.from(activeTasks.entries()).map(([taskId, task]) => ({
    ...task,
    elapsedTime: Date.now() - task.startTime.getTime(),
    taskId
  }));
}

/**
 * Stop a specific platform resolution task
 */
export function stopTask(taskId: string) {
  const task = activeTasks.get(taskId);
  if (!task) {
    return { status: 'not_found' };
  }
  
  activeTasks.set(taskId, {
    ...task,
    status: 'stopping',
    lastUpdate: new Date()
  });
  
  return { status: 'stopping' };
}

/**
 * Process tracks in batches to avoid overwhelming the Odesli API
 */
async function processTracksInBatches(taskId: string, batchSize = 10) {
  try {
    // Update task status
    activeTasks.set(taskId, {
      ...activeTasks.get(taskId)!,
      status: 'counting',
      lastUpdate: new Date()
    });
    
    // Get count of tracks that need platform resolution
    const tracksToProcessQuery = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM tracks t
      WHERE EXISTS (
        SELECT 1 FROM track_platform_ids pl
        WHERE pl."trackId" = t.id
        AND pl.platform = 'spotify'
      )
      AND NOT EXISTS (
        SELECT 1 FROM track_platform_ids pl
        WHERE pl."trackId" = t.id
        AND pl.platform != 'spotify'
      )
    `);
    
    const count = parseInt(tracksToProcessQuery.rows[0]?.count as string || '0');
    
    // Update task with total count
    activeTasks.set(taskId, {
      ...activeTasks.get(taskId)!,
      status: 'processing',
      total: count,
      lastUpdate: new Date()
    });
    
    console.log(`Found ${count} tracks that need platform resolution`);
    
    if (count === 0) {
      activeTasks.set(taskId, {
        ...activeTasks.get(taskId)!,
        status: 'completed',
        processed: 0,
        total: 0,
        lastUpdate: new Date()
      });
      console.log("No tracks need platform resolution");
      return;
    }
    
    let processed = 0;
    let offset = 0;
    
    // Process in batches
    while (offset < count) {
      // Check if task has been requested to stop
      const currentTask = activeTasks.get(taskId);
      if (currentTask?.status === 'stopping') {
        activeTasks.set(taskId, {
          ...currentTask,
          status: 'stopped',
          lastUpdate: new Date()
        });
        console.log(`Task ${taskId} was stopped after processing ${processed} tracks`);
        return;
      }
      
      // Get batch of tracks
      const tracksQuery = await db.execute(sql`
        SELECT t.id, t.title, pl."platformId" as spotify_id
        FROM tracks t
        JOIN track_platform_ids pl ON pl."trackId" = t.id
        WHERE pl.platform = 'spotify'
        AND NOT EXISTS (
          SELECT 1 FROM track_platform_ids pl2
          WHERE pl2."trackId" = t.id
          AND pl2.platform != 'spotify'
        )
        LIMIT ${batchSize} OFFSET ${offset}
      `);
      
      const tracks = tracksQuery.rows;
      
      if (tracks.length === 0) {
        break;
      }
      
      console.log(`Processing batch of ${tracks.length} tracks, offset ${offset}`);
      
      // Process each track in the batch
      for (const track of tracks) {
        try {
          await resolveTrackPlatforms(
            track.id as number, 
            track.spotify_id as string,
            track.title as string
          );
          processed++;
          
          // Update task status
          activeTasks.set(taskId, {
            ...activeTasks.get(taskId)!,
            processed,
            lastUpdate: new Date()
          });
        } catch (error) {
          console.error(`Error resolving platforms for track ${track.id}:`, error);
        }
        
        // Small delay to avoid hitting rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      offset += batchSize;
      
      // Short delay between batches
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Update final status
    activeTasks.set(taskId, {
      ...activeTasks.get(taskId)!,
      status: 'completed',
      processed,
      lastUpdate: new Date()
    });
    
    console.log(`Completed platform resolution for ${processed} tracks`);
  } catch (error) {
    console.error("Error processing tracks in batches:", error);
    
    // Update task status to failed
    activeTasks.set(taskId, {
      ...activeTasks.get(taskId)!,
      status: 'failed',
      lastUpdate: new Date()
    });
    
    throw error;
  }
}

/**
 * Resolve platform IDs for a single track using the Odesli API
 */
async function resolveTrackPlatforms(trackId: number, spotifyId: string, title: string) {
  try {
    console.log(`Resolving platforms for track ${trackId}: ${title} (Spotify ID: ${spotifyId})`);
    
    // Build the Odesli API URL
    const apiUrl = `https://api.song.link/v1-alpha.1/links?platform=spotify&type=song&id=${spotifyId}`;
    
    // Fetch data from Odesli API
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      throw new Error(`Odesli API returned ${response.status}: ${response.statusText}`);
    }
    
    const data: OdesliResponse = await response.json();
    
    // Extract platform IDs
    const platformData: { platform: string; id: string; url: string }[] = [];
    
    Object.entries(data.linksByPlatform).forEach(([platform, linkData]) => {
      const entityId = linkData.entityUniqueId;
      const entity = data.entitiesByUniqueId[entityId];
      
      if (entity && entity.id) {
        platformData.push({
          platform: mapPlatformName(platform),
          id: entity.id,
          url: linkData.url
        });
      }
    });
    
    console.log(`Found ${platformData.length} platform IDs for track ${trackId}`);
    
    // Store platform IDs in database
    for (const { platform, id, url } of platformData) {
      // Skip if it's already the spotify platform we have
      if (platform === 'spotify') {
        continue;
      }
      
      try {
        // Check if this platform link already exists
        const existingLink = await db.select()
          .from(trackPlatformIds)
          .where(sql`
            "trackId" = ${trackId} AND 
            platform = ${platform}
          `)
          .limit(1);
        
        if (existingLink.length === 0) {
          // Insert new platform link
          await db.insert(trackPlatformIds).values({
            trackId: trackId,
            platform,
            platformId: id,
            platformUrl: url
          });
          
          console.log(`Added ${platform} ID for track ${trackId}: ${id}`);
        } else {
          console.log(`${platform} ID already exists for track ${trackId}, skipping`);
        }
      } catch (dbError) {
        console.error(`Database error storing ${platform} ID for track ${trackId}:`, dbError);
      }
    }
    
    return platformData;
  } catch (error) {
    console.error(`Error resolving platforms for track ${trackId}:`, error);
    throw error;
  }
}

/**
 * Map Odesli platform names to our internal platform names
 */
function mapPlatformName(odesliPlatform: string): string {
  const platformMap: { [key: string]: string } = {
    'spotify': 'spotify',
    'itunes': 'apple_music',
    'appleMusic': 'apple_music',
    'youtube': 'youtube',
    'youtubeMusic': 'youtube_music',
    'amazonMusic': 'amazon_music',
    'tidal': 'tidal',
    'deezer': 'deezer',
    'soundcloud': 'soundcloud',
    'pandora': 'pandora',
    'yandex': 'yandex'
  };
  
  return platformMap[odesliPlatform] || odesliPlatform;
}