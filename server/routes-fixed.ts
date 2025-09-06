// Define a type for our global namespace
declare global {
  var recentlyUsedTracks: Set<string>;
}

import express, { type Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import * as spotify from "./spotify-fixed";
import * as openai from "./openai";
import { 
  insertUserSchema, 
  insertPlaylistSchema, 
  insertSongSchema, 
  insertChatMessageSchema, 
  insertSavedPromptSchema,
  SpotifyTrack
} from "@shared/schema";
import { sql } from "drizzle-orm";
import crypto from "crypto";
import fetch from "node-fetch";
import sharp from "sharp";
import * as fs from "fs";
import * as db from "./db";

// MCP router has been removed as it's no longer needed

// Test image route removed

// Import the v2 router with fixed API endpoints
import v2Router from './v2-router';

// Initialize our global state for tracking recently used tracks
if (!global.recentlyUsedTracks) {
  global.recentlyUsedTracks = new Set<string>();
}

/**
 * Generate a cover image in the background and store it for the session
 * This function is designed to be called after a response has been sent
 * to avoid blocking the user experience
 */
async function generateCoverImageInBackground(
  title: string,
  description: string,
  tracks: SpotifyTrack[],
  sessionId: string
): Promise<void> {
  try {
    console.log(`Starting background cover image generation for session ${sessionId}`);
    
    // Import modules
    const openai = await import('./openai');
    const { updateProgress } = await import('./services/progressTracking');
    
    // Update progress - cover generation started
    updateProgress(sessionId, {
      step: 'cover_generation',
      message: 'Creating the perfect image for your playlist...',
      percentage: 30,
      status: 'in_progress'
    });
    
    // Step 1: Generate cover description with OpenAI
    const coverDescription = await openai.generateCoverImageDescription(title, description, tracks);
    console.log("Generated cover description:", coverDescription);
    
    // Update progress - description generated
    updateProgress(sessionId, {
      step: 'cover_generation',
      message: 'Description created! Generating image...',
      percentage: 60,
      status: 'in_progress'
    });
    
    // Step 2: Generate image with GPT-Image-1 if enabled, otherwise use DALL-E 3
    // Now that we have the correct API format, we can try GPT-Image-1 again
    const useGptImage = true; // Set to true to test GPT-Image-1
    const coverImageUrl = await openai.generateCoverImage(coverDescription, useGptImage);
    console.log("Cover image generated:", coverImageUrl);
    
    // Update progress - image generated
    updateProgress(sessionId, {
      step: 'cover_generation',
      message: 'Cover image created successfully!',
      percentage: 100,
      status: 'completed'
    });
    
    // Step 3: Store the cover image URL for this session
    const result = await storage.storeCoverImageForSession(sessionId, coverImageUrl);
    console.log("Cover image stored:", result);
    
    // Update progress - final assembly completed
    updateProgress(sessionId, {
      step: 'final_assembly',
      message: 'Your playlist is ready to enjoy!',
      percentage: 100,
      status: 'completed'
    });
    
    // Complete progress tracking
    const { completeProgressTracking } = await import('./services/progressTracking');
    completeProgressTracking(sessionId);
  } catch (error) {
    console.error("Background cover image generation failed:", error);
    
    // Import progress tracking
    const { updateProgress } = await import('./services/progressTracking');
    
    // Update progress - cover generation failed
    updateProgress(sessionId, {
      step: 'cover_generation',
      message: 'Cover image generation encountered an issue.',
      percentage: 100,
      status: 'failed',
      details: 'You can generate a custom cover image manually.'
    });
    
    // Complete final assembly anyway
    updateProgress(sessionId, {
      step: 'final_assembly',
      message: 'Your playlist is ready! You can add a cover image later.',
      percentage: 100,
      status: 'completed'
    });
    
    // Complete progress tracking
    const { completeProgressTracking } = await import('./services/progressTracking');
    completeProgressTracking(sessionId);
  }
}

function selectBestImage(images: Array<any> = []): string | undefined {
  if (!images || images.length === 0) return undefined;
  
  // Sort by size (largest first)
  const sortedImages = [...images].sort((a, b) => {
    // If both have width and height, sort by area
    if (a.width && a.height && b.width && b.height) {
      return (b.width * b.height) - (a.width * a.height);
    }
    // Otherwise use the order they came in
    return 0;
  });
  
  return sortedImages[0]?.url;
}

async function imageUrlToBase64(url: string): Promise<string> {
  try {
    // Check if the URL is a relative path and convert to absolute URL
    let absoluteUrl = url;
    if (url.startsWith('/')) {
      // Convert relative path to absolute using current server URL
      const baseUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 5000}`;
      absoluteUrl = `${baseUrl}${url}`;
      console.log(`Converting relative path ${url} to absolute URL: ${absoluteUrl}`);
    }
    
    // Fetch the image
    const response = await fetch(absoluteUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }
    
    // Get the image as a buffer
    const imageBuffer = await response.buffer();
    
    // Process with sharp to ensure it's the right format and size
    let originalBuffer: Buffer;
    try {
      // Resize to 640x640 (Spotify requires square images)
      originalBuffer = await sharp(imageBuffer)
        .resize(640, 640, { fit: 'cover', position: 'centre' })
        .jpeg({ quality: 90 })
        .toBuffer();
    } catch (sharpError) {
      console.error("Error processing image with Sharp:", sharpError);
      // Fall back to the original buffer
      originalBuffer = imageBuffer;
    }
    
    // Convert buffer to base64
    return originalBuffer.toString('base64');
  } catch (error) {
    console.error("Error converting image to base64:", error);
    throw error;
  }
}

// Import the progress tracking service
import { initProgressWebSocketServer, startProgressTracking, updateProgress, completeProgressTracking } from './services/progressTracking';

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  // Initialize WebSocket server for progress tracking
  initProgressWebSocketServer(httpServer);
  
  // MCP routes have been removed as they're no longer needed
  
  // Test image route has been removed

  // Register the v2 API router with proper middleware
  app.use('/api/v2', v2Router);

  // Vector embedding search test endpoint
  app.get("/api/vector-search", async (req: Request, res: Response) => {
    try {
      const { query, limit = 24 } = req.query;
      
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid query parameter' });
      }
      
      // Import the necessary function from embeddings service
      const { findTracksMatchingEmbedding } = await import('./services/embeddings');
      
      // Perform vector search
      const results = await findTracksMatchingEmbedding(
        query, 
        parseInt(limit.toString()) || 24, 
        req.query.avoidExplicit === 'true'
      );
      
      return res.json({ results });
    } catch (error) {
      console.error('Error in vector search endpoint:', error);
      return res.status(500).json({ error: 'Error performing vector search: ' + error.message });
    }
  });
  
  // Embedding status endpoint for monitoring generation progress
  // Background embedding process endpoints
  app.post('/api/embeddings/start', async (req: Request, res: Response) => {
    try {
      // Import the background-tasks module
      const { startBackgroundEmbeddingProcess } = await import('./services/background-tasks');
      
      // Start the background embedding process
      const taskId = startBackgroundEmbeddingProcess();
      console.log('Starting background embedding process with task ID:', taskId);
      
      return res.json({
        success: true,
        taskId,
        message: 'Background embedding process started successfully'
      });
    } catch (error) {
      console.error('Error starting background embedding process:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  app.get('/api/embeddings/status/:taskId', async (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const { getBackgroundTaskStatus } = await import('./services/background-tasks');
      
      const status = getBackgroundTaskStatus(taskId);
      
      if (!status.found) {
        return res.status(404).json({
          success: false,
          error: 'Task not found'
        });
      }
      
      return res.json({
        success: true,
        ...status
      });
    } catch (error) {
      console.error('Error checking task status:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  app.get('/api/embeddings/tasks', async (req: Request, res: Response) => {
    try {
      const { getAllBackgroundTasks } = await import('./services/background-tasks');
      const tasks = getAllBackgroundTasks();
      
      return res.json({
        success: true,
        tasks
      });
    } catch (error) {
      console.error('Error getting background tasks:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  app.post('/api/embeddings/stop/:taskId', async (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const { stopBackgroundTask } = await import('./services/background-tasks');
      
      const success = stopBackgroundTask(taskId);
      
      if (!success) {
        return res.status(404).json({
          success: false,
          error: 'Task not found or already completed'
        });
      }
      
      return res.json({
        success: true,
        message: `Task ${taskId} stopped successfully`
      });
    } catch (error) {
      console.error('Error stopping background task:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  app.get("/api/embedding-status", async (req: Request, res: Response) => {
    try {
      const { db } = await import('./db');
      const { sql } = await import('drizzle-orm');
      const { tracks } = await import('@shared/schema');
      
      const embeddingStats = await db.select({
        total: sql<number>`count(*)`,
        withEmbeddings: sql<number>`count(CASE WHEN embedding IS NOT NULL THEN 1 END)`,
        withoutEmbeddings: sql<number>`count(CASE WHEN embedding IS NULL THEN 1 END)`
      })
      .from(tracks);
      
      const stats = embeddingStats[0];
      if (!stats) {
        return res.json({ error: "No tracks found in database" });
      }
      
      res.json({
        total: stats.total,
        withEmbeddings: stats.withEmbeddings,
        withoutEmbeddings: stats.withoutEmbeddings,
        percentage: ((stats.withEmbeddings / stats.total) * 100).toFixed(2) + '%',
        lastUpdated: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error getting embedding statistics:", error);
      res.status(500).json({ error: "Error calculating embedding statistics" });
    }
  });
  
  // Track import endpoints
  app.post("/api/tracks/import", async (req: Request, res: Response) => {
    // Explicitly set content type to JSON to prevent HTML rendering issues
    res.setHeader('Content-Type', 'application/json');
    
    try {
      const { tracks } = req.body;

      if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
        return res.status(400).json({ 
          message: "Request must include a 'tracks' array with at least one track",
          status: "error"
        });
      }

      // Log the import request
      console.log(`Track import request received with ${tracks.length} tracks`);
      
      // Import the tracks directly from the request data
      // This is just processing the request, actual DB operations happen asynchronously
      const processResult = await processTracksForImport(tracks);
      
      return res.status(200).json({ 
        message: `Started importing ${tracks.length} tracks. This will happen in the background.`,
        status: "success",
        tracksCount: tracks.length,
        processId: processResult.processId || "background-import-" + Date.now()
      });
    } catch (error) {
      console.error("Track import error:", error);
      return res.status(500).json({ message: "Failed to process track import request" });
    }
  });
  
  // Helper function to process track imports
  async function processTracksForImport(tracks: any[]): Promise<{ processId?: string }> {
    try {
      console.log(`Processing ${tracks.length} tracks for import`);
      
      // Create a process ID for this import batch
      const processId = `track-import-${Date.now()}`;
      
      // Start a background process to import the tracks
      // This happens asynchronously after the response is sent
      setTimeout(async () => {
        try {
          console.log(`[${processId}] Starting background import of ${tracks.length} tracks`);
          
          // Keep track of import stats
          let importedCount = 0;
          let errorCount = 0;
          
          // Process tracks in small batches to avoid overwhelming the database
          const batchSize = 10;
          for (let i = 0; i < tracks.length; i += batchSize) {
            const batch = tracks.slice(i, i + batchSize);
            console.log(`[${processId}] Processing batch ${i/batchSize + 1} of ${Math.ceil(tracks.length/batchSize)} (${batch.length} tracks)`);
            
            // Process each track in the batch
            for (const track of batch) {
              try {
                // Check if the track already exists by Spotify ID
                const spotifyId = track.platforms?.spotify?.id;
                if (!spotifyId) {
                  console.log(`[${processId}] Skipping track without Spotify ID:`, track.title);
                  errorCount++;
                  continue;
                }
                
                const existingTrack = await findTrackIdBySpotifyId(spotifyId);
                if (existingTrack) {
                  console.log(`[${processId}] Track already exists with Spotify ID ${spotifyId}, skipping import`);
                  importedCount++; // Count as success even though we didn't import
                  continue;
                }
                
                // Basic validation - ensure required fields exist
                if (!track.title || !track.artists || !track.artists[0]?.name) {
                  console.log(`[${processId}] Invalid track data, missing required fields:`, track);
                  errorCount++;
                  continue;
                }
                
                // Insert the track into the database
                await insertTrackWithMetadata(track);
                importedCount++;
                
              } catch (trackError) {
                console.error(`[${processId}] Error importing track:`, trackError);
                errorCount++;
              }
            }
            
            // Short delay between batches to prevent database overload
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          
          console.log(`[${processId}] Track import completed: ${importedCount} imported, ${errorCount} errors`);
        } catch (batchError) {
          console.error(`[${processId}] Error in background import process:`, batchError);
        }
      }, 100);
      
      return { processId };
    } catch (error) {
      console.error("Error initiating track import process:", error);
      return {};
    }
  }
  
  // Helper function to insert a track with its metadata
  async function insertTrackWithMetadata(track: any): Promise<void> {
    try {
      // Extract basic track information
      const { title, artists, album, duration_ms } = track;
      const artistName = artists && artists[0] ? artists[0].name : "Unknown Artist";
      const spotifyId = track.platforms?.spotify?.id;
      
      if (!spotifyId || !title) {
        throw new Error("Track missing required fields (title or Spotify ID)");
      }
      
      // Convert duration from ms to seconds if available
      const durationSec = duration_ms ? Math.round(duration_ms / 1000) : null;
      
      // Process album information first (if available)
      let albumId = null;
      if (album && album.name) {
        try {
          // Check if album already exists
          const existingAlbumQuery = await db.pool.query(
            `SELECT id FROM albums WHERE title = $1`,
            [album.name]
          );
          
          if (existingAlbumQuery.rows && existingAlbumQuery.rows.length > 0) {
            // Album already exists
            albumId = existingAlbumQuery.rows[0].id;
          } else {
            // Insert new album
            // Get cover image URL if available
            const coverImage = album.images && album.images.length > 0 ? album.images[0].url : null;
            
            const albumResult = await db.pool.query(
              `INSERT INTO albums (title, cover_image, created_at, updated_at) 
               VALUES ($1, $2, NOW(), NOW()) RETURNING id`,
              [album.name, coverImage]
            );
            
            if (albumResult.rows && albumResult.rows.length > 0) {
              albumId = albumResult.rows[0].id;
              
              // If album has a Spotify ID, add it to album_platform_ids
              if (album.id) {
                await db.pool.query(
                  `INSERT INTO album_platform_ids (album_id, platform, platform_id)
                   VALUES ($1, $2, $3)`,
                  [albumId, 'spotify', album.id]
                );
              }
              
              // Connect album to artists if we have artist information
              if (artists && artists.length > 0 && albumId) {
                for (let i = 0; i < artists.length; i++) {
                  const artist = artists[i];
                  if (!artist.name) continue;
                  
                  // We'll handle this after creating the artists
                  // (needs artist IDs which we'll get later)
                }
              }
            }
          }
        } catch (albumError) {
          console.warn(`Error processing album ${album.name}:`, albumError);
          // Continue even if album processing fails
        }
      }
      
      // Insert the track into the database
      const result = await db.pool.query(
        `INSERT INTO tracks (
          title, 
          album_id,
          duration,
          created_at, 
          updated_at
        ) VALUES ($1, $2, $3, NOW(), NOW()) RETURNING id`,
        [title, albumId, durationSec]
      );
      
      if (!result.rows || result.rows.length === 0) {
        throw new Error("Failed to insert track into database");
      }
      
      const trackId = result.rows[0].id;
      
      // Add the Spotify ID to the track_platform_ids table
      await db.pool.query(
        `INSERT INTO track_platform_ids (
          track_id, 
          platform, 
          platform_id
        ) VALUES ($1, $2, $3)`,
        [trackId, 'spotify', spotifyId]
      );
      
      // Add platform URL if available
      if (track.external_urls && track.external_urls.spotify) {
        await db.pool.query(
          `UPDATE track_platform_ids 
           SET platform_url = $1
           WHERE track_id = $2 AND platform = 'spotify'`,
          [track.external_urls.spotify, trackId]
        );
      }
      
      // Process other platform IDs if available
      if (track.platforms) {
        for (const platform of Object.keys(track.platforms)) {
          if (platform === 'spotify') continue; // already added
          
          const platformData = track.platforms[platform];
          if (platformData && platformData.id) {
            try {
              await db.pool.query(
                `INSERT INTO track_platform_ids (
                  track_id, 
                  platform, 
                  platform_id,
                  platform_url
                ) VALUES ($1, $2, $3, $4)`,
                [trackId, platform, platformData.id, platformData.url || null]
              );
            } catch (platformError) {
              console.warn(`Could not add platform ID for ${platform}:`, platformError);
            }
          }
        }
      }
      
      // Add track audio features if available
      if (track.audio_features) {
        try {
          const features = track.audio_features;
          await db.pool.query(
            `UPDATE tracks SET
              tempo = $1,
              energy = $2,
              danceability = $3,
              valence = $4,
              acousticness = $5,
              instrumentalness = $6,
              liveness = $7,
              speechiness = $8
             WHERE id = $9`,
            [
              features.tempo || null,
              features.energy ? Math.round(features.energy * 100) : null,
              features.danceability ? Math.round(features.danceability * 100) : null,
              features.valence ? Math.round(features.valence * 100) : null,
              features.acousticness ? Math.round(features.acousticness * 100) : null,
              features.instrumentalness ? Math.round(features.instrumentalness * 100) : null,
              features.liveness ? Math.round(features.liveness * 100) : null,
              features.speechiness ? Math.round(features.speechiness * 100) : null,
              trackId
            ]
          );
        } catch (featuresError) {
          console.warn(`Error adding audio features for track ${title}:`, featuresError);
        }
      }
      
      // Process artists
      const artistIds = [];
      if (artists && artists.length > 0) {
        for (let i = 0; i < artists.length; i++) {
          const artist = artists[i];
          if (!artist.name) continue;
          
          try {
            // Check if the artist already exists
            let artistId;
            const existingArtistQuery = await db.pool.query(
              `SELECT id FROM artists WHERE name = $1`,
              [artist.name]
            );
            
            if (existingArtistQuery.rows && existingArtistQuery.rows.length > 0) {
              // Artist already exists
              artistId = existingArtistQuery.rows[0].id;
            } else {
              // Insert new artist
              const artistResult = await db.pool.query(
                `INSERT INTO artists (name, created_at, updated_at) 
                 VALUES ($1, NOW(), NOW()) RETURNING id`,
                [artist.name]
              );
              
              if (!artistResult.rows || artistResult.rows.length === 0) {
                throw new Error(`Failed to insert artist ${artist.name}`);
              }
              
              artistId = artistResult.rows[0].id;
              
              // If the artist has a Spotify ID, add it to artist_platform_ids
              if (artist.id) {
                await db.pool.query(
                  `INSERT INTO artist_platform_ids (artist_id, platform, platform_id)
                   VALUES ($1, $2, $3)`,
                  [artistId, 'spotify', artist.id]
                );
              }
            }
            
            artistIds.push(artistId);
            
            // Connect track and artist in tracks_to_artists
            await db.pool.query(
              `INSERT INTO tracks_to_artists (track_id, artist_id, is_primary)
               VALUES ($1, $2, $3)
               ON CONFLICT (track_id, artist_id) DO NOTHING`,
              [trackId, artistId, i === 0] // First artist is primary
            );
          } catch (artistError) {
            console.warn(`Error processing artist ${artist.name}:`, artistError);
          }
        }
      }
      
      // Now connect album to artists if we have both
      if (albumId && artistIds.length > 0) {
        for (let i = 0; i < artistIds.length; i++) {
          try {
            await db.pool.query(
              `INSERT INTO albums_to_artists (album_id, artist_id, is_primary)
               VALUES ($1, $2, $3)
               ON CONFLICT (album_id, artist_id) DO NOTHING`,
              [albumId, artistIds[i], i === 0] // First artist is primary
            );
          } catch (albumArtistError) {
            console.warn(`Error connecting album to artist:`, albumArtistError);
          }
        }
      }
      
      console.log(`Imported track: "${title}" by ${artistName} (ID: ${trackId}, Spotify ID: ${spotifyId})`);
      
    } catch (error) {
      console.error("Error inserting track:", error);
      throw error;
    }
  }
  
  // Helper function to find a track by its Spotify ID
  async function findTrackIdBySpotifyId(spotifyId: string): Promise<number | null> {
    try {
      const result = await db.pool.query(
        `SELECT track_id FROM track_platform_ids 
         WHERE platform = 'spotify' AND platform_id = $1 
         LIMIT 1`,
        [spotifyId]
      );
      
      if (result.rows && result.rows.length > 0) {
        return result.rows[0].track_id;
      }
      
      return null;
    } catch (error) {
      console.error("Error finding track by Spotify ID:", error);
      return null;
    }
  }
  
  // Alternative dedicated track import endpoint with URL that won't be matched by Vite
  app.post("/_songfuse_api/tracks-import", async (req: Request, res: Response) => {
    // Redirect to the main API endpoint
    console.log("Redirecting track import request to the main API endpoint");
    
    // Forward the request to the main API endpoint
    try {
      const { tracks } = req.body;
      
      if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
        return res.status(400).json({ 
          message: "Request must include a 'tracks' array with at least one track",
          status: "error"
        });
      }
      
      // Process the tracks
      const processResult = await processTracksForImport(tracks);
      
      res.status(200).json({ 
        message: `Started importing ${tracks.length} tracks. This will happen in the background.`,
        status: "success",
        tracksCount: tracks.length,
        processId: processResult.processId || "background-import-" + Date.now()
      });
    } catch (error) {
      console.error("Track import error:", error);
      return res.status(500).json({ message: "Failed to process track import request" });
    }
  });
  
  // Log confirmation that we're using existing tracks in the database and track import is now enabled
  try {
    // Get count of existing tracks
    const { db } = await import('./db');
    const { tracks } = await import('@shared/schema');
    const tracksCountResult = await db.select({ count: sql`count(*)` }).from(tracks);
    const tracksCount = tracksCountResult?.[0]?.count || 0;
    console.log(`Using ${tracksCount} existing tracks from database (track import is now enabled)`);
  } catch (error) {
    console.error("Error counting tracks:", error);
  }
  
  // Spotify auth routes
  app.get("/api/auth/spotify", (req: Request, res: Response) => {
    try {
      console.log("Spotify auth initiated, generating authorization URL");
      const authUrl = spotify.getAuthorizationUrl();
      console.log(`Generated Spotify auth URL with redirect URI: ${process.env.SPOTIFY_REDIRECT_URI}`);
      res.json({ url: authUrl });
    } catch (error) {
      console.error("Error generating Spotify auth URL:", error);
      res.status(500).json({ error: "Failed to generate Spotify authentication URL" });
    }
  });
  
  // Debug route for checking Spotify credentials
  app.get("/api/auth/spotify/debug", (req: Request, res: Response) => {
    try {
      // Retrieve configuration (hiding sensitive parts)
      const clientIdPrefix = process.env.SPOTIFY_CLIENT_ID ? process.env.SPOTIFY_CLIENT_ID.substring(0, 5) : "undefined";
      const clientSecretPrefix = process.env.SPOTIFY_CLIENT_SECRET ? process.env.SPOTIFY_CLIENT_SECRET.substring(0, 5) : "undefined";
      const redirectUri = process.env.SPOTIFY_REDIRECT_URI || "undefined";
      
      // Generate the authorization URL to verify it's correctly formed
      const authUrl = spotify.getAuthorizationUrl();
      
      // Verify the URL is valid
      let isValidUrl = false;
      try {
        new URL(authUrl);
        isValidUrl = true;
      } catch (urlError) {
        isValidUrl = false;
      }
      
      // Return a diagnostic report
      res.json({
        configuration: {
          clientId: `${clientIdPrefix}... (hidden for security)`,
          clientSecret: `${clientSecretPrefix}... (hidden for security)`,
          redirectUri,
          areCredentialsSet: !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET && process.env.SPOTIFY_REDIRECT_URI)
        },
        authUrl: {
          isValid: isValidUrl,
          url: authUrl,
          startsWithCorrectDomain: authUrl.startsWith("https://accounts.spotify.com/")
        },
        serverInfo: {
          nodeVersion: process.version,
          // Note current time and timezone to help debug expiration issues
          currentTime: new Date().toISOString(),
          timezoneName: Intl.DateTimeFormat().resolvedOptions().timeZone
        }
      });
    } catch (error) {
      console.error("Error in Spotify debug route:", error);
      res.status(500).json({ 
        error: "Debug information could not be generated",
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  });
  
  app.get("/api/auth/callback", async (req: Request, res: Response) => {
    try {
      console.log(`Received auth callback with query params:`, req.query);
      const { code, state, error: spotifyError, error_description } = req.query;
      
      // Handle error response from Spotify
      if (spotifyError) {
        console.error(`Spotify returned an error: ${spotifyError} - ${error_description}`);
        return res.status(400).json({ 
          message: "Spotify authentication failed", 
          error: spotifyError,
          description: error_description
        });
      }
      
      // Validate code parameter
      if (!code || typeof code !== "string") {
        return res.status(400).json({ message: "Authorization code is required" });
      }
      
      // Validate state parameter to prevent CSRF attacks
      if (!state || typeof state !== "string") {
        console.warn("Auth callback received without state parameter, could be CSRF attack");
        return res.status(400).json({ message: "Invalid authentication state" });
      }
      
      // Check if state parameter exists in our tracking object
      if (!global.spotifyAuthState || !global.spotifyAuthState[state]) {
        console.error(`Invalid state parameter: ${state}. State not found in session storage.`);
        return res.status(400).json({ 
          message: "Invalid authentication session", 
          error: "State parameter mismatch" 
        });
      }
      
      // Check if state was already used (prevent replay attacks)
      if (global.spotifyAuthState[state].used) {
        console.error(`State parameter ${state} has already been used!`);
        // Remove the used state
        delete global.spotifyAuthState[state];
        return res.status(400).json({ 
          message: "Authentication session already used", 
          error: "Potential replay attack detected" 
        });
      }
      
      // Check if state has expired (10 minute window)
      const stateTimestamp = global.spotifyAuthState[state].timestamp;
      const expiryTime = Date.now() - (10 * 60 * 1000);
      if (stateTimestamp < expiryTime) {
        console.error(`State parameter ${state} has expired. Created at ${new Date(stateTimestamp).toISOString()}`);
        delete global.spotifyAuthState[state];
        return res.status(400).json({ 
          message: "Authentication session expired", 
          error: "Please try logging in again" 
        });
      }
      
      // Mark state as used to prevent reuse
      global.spotifyAuthState[state].used = true;
      
      // Exchange code for access token
      const tokenData = await spotify.getAccessToken(code);
      
      // Get user profile
      const profile = await spotify.getCurrentUserProfile(tokenData.access_token);
      
      if (!profile || !profile.id) {
        return res.status(400).json({ message: "Failed to get user profile" });
      }
      
      // Check if user exists
      let user = await storage.getUserBySpotifyId(profile.id);
      
      // Create or update user
      if (!user) {
        // Create a new user if not found
        // When using Spotify OAuth authentication, we don't have a traditional password
        // So we'll use a secure randomly generated string as a placeholder
        const secureRandomPassword = Math.random().toString(36).substring(2, 15) + 
                                     Math.random().toString(36).substring(2, 15);
        
        user = await storage.createUser({
          username: profile.display_name || profile.id,
          password: secureRandomPassword, // Add a secure random password to satisfy DB constraint
          spotifyId: profile.id,
          spotifyAccessToken: tokenData.access_token,
          spotifyRefreshToken: tokenData.refresh_token,
          tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000)
        });
        
        console.log(`Created new user for Spotify account: ${profile.id} (${profile.display_name || 'unnamed'})`);
      } else {
        // Update existing user with new tokens
        user = await storage.updateUser(user.id, {
          spotifyAccessToken: tokenData.access_token,
          spotifyRefreshToken: tokenData.refresh_token,
          tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000)
        });
      }
      
      // Only delete the used state parameter instead of clearing the entire state object
      // This prevents other concurrent login attempts from being invalidated
      console.log(`Successfully authenticated with state parameter: ${state}, marking as used`);
      
      // Clean up only expired state parameters to prevent memory leaks
      const now = Date.now();
      const cleanupTime = now - (10 * 60 * 1000); // 10 minutes
      Object.keys(global.spotifyAuthState).forEach(key => {
        if (key !== state && global.spotifyAuthState[key].timestamp < cleanupTime) {
          console.log(`Cleaning up expired state parameter: ${key}`);
          delete global.spotifyAuthState[key];
        }
      });
      
      // Return user data
      const redirectUrl = `/login?userId=${user.id}&username=${encodeURIComponent(user.username)}`;
      res.redirect(redirectUrl);
    } catch (error) {
      console.error("Auth callback error:", error);
      // Add detailed error information to help debug Spotify auth issues
      if (error instanceof Error) {
        console.error(`Error details - Name: ${error.name}, Message: ${error.message}`);
        console.error(`Stack: ${error.stack}`);
        
        // Check for specific errors related to redirect URIs
        if (error.message.includes('redirect_uri_mismatch') || error.message.includes('Invalid redirect URI')) {
          console.error(`REDIRECT URI MISMATCH DETECTED. Current redirect URI: ${process.env.SPOTIFY_REDIRECT_URI}`);
          return res.status(400).json({ 
            message: "Authentication failed due to redirect URI mismatch",
            error: error.message,
            currentRedirectUri: process.env.SPOTIFY_REDIRECT_URI,
            solution: "Please ensure the redirect URI configured in Spotify Developer Dashboard matches the SPOTIFY_REDIRECT_URI environment variable"
          });
        }
      }
      
      res.status(500).json({ message: "Authentication failed", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
  
  // Get user
  app.get("/api/user/:id", async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.id);
      let user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check if token is expired
      if (user.tokenExpiresAt && user.tokenExpiresAt < new Date()) {
        if (user.spotifyRefreshToken) {
          try {
            const refreshData = await spotify.refreshAccessToken(user.spotifyRefreshToken);
            user = await storage.updateUser(user.id, {
              spotifyAccessToken: refreshData.access_token,
              tokenExpiresAt: new Date(Date.now() + refreshData.expires_in * 1000)
            });
          } catch (error) {
            return res.status(401).json({ message: "Failed to refresh token" });
          }
        } else {
          return res.status(401).json({ message: "Token expired" });
        }
      }

      // Get user profile from Spotify
      try {
        if (user.spotifyAccessToken) {
          const spotifyProfile = await spotify.getCurrentUserProfile(user.spotifyAccessToken);
          
          res.json({
            id: user.id,
            username: user.username,
            spotifyId: user.spotifyId,
            profile: {
              displayName: spotifyProfile.display_name,
              email: spotifyProfile.email,
              imageUrl: spotifyProfile.images?.[0]?.url
            }
          });
        } else {
          // Return basic user info without Spotify profile if no access token
          res.json({
            id: user.id,
            username: user.username,
            spotifyId: user.spotifyId,
            profile: {
              displayName: user.username,
              email: null,
              imageUrl: null
            }
          });
        }
      } catch (spotifyError) {
        console.error("Error fetching Spotify profile:", spotifyError);
        // Return basic user info if Spotify profile fetch fails
        res.json({
          id: user.id,
          username: user.username,
          spotifyId: user.spotifyId,
          profile: {
            displayName: user.username,
            email: null,
            imageUrl: null
          }
        });
      }
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ message: "Failed to get user" });
    }
  });
  
  // Generate a cover image for a playlist
  app.post("/api/cover/generate", async (req: Request, res: Response) => {
    try {
      const { userId, title, description, tracks, customPrompt, improvePrompt } = req.body;
      
      if (!userId || !title) {
        return res.status(400).json({ message: "userId and title are required" });
      }

      const user = await storage.getUser(parseInt(userId));
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      try {
        let finalImagePrompt;

        if (customPrompt) {
          // User provided a custom prompt
          console.log("Using user-provided custom prompt:", customPrompt);
          finalImagePrompt = customPrompt;
        } else if (improvePrompt) {
          // User wants AI to improve their prompt
          console.log("Improving user prompt:", improvePrompt);
          // Generate an improved description based on the user's basic prompt
          const improvedDescription = await openai.generateCoverImageDescription(
            title, description, tracks, improvePrompt
          );
          console.log("AI improved description:", improvedDescription);
          finalImagePrompt = improvedDescription;
        } else {
          // No custom prompt, generate a description based on playlist info
          console.log("Generating automatic cover description based on playlist info");
          finalImagePrompt = await openai.generateCoverImageDescription(title, description, tracks);
        }
        
        console.log("Final image generation prompt:", finalImagePrompt);
        
        // Generate image with GPT-Image-1 (don't pass playlistId as boolean)
        const coverImageUrl = await openai.generateCoverImage(finalImagePrompt);
        
        // Return the generated image URL and the prompt used
        return res.json({ 
          coverImageUrl,
          promptUsed: finalImagePrompt 
        });
      } catch (genError) {
        console.error("Error in image generation:", genError);
        
        // Return error instead of default cover
        return res.status(500).json({ 
          message: "Failed to generate cover image",
          error: genError.message 
        });
      }
    } catch (error) {
      console.error("Cover generation error:", error);
      res.status(500).json({ message: "Failed to generate cover image" });
    }
  });

  // Save playlist to database and optionally to Spotify
  app.post("/api/playlist/save", async (req: Request, res: Response) => {
    try {
      const { userId, title, description, coverImageUrl, tracks, isPublic, skipSpotify } = req.body;
      
      console.log("Save playlist request received:", { userId, title, tracks: tracks?.length, skipSpotify });
      
      if (!userId || !title || !tracks || !Array.isArray(tracks)) {
        return res.status(400).json({ message: "userId, title, and tracks array are required" });
      }

      const user = await storage.getUser(parseInt(userId));
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      
      let spotifyPlaylist = null;
      let spotifyUrl = null;
      let spotifyId = null;
      
      // Only try to save to Spotify if user has proper authentication and skipSpotify flag is not true
      if (!skipSpotify && user.spotifyAccessToken && user.spotifyId) {
        try {
          console.log("Creating playlist on Spotify for user:", user.spotifyId);
          
          // Truncate description to comply with Spotify limits (300 characters max)
          const truncatedDesc = description ? description.substring(0, 300) : "";
          console.log("Creating playlist with description length:", truncatedDesc.length);
          
          // Create playlist on Spotify
          spotifyPlaylist = await spotify.createPlaylist(
            user.spotifyAccessToken,
            user.spotifyId,
            title,
            truncatedDesc,
            isPublic !== false
          );
          
          console.log("Playlist created successfully:", spotifyPlaylist.id);
          
          // Set values for response
          spotifyId = spotifyPlaylist.id;
          spotifyUrl = spotifyPlaylist.external_urls.spotify;

          // Add tracks to the playlist
          const trackUris = tracks.map(track => {
            // Ensure track ID is valid and in correct format
            if (!track.id) {
              console.error("Missing track ID:", track);
              return null;
            }
            // Clean up ID to ensure proper format
            const cleanId = track.id.replace('spotify:track:', '');
            return `spotify:track:${cleanId}`;
          }).filter(uri => uri !== null) as string[];
          
          // Log the first few track URIs for debugging
          console.log("Track URIs sample:", trackUris.slice(0, 3));
          console.log(`Total track URIs: ${trackUris.length}`);
          
          await spotify.addTracksToPlaylist(user.spotifyAccessToken, spotifyPlaylist.id, trackUris);
          console.log("Added tracks to playlist");

          // Upload custom cover if provided
          if (coverImageUrl) {
            try {
              console.log("Preparing to upload cover image for playlist:", spotifyPlaylist.id);
              
              // Convert image URL to base64 for Spotify API
              const base64Image = await imageUrlToBase64(coverImageUrl);
              
              if (!base64Image) {
                console.error("Failed to convert image to base64, skipping cover upload");
              } else {
                console.log("Successfully converted image to base64, uploading to Spotify...");
                
                // Add a short delay to ensure the playlist is fully created before uploading image
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                await spotify.uploadPlaylistCoverImage(user.spotifyAccessToken, spotifyPlaylist.id, base64Image);
                console.log("Successfully uploaded cover image to Spotify");
              }
            } catch (imgError) {
              console.error("Failed to upload cover image:", imgError);
              // Don't fail the whole request if image upload fails
            }
          }
        } catch (spotifyError) {
          console.error("Spotify API error:", spotifyError);
          
          // Check if the token might be expired
          if (user.tokenExpiresAt && user.tokenExpiresAt < new Date()) {
            // Try to refresh the token
            try {
              if (user.spotifyRefreshToken) {
                console.log("Token expired, attempting to refresh");
                const refreshData = await spotify.refreshAccessToken(user.spotifyRefreshToken);
                await storage.updateUser(user.id, {
                  spotifyAccessToken: refreshData.access_token,
                  tokenExpiresAt: new Date(Date.now() + refreshData.expires_in * 1000)
                });
                return res.status(401).json({ 
                  message: "Token refreshed. Please try again.",
                  tokenRefreshed: true
                });
              }
            } catch (refreshError) {
              console.error("Token refresh error:", refreshError);
            }
          }
          
          // Continue with database-only approach
          console.log("Spotify save failed, continuing with database-only save");
        }
      } else {
        console.log("Skipping Spotify save due to missing auth or skipSpotify=true");
      }

      // Check if this is an update to an existing playlist
      let existingPlaylistId = req.body.playlistId ? parseInt(req.body.playlistId) : null;
      let playlist;
      
      // If we have an existing playlist ID and it belongs to this user, update it
      if (existingPlaylistId) {
        const existingPlaylist = await storage.getPlaylist(existingPlaylistId);
        if (existingPlaylist && existingPlaylist.userId === parseInt(userId)) {
          playlist = await storage.updatePlaylist(existingPlaylistId, {
            title,
            description: description || "",
            spotifyId, // Will be null if Spotify save was skipped or failed
            spotifyUrl,
            coverImageUrl
          });
          console.log("Updated existing playlist in database:", playlist.id);
          
          // Delete existing songs to replace them with the new ones
          await storage.deleteSongsByPlaylistId(existingPlaylistId);
        } else {
          existingPlaylistId = null; // Reset if the playlist doesn't exist or doesn't belong to user
        }
      }
      
      // If no existing playlist or couldn't update, check for duplicates by title
      if (!existingPlaylistId) {
        // Check if a playlist with the same title already exists for this user
        // This helps prevent duplicate playlist creation during auto-save retries
        try {
          const existingPlaylistsByTitle = await storage.getPlaylistsByTitle(parseInt(userId), title);
          
          if (existingPlaylistsByTitle && existingPlaylistsByTitle.length > 0) {
            // Use the most recently created playlist with the same title
            const mostRecentPlaylist = existingPlaylistsByTitle[0];
            console.log(`Found existing playlist with title "${title}", using ID ${mostRecentPlaylist.id} instead of creating a new one`);
            
            // Update the playlist details
            playlist = await storage.updatePlaylist(mostRecentPlaylist.id, {
              title,
              description: description || "",
              spotifyId, // Will be null if Spotify save was skipped or failed
              spotifyUrl,
              coverImageUrl
            });
            
            // Delete existing songs to replace them with the new ones
            await storage.deleteSongsByPlaylistId(mostRecentPlaylist.id);
          } else {
            // Create a new playlist if no matching title was found
            playlist = await storage.createPlaylist({
              userId: parseInt(userId),
              title,
              description: description || "",
              spotifyId, // Will be null if Spotify save was skipped or failed
              spotifyUrl,
              coverImageUrl
            });
            console.log("Created new playlist in database:", playlist.id);
          }
        } catch (error) {
          console.error("Error checking for existing playlists:", error);
          // Fallback to creating a new playlist if the check fails
          playlist = await storage.createPlaylist({
            userId: parseInt(userId),
            title,
            description: description || "",
            spotifyId, // Will be null if Spotify save was skipped or failed
            spotifyUrl,
            coverImageUrl
          });
          console.log("Created new playlist in database (after error):", playlist.id);
        }
      }

      // Check for duplicates before saving tracks to database
      console.log("Checking for duplicate tracks before saving...");
      const uniqueTrackIds = new Set<string>();
      const uniqueTracks: any[] = [];
      
      // First pass: identify unique tracks to save
      for (const track of tracks) {
        if (!track.id) {
          console.warn("Track missing ID, skipping:", track.name);
          continue;
        }
        
        // If we haven't seen this track ID before, add it
        if (!uniqueTrackIds.has(track.id)) {
          uniqueTrackIds.add(track.id);
          uniqueTracks.push(track);
        } else {
          console.log(`Removing duplicate track: ${track.name} (ID: ${track.id})`);
        }
      }
      
      // If we found and removed duplicates, log a summary
      if (uniqueTracks.length < tracks.length) {
        console.log(`Removed ${tracks.length - uniqueTracks.length} duplicate tracks. Original: ${tracks.length}, Unique: ${uniqueTracks.length}`);
      } else {
        console.log("No duplicate tracks found.");
      }
      
      // Save only unique tracks to our database
      console.log(`Creating ${uniqueTracks.length} songs and establishing track-song relationships...`);
      for (let i = 0; i < uniqueTracks.length; i++) {
        const track = uniqueTracks[i];
        // Create the song record
        const newSong = await storage.createSong({
          playlistId: playlist.id,
          spotifyId: track.id,
          title: track.name || track.title || "Unknown Track",
          artist: (track.artists && Array.isArray(track.artists)) ? track.artists.map((a: any) => a.name).join(", ") : (track.artist || "Unknown Artist"),
          album: (track.album && track.album.name) ? track.album.name : (track.albumName || "Unknown Album"),
          albumImageUrl: (track.album && track.album.images && track.album.images[0]) ? track.album.images[0].url : (track.albumImageUrl || null),
          durationMs: track.duration_ms || 0,
          position: i
        });
        
        // Create relationship with our actual tracks database
        try {
          console.log(`Creating track-song relationship for song #${i+1}: "${track.name}" (Spotify ID: ${track.id})`);
          
          // Find corresponding track in our database using Spotify ID
          const { rows } = await db.pool.query(`
            SELECT track_id 
            FROM track_platform_ids 
            WHERE platform = 'spotify' AND platform_id = '${track.id}'
            LIMIT 1
          `);
          
          if (rows && rows.length > 0) {
            const trackId = rows[0].track_id;
            console.log(`✓ Found matching track ID: ${trackId}`);
            
            // Create relationship
            await db.pool.query(`
              INSERT INTO tracks_songs (song_id, track_id)
              VALUES (${newSong.id}, ${trackId})
              ON CONFLICT DO NOTHING
            `);
            
            console.log(`✓ Created track-song relationship: song ${newSong.id} → track ${trackId}`);
            
            // Verify relationship was created
            const verifyResult = await db.pool.query(`
              SELECT * FROM tracks_songs WHERE song_id = ${newSong.id} AND track_id = ${trackId}
            `);
            
            if (verifyResult.rows && verifyResult.rows.length > 0) {
              console.log(`✓ Verified relationship exists in database`);
            } else {
              console.log(`⚠ Warning: Relationship creation may have failed, not found in database`);
            }
          } else {
            console.log(`⚠ Warning: No matching track found in database for "${track.name}" (ID: ${track.id})`);
          }
        } catch (error) {
          console.error(`Failed to create track-song relationship for "${track.name}":`, error);
          // Continue with the next song even if this one fails
        }
      }
      console.log(`Saved ${uniqueTracks.length} unique tracks to database with track-song relationships`);

      res.json({
        id: playlist.id,
        spotifyId,
        spotifyUrl,
        savedToSpotify: !!spotifyId
      });
    } catch (error) {
      console.error("Save playlist error:", error);
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Unknown error occurred';
      res.status(500).json({ message: `Failed to save playlist: ${errorMessage}` });
    }
  });

  // Get user's playlists
  app.get("/api/playlists", async (req: Request, res: Response) => {
    try {
      const userId = req.query.userId as string;
      
      if (!userId) {
        return res.status(400).json({ message: "userId is required" });
      }

      const user = await storage.getUser(parseInt(userId));
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get playlists from our database - these are the ones created with Songfuse
      const dbPlaylists = await storage.getPlaylistsByUserId(parseInt(userId));
      
      // Map database playlists to the expected format
      const playlists = await Promise.all(dbPlaylists.map(async (dbPlaylist) => {
        let coverImage = dbPlaylist.coverImageUrl;
        let trackCount = 0;
        let spotifyUrl = '';
        
        // If the playlist has a Spotify ID, fetch additional details from Spotify
        if (dbPlaylist.spotifyId && user.spotifyAccessToken) {
          try {
            let accessToken = user.spotifyAccessToken;
            let tokenRefreshed = false;
            
            try {
              // First attempt with current token
              const spotifyDetails = await spotify.getPlaylistDetails(
                accessToken,
                dbPlaylist.spotifyId
              );
              
              // Use Spotify data when available
              // Try to select a square image if possible, or default to the first one
              const images = spotifyDetails.images || [];
              let bestImage = images[0]?.url;
              
              // Look for square images (where width === height)
              const squareImage = images.find(img => img.width === img.height);
              if (squareImage) {
                bestImage = squareImage.url;
              }
              
              coverImage = coverImage || bestImage || null;
              trackCount = spotifyDetails.tracks.total;
              spotifyUrl = spotifyDetails.external_urls.spotify;
            } catch (error) {
              // Check if this is a token expiration error (401)
              if (error.message?.includes('401') && user.spotifyRefreshToken) {
                console.log(`Token expired for user ${user.id}, attempting refresh...`);
                
                try {
                  // Refresh the token
                  const refreshedTokens = await spotify.refreshAccessToken(user.spotifyRefreshToken);
                  
                  // Update user's token in database
                  const tokenExpiresAt = new Date();
                  tokenExpiresAt.setSeconds(tokenExpiresAt.getSeconds() + refreshedTokens.expires_in);
                  
                  await storage.updateUserTokens(
                    user.id,
                    refreshedTokens.access_token,
                    user.spotifyRefreshToken,
                    tokenExpiresAt
                  );
                  
                  accessToken = refreshedTokens.access_token;
                  tokenRefreshed = true;
                  
                  // Try again with the new token
                  const spotifyDetails = await spotify.getPlaylistDetails(
                    accessToken,
                    dbPlaylist.spotifyId
                  );
                  
                  const images = spotifyDetails.images || [];
                  let bestImage = images[0]?.url;
                  
                  const squareImage = images.find(img => img.width === img.height);
                  if (squareImage) {
                    bestImage = squareImage.url;
                  }
                  
                  coverImage = coverImage || bestImage || null;
                  trackCount = spotifyDetails.tracks.total;
                  spotifyUrl = spotifyDetails.external_urls.spotify;
                } catch (refreshError) {
                  console.error(`Failed to refresh token for user ${user.id}:`, refreshError);
                  throw refreshError; // Rethrow to be caught by outer catch
                }
              } else {
                // If it's not a token issue or we don't have a refresh token, rethrow
                throw error;
              }
            }
          } catch (err) {
            console.log(`Could not fetch Spotify details for playlist ${dbPlaylist.id}:`, err);
            // Continue with the data we have from the database
          }
        }
        
        // If we couldn't get track count from Spotify, count tracks in our database
        if (trackCount === 0) {
          const songs = await storage.getSongsByPlaylistId(dbPlaylist.id);
          trackCount = songs.length;
        }
        
        return {
          id: dbPlaylist.id,
          spotifyId: dbPlaylist.spotifyId || null,
          title: dbPlaylist.title,
          description: dbPlaylist.description || '',
          coverImage: coverImage || null,
          trackCount: trackCount,
          spotifyUrl: spotifyUrl || ''
        };
      }));
      
      res.json(playlists);
    } catch (error) {
      console.error("Get playlists error:", error);
      res.status(500).json({ message: "Failed to get playlists" });
    }
  });
  
  // Delete a playlist
  app.delete("/api/playlist/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.query.userId as string;
      
      if (!userId) {
        return res.status(400).json({ message: "userId is required" });
      }

      const playlist = await storage.getPlaylist(parseInt(id));
      if (!playlist) {
        return res.status(404).json({ message: "Playlist not found" });
      }

      if (playlist.userId !== parseInt(userId)) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      await storage.deletePlaylist(parseInt(id));
      res.json({ success: true });
    } catch (error) {
      console.error("Delete playlist error:", error);
      res.status(500).json({ message: "Failed to delete playlist" });
    }
  });
  
  // Delete a song from a playlist
  app.delete("/api/playlist/:id/song/:position", async (req: Request, res: Response) => {
    try {
      const { id, position } = req.params;
      const userId = req.query.userId as string;
      
      if (!userId) {
        return res.status(400).json({ message: "userId is required" });
      }
      
      const playlistId = parseInt(id);
      const songPosition = parseInt(position);
      
      if (isNaN(playlistId) || isNaN(songPosition)) {
        return res.status(400).json({ message: "Invalid playlist ID or song position" });
      }
      
      // Get the user
      const user = await storage.getUser(parseInt(userId));
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Get the playlist
      const playlist = await storage.getPlaylist(playlistId);
      if (!playlist) {
        return res.status(404).json({ message: "Playlist not found" });
      }
      
      // Make sure the playlist belongs to the user
      if (playlist.userId !== parseInt(userId)) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      // Get all songs for this playlist
      const songs = await storage.getSongsByPlaylistId(playlistId);
      
      // Find the song at the specified position
      const songToDelete = songs.find(song => song.position === songPosition);
      if (!songToDelete) {
        return res.status(404).json({ message: "Song not found at that position" });
      }
      
      // Delete the song
      await storage.deleteSong(songToDelete.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete song error:", error);
      res.status(500).json({ message: "Failed to delete song" });
    }
  });
  
  // Export a playlist to Spotify
  app.post("/api/playlist/:id/export", async (req: Request, res: Response) => {
    try {
      const playlistId = parseInt(req.params.id);
      const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
      
      if (isNaN(playlistId) || !userId || isNaN(userId)) {
        return res.status(400).json({ message: "Invalid playlist ID or user ID" });
      }
      
      // Get the user for Spotify token
      const user = await storage.getUser(userId);
      if (!user || !user.spotifyAccessToken) {
        return res.status(401).json({ message: "User not logged in or Spotify token missing" });
      }
      
      // Get the playlist details
      const playlist = await storage.getPlaylist(playlistId);
      if (!playlist) {
        return res.status(404).json({ message: "Playlist not found" });
      }
      
      // Check if playlist is already saved to Spotify
      if (playlist.spotifyId) {
        return res.status(200).json({ 
          message: "Playlist already saved to Spotify",
          spotifyId: playlist.spotifyId,
          spotifyUrl: playlist.spotifyUrl || undefined
        });
      }
      
      // Get playlist songs
      const songs = await storage.getSongsByPlaylistId(playlistId);
      if (!songs || songs.length === 0) {
        return res.status(400).json({ message: "Playlist has no songs" });
      }
      
      // Get track IDs from songs
      const trackIds = songs.map(song => song.spotifyId);
      
      // Create the playlist on Spotify
      let refreshResponse = null;
      try {
        // First get the user's Spotify profile to get their ID
        const profile = await spotify.getCurrentUserProfile(user.spotifyAccessToken);
        
        // Try to create playlist with current token
        const playlistResponse = await spotify.createPlaylist(
          user.spotifyAccessToken,
          profile.id,
          playlist.title,
          playlist.description || ""
        );
        
        // Now add the tracks to the playlist
        if (trackIds.length > 0) {
          console.log("Raw track IDs from database:", JSON.stringify(trackIds));
          
          // Format IDs into Spotify URIs properly, handling any prefixed IDs
          const formattedTrackUris = trackIds.map(id => {
            // If ID already has spotify:track prefix, use as is
            if (id.startsWith("spotify:track:")) {
              return id;
            }
            // Extract just the ID if it includes a prefix but isn't properly formatted
            if (id.includes("spotify:track:")) {
              const actualId = id.split("spotify:track:")[1];
              return `spotify:track:${actualId}`;
            }
            // Regular case - add prefix to ID
            return `spotify:track:${id}`;
          });
          
          await spotify.addTracksToPlaylist(
            user.spotifyAccessToken,
            playlistResponse.id,
            formattedTrackUris
          );
        }
        
        const spotifyId = playlistResponse.id;
        const spotifyUrl = playlistResponse.external_urls.spotify;
        
        // If there's a cover image, upload it to Spotify
        if (playlist.coverImageUrl) {
          try {
            // Convert the image to base64
            const base64Image = await imageUrlToBase64(playlist.coverImageUrl);
            
            // Upload the image to Spotify
            await spotify.uploadPlaylistCoverImage(
              user.spotifyAccessToken,
              spotifyId,
              base64Image
            );
          } catch (imageError) {
            console.error("Error uploading cover image to Spotify:", imageError);
            // We'll continue even if the image upload fails
          }
        }
        
        // Update the playlist in our database with Spotify ID and URL
        await storage.updatePlaylist(playlist.id, {
          spotifyId,
          spotifyUrl
        });
        
        return res.status(200).json({
          spotifyId,
          spotifyUrl,
          message: "Playlist exported to Spotify successfully"
        });
      } catch (error: any) {
        // If token expired, try to refresh it and try again
        if (error.message && error.message.includes("token") && user.spotifyRefreshToken) {
          try {
            console.log("Refreshing token and trying again");
            refreshResponse = await spotify.refreshAccessToken(user.spotifyRefreshToken);
            
            // Update user with new token
            await storage.updateUser(user.id, {
              spotifyAccessToken: refreshResponse.access_token
            });
            
            // Get the user's Spotify profile with the refreshed token
            const profile = await spotify.getCurrentUserProfile(refreshResponse.access_token);
            
            // Try again with new token
            const playlistResponse = await spotify.createPlaylist(
              refreshResponse.access_token,
              profile.id,
              playlist.title,
              playlist.description || ""
            );
            
            // Add the tracks to the playlist
            if (trackIds.length > 0) {
              // Format IDs into Spotify URIs properly
              const formattedTrackUris = trackIds.map(id => {
                // If ID already has spotify:track prefix, use as is
                if (id.startsWith("spotify:track:")) {
                  return id;
                }
                // Extract just the ID if it includes a prefix but isn't properly formatted
                if (id.includes("spotify:track:")) {
                  const actualId = id.split("spotify:track:")[1];
                  return `spotify:track:${actualId}`;
                }
                // Regular case - add prefix to ID
                return `spotify:track:${id}`;
              });
              
              await spotify.addTracksToPlaylist(
                refreshResponse.access_token,
                playlistResponse.id,
                formattedTrackUris
              );
            }
            
            const spotifyId = playlistResponse.id;
            const spotifyUrl = playlistResponse.external_urls.spotify;
            
            // If there's a cover image, upload it to Spotify
            if (playlist.coverImageUrl) {
              try {
                // Convert the image to base64
                const base64Image = await imageUrlToBase64(playlist.coverImageUrl);
                
                // Upload the image to Spotify
                await spotify.uploadPlaylistCoverImage(
                  refreshResponse.access_token,
                  spotifyId,
                  base64Image
                );
              } catch (imageError) {
                console.error("Error uploading cover image to Spotify:", imageError);
                // We'll continue even if the image upload fails
              }
            }
            
            // Update the playlist in our database with Spotify ID and URL
            await storage.updatePlaylist(playlist.id, {
              spotifyId,
              spotifyUrl
            });
            
            return res.status(200).json({
              spotifyId,
              spotifyUrl,
              message: "Playlist exported to Spotify successfully after token refresh"
            });
          } catch (refreshError) {
            console.error("Error refreshing token:", refreshError);
            return res.status(401).json({ message: "Failed to refresh Spotify token. Please log in again." });
          }
        }
        
        throw error;
      }
    } catch (error: any) {
      console.error("Error exporting playlist to Spotify:", error);
      res.status(500).json({ message: `Failed to export playlist to Spotify: ${error.message || "Unknown error"}` });
    }
  });

  // Get details for a specific playlist by ID or Spotify ID
  app.get("/api/playlist/:idOrSpotifyId", async (req: Request, res: Response) => {
    try {
      const { idOrSpotifyId } = req.params;
      const userId = req.query.userId as string;
      
      if (!userId || !idOrSpotifyId) {
        return res.status(400).json({ message: "userId and playlist identifier are required" });
      }

      const user = await storage.getUser(parseInt(userId));
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // First, try to interpret the parameter as a numeric ID (our database ID)
      let dbPlaylist;
      const numericId = parseInt(idOrSpotifyId);
      
      if (!isNaN(numericId)) {
        // It's a numeric ID, so look up by database ID
        dbPlaylist = await storage.getPlaylist(numericId);
      } else {
        // It's not a numeric ID, so try as Spotify ID
        dbPlaylist = await storage.getPlaylistBySpotifyId(idOrSpotifyId);
      }
      
      if (!dbPlaylist) {
        return res.status(404).json({ message: "Playlist not found" });
      }
      
      // If we have a Spotify ID and user has a Spotify token, fetch Spotify details
      if (dbPlaylist.spotifyId && user.spotifyAccessToken) {
        try {
          // Try to get additional details from Spotify
          const spotifyPlaylist = await spotify.getPlaylistDetails(
            user.spotifyAccessToken, 
            dbPlaylist.spotifyId
          );
          
          // Get the tracks from Spotify
          const spotifyTracks = spotifyPlaylist.tracks.items.map(item => ({
            id: item.track.id,
            name: item.track.name,
            artists: item.track.artists,
            album: item.track.album,
            duration_ms: item.track.duration_ms,
            preview_url: item.track.preview_url
          }));
          
          // Debug log for preview URLs
          if (spotifyTracks.length > 0) {
            console.log("Playlist details sample track preview URL:", spotifyTracks[0].preview_url);
          }
          
          res.json({
            id: dbPlaylist.id,
            spotifyId: spotifyPlaylist.id,
            title: spotifyPlaylist.name || dbPlaylist.title,
            description: spotifyPlaylist.description || dbPlaylist.description,
            coverImage: selectBestImage(spotifyPlaylist.images) || dbPlaylist.coverImageUrl || null,
            tracks: spotifyTracks,
            spotifyUrl: spotifyPlaylist.external_urls.spotify
          });
          
          return;
        } catch (spotifyError) {
          console.error("Error fetching Spotify playlist details:", spotifyError);
          // Continue with database-only approach
        }
      }
      
      // If we got here, either there's no Spotify ID, no Spotify token, 
      // or we failed to get Spotify data. Use database data only.
      
      // Get the songs for this playlist from our database
      const songs = await storage.getSongsByPlaylistId(dbPlaylist.id);
      
      // Convert database songs to SpotifyTrack format
      // We need to fetch additional data for each song
      const tracks = [];
      
      for (const song of songs) {
        try {
          // Try to get the track from our database first
          const { getTrackBySpotifyId } = await import('./db');
          const trackData = await getTrackBySpotifyId(song.spotifyId);
          
          if (trackData) {
            tracks.push(trackData);
            // Log sample track info
            if (tracks.length === 1 || tracks.length === 2) {
              console.log("Playlist details sample track info:", {
                id: trackData.id,
                name: trackData.name,
                preview_url: trackData.preview_url,
                has_preview: !!trackData.preview_url
              });
            }
          }
        } catch (trackErr) {
          console.error(`Error getting track data for song ${song.id}:`, trackErr);
          // Skip this track
        }
      }
      
      // Construct Spotify URL if we have a Spotify ID
      const spotifyUrl = dbPlaylist.spotifyId ? 
        `https://open.spotify.com/playlist/${dbPlaylist.spotifyId}` : 
        dbPlaylist.spotifyUrl || '';
      
      res.json({
        id: dbPlaylist.id,
        spotifyId: dbPlaylist.spotifyId || null,
        title: dbPlaylist.title,
        description: dbPlaylist.description || '',
        coverImage: dbPlaylist.coverImageUrl || null,
        tracks: tracks,
        spotifyUrl: spotifyUrl
      });
    } catch (error) {
      console.error("Get playlist details error:", error);
      res.status(500).json({ message: "Failed to get playlist details" });
    }
  });

  // AI Chat for playlist generation
  app.post('/api/playlist/generate-metadata', async (req: Request, res: Response) => {
    try {
      const { tracks, prompt, articleData } = req.body;
      
      if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Missing or invalid tracks array"
        });
      }
      
      // Make prompt optional with fallback to empty string
      const userPrompt = typeof prompt === 'string' ? prompt : '';
      
      console.log(`Generating title and description for playlist with ${tracks.length} tracks and prompt: "${userPrompt.substring(0, 50)}..."`);
      console.log("Article data provided:", articleData);
      
      // Import both OpenAI functions
      const { generatePlaylistTitleAndDescription, generatePlaylistIdeas } = await import('./openai');
      
      try {
        // Try the enhanced metadata generation first
        console.log("Using enhanced title and description generation method");
        const metadata = await generatePlaylistTitleAndDescription(tracks, userPrompt, articleData);
        
        // Return the enhanced metadata
        return res.status(200).json({
          success: true,
          title: metadata.title,
          description: metadata.description,
          method: "enhanced"
        });
      } catch (enhancedError) {
        // Log the error but don't fail - try the fallback method
        console.warn("Enhanced metadata generation failed, falling back to standard method:", 
          enhancedError instanceof Error ? enhancedError.message : "Unknown error");
        
        // Fall back to the original method
        console.log("Falling back to standard title and description generation method");
        const fallbackMetadata = await generatePlaylistIdeas(userPrompt, tracks);
        
        // Return the fallback metadata with a flag indicating we used the fallback
        return res.status(200).json({
          success: true,
          title: fallbackMetadata.title,
          description: fallbackMetadata.description,
          method: "fallback",
          fallbackReason: enhancedError instanceof Error ? enhancedError.message : "Unknown error"
        });
      }
    } catch (error) {
      console.error("Error generating playlist metadata:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to generate playlist metadata",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  app.post("/api/chat/generate", async (req: Request, res: Response) => {
    try {
      const { userId, sessionId, message, articleData } = req.body;
      
      if (!userId || !sessionId || !message) {
        return res.status(400).json({ message: "userId, sessionId, and message are required" });
      }
      
      // Initialize progress tracking for this session
      startProgressTracking(sessionId);
      
      // Update progress - prompt analysis started
      updateProgress(sessionId, {
        step: 'prompt_analysis',
        message: 'Analyzing your music request...',
        percentage: 20,
        status: 'in_progress'
      });

      const user = await storage.getUser(parseInt(userId));
      if (!user || !user.spotifyAccessToken) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      // Store the user message
      await storage.createChatMessage({
        userId: parseInt(userId),
        sessionId,
        content: message,
        isUser: true
      });
      
      // Update progress - prompt analysis
      updateProgress(sessionId, {
        step: 'prompt_analysis',
        message: 'Understanding your music taste...',
        percentage: 40,
        status: 'in_progress'
      });
      
      // Start timing the playlist generation
      console.time('playlist_generation_total');
      console.log("Processing chat message for playlist generation:", message);
      
      // Log article data if provided
      if (articleData) {
        console.log("Article-based playlist generation requested with data:", articleData);
      }
      
      // Track which method we used for playlist generation
      let usedMcpMethod = false;
      let songSuggestions;
      let mcpResults;
      
      // First try to use the MCP system for faster, better playlist generation
      try {
        console.log("Attempting to use MCP system for playlist generation...");
        
        // Update progress - finishing prompt analysis
        updateProgress(sessionId, {
          step: 'prompt_analysis',
          message: 'Understood your preferences! Moving to track selection...',
          percentage: 100,
          status: 'completed'
        });
        
        // Update progress - starting track selection
        updateProgress(sessionId, {
          step: 'track_selection',
          message: 'Finding the perfect tracks for your playlist...',
          percentage: 20,
          status: 'in_progress'
        });
        
        mcpResults = await openai.generatePlaylistWithMCP(message);
        usedMcpMethod = true;
        console.log("Successfully used MCP for playlist generation");
        
        // Update progress - track selection complete
        updateProgress(sessionId, {
          step: 'track_selection',
          message: 'Found the perfect tracks for your playlist!',
          percentage: 100,
          status: 'completed'
        });
        
        // Update progress - start playlist organization
        updateProgress(sessionId, {
          step: 'playlist_organization',
          message: 'Organizing your playlist for the best listening experience...',
          percentage: 30,
          status: 'in_progress'
        });
      } catch (mcpError) {
        console.error("MCP playlist generation failed, falling back to standard method:", mcpError);
        
        // Update progress - track selection fallback
        updateProgress(sessionId, {
          step: 'track_selection',
          message: 'Trying alternative approach to find perfect tracks...',
          percentage: 30,
          status: 'in_progress',
          details: 'Using specialized search methods to match your taste.'
        });
        
        // Fall back to standard song recommendations if MCP fails
        const results = await openai.generateSongRecommendations(message);
        songSuggestions = results.songs;
        
        // Update progress - track selection progress
        updateProgress(sessionId, {
          step: 'track_selection',
          message: 'Found track recommendations. Searching for matches...',
          percentage: 60,
          status: 'in_progress'
        });
      }
      
      // If we successfully used MCP, use those tracks directly
      // Otherwise, we need to find matching tracks for the song suggestions
      let tracks: SpotifyTrack[] = [];
      
      // Check for explicit content requests
      const avoidExplicit = 
        message.toLowerCase().includes("clean") || 
        message.toLowerCase().includes("no explicit") ||
        message.toLowerCase().includes("family friendly") ||
        message.toLowerCase().includes("kid friendly");
      
      if (avoidExplicit) {
        console.log("User requested clean/non-explicit content - filtering will be applied");
      }
      
      let initialTracks: SpotifyTrack[] = [];
      
      if (usedMcpMethod && mcpResults && mcpResults.tracks.length > 0) {
        console.log("Using tracks directly from MCP");
        // Use the MCP tracks directly
        initialTracks = mcpResults.tracks;
        tracks = mcpResults.tracks;
        console.log(`MCP provided ${tracks.length} tracks`);
        
        // Skip all the search and track matching steps when using MCP results
        console.log("Using MCP tracks directly - skipping database and Spotify search");
      } else {
        // Original approach when MCP isn't available
        console.log("OpenAI recommended songs:", JSON.stringify(songSuggestions, null, 2));
        
        // Generate search queries for each song
        console.log("Searching for tracks matching AI recommendations...");
        
        // First try searching in our database
        for (const suggestion of songSuggestions || []) {
          if (initialTracks.length >= 50) break;
          
          const query = `${suggestion.title} ${suggestion.artist}`;
          console.log(`Searching database for: ${query}`);
          
          try {
            // Search our database first (with silent mode to suppress [GENERAL SEARCH] logs)
            const dbTracks = await db.searchTracks(
              query,
              10,
              0,
              avoidExplicit, 
              undefined,
              suggestion.genre ? [suggestion.genre] : undefined,
              [],  // no decades filter
              true // silent mode
            );
            
            if (dbTracks && dbTracks.length > 0) {
              console.log(`Found ${dbTracks.length} matching tracks in database`);
              
              // Add new tracks, avoiding duplicates
              const existingIds = new Set(initialTracks.map(t => t.id));
              
              for (const track of dbTracks) {
                if (!existingIds.has(track.id)) {
                  initialTracks.push(track);
                  existingIds.add(track.id);
                }
              }
            } else {
              console.log(`No matches found in database for: ${query}`);
            }
          } catch (error) {
            console.error(`Error searching database for "${query}":`, error);
          }
        }
        
        console.log(`Found ${initialTracks.length} tracks in database`);
        
        // Skip Spotify recommendations entirely and use only basic Spotify search if needed
        if (initialTracks.length < 10 && user.spotifyAccessToken) {
          // Regular search if we don't have enough tracks
          console.log("Not enough tracks found, falling back to simple Spotify search");
          try {
            const spotifyTracks = await spotify.searchTracks(user.spotifyAccessToken, message, 50, avoidExplicit);
            
            // Get IDs of tracks we already have to avoid duplicates
            const existingIds = new Set(initialTracks.map(t => t.id));
            
            // Add only Spotify tracks we do not already have
            const uniqueSpotifyTracks = spotifyTracks.filter(t => !existingIds.has(t.id));
            
            initialTracks = [...initialTracks, ...uniqueSpotifyTracks];
            console.log(`After adding Spotify search results, we have ${initialTracks.length} tracks total`);
            
            // Import tracks to our database in the background
            for (const track of spotifyTracks) {
              try {
                db.importTrackFromSpotify(track).catch(err => {
                  console.error("Error importing track to database:", err);
                });
              } catch (error) {
                console.error("Error queuing track import:", error);
              }
            }
          } catch (searchError) {
            console.error("Spotify search error:", searchError);
            console.log("Continuing with database tracks only");
          }
        } else {
          console.log("Using tracks from multi-platform database (sufficient quantity found)");
        }
        
        // Filter out tracks with zero or undefined duration
        initialTracks = initialTracks.filter(track => {
          if (!track.duration_ms || track.duration_ms === 0) {
            console.warn(`Filtered out track with zero duration: ${track.name} by ${track.artists.map(a => a.name).join(', ')}`);
            return false;
          }
          return true;
        });
        
        console.log(`After filtering, ${initialTracks.length} tracks remain with valid duration`);
        
        // If filtering removed too many tracks, try to get more
        if (initialTracks.length < 10 && user.spotifyAccessToken) {
          console.log("Need more tracks after duration filtering, trying alternative search");
          const alternativeQuery = message + " popular";
          const moreTracks = await spotify.searchTracks(user.spotifyAccessToken, alternativeQuery, 30, avoidExplicit);
          
          // Filter these tracks as well
          const validMoreTracks = moreTracks.filter(track => track.duration_ms && track.duration_ms > 0);
          
          // Add only tracks we don't already have
          const existingIds = new Set(initialTracks.map(t => t.id));
          for (const track of validMoreTracks) {
            if (!existingIds.has(track.id)) {
              initialTracks.push(track);
              existingIds.add(track.id);
            }
          }
          
          console.log(`Added ${validMoreTracks.length} additional tracks with valid duration`);
        }
        
        // Select tracks from search results
        tracks = initialTracks.slice(0, 24);
        console.log(`Selected ${tracks.length} tracks from search results`);
      }
      
      // Skip track enrichment steps if using MCP tracks directly
      if (!usedMcpMethod || !mcpResults || mcpResults.tracks.length < 24) {
        // Only try to find more tracks if we're not using MCP or MCP didn't provide enough
        if (tracks.length < 24) {
          console.log(`Not enough tracks from initial search (only ${tracks.length}), will try to find more`);
          
          // Ensure we have exactly 24 tracks
          console.log(`Not enough unique artists (only ${tracks.length}), adding more tracks from initial results`);
          
          // Add more tracks from initialTracks, avoiding duplicates
          const existingIds = new Set(tracks.map(t => t.id));
          
          for (const track of initialTracks) {
            if (!existingIds.has(track.id) && tracks.length < 24) {
              tracks.push(track);
              existingIds.add(track.id);
            }
            
            // Stop when we reach 24 tracks
            if (tracks.length >= 24) break;
          }
        }
      }
      
      console.log(`Selected ${tracks.length} diverse tracks with both artist diversity and randomization`);
      
      // As a last resort, if we still don't have enough tracks and we're not using MCP,
      // use direct search with Spotify
      if (!usedMcpMethod && tracks.length < 24 && user.spotifyAccessToken) {
        console.log(`Still not enough tracks (only ${tracks.length}), using Spotify direct search as last resort`);
        
        // Use remaining AI suggestions we haven't found matches for
        const remainingSuggestions = (songSuggestions || []).filter(suggestion => {
          const matchingTrack = tracks.find(t => 
            t.name.toLowerCase().includes(suggestion.title.toLowerCase()) &&
            t.artists.some(a => a.name.toLowerCase().includes(suggestion.artist.toLowerCase()))
          );
          return !matchingTrack;
        });
        
        // Search for remaining suggestions directly on Spotify
        for (const suggestion of remainingSuggestions) {
          if (tracks.length >= 24) break;
          
          const searchQuery = `${suggestion.title} ${suggestion.artist}`;
          const results = await spotify.searchTracks(user.spotifyAccessToken, searchQuery, 2, avoidExplicit);
          
          // Add the tracks we found if they don't already exist
          if (results && results.length > 0) {
            const existingIds = new Set(tracks.map(t => t.id));
            for (const track of results) {
              if (!existingIds.has(track.id) && tracks.length < 24) {
                tracks.push(track);
                existingIds.add(track.id);
              }
            }
          }
        }
        
        // Use a list of alternative search queries if we still need more tracks
        const alternativeQueries = [message + " popular", message + " hits", message + " best"];
        const existingIds = new Set(tracks.map(t => t.id));
        
        // Try each alternative query until we have enough tracks
        for (const query of alternativeQueries) {
          if (tracks.length >= 24) break;
          
          try {
            const moreTracks = await spotify.searchTracks(user.spotifyAccessToken, query, 40, avoidExplicit);
            
            // Filter for valid tracks with duration and no duplicates
            const validTracks = moreTracks.filter(track => 
              track.duration_ms && 
              track.duration_ms > 0 && 
              !existingIds.has(track.id)
            );
            
            // Add new tracks
            for (const track of validTracks) {
              if (tracks.length >= 24) break;
              tracks.push(track);
              existingIds.add(track.id);
            }
            
            console.log(`Added ${Math.min(validTracks.length, 24 - (tracks.length - validTracks.length))} tracks from query "${query}"`);
          } catch (err) {
            console.error(`Error searching with query "${query}":`, err);
          }
        }
      }

      // Get playlist title and description
      let title, description;
      
      // Update progress - track selection completed if not already updated
      if (!usedMcpMethod) {
        updateProgress(sessionId, {
          step: 'track_selection',
          message: `Selected ${tracks.length} perfect tracks for your playlist!`,
          percentage: 100,
          status: 'completed'
        });
      }
      
      // Update progress - start playlist organization
      updateProgress(sessionId, {
        step: 'playlist_organization',
        message: 'Creating the perfect flow for your playlist...',
        percentage: 10,
        status: 'in_progress'
      });
      
      // Small delay to show progress to user
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Update progress - organizing tracks
      updateProgress(sessionId, {
        step: 'playlist_organization',
        message: 'Organizing tracks for the best listening experience...',
        percentage: 30,
        status: 'in_progress'
      });
      
      if (usedMcpMethod && mcpResults) {
        // Use title and description from MCP results
        console.log("Using title and description from MCP");
        title = mcpResults.title;
        description = mcpResults.description;
        
        // Update progress - obtained playlist details
        updateProgress(sessionId, {
          step: 'playlist_organization',
          message: 'Crafting a beautiful title and description...',
          percentage: 60,
          status: 'in_progress'
        });
      } else {
        // Generate playlist details using the new enhanced approach
        console.log("Generating playlist details with enhanced OpenAI approach");
        
        // Update progress - preparing playlist metadata
        updateProgress(sessionId, {
          step: 'playlist_organization',
          message: 'Creating the perfect title and description...',
          percentage: 50,
          status: 'in_progress'
        });
        
        try {
          // Try the new improved title/description generator first
          const enhancedMetadata = await openai.generatePlaylistTitleAndDescription(tracks, message, articleData);
          title = enhancedMetadata.title;
          description = enhancedMetadata.description;
          console.log("Successfully generated enhanced title and description");
        } catch (metadataError) {
          // Fall back to standard approach if enhanced fails
          console.error("Enhanced metadata generation failed, falling back to standard approach:", metadataError);
          const playlistIdeas = await openai.generatePlaylistIdeas(message, tracks);
          title = playlistIdeas.title;
          description = playlistIdeas.description;
        }
        
        // Update progress - metadata generation successful
        updateProgress(sessionId, {
          step: 'playlist_organization',
          message: 'Created a unique title and description!',
          percentage: 70,
          status: 'in_progress'
        });
      }
      
      // Update progress - finalizing playlist organization
      updateProgress(sessionId, {
        step: 'playlist_organization',
        message: 'Finalizing your playlist structure...',
        percentage: 90,
        status: 'in_progress'
      });
      
      // Small delay to show progress to user
      await new Promise(resolve => setTimeout(resolve, 400));
      
      // Update progress - playlist organization complete
      updateProgress(sessionId, {
        step: 'playlist_organization',
        message: 'Playlist organization complete!',
        percentage: 100,
        status: 'completed'
      });
      
      // Save AI response
      const aiResponseText = `I've created a playlist called "${title}" with ${tracks.length} songs based on your request. The description is: "${description}". You can preview the tracks, modify them, and adjust the title and description before saving to Spotify.`;
      
      await storage.createChatMessage({
        userId: parseInt(userId),
        sessionId,
        content: aiResponseText,
        isUser: false
      });
      
      // Update progress - starting final assembly
      updateProgress(sessionId, {
        step: 'final_assembly',
        message: 'Putting the finishing touches on your playlist...',
        percentage: 40,
        status: 'in_progress'
      });
      
      // Small delay to show progress to user
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Update progress - assembling playlist data
      updateProgress(sessionId, {
        step: 'final_assembly',
        message: 'Assembling your complete playlist experience...',
        percentage: 70,
        status: 'in_progress'
      });
      
      // Small delay to show progress to user
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Update progress - final assembly almost complete
      updateProgress(sessionId, {
        step: 'final_assembly',
        message: 'Almost ready! Preparing your playlist for preview...',
        percentage: 90,
        status: 'in_progress'
      });
      
      // Return the playlist WITHOUT the cover image
      // The client will request a cover image separately to improve perceived performance
      res.json({
        message: aiResponseText,
        usedMcp: usedMcpMethod, // Add flag to indicate if MCP was used
        playlist: {
          title: title,
          description: description,
          coverImageUrl: "", // Empty string instead of null to avoid client-side issues
          tracks,
          sourceMethod: usedMcpMethod ? "vector" : "standard" // Indicate the source method used
        }
      });
      
      // No longer automatically generating cover images
      // Cover images will be generated on-demand when requested by the user
      console.log("Automatic cover image generation disabled - user will need to generate a cover manually");
    } catch (error) {
      console.error("Generate playlist error:", error);
      
      // Update progress to show error
      try {
        updateProgress(sessionId, {
          step: 'final_assembly',
          message: 'Encountered an issue creating your playlist.',
          percentage: 100,
          status: 'failed',
          details: 'Please try again with a different prompt.'
        });
        
        // Complete progress tracking
        completeProgressTracking(sessionId);
      } catch (progressError) {
        console.error("Error updating progress tracking:", progressError);
      }
      
      res.status(500).json({ message: "Failed to generate playlist" });
    }
  });

  // Track replacement API using MCP vector search
  app.post("/api/track/replace", async (req: Request, res: Response) => {
    try {
      const { sessionId, trackId, artistName, trackName, customQuery, playlistTracks, previousSuggestions } = req.body;

      if (!sessionId || !trackId) {
        return res.status(400).json({ error: "Missing session ID or track ID" });
      }

      // Get the first user for now (since we're not persisting session in memory storage)
      // In a production app, we'd use proper authentication here
      const users = await storage.getUsers();
      const user = users[0];

      if (!user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const userId = user.id;

      // Generate a query for replacement track based on the original track and current playlist context
      let queryText;
      let avoidExplicit = false;

      if (customQuery) {
        queryText = customQuery;
        // Check if the custom query suggests avoiding explicit content
        avoidExplicit = customQuery.toLowerCase().includes("clean") || 
                       customQuery.toLowerCase().includes("no explicit") ||
                       customQuery.toLowerCase().includes("family friendly");
      } else {
        // For replacement, use the track name and artist as the query
        // We'll also add the session ID which can have context about the playlist
        const queryResult = await openai.generateReplacementTrackQuery(
          trackName,
          artistName,
          sessionId
        );

        queryText = queryResult.searchQuery;
        avoidExplicit = queryResult.avoidExplicit;
      }

      if (!queryText) {
        return res.status(500).json({ error: "Failed to generate replacement query" });
      }

      console.log(`Searching for replacement tracks with query: ${queryText}, avoidExplicit: ${avoidExplicit}`);
      
      // First try using MCP vector search for better-quality replacements
      let vectorResults = [];
      let searchResults = [];
      
      try {
        // Import and use vector search from MCP
        const { findTracksByVectorSimilarity } = await import('./mcp/vector-search');
        
        // Perform vector search with the query
        vectorResults = await findTracksByVectorSimilarity(
          { query: queryText, avoidExplicit }, 
          20 // Get enough results for filtering
        );
        
        console.log(`Vector search found ${vectorResults.length} potential track matches`);
        
        if (vectorResults.length > 0) {
          // Fetch full track details
          const { db } = await import('./db');
          const { dbTrackToSpotifyTrack } = await import('./db');
          const { tracks } = await import('@shared/schema');
          const { eq } = await import('drizzle-orm');
          
          const trackIds = vectorResults.map(result => result.id);
          
          // Fetch tracks individually to avoid SQL array issues
          for (const trackId of trackIds) {
            const [track] = await db
              .select()
              .from(tracks)
              .where(eq(tracks.id, trackId));
            
            if (track) {
              const spotifyTrack = await dbTrackToSpotifyTrack(track);
              if (spotifyTrack) {
                searchResults.push(spotifyTrack);
              }
            }
          }
          
          console.log(`Successfully retrieved ${searchResults.length} tracks from vector search`);
        }
      } catch (vectorError) {
        console.error('Error using vector search for track replacement:', vectorError);
      }
      
      // If vector search didn't return enough results, fall back directly to Spotify search
      if (searchResults.length < 5 && user.spotifyAccessToken) {
        console.log('Not enough results from vector search, falling back to Spotify API');
        try {
          // Ensure we have a valid token
          let accessToken = user.spotifyAccessToken;
          if (user.spotifyRefreshToken) {
            try {
              const tokens = await spotify.refreshAccessToken(user.spotifyRefreshToken);
              accessToken = tokens.access_token;
            } catch (err) {
              console.error("Failed to refresh token:", err);
              // Continue with the existing token
            }
          }
          
          const spotifyResults = await spotify.searchTracks(accessToken, queryText, 10, avoidExplicit);
          
          // Add Spotify results to our search results, avoiding duplicates
          const existingIds = new Set(searchResults.map(track => track.id));
          for (const track of spotifyResults) {
            if (!existingIds.has(track.id)) {
              searchResults.push(track);
              existingIds.add(track.id);
            }
          }
        } catch (spotifyError) {
          console.error('Error searching Spotify:', spotifyError);
        }
      }
      
      // Filter out tracks with zero or undefined duration
      searchResults = searchResults.filter(track => {
        if (!track.duration_ms || track.duration_ms === 0) {
          console.warn(`Filtered out track with zero duration: ${track.name}`);
          return false;
        }
        return true;
      });

      // Create sets of track IDs to filter out
      const playlistTrackIds = new Set(playlistTracks?.map((t: any) => t.id) || []);
      const previousSuggestionIds = new Set(previousSuggestions || []);

      // Check if we want to allow tracks by the same artist
      const allowSameArtist = sessionId.toLowerCase().includes("same artist") || 
                             queryText.toLowerCase().includes("same artist") ||
                             queryText.toLowerCase().includes("by this artist");

      // Filter out original track, tracks already in playlist, and previously suggested tracks
      const alternativeTracks = searchResults.filter((track: any) => {
        // Always filter out the exact same track
        if (track.id === trackId) return false;

        // Filter out tracks already in the playlist
        if (playlistTrackIds.has(track.id)) {
          return false;
        }

        // Filter out tracks previously suggested for this track
        if (previousSuggestionIds.has(track.id)) {
          return false;
        }

        // Filter out tracks by the same artist unless explicitly allowed
        if (!allowSameArtist) {
          const trackArtists = track.artists.map((a: any) => a.name.toLowerCase());
          if (artistName && trackArtists.includes(artistName.toLowerCase())) return false;
        }

        return true;
      }).slice(0, 5); // Limit to 5 alternatives

      // Generate reasons for the recommended tracks
      const alternatives = alternativeTracks.map((track: any) => {
        let reason = "";
        
        // If this was a vector search result, highlight that it's using our advanced matching
        const vectorResult = vectorResults.find(vr => vr.id === parseInt(track.id));
        if (vectorResult) {
          reason = `${Math.round(vectorResult.similarity * 100)}% match to "${trackName}" using advanced vector similarity`;
        } else {
          // For non-vector results, use a generic reason
          reason = `Similar to "${trackName}" with a complementary style and energy`;
        }

        return {
          track,
          reason: reason + "."
        };
      });

      res.json({ 
        alternatives,
        originalQuery: queryText,
        usedVectorSearch: vectorResults.length > 0
      });
    } catch (error) {
      console.error("Error getting track replacements:", error);
      res.status(500).json({ error: "Failed to get replacement tracks" });
    }
  });
  
  // Discover API endpoints
  app.get("/api/discover/playlists", async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string || "20");
      const offset = parseInt(req.query.offset as string || "0");
      const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
      
      console.log(`Getting public playlists with limit: ${limit}, offset: ${offset}`);
      
      const playlists = await storage.getPublicPlaylists(limit, offset, userId);
      
      // Get creator usernames and song counts for each playlist
      const playlistsWithDetails = await Promise.all(playlists.map(async (playlist) => {
        const creator = await storage.getUser(playlist.userId);
        const songCount = await storage.getSongsByPlaylistId(playlist.id).then(songs => songs.length);
        
        return {
          ...playlist,
          creatorName: creator?.username || "Unknown User",
          songCount
        };
      }));
      
      res.json(playlistsWithDetails);
    } catch (error) {
      console.error('Error fetching public playlists:', error);
      res.status(500).json({ message: "Failed to fetch public playlists" });
    }
  });
  
  // GET endpoint for searching playlists
  app.get("/api/discover/search", async (req: Request, res: Response) => {
    try {
      const query = req.query.q as string || "";
      const limit = parseInt(req.query.limit as string || "20");
      const offset = parseInt(req.query.offset as string || "0");
      const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
      const isPublicOnly = req.query.isPublic === 'true';
      
      console.log(`Searching playlists with query: "${query}", limit: ${limit}, offset: ${offset}, isPublicOnly: ${isPublicOnly}`);
      
      if (!query.trim()) {
        // If no query provided, return all public playlists
        // Include isPublic parameter if set
        const redirectUrl = `/api/discover/playlists?limit=${limit}&offset=${offset}${userId ? `&userId=${userId}` : ''}${isPublicOnly ? '&isPublic=true' : ''}`;
        console.log(`Redirecting to: ${redirectUrl}`);
        return res.redirect(redirectUrl);
      }
      
      // storage.searchPlaylists already filters for public playlists by default (isPublic=true in the implementation)
      const playlists = await storage.searchPlaylists(query, limit, offset, userId);
      
      // Get creator usernames and song counts for each playlist
      const playlistsWithDetails = await Promise.all(playlists.map(async (playlist) => {
        const creator = await storage.getUser(playlist.userId);
        const songCount = await storage.getSongsByPlaylistId(playlist.id).then(songs => songs.length);
        
        return {
          ...playlist,
          creatorName: creator?.username || "Unknown User",
          songCount
        };
      }));
      
      res.json(playlistsWithDetails);
    } catch (error) {
      console.error('Error searching playlists:', error);
      res.status(500).json({ message: "Failed to search playlists" });
    }
  });
  
  // POST endpoint for searching multiple songs in the database
  app.post("/api/discover/search", async (req: Request, res: Response) => {
    try {
      const { songs } = req.body;
      
      if (!songs || !Array.isArray(songs) || songs.length === 0) {
        return res.status(400).json({ message: "No songs provided for search" });
      }
      
      console.log(`Searching for ${songs.length} songs in the database`);
      
      // Get the user for Spotify API fallback
      const user = await storage.getUser(1); // Get default user
      
      const results = [];
      
      // Search for each song in the database
      for (const song of songs) {
        const { title, artist, query } = song;
        
        // Check if we have a valid query
        if (!title && !artist && !query) {
          results.push({
            status: 'not_found',
            song: { title, artist },
            message: 'Invalid search parameters'
          });
          continue;
        }
        
        // Try to search by title and artist first
        const searchQuery = query || `${title} ${artist}`.trim();
        // Use silent mode to suppress [GENERAL SEARCH] logs
        const dbTracks = await db.searchTracks(searchQuery, 5, 0, false, null, [], [], true);
        
        if (dbTracks && dbTracks.length > 0) {
          // Found in database
          results.push({
            status: 'found',
            track: dbTracks[0],
            song: { title, artist }
          });
        } else {
          // If not found in database, try with Spotify if available
          if (user?.spotifyAccessToken) {
            try {
              // Ensure fresh token
              let accessToken = user.spotifyAccessToken;
              if (user.spotifyRefreshToken) {
                try {
                  const tokens = await spotify.refreshAccessToken(user.spotifyRefreshToken);
                  accessToken = tokens.access_token;
                } catch (err) {
                  console.error("Failed to refresh token:", err);
                }
              }
              
              // Search Spotify
              const spotifyTracks = await spotify.searchTracks(accessToken, searchQuery, 1, false);
              
              if (spotifyTracks && spotifyTracks.length > 0) {
                // Import track from Spotify to our database
                try {
                  const importedTrack = await db.importTrackFromSpotify(spotifyTracks[0], accessToken);
                  results.push({
                    status: 'found',
                    track: importedTrack,
                    song: { title, artist }
                  });
                  continue;
                } catch (importErr) {
                  console.error("Error importing track:", importErr);
                }
              }
            } catch (spotifyErr) {
              console.error("Error searching Spotify:", spotifyErr);
            }
          }
          
          // Not found anywhere
          results.push({
            status: 'not_found',
            song: { title, artist },
            message: 'Track not found in database or Spotify'
          });
        }
      }
      
      res.json({ results });
    } catch (error) {
      console.error('Error searching for songs:', error);
      res.status(500).json({ message: "Failed to search for songs" });
    }
  });
  
  app.get("/api/discover/artist/:artistName", async (req: Request, res: Response) => {
    try {
      const artistName = req.params.artistName;
      const limit = parseInt(req.query.limit as string || "20");
      const offset = parseInt(req.query.offset as string || "0");
      const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
      const isPublicOnly = req.query.isPublic === 'true';
      
      console.log(`Searching playlists by artist: "${artistName}", limit: ${limit}, offset: ${offset}, isPublicOnly: ${isPublicOnly}`);
      
      if (!artistName.trim()) {
        return res.status(400).json({ message: "Artist name is required" });
      }
      
      // For non-logged in users, ensure we only search for public playlists
      // Note: searchPlaylistsByArtist already filters for isPublic=true by default
      const playlists = await storage.searchPlaylistsByArtist(artistName, limit, offset, userId);
      
      // Get creator usernames and song counts for each playlist
      const playlistsWithDetails = await Promise.all(playlists.map(async (playlist) => {
        const creator = await storage.getUser(playlist.userId);
        const songCount = await storage.getSongsByPlaylistId(playlist.id).then(songs => songs.length);
        
        return {
          ...playlist,
          creatorName: creator?.username || "Unknown User",
          songCount
        };
      }));
      
      res.json(playlistsWithDetails);
    } catch (error) {
      console.error('Error searching playlists by artist:', error);
      res.status(500).json({ message: "Failed to search playlists by artist" });
    }
  });

  // Search user's own playlists by artist name
  app.get("/api/my-playlists/artist/:artistName", async (req: Request, res: Response) => {
    try {
      const artistName = req.params.artistName;
      const limit = parseInt(req.query.limit as string || "20");
      const offset = parseInt(req.query.offset as string || "0");
      const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
      
      console.log(`Searching user playlists by artist: "${artistName}" for user ${userId}`);
      
      if (!artistName.trim()) {
        return res.status(400).json({ message: "Artist name is required" });
      }
      
      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }
      
      // Search playlists by artist, but include both public and private playlists for the user
      const playlists = await storage.searchPlaylistsByArtist(artistName, limit, offset, userId);
      
      // Filter to only return playlists owned by this specific user
      const userPlaylists = playlists.filter(playlist => playlist.userId === userId);
      
      // Get track counts for each playlist using the new method
      const playlistsWithCounts = await Promise.all(userPlaylists.map(async (playlist) => {
        try {
          const songCount = await storage.getSongsByPlaylistId(playlist.id).then(songs => songs.length);
          
          return {
            id: playlist.id,
            spotifyId: playlist.spotifyId,
            title: playlist.title,
            description: playlist.description,
            coverImage: playlist.coverImageUrl,
            trackCount: songCount,
            spotifyUrl: playlist.spotifyUrl || '',
            spotifyImageUrl: playlist.spotifyImageUrl || undefined
          };
        } catch (error) {
          console.error(`Error getting track count for playlist ${playlist.id}:`, error);
          return {
            id: playlist.id,
            spotifyId: playlist.spotifyId,
            title: playlist.title,
            description: playlist.description,
            coverImage: playlist.coverImageUrl,
            trackCount: 0,
            spotifyUrl: playlist.spotifyUrl || '',
            spotifyImageUrl: playlist.spotifyImageUrl || undefined
          };
        }
      }));
      
      res.json(playlistsWithCounts);
    } catch (error) {
      console.error('Error searching user playlists by artist:', error);
      res.status(500).json({ message: "Failed to search user playlists by artist" });
    }
  });
  
  app.get("/api/discover/playlist/:id", async (req: Request, res: Response) => {
    try {
      const playlistId = parseInt(req.params.id);
      
      if (isNaN(playlistId)) {
        return res.status(400).json({ message: "Invalid playlist ID" });
      }
      
      const result = await storage.getPlaylistWithSongs(playlistId);
      
      if (!result) {
        return res.status(404).json({ message: "Playlist not found or not public" });
      }
      
      // Get the creator's username
      const creator = await storage.getUser(result.playlist.userId);
      
      res.json({
        ...result,
        creatorName: creator?.username || "Unknown User"
      });
    } catch (error) {
      console.error('Error fetching public playlist details:', error);
      res.status(500).json({ message: "Failed to fetch playlist details" });
    }
  });
  
  // API endpoint to export all tracks from our database
  app.get("/api/tracks/export", async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string || "5000");
      const offset = parseInt(req.query.offset as string || "0");
      
      console.log(`Exporting tracks with limit: ${limit}, offset: ${offset}`);
      
      // Get all tracks from the database
      const tracks = await import('./db').then(db => db.getAllTracks(limit, offset));
      
      // Set appropriate headers for file download
      res.setHeader('Content-Disposition', 'attachment; filename="songfuse-tracks.json"');
      res.setHeader('Content-Type', 'application/json');
      
      // Return the tracks as JSON
      res.json(tracks);
    } catch (error) {
      console.error('Error exporting tracks:', error);
      res.status(500).json({ message: "Failed to export tracks" });
    }
  });

  // Direct Assistant API endpoint for playlist generation
  // This endpoint uses a special prefix to bypass Vite middleware and connect directly to OpenAI
  app.post('/_songfuse_api/playlist/direct-assistant', async (req: Request, res: Response) => {
    // Set explicit content type and accept headers to ensure proper JSON response
    res.setHeader('Content-Type', 'application/json');
    
    // Generate a unique session ID for tracking
    const sessionId = crypto.randomUUID();
    console.log(`Starting direct assistant playlist generation with session ID: ${sessionId}`);
    
    try {
      // Extract the user prompt and article data from the request
      const { prompt, articleData } = req.body;
      
      if (!prompt) {
        return res.status(400).json({ 
          success: false, 
          message: "Missing 'prompt' field in request body",
          error: "MISSING_PROMPT" 
        });
      }
      
      // Log the request details
      console.log(`Direct Assistant API - Received prompt: "${prompt.substring(0, 100)}..."`);
      if (articleData) {
        console.log("Direct Assistant API - Article data provided:", articleData);
      }
      console.time(`direct-assistant-${sessionId}`);
      
      // Import necessary services
      const OpenAI = await import('openai');
      
      // Prioritize production API key when available
      const apiKey = process.env.OPENAI_API_KEY_PROD || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          success: false,
          message: "OpenAI API key not configured",
          error: "MISSING_API_KEY"
        });
      }
      
      console.log('[Direct Assistant] 🔐 Using ' + 
        (apiKey === process.env.OPENAI_API_KEY_PROD ? 'PRODUCTION' : 'DEVELOPMENT') + 
        ' OpenAI API key');
      
      const openai = new OpenAI.default({ apiKey });
      
      // Log the request timing
      const startTime = Date.now();
      console.log(`Direct Assistant API - Starting request at ${new Date().toISOString()}`);
      
      // Create a thread with the user's prompt, enhanced with article context if available
      let enhancedPrompt = prompt;
      
      if (articleData && articleData.title && articleData.link) {
        enhancedPrompt = `I want to create a playlist inspired by this news article:

Article Title: "${articleData.title}"
Article Link: ${articleData.link}

User Request: ${prompt}

Please create a playlist that captures the themes, mood, and energy of this news story while incorporating the user's specific request. The playlist should feel connected to the article's themes.`;
        
        console.log("Enhanced prompt for article-based playlist:", enhancedPrompt.substring(0, 200) + "...");
      }
      
      const thread = await openai.beta.threads.create({
        messages: [
          {
            role: "user",
            content: enhancedPrompt
          }
        ]
      });
      
      console.log(`Created thread with ID: ${thread.id}`);
      
      // Run the assistant on the thread
      // NOTE: This is currently configured to use the development assistant
      const assistantId = process.env.OPENAI_ASSISTANT_ID;
      
      if (!assistantId) {
        throw new Error("Missing OPENAI_ASSISTANT_ID environment variable");
      }
      
      console.log(`Running assistant ${assistantId} on thread ${thread.id}`);
      
      const run = await openai.beta.threads.runs.create(
        thread.id,
        { assistant_id: assistantId }
      );
      
      console.log(`Created run with ID: ${run.id}`);
      
      // Poll for completion with timeout
      let complete = false;
      let runResult = run;
      let pollCount = 0;
      const maxPolls = 100; // Safety limit
      const pollInterval = 500; // ms
      
      while (!complete && pollCount < maxPolls) {
        // Get the latest run status
        runResult = await openai.beta.threads.runs.retrieve(
          thread.id,
          run.id
        );
        
        pollCount++;
        
        // Check if the run is complete
        if (runResult.status === 'completed') {
          complete = true;
          console.log(`Run completed after ${pollCount} polls`);
        } else if (runResult.status === 'failed' || runResult.status === 'cancelled' || runResult.status === 'expired') {
          throw new Error(`Run failed with status: ${runResult.status}`);
        } else {
          // Wait before polling again
          await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
      }
      
      if (!complete) {
        throw new Error(`Run timed out after ${pollCount} polls`);
      }
      
      // Retrieve the assistant's response
      const messages = await openai.beta.threads.messages.list(
        thread.id
      );
      
      const assistantMessages = messages.data.filter(msg => msg.role === 'assistant');
      
      if (assistantMessages.length === 0) {
        throw new Error("No assistant messages found in the thread");
      }
      
      // Get the latest message from the assistant
      const latestMessage = assistantMessages[0];
      const responseContent = latestMessage.content[0];
      
      // Check if we got a text response
      if (responseContent.type !== 'text') {
        throw new Error(`Unexpected response type: ${responseContent.type}`);
      }
      
      // Parse the response as JSON
      const responseText = responseContent.text.value;
      console.log(`Received response: ${responseText.substring(0, 200)}...`);
      
      // Log timing information
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      console.log(`Direct Assistant API - Request completed in ${duration.toFixed(2)} seconds`);
      console.timeEnd(`direct-assistant-${sessionId}`);
      
      // Attempt to parse JSON from the response
      try {
        // First, check if the response is wrapped in a markdown code block
        let cleanedResponse = responseText;
        if (responseText.startsWith('```json') || responseText.startsWith('```')) {
          // Extract content between markdown code block indicators
          cleanedResponse = responseText
            .replace(/^```json\s*\n/, '') // Remove opening ```json
            .replace(/^```\s*\n/, '')     // Or just ```
            .replace(/\n```\s*$/, '');    // Remove closing ```
          
          console.log(`Detected markdown code block, cleaned response: ${cleanedResponse.substring(0, 100)}...`);
        }
        
        // Now try to parse the cleaned response
        const jsonResponse = JSON.parse(cleanedResponse);
        console.log("Successfully parsed JSON response");
        
        // Return the successful response
        return res.status(200).json({
          success: true,
          response: jsonResponse,
          timing: {
            duration: duration,
            startTime: new Date(startTime).toISOString(),
            endTime: new Date(endTime).toISOString(),
            pollCount: pollCount
          }
        });
      } catch (jsonError) {
        console.error("Failed to parse JSON from assistant response:", jsonError);
        console.log("Raw response:", responseText);
        
        // Return the raw text if JSON parsing fails
        return res.status(200).json({
          success: true,
          rawResponse: responseText,
          warning: "Failed to parse JSON from assistant response",
          timing: {
            duration: duration,
            startTime: new Date(startTime).toISOString(),
            endTime: new Date(endTime).toISOString(),
            pollCount: pollCount
          }
        });
      }
    } catch (error) {
      console.error("Error in direct assistant API:", error);
      
      // Check if error response is HTML instead of JSON (Vite middleware interference)
      const errorMessage = error.message || 'Unknown error';
      const isHtmlResponse = errorMessage.includes('<!DOCTYPE html>') || 
                             errorMessage.includes('<html') ||
                             errorMessage.includes('</body>');
      
      if (isHtmlResponse) {
        console.error("CRITICAL ERROR: Received HTML response instead of JSON. This indicates Vite middleware interference.");
        return res.status(500).json({
          success: false,
          message: "Received HTML instead of JSON - Vite middleware interference",
          error: "VITE_MIDDLEWARE_INTERFERENCE"
        });
      }
      
      // Return a proper error response
      return res.status(500).json({
        success: false,
        message: errorMessage,
        error: "ASSISTANT_API_ERROR"
      });
    }
  });

  // Smart Links endpoints
  app.post('/api/smart-links', async (req, res) => {
    try {
      console.log('Smart link creation request:', req.body);
      const { playlistId, promotedTrackId, customCoverImage, title, description } = req.body;
      
      // Validate required fields
      if (!playlistId || !promotedTrackId || !title) {
        console.error('Missing required fields:', { playlistId, promotedTrackId, title });
        return res.status(400).json({ message: 'Missing required fields: playlistId, promotedTrackId, and title are required' });
      }
      
      // Generate a unique share ID
      const shareId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      
      const smartLinkData = {
        shareId,
        playlistId: parseInt(playlistId),
        promotedTrackId: parseInt(promotedTrackId),
        customCoverImage: customCoverImage || null,
        title,
        description: description || null,
        views: 0
      };
      
      console.log('Creating smart link with data:', smartLinkData);
      const newSmartLink = await storage.createSmartLink(smartLinkData);
      console.log('Smart link created successfully:', newSmartLink);
      res.setHeader('Content-Type', 'application/json');
      res.status(200).json(newSmartLink);
    } catch (error) {
      console.error('Error creating smart link:', error);
      res.status(500).json({ message: 'Failed to create smart link', error: error.message });
    }
  });

  // Check if playlist has smart link
  app.get('/api/playlists/:playlistId/smart-link', async (req, res) => {
    try {
      const playlistId = parseInt(req.params.playlistId);
      const smartLink = await storage.getSmartLinkByPlaylistId(playlistId);
      
      if (smartLink) {
        res.json({ exists: true, smartLink });
      } else {
        res.json({ exists: false });
      }
    } catch (error) {
      console.error('Error checking smart link for playlist:', error);
      res.status(500).json({ message: 'Failed to check smart link' });
    }
  });

  app.get('/api/users/:userId/smart-links', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const smartLinks = await storage.getSmartLinksByUserId(userId);
      res.json(smartLinks);
    } catch (error) {
      console.error('Error fetching user smart links:', error);
      res.status(500).json({ message: 'Failed to fetch smart links' });
    }
  });

  // New endpoint for playlist ID-based smart links
  app.get('/api/smart-links/playlist/:playlistId', async (req, res) => {
    try {
      const playlistId = parseInt(req.params.playlistId);
      console.log(`Looking for smart link for playlist ${playlistId}`);
      
      // First try to get an existing smart link for this playlist
      const existingSmartLink = await storage.getSmartLinkByPlaylistId(playlistId);
      console.log(`Found existing smart link:`, existingSmartLink ? 'YES' : 'NO');
      if (existingSmartLink) {
        console.log(`Returning smart link with promotedTrackId: ${existingSmartLink.promotedTrackId}`);
        // Return the existing smart link data with proper promoted track info
        return res.json(existingSmartLink);
      }
      
      // If no smart link exists, get the playlist data and create a basic response
      const playlist = await storage.getPlaylist(playlistId);
      if (!playlist) {
        return res.status(404).json({ message: 'Playlist not found' });
      }
      
      // Create a smart link response format compatible with existing format
      const smartLinkResponse = {
        id: playlistId,
        shareId: `playlist-${playlistId}`, // Generate a consistent share ID
        playlist: {
          id: playlist.id,
          title: playlist.title,
          description: playlist.description,
          coverImageUrl: playlist.coverImageUrl,
          spotifyId: playlist.spotifyId,
          articleTitle: playlist.articleTitle,
          articleLink: playlist.articleLink
        },
        title: playlist.title,
        description: playlist.description,
        customCoverImage: playlist.coverImageUrl,
        views: 0, // Default for direct playlist access
        createdAt: playlist.createdAt?.toISOString() || new Date().toISOString(),
        promotedTrackId: null // No promoted track for direct playlist access
      };
      
      res.json(smartLinkResponse);
    } catch (error) {
      console.error('Error fetching playlist smart link:', error);
      res.status(500).json({ message: 'Failed to fetch playlist' });
    }
  });

  app.get('/api/smart-links/playlist/:playlistId/tracks', async (req, res) => {
    try {
      const playlistId = parseInt(req.params.playlistId);
      console.log(`API route: fetching tracks for playlist ${playlistId}`);
      const tracks = await storage.getSmartLinkTracks(`playlist-${playlistId}`);
      console.log(`API route: found ${tracks.length} tracks for playlist ${playlistId}`);
      res.json(tracks);
    } catch (error) {
      console.error('Error fetching playlist tracks:', error);
      res.status(500).json({ message: 'Failed to fetch tracks' });
    }
  });

  // Credit management API endpoints
  app.get('/api/users/:userId/credits', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json({ credits: user.credits || 5 });
    } catch (error) {
      console.error("Error fetching user credits:", error);
      res.status(500).json({ message: "Failed to fetch credits" });
    }
  });

  app.post('/api/users/:userId/credits/deduct', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const { amount, type, description, relatedId } = req.body;
      
      if (!amount || amount <= 0) {
        return res.status(400).json({ message: "Amount must be positive" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const currentCredits = user.credits || 5;
      if (currentCredits < amount) {
        return res.status(400).json({ message: "Insufficient credits" });
      }
      
      // Deduct credits from user
      await storage.updateUser(userId, { 
        credits: currentCredits - amount 
      });
      
      // Record transaction
      await storage.createCreditTransaction({
        userId,
        amount: -amount,
        type: type || 'usage',
        description: description || 'Credit usage',
        relatedId
      });
      
      res.json({ 
        credits: currentCredits - amount,
        message: `${amount} credit(s) deducted successfully`
      });
    } catch (error) {
      console.error("Error deducting credits:", error);
      res.status(500).json({ message: "Failed to deduct credits" });
    }
  });

  app.post('/api/users/:userId/credits/add', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const { amount, type, description } = req.body;
      
      if (!amount || amount <= 0) {
        return res.status(400).json({ message: "Amount must be positive" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const currentCredits = user.credits || 5;
      
      // Add credits to user
      await storage.updateUser(userId, { 
        credits: currentCredits + amount 
      });
      
      // Record transaction
      await storage.createCreditTransaction({
        userId,
        amount: amount,
        type: type || 'purchase',
        description: description || 'Credit purchase'
      });
      
      res.json({ 
        credits: currentCredits + amount,
        message: `${amount} credit(s) added successfully`
      });
    } catch (error) {
      console.error("Error adding credits:", error);
      res.status(500).json({ message: "Failed to add credits" });
    }
  });

  app.get('/api/users/:userId/credit-transactions', async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const limit = parseInt(req.query.limit as string) || 50;
      
      const transactions = await storage.getCreditTransactionsByUserId(userId, limit);
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching credit transactions:", error);
      res.status(500).json({ message: "Failed to fetch credit transactions" });
    }
  });

  // WhatsApp Bot Testing Endpoint
  app.post("/api/whatsapp-simulate", async (req: Request, res: Response) => {
    try {
      const { message } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      // Import OpenAI service
      const openai = await import('./openai');
      
      // Generate song recommendations based on message
      const songRecommendations = await openai.generateSongRecommendations(message);
      
      if (!songRecommendations?.songs || songRecommendations.songs.length === 0) {
        return res.status(200).json({
          title: "Custom Playlist",
          description: "No matching tracks found",
          playlist: []
        });
      }

      // Import database functions to find tracks
      const { findTracksByTitleArtist } = await import('./db');
      
      // Call the function with the full array of songs (as it expects)
      const tracks = await findTracksByTitleArtist(songRecommendations.songs.slice(0, 15));
      const foundTracks = tracks.dbTracks || [];
      
      if (foundTracks.length === 0) {
        return res.status(200).json({
          title: "Custom Playlist", 
          description: "No matching tracks found in database",
          playlist: []
        });
      }

      // Generate playlist metadata
      const playlistIdeas = await openai.generatePlaylistIdeas(message, foundTracks as any);
      
      res.json({
        title: playlistIdeas.title,
        description: playlistIdeas.description,
        playlist: foundTracks.slice(0, 12) // Limit to 12 tracks
      });

    } catch (error) {
      console.error("WhatsApp simulate error:", error);
      res.status(500).json({ error: "Failed to process message" });
    }
  });

  // Track reordering endpoint
  app.post("/api/playlist/:id/reorder-tracks", async (req: Request, res: Response) => {
    try {
      const playlistId = parseInt(req.params.id);
      const { trackOrder } = req.body; // Array of { trackId: number, position: number }
      const userId = req.query.userId as string;

      if (!userId) {
        return res.status(400).json({ message: "userId is required" });
      }

      if (!trackOrder || !Array.isArray(trackOrder)) {
        return res.status(400).json({ message: "trackOrder array is required" });
      }

      // Verify playlist ownership
      const playlist = await storage.getPlaylist(playlistId);
      if (!playlist || playlist.userId !== parseInt(userId)) {
        return res.status(403).json({ message: "Access denied: You don't own this playlist" });
      }

      // Update each track position
      const updatePromises = trackOrder.map(({ trackId, position }) =>
        storage.updateTrackPosition(playlistId, trackId, position)
      );

      await Promise.all(updatePromises);

      res.json({ 
        success: true, 
        message: "Track order updated successfully",
        updatedTracks: trackOrder.length
      });
    } catch (error) {
      console.error("Error reordering tracks:", error);
      res.status(500).json({ message: "Failed to reorder tracks" });
    }
  });

  return httpServer;
}