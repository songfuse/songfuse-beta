/**
 * Service for retrieving and processing audio features from Spotify
 */

import { db } from '../db';
import { tracks, trackPlatformIds } from '../../shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import * as spotify from '../spotify-fixed';

// Queue of tracks waiting for audio features retrieval
interface QueueItem {
  trackId: number;
  spotifyId: string;
  attempts: number;
}

const MAX_ATTEMPTS = 3;
const RATE_LIMIT_DELAY = 1000; // 1 second delay between API calls to avoid rate limiting
const BATCH_SIZE = 50; // Maximum number of tracks per Spotify API request
const queue: QueueItem[] = [];
let isProcessing = false;

/**
 * Queue a track for audio features retrieval
 * 
 * @param trackId The database ID of the track
 * @param spotifyId The Spotify ID of the track
 */
export async function queueTrackForAudioFeatures(trackId: number, spotifyId: string): Promise<void> {
  // Check if this track already has audio features
  const track = await db.select().from(tracks).where(eq(tracks.id, trackId)).limit(1);
  
  if (track.length > 0 && track[0].danceability !== null && track[0].energy !== null) {
    console.log(`Track ${trackId} already has audio features, skipping`);
    return;
  }
  
  // Add to queue if not already in it
  const existingItem = queue.find(item => item.trackId === trackId);
  if (!existingItem) {
    queue.push({
      trackId,
      spotifyId,
      attempts: 0
    });
    console.log(`Added track ${trackId} to audio features queue (${queue.length} tracks in queue)`);
    
    // Start processing if not already running
    if (!isProcessing) {
      processQueue();
    }
  }
}

/**
 * Process the queue of tracks waiting for audio features
 */
async function processQueue(): Promise<void> {
  if (isProcessing || queue.length === 0) {
    return;
  }
  
  isProcessing = true;
  
  try {
    while (queue.length > 0) {
      // Take up to BATCH_SIZE items from the queue
      const batch = queue.splice(0, BATCH_SIZE);
      const trackIds = batch.map(item => item.trackId);
      const spotifyIds = batch.map(item => item.spotifyId);
      
      console.log(`Processing batch of ${batch.length} tracks for audio features`);
      
      try {
        // Get access token (assuming admin access for system operations)
        const adminToken = await getAdminAccessToken();
        
        if (!adminToken) {
          console.error('Failed to get admin access token for audio features retrieval');
          // Put items back in queue with increased attempts
          batch.forEach(item => {
            if (item.attempts < MAX_ATTEMPTS) {
              queue.push({
                ...item,
                attempts: item.attempts + 1
              });
            } else {
              console.error(`Giving up on track ${item.trackId} after ${MAX_ATTEMPTS} attempts`);
            }
          });
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 5000));
          continue;
        }
        
        // Fetch audio features from Spotify
        const audioFeaturesMap = await spotify.getAudioFeatures(adminToken, spotifyIds);
        
        // Update each track with its audio features
        for (let i = 0; i < batch.length; i++) {
          const item = batch[i];
          const trackId = item.trackId;
          const spotifyId = item.spotifyId;
          
          const audioFeatures = audioFeaturesMap[spotifyId];
          
          if (audioFeatures) {
            // Transform Spotify's audio features to our format
            const transformedFeatures = transformAudioFeatures(audioFeatures);
            
            // Update the track with individual audio features
            await db.update(tracks)
              .set({
                danceability: Math.round(audioFeatures.danceability * 100),
                energy: Math.round(audioFeatures.energy * 100),
                valence: Math.round(audioFeatures.valence * 100),
                tempo: Math.round(audioFeatures.tempo),
                instrumentalness: Math.round(audioFeatures.instrumentalness * 100),
                acousticness: Math.round(audioFeatures.acousticness * 100),
                liveness: Math.round(audioFeatures.liveness * 100),
                speechiness: Math.round(audioFeatures.speechiness * 100)
              })
              .where(eq(tracks.id, trackId));
            
            console.log(`Updated audio features for track ${trackId} (${spotifyId})`);
          } else {
            console.warn(`No audio features found for track ${trackId} (${spotifyId})`);
          }
        }
      } catch (error) {
        console.error('Error processing audio features batch:', error);
        
        // Put items back in queue with increased attempts
        batch.forEach(item => {
          if (item.attempts < MAX_ATTEMPTS) {
            queue.push({
              ...item,
              attempts: item.attempts + 1
            });
          } else {
            console.error(`Giving up on track ${item.trackId} after ${MAX_ATTEMPTS} attempts`);
          }
        });
      }
      
      // Wait to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
    }
  } finally {
    isProcessing = false;
    
    // If new items were added to the queue while we were processing,
    // start processing again
    if (queue.length > 0) {
      processQueue();
    }
  }
}

/**
 * Get an admin access token for Spotify API access
 * This uses client credentials flow for system operations
 */
async function getAdminAccessToken(): Promise<string | null> {
  try {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      console.error('Spotify client credentials not configured');
      return null;
    }
    
    // Use the client credentials flow to get an access token
    const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });
    
    if (!response.ok) {
      console.error('Failed to get Spotify access token:', response.status, response.statusText);
      return null;
    }
    
    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error('Error getting admin access token:', error);
    return null;
  }
}

/**
 * Transform Spotify's audio features to our format
 * 
 * @param spotifyFeatures The audio features from Spotify API
 * @returns Transformed audio features object
 */
function transformAudioFeatures(spotifyFeatures: any): any {
  const originalKeys = [
    'danceability', 'energy', 'key', 'loudness', 'mode', 
    'speechiness', 'acousticness', 'instrumentalness', 
    'liveness', 'valence', 'tempo', 'time_signature',
    'duration_ms'
  ];
  
  // Make sure all expected properties exist
  const features: any = {};
  
  for (const key of originalKeys) {
    if (key in spotifyFeatures) {
      // Convert 0-1 values to 0-100 scale for better readability
      if (['danceability', 'energy', 'speechiness', 'acousticness', 'instrumentalness', 'liveness', 'valence'].includes(key)) {
        features[key] = Math.round(spotifyFeatures[key] * 100);
      } else {
        features[key] = spotifyFeatures[key];
      }
    } else {
      // Use null for missing values
      features[key] = null;
    }
  }
  
  return features;
}

/**
 * Get tracks without audio features
 * 
 * @param limit Maximum number of tracks to return
 * @returns Array of tracks without audio features
 */
export async function getTracksWithoutAudioFeatures(limit: number = 100): Promise<Array<{ id: number, spotifyId: string }>> {
  // Join tracks with trackPlatformIds to get Spotify IDs
  const result = await db.select({
    id: tracks.id,
    spotifyId: trackPlatformIds.platformId
  })
  .from(tracks)
  .where(sql`(
    danceability IS NULL OR
    energy IS NULL OR
    valence IS NULL OR
    tempo IS NULL
  )`)
  .innerJoin(trackPlatformIds, and(
    eq(trackPlatformIds.trackId, tracks.id),
    eq(trackPlatformIds.platform, 'spotify')
  ))
  .limit(limit);
  
  return result;
}

/**
 * Update audio features for all tracks without them
 * This function is used for batch processing
 */
export async function updateAllAudioFeatures(): Promise<void> {
  const tracksToUpdate = await getTracksWithoutAudioFeatures(1000);
  
  console.log(`Found ${tracksToUpdate.length} tracks without audio features`);
  
  for (const track of tracksToUpdate) {
    await queueTrackForAudioFeatures(track.id, track.spotifyId);
  }
}

/**
 * Update a batch of tracks without audio features
 * This function is used for the metadata update endpoint
 * 
 * @param batchSize Number of tracks to process in one batch
 */
export async function updateMissingAudioFeatures(batchSize: number = 50): Promise<void> {
  try {
    console.log(`Starting audio features update for up to ${batchSize} tracks...`);
    
    // Get tracks without audio features
    const tracksToUpdate = await getTracksWithoutAudioFeatures(batchSize);
    
    if (tracksToUpdate.length === 0) {
      console.log('No tracks found without audio features.');
      return;
    }
    
    console.log(`Found ${tracksToUpdate.length} tracks without audio features`);
    
    // Get admin access token
    const adminToken = await getAdminAccessToken();
    
    if (!adminToken) {
      console.error('Failed to get admin access token for audio features update');
      return;
    }
    
    // Process in smaller sub-batches to avoid rate limits (max 100 per Spotify API request)
    const subBatchSize = 50;
    let updatedCount = 0;
    
    for (let i = 0; i < tracksToUpdate.length; i += subBatchSize) {
      const subBatch = tracksToUpdate.slice(i, i + subBatchSize);
      const spotifyIds = subBatch.map(track => track.spotifyId);
      
      try {
        // Fetch audio features from Spotify
        const audioFeaturesMap = await spotify.getAudioFeatures(adminToken, spotifyIds);
        
        // Update each track with its audio features
        for (const track of subBatch) {
          const audioFeatures = audioFeaturesMap[track.spotifyId];
          
          if (audioFeatures) {
            // Transform Spotify's audio features to our format
            const transformedFeatures = transformAudioFeatures(audioFeatures);
            
            // Update track with normalized audio features values (0-100 scale)
            await db.update(tracks)
              .set({
                danceability: Math.round(audioFeatures.danceability * 100),
                energy: Math.round(audioFeatures.energy * 100),
                valence: Math.round(audioFeatures.valence * 100),
                tempo: Math.round(audioFeatures.tempo),
                instrumentalness: Math.round(audioFeatures.instrumentalness * 100),
                acousticness: Math.round(audioFeatures.acousticness * 100),
                liveness: Math.round(audioFeatures.liveness * 100),
                speechiness: Math.round(audioFeatures.speechiness * 100)
              })
              .where(eq(tracks.id, track.id));
            
            console.log(`Updated audio features for track ${track.id} (${track.spotifyId})`);
            updatedCount++;
          } else {
            console.warn(`No audio features found for track ${track.id} (${track.spotifyId})`);
          }
        }
      } catch (error) {
        console.error('Error processing audio features batch:', error);
      }
      
      // Add a delay between batches to avoid rate limiting
      if (i + subBatchSize < tracksToUpdate.length) {
        console.log('Waiting before processing next batch...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`Audio features update completed. Updated ${updatedCount} tracks.`);
  } catch (error) {
    console.error('Error updating audio features:', error);
  }
}