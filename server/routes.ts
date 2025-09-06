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
import { importTracksFromJson } from "./scripts/import-tracks";
import { 
  insertUserSchema, 
  insertPlaylistSchema, 
  insertSongSchema, 
  insertChatMessageSchema, 
  insertSavedPromptSchema,
  SpotifyTrack
} from "@shared/schema";
import crypto from "crypto";
import fetch from "node-fetch";
import sharp from "sharp";
import fs from "fs";
import path from "path";

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
    
    // Import openai module
    const openai = await import('./openai');
    
    // Step 1: Generate cover description with OpenAI
    const coverDescription = await openai.generateCoverImageDescription(title, description, tracks);
    console.log("Generated cover description:", coverDescription);
    
    // Step 2: Generate image with DALL-E
    const coverImageUrl = await openai.generateCoverImage(coverDescription);
    console.log("Cover image generated:", coverImageUrl);
    
    // Step 3: Store the cover image in Supabase storage with full optimization and save URL for session
    const { storeAiGeneratedCoverWithOptimization } = await import('./services/supabaseStorage');
    const optimizedImages = await storeAiGeneratedCoverWithOptimization(coverImageUrl);
    const permanentCoverImageUrl = optimizedImages.original;
    console.log("Stored optimized cover images in Supabase:", permanentCoverImageUrl);
    
    await storage.storeCoverImageForSession(sessionId, permanentCoverImageUrl);
    console.log(`Cover image stored for session ${sessionId}`);
  } catch (error) {
    console.error("Error in background cover image generation:", error);
    // We don't throw here since this is a background process
  }
}

/**
 * Select the best image from an array of images, preferring square images
 * @param images Array of image objects with url, width, and height properties
 * @returns URL of the best image, or undefined if no images
 */
function selectBestImage(images: Array<any> = []): string | undefined {
  if (!images || images.length === 0) {
    return undefined;
  }
  
  // Default to the first image if no better option is found
  let bestImage = images[0]?.url;
  
  // Look for square images (where width === height)
  const squareImage = images.find(img => img.width && img.height && img.width === img.height);
  if (squareImage) {
    bestImage = squareImage.url;
  }
  
  return bestImage;
}

// Convert an image URL to a base64 string, with resizing and optimization for Spotify
async function imageUrlToBase64(url: string): Promise<string> {
  try {
    console.log("Fetching image from URL:", url);
    
    let originalBuffer: Buffer;
    
    // Handle local file paths vs remote URLs
    if (url.startsWith('/images/')) {
      // Local file path - read from filesystem
      const { getAbsolutePathFromPublicPath } = await import('./services/imageStorage');
      const filePath = getAbsolutePathFromPublicPath(url);
      console.log("Reading local image from:", filePath);
      originalBuffer = await fs.promises.readFile(filePath);
    } else {
      // Remote URL - fetch from network
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
      }
      
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.startsWith('image/')) {
        throw new Error(`URL does not contain an image (content-type: ${contentType})`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      originalBuffer = Buffer.from(arrayBuffer);
    }
    
    console.log("Original image size:", originalBuffer.length, "bytes");
    
    // Resize and optimize image for Spotify (maximum 256KB)
    // Resize to 640x640 as per Spotify's recommendations
    const optimizedImageBuffer = await sharp(originalBuffer)
      .resize(640, 640, { fit: 'cover' })
      .jpeg({ quality: 80, progressive: true }) // JPEG format is more compressed
      .toBuffer();
    
    console.log("Optimized image size:", optimizedImageBuffer.length, "bytes");
    
    // If still too large, reduce quality further
    if (optimizedImageBuffer.length > 200000) { // 200KB
      console.log("Image still too large, reducing quality further");
      const furtherOptimizedBuffer = await sharp(originalBuffer)
        .resize(640, 640, { fit: 'cover' })
        .jpeg({ quality: 50, progressive: true })
        .toBuffer();
      
      console.log("Further optimized image size:", furtherOptimizedBuffer.length, "bytes");
      return furtherOptimizedBuffer.toString('base64');
    }
    
    return optimizedImageBuffer.toString('base64');
  } catch (error) {
    console.error("Error processing image:", error);
    return "";
  }
}

// Import the track platform resolution service
import { queueTrackForPlatformResolution } from './services/odesli';

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // Authentication routes
  app.get("/api/auth/spotify", (req: Request, res: Response) => {
    console.log("Spotify auth endpoint hit");
    const authUrl = spotify.getAuthorizationUrl();
    console.log("Generated Spotify auth URL:", authUrl);
    res.json({ url: authUrl });
  });

  app.get("/api/auth/callback", async (req: Request, res: Response) => {
    try {
      console.log("Spotify auth callback hit");
      const code = req.query.code as string;
      if (!code) {
        console.log("No authorization code provided");
        return res.status(400).json({ message: "Authorization code is required" });
      }
      console.log("Spotify auth code received, exchanging for token");

      const tokenData = await spotify.getAccessToken(code);
      console.log("Spotify token received, fetching user profile");
      const userProfile = await spotify.getCurrentUserProfile(tokenData.access_token);
      console.log("User profile received for:", userProfile.display_name || userProfile.id);

      // Check if user exists
      let user = await storage.getUserBySpotifyId(userProfile.id);
      
      if (!user) {
        // Create a new user
        console.log("Creating new user in database");
        user = await storage.createUser({
          username: userProfile.display_name || userProfile.id,
          password: crypto.randomBytes(20).toString('hex'), // Random password for OAuth users
          spotifyId: userProfile.id,
          spotifyAccessToken: tokenData.access_token,
          spotifyRefreshToken: tokenData.refresh_token,
          tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000)
        });
      } else {
        // Update existing user's tokens
        console.log("Updating existing user in database");
        user = await storage.updateUser(user.id, {
          spotifyAccessToken: tokenData.access_token,
          spotifyRefreshToken: tokenData.refresh_token,
          tokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000)
        });
      }

      console.log("User saved, redirecting to frontend with userId:", user.id);
      // Redirect to frontend with user ID as query param
      // In a real app, we would set session cookies
      res.redirect(`/?userId=${user.id}`);
    } catch (error) {
      console.error("Auth callback error:", error);
      res.status(500).json({ message: "Authentication failed" });
    }
  });

  // User profile
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
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ message: "Failed to get user" });
    }
  });

  // AI Chat for playlist generation
  app.post("/api/chat/generate", async (req: Request, res: Response) => {
    try {
      const { userId, sessionId, message } = req.body;
      
      if (!userId || !sessionId || !message) {
        return res.status(400).json({ message: "userId, sessionId, and message are required" });
      }

      const user = await storage.getUser(parseInt(userId));
      if (!user || !user.spotifyAccessToken) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Save user message
      await storage.createChatMessage({
        userId: parseInt(userId),
        sessionId,
        content: message,
        isUser: true
      });

      // Process with OpenAI to determine music intent
      const chatHistory = await storage.getChatMessagesBySessionId(sessionId);
      const historyForAI = chatHistory.map(msg => ({
        role: msg.isUser ? "user" : "assistant",
        content: msg.content
      }));

      // Check if user wants to avoid explicit content
      const avoidExplicit = message.toLowerCase().includes("clean") || 
                           message.toLowerCase().includes("no explicit") ||
                           message.toLowerCase().includes("family friendly") ||
                           message.toLowerCase().includes("kid friendly") ||
                           message.toLowerCase().includes("radio edit");
      
      console.log(`Generating playlist with avoidExplicit: ${avoidExplicit}`);
      
      // Check if user wants multiple songs by same artists
      const allowRepeatedArtists = message.toLowerCase().includes("multiple songs by") || 
                                  message.toLowerCase().includes("songs from same artist") ||
                                  message.toLowerCase().includes("several tracks by");
      
      console.log(`Generating playlist with allowRepeatedArtists: ${allowRepeatedArtists}`);
      
      // Get all genres from the database to help OpenAI make relevant suggestions
      const db = await import('./db');
      const openai = await import('./openai');
      
      // Get all genres from database for context
      console.log("Fetching all genres from database for OpenAI context");
      const databaseGenres = await db.getAllDatabaseGenres();
      console.log(`Found ${databaseGenres.length} genres in database`);
      
      // NEW APPROACH: Use OpenAI to recommend songs that match the user's request
      console.log("Using OpenAI to generate song recommendations");
      const songRecommendations = await openai.generateSongRecommendations(message, databaseGenres);
      console.log(`OpenAI generated ${songRecommendations.songs.length} song recommendations and ${songRecommendations.genres.length} genres`);
      
      // Log detailed song recommendations for debugging
      console.log("==== OPENAI SONG RECOMMENDATIONS (first 20) ====");
      songRecommendations.songs.slice(0, 20).forEach((song, index) => {
        console.log(`${index + 1}. "${song.title}" by ${song.artist}${song.genre ? ` (${song.genre})` : ''}`);
      });
      
      console.log("==== OPENAI SUGGESTED GENRES ====");
      console.log(songRecommendations.genres.join(', '));
      
      // Extract key information from OpenAI response
      const extractedGenres = songRecommendations.genres;
      const songSuggestions = songRecommendations.songs;
      
      // Convert the first few song suggestions to a search query to help with database matching
      let searchQuery = message;
      if (songSuggestions.length > 0) {
        // Create a search query that includes some song titles and artists
        const topSongs = songSuggestions.slice(0, 5);
        const songQueries = topSongs.map(song => `${song.title} ${song.artist}`).join(' ');
        searchQuery = `${message} ${songQueries}`;
        console.log("Enhanced search query with song suggestions:", searchQuery);
      }
      
      // Record if this is a genre-based search attempt
      const isGenreBasedSearch = extractedGenres.length > 0;
      console.log(`Genre-based search: ${isGenreBasedSearch ? 'YES' : 'NO'}, Found genres: ${extractedGenres.join(', ')}`);
      
      // NEW APPROACH: Try to find the exact songs OpenAI recommended in our database
      console.log("Searching for AI-recommended songs in our database");
      
      // Add a timestamp query parameter to avoid caching issues with the database search
      const cacheBuster = Date.now();
      console.log(`Using cache buster: ${cacheBuster} to ensure fresh results`);
      
      let initialTracks = await db.findTracksByTitleArtist(
        songSuggestions,
        50,
        avoidExplicit
      );
      
      console.log(`Found ${initialTracks.length} exact matches for AI-recommended songs`);
      
      // If we don't have enough tracks, do a more thorough search for each AI suggestion
      if (initialTracks.length < 24) {
        console.log("Not enough exact matches, searching more thoroughly for AI suggestions");
        
        for (const suggestion of songSuggestions) {
          if (initialTracks.length >= 24) break;
          
          // Try different search combinations for each suggestion
          const searchQueries = [
            `${suggestion.title} ${suggestion.artist}`,
            suggestion.title,
            `${suggestion.artist} ${suggestion.genre || ''}`
          ];
          
          for (const query of searchQueries) {
            const searchResults = await db.searchTracks(
              query,
              5, // Limit per query to avoid too many results
              0,
              avoidExplicit,
              null,
              suggestion.genre ? [suggestion.genre] : extractedGenres
            );
            
            // Add only new tracks we haven't seen before
            const existingIds = new Set(initialTracks.map(t => t.id));
            for (const track of searchResults) {
              if (!existingIds.has(track.id)) {
                initialTracks.push(track);
                existingIds.add(track.id);
                if (initialTracks.length >= 24) break;
              }
            }
            if (initialTracks.length >= 24) break;
          }
        }
        
        console.log(`Found ${additionalTracks.length} additional tracks from general search`);
        
        // Get IDs of tracks we already have to avoid duplicates
        const existingIds = new Set(initialTracks.map(t => t.id));
        
        // Add only tracks we don't already have
        for (const track of additionalTracks) {
          if (!existingIds.has(track.id)) {
            initialTracks.push(track);
            existingIds.add(track.id);
          }
        }
        
        console.log(`After de-duplication, we have ${initialTracks.length} tracks from database`);
      }
      
      // Always try to get recommendations from Spotify for better results
      // We'll consider it needed if we still don't have enough tracks or this is a genre-specific request
      const needsSpotifySearch = initialTracks.length < 24 || isGenreBasedSearch;
      
      if (needsSpotifySearch && user.spotifyAccessToken) {
        try {
          console.log("Using Spotify recommendations API with genre information");
          
          // Get some seed tracks from initial search if available
          const seedTracks = initialTracks.slice(0, 2).map(t => t.id);
          
          // Get Spotify genre seeds from extracted genres
          const { getSpotifyGenreSeeds } = await import('./services/genreAnalysis');
          
          // For Spotify's API, convert our database genres to Spotify genre seeds
          const genreSeeds = getSpotifyGenreSeeds(
            extractedGenres.map(name => ({ name, confidence: 1.0 })),
            3
          );
          
          console.log("Using seed genres for recommendations:", genreSeeds);
          
          // Get recommendations from Spotify
          const recommendations = await spotify.getRecommendations(
            user.spotifyAccessToken,
            seedTracks,
            genreSeeds,
            60 // Get plenty of tracks for genre accuracy
          );
          
          if (recommendations && recommendations.length > 0) {
            console.log(`Got ${recommendations.length} tracks from Spotify recommendations API`);
            
            // For genre accuracy, always give higher priority to Spotify recommendations
            // since they're likely more relevant to the requested genre
            console.log(`Prioritizing Spotify recommendations over database results`);
            
            // Get IDs of tracks we already have to avoid duplicates
            const existingIds = new Set(initialTracks.map(t => t.id));
            
            // Add only Spotify tracks we don't already have
            const uniqueRecommendations = recommendations.filter(t => !existingIds.has(t.id));
            
            // Put Spotify recommendations first, followed by database results
            initialTracks = [...uniqueRecommendations, ...initialTracks];
            console.log(`After adding Spotify recommendations, we have ${initialTracks.length} tracks total`);
            
            // Import these tracks to our database in the background
            for (const track of recommendations) {
              try {
                db.importTrackFromSpotify(track).catch(err => {
                  console.error("Error importing recommended track to database:", err);
                });
              } catch (error) {
                console.error("Error queuing track import:", error);
              }
            }
          }
        } catch (recError) {
          console.error("Error getting recommendations from Spotify:", recError);
          // Fall back to regular search on error
          const spotifyTracks = await spotify.searchTracks(user.spotifyAccessToken, searchQuery, 50, avoidExplicit);
          
          // Get IDs of tracks we already have to avoid duplicates
          const existingIds = new Set(initialTracks.map(t => t.id));
          
          // Add only Spotify tracks we don't already have
          const uniqueSpotifyTracks = spotifyTracks.filter(t => !existingIds.has(t.id));
          
          initialTracks = [...uniqueSpotifyTracks, ...initialTracks];
          console.log(`After adding Spotify search results, we have ${initialTracks.length} tracks total`);
        }
      } else if (initialTracks.length < 10) {
        // Regular search if we still don't have enough tracks
        console.log("Not enough tracks found, falling back to Spotify search");
        const spotifyTracks = await spotify.searchTracks(user.spotifyAccessToken, searchQuery, 50, avoidExplicit);
        
        // Get IDs of tracks we already have to avoid duplicates
        const existingIds = new Set(initialTracks.map(t => t.id));
        
        // Add only Spotify tracks we don't already have
        const uniqueSpotifyTracks = spotifyTracks.filter(t => !existingIds.has(t.id));
        
        initialTracks = [...uniqueSpotifyTracks, ...initialTracks];
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
      
      // Log if we have fewer tracks after filtering, but don't try Spotify fallback
      if (initialTracks.length < 10) {
        console.log(`Note: Only ${initialTracks.length} tracks remain after filtering, but will continue with database-only approach`);
      }
      
      // Select tracks directly from AI suggestions
      let tracks = initialTracks.slice(0, 24);
      console.log(`Selected ${tracks.length} tracks from AI suggestions`);
      
      // Keep track order from AI suggestions
      if (tracks.length < 24) {
        console.log(`Not enough tracks from initial search (only ${tracks.length}), will try to find more`);
      }
      
      console.log(`Selected ${tracks.length} diverse tracks with both artist diversity and randomization`);
      
      
      // Ensure we have exactly 24 tracks
      if (tracks.length < 24) {
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
      
      // Database-only approach: work with what we found
      if (tracks.length < 24) {
        console.log(`Database search yielded ${tracks.length} tracks, continuing with database-only approach`);
      }
      
      // As a last resort, if we still don't have 24 tracks, duplicate some popular ones
      // but make sure we mark this clearly in logs since it's not ideal
      if (tracks.length < 24) {
        console.log(`WARNING: Not enough unique tracks found (only ${tracks.length}). Will use some duplicates to reach 24 tracks.`);
        
        // Sort tracks by popularity (higher first)
        const sortedTracks = [...tracks].sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
        
        // Add duplicates of popular tracks until we have 24
        let index = 0;
        while (tracks.length < 24 && sortedTracks.length > 0) {
          // Create a modified copy to make it clear this is a duplicate
          const duplicateTrack = {...sortedTracks[index % sortedTracks.length]};
          // Add a flag for logging (won't affect Spotify API calls)
          duplicateTrack._isDuplicate = true;
          
          tracks.push(duplicateTrack);
          index++;
          
          console.log(`Added duplicate of track: ${duplicateTrack.name} by ${duplicateTrack.artists.map(a => a.name).join(', ')}`);
        }
      }
      
      // Randomize the tracks ordering a bit before slicing to 24 
      // This will help avoid always getting the same tracks in the same order
      const finalRandomSeed = Date.now();
      console.log(`Using random seed ${finalRandomSeed} for final track selection`);
      
      // Create a shuffled version of the tracks with some randomization
      // We'll keep 70% of the original sorting (relevance) but add 30% randomization
      const finalShuffledTracks = [...tracks].map((track, index) => ({
        track,
        // Original position score (higher = better)
        positionScore: (tracks.length - index) / tracks.length * 70,
        // Random factor (0-30)
        randomFactor: ((track.id?.charCodeAt(0) || 0) + finalRandomSeed) % 30
      }))
      .sort((a, b) => {
        // Higher combined score first
        return (b.positionScore + b.randomFactor) - (a.positionScore + a.randomFactor);
      })
      .map(item => item.track);
      
      // Take exactly the top 24 tracks after shuffling
      tracks = finalShuffledTracks.slice(0, 24);
      console.log(`Selected ${tracks.length} tracks using shuffled selection`);
      
      // Final check for duplicates - this is a safety measure
      // Create a map to store tracks by ID, preserving only the first occurrence
      const uniqueTracksMap = new Map();
      tracks.forEach(track => {
        if (!uniqueTracksMap.has(track.id)) {
          uniqueTracksMap.set(track.id, track);
        }
      });
      
      // If we detected duplicates in the final list, log a warning
      if (uniqueTracksMap.size < tracks.length) {
        console.log(`WARNING: Detected ${tracks.length - uniqueTracksMap.size} duplicate tracks in final playlist. Removing duplicates.`);
        tracks = Array.from(uniqueTracksMap.values());
      }
      
      console.log(`Final track count: ${tracks.length}`);
      
      // Generate playlist details
      const playlistIdeas = await openai.generatePlaylistIdeas(message, tracks);
      
      // Save AI response
      const aiResponseText = `I've created a playlist called "${playlistIdeas.title}" with 24 songs based on your request. The description is: "${playlistIdeas.description}". You can preview the tracks, modify them, and adjust the title and description before saving to Spotify.`;
      
      await storage.createChatMessage({
        userId: parseInt(userId),
        sessionId,
        content: aiResponseText,
        isUser: false
      });
      
      // Debug log to see what Spotify returns for tracks
      if (tracks.length > 0) {
        console.log("Preview URL sample:", tracks[0].preview_url);
        
        // Log all track titles for easier verification of playlist diversity
        console.log("PLAYLIST TRACK TITLES:");
        tracks.forEach((track, index) => {
          console.log(`${index + 1}. ${track.name} by ${track.artists.map(a => a.name).join(', ')}`);
        });
      }
      
      // Generate AI cover image automatically and store in Supabase BEFORE sending response
      console.log("🎨 Generating AI cover image for playlist");
      let permanentCoverImageUrl = "";
      
      try {
        const coverDescription = await openai.generateCoverImageDescription(
          playlistIdeas.title,
          playlistIdeas.description,
          tracks
        );
        console.log("Generated cover description:", coverDescription);
        
        const tempCoverImageUrl = await openai.generateCoverImage(coverDescription);
        console.log("Generated temporary cover image URL:", tempCoverImageUrl);
        
        // Store the cover image in Supabase storage with full optimization
        const { storeAiGeneratedCoverWithOptimization } = await import('./services/supabaseStorage');
        const optimizedImages = await storeAiGeneratedCoverWithOptimization(tempCoverImageUrl);
        permanentCoverImageUrl = optimizedImages.original;
        console.log("✅ Stored optimized cover images in Supabase:", permanentCoverImageUrl);
        
      } catch (coverError) {
        console.error("❌ Cover generation error (proceeding without cover):", coverError);
        permanentCoverImageUrl = ""; // Empty string if generation fails
      }
      
      // Send response with properly stored cover image (or empty string if failed)
      res.json({
        message: aiResponseText,
        playlist: {
          title: playlistIdeas.title,
          description: playlistIdeas.description,
          coverImageUrl: permanentCoverImageUrl,
          tracks
        }
      });
    } catch (error) {
      console.error("Generate playlist error:", error);
      res.status(500).json({ message: "Failed to generate playlist" });
    }
  });

  // Chat message history
  app.get("/api/chat/:sessionId", async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const userId = req.query.userId as string;
      
      if (!userId || !sessionId) {
        return res.status(400).json({ message: "userId and sessionId are required" });
      }

      const messages = await storage.getChatMessagesBySessionId(sessionId);
      res.json(messages);
    } catch (error) {
      console.error("Get chat history error:", error);
      res.status(500).json({ message: "Failed to get chat history" });
    }
  });
  
  // Endpoint to fetch the cover image for a chat session
  app.get("/api/chat/:sessionId/cover", async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      
      // Check if cover image is ready for this session
      const coverImageUrl = await storage.getCoverImageForSession(sessionId);
      
      if (coverImageUrl) {
        res.json({ coverImageUrl, status: "complete" });
      } else {
        // 202 Accepted means the request was valid but processing is not complete
        res.status(202).json({ 
          message: "Cover image is still being generated",
          status: "pending"
        });
      }
    } catch (error) {
      console.error("Error fetching cover image:", error);
      res.status(500).json({ 
        message: "Failed to get cover image",
        status: "error" 
      });
    }
  });
  
  // Improve playlist with AI
  app.post("/api/playlist/improve", async (req: Request, res: Response) => {
    try {
      const { userId, playlistId, title, description, tracks, improvementPrompt, sessionId } = req.body;
      
      if (!userId || !improvementPrompt || !sessionId || !tracks) {
        return res.status(400).json({ error: "Missing required parameters" });
      }
      
      // Store the user message
      await storage.createChatMessage({
        userId: parseInt(userId),
        sessionId,
        content: improvementPrompt,
        isUser: true
      });
      
      // Get the user
      const user = await storage.getUser(parseInt(userId));
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Process the improvement request with OpenAI
      console.log("Generating playlist improvements with request:", improvementPrompt);
      
      // Format the improvement request to make it clear this is an improvement and needs Spotify-friendly content
      const improvementRequestPrompt = `IMPROVE this existing playlist titled "${title}" with description "${description}" based on the following request: ${improvementPrompt}. 
      
Make significant changes to create a more Spotify-friendly title and description that will maximize discoverability and search performance. Generate a title that includes popular genre keywords, mood/vibe words, and contextual keywords about when to listen.

The description should focus primarily on describing what's INSIDE the playlist - the actual songs, artists, and genres included. Begin with a clear statement about what listeners will find, list specific types of songs and musical elements featured, and include 3-5 relevant hashtags at the end.`;
      
      console.log("Full improvement request prompt:", improvementRequestPrompt);
      
      const playlistIdeas = await openai.generatePlaylistIdeas(
        improvementRequestPrompt,
        tracks
      );
      
      console.log("OpenAI generated playlist ideas:", {
        originalTitle: title,
        newTitle: playlistIdeas.title,
        originalDescription: description,
        newDescription: playlistIdeas.description
      });
      
      // Generate response and store it
      const aiResponseText = `I've improved the playlist based on your request. 

The new title "${playlistIdeas.title}" is now more Spotify-friendly and includes searchable keywords that will help users discover your playlist.

The updated description is optimized for Spotify search: "${playlistIdeas.description}"

These changes will make your playlist more discoverable when people search for related music on Spotify. The tracks have also been updated to better match your request.`;
      
      await storage.createChatMessage({
        userId: parseInt(userId),
        sessionId,
        content: aiResponseText,
        isUser: false
      });
      
      // Generate new or replacement tracks based on the improvement request
      console.log("Generating track recommendations based on improvement request...");
      
      let updatedTracks = [...tracks]; // Start with existing tracks
      
      try {
        // Check if the improvement request suggests adding new tracks
        const shouldAddTracks = 
          improvementPrompt.toLowerCase().includes("add") || 
          improvementPrompt.toLowerCase().includes("more songs") || 
          improvementPrompt.toLowerCase().includes("new songs");
        
        // Check if the improvement request suggests replacing tracks
        const shouldReplaceTrack = 
          improvementPrompt.toLowerCase().includes("replace") || 
          improvementPrompt.toLowerCase().includes("different") || 
          improvementPrompt.toLowerCase().includes("change");
          
        // Log what we detected about the request
        console.log(`Improvement request analysis:`, {
          originalPrompt: improvementPrompt,
          shouldAddTracks,
          shouldReplaceTrack
        });
        
        // Add new tracks if requested
        if (shouldAddTracks) {
          let numToAdd = 5; // Default to adding 5 tracks
          
          // Try to extract a number from the prompt
          const numberMatch = improvementPrompt.match(/(\d+)/);
          if (numberMatch && numberMatch[1]) {
            const requestedNumber = parseInt(numberMatch[1]);
            if (!isNaN(requestedNumber) && requestedNumber > 0) {
              // Use the requested number with a reasonable cap for API limits
              numToAdd = Math.min(requestedNumber, 10); // Cap at 10 tracks
              console.log(`User requested adding ${requestedNumber} tracks, using ${numToAdd}`);
            }
          } else if (improvementPrompt.toLowerCase().includes("more") || 
                   improvementPrompt.toLowerCase().includes("additional")) {
            // If they just requested "more" songs without a number, give them more than the default
            numToAdd = 8;
            console.log("User requested more tracks without specifying count, adding 8");
          }
          
          // Generate track recommendations
          console.log(`Attempting to add ${numToAdd} tracks to playlist...`);
          
          const { getRecommendations } = await import('./spotify');
          
          // Improved seed track selection for better recommendations
          let seedTracks: string[] = [];
          
          // Only attempt to get seed tracks if we have tracks
          if (tracks.length > 0) {
            // Get tracks from different positions in the playlist for better variety
            const positions = [
              0, // First track
              Math.floor(tracks.length / 3), // One-third through
              Math.floor(tracks.length / 2), // Middle
              Math.floor(tracks.length * 2 / 3), // Two-thirds through
              tracks.length - 1 // Last track
            ];
            
            // Extract tracks from these positions if they exist
            seedTracks = positions
              .filter(pos => pos >= 0 && pos < tracks.length) // Ensure position is valid
              .map(pos => tracks[pos]?.id) // Get the track ID
              .filter(id => typeof id === 'string' && id.length > 0) // Filter out invalid IDs
              .slice(0, 3); // Use up to 3 seed tracks
              
            console.log("Selected seed tracks from positions:", positions.slice(0, seedTracks.length));
          }
          
          // Add some fallback seed tracks for Tupac as requested, if user mentioned Tupac
          if (improvementPrompt.toLowerCase().includes("tupac") && seedTracks.length < 3) {
            // Common Tupac track IDs
            const tupacTracks = ["3fJaqjV813edLN5wrxUPkc", "4pJi1qNA8NXL5JVcmeD5sT", "5ZATfKurLqjmXj2bu0Qlhe"];
            
            // Add Tupac tracks until we have 3 seed tracks
            for (const trackId of tupacTracks) {
              if (seedTracks.length < 3 && !seedTracks.includes(trackId)) {
                seedTracks.push(trackId);
              }
            }
            
            console.log("Added Tupac seed tracks, final count:", seedTracks.length);
          }
          
          if (seedTracks.length > 0) {
            try {
              // Get user for Spotify API call
              const user = await storage.getUser(parseInt(userId));
              
              if (user && user.spotifyAccessToken) {
                // Get seed genres using the enhanced genre extraction service
                let seedGenres: string[] = [];
                try {
                  // Import the genre analysis service
                  const { extractGenresFromPrompt, getSpotifyGenreSeeds } = await import('./services/genreAnalysis');
                  
                  // Extract detailed genre information from the improvement prompt
                  const genreAnalysis = await extractGenresFromPrompt(improvementPrompt);
                  
                  if (genreAnalysis.genres && genreAnalysis.genres.length > 0) {
                    // Get Spotify genre seeds from the extracted genres (limit to 5 for API compatibility)
                    seedGenres = getSpotifyGenreSeeds(genreAnalysis.genres, 5);
                    console.log("Enhanced genre extraction results:", JSON.stringify(genreAnalysis.genres.map(g => ({ name: g.name, confidence: g.confidence }))));
                  } else {
                    // Fallback to default genres if extraction failed
                    seedGenres = ["pop", "hip-hop", "rock"];
                    console.log("Enhanced genre extraction failed, using default genres");
                  }
                } catch (error) {
                  console.error("Error in enhanced genre extraction:", error);
                  
                  // Fallback to simple keyword matching if enhanced extraction fails
                  if (improvementPrompt.toLowerCase().includes("hip hop") || 
                      improvementPrompt.toLowerCase().includes("rap") ||
                      improvementPrompt.toLowerCase().includes("tupac")) {
                    seedGenres = ["hip-hop", "rap"];
                  } else if (improvementPrompt.toLowerCase().includes("rock")) {
                    seedGenres = ["rock", "hard-rock", "alternative"];
                  } else if (improvementPrompt.toLowerCase().includes("pop")) {
                    seedGenres = ["pop", "dance-pop"];
                  } else if (improvementPrompt.toLowerCase().includes("country")) {
                    seedGenres = ["country"];
                  } else if (improvementPrompt.toLowerCase().includes("jazz")) {
                    seedGenres = ["jazz"];
                  } else if (improvementPrompt.toLowerCase().includes("classical")) {
                    seedGenres = ["classical"];
                  } else if (improvementPrompt.toLowerCase().includes("electronic") || 
                            improvementPrompt.toLowerCase().includes("edm")) {
                    seedGenres = ["electronic", "edm"];
                  } else {
                    // Default to some popular genres if none specified
                    seedGenres = ["pop", "hip-hop", "rock"];
                  }
                }
                
                console.log("Using seed genres:", seedGenres);
                
                // Get recommendations from Spotify with both seed tracks and genres
                const recommendations = await getRecommendations(
                  user.spotifyAccessToken,
                  seedTracks,
                  seedGenres,
                  numToAdd
                );
                
                if (recommendations && recommendations.length > 0) {
                  console.log(`Successfully got ${recommendations.length} track recommendations`);
                  
                  // Filter out any tracks that are already in the playlist
                  const existingIds = new Set(tracks.map(t => t.id));
                  const newTracks = recommendations.filter(track => !existingIds.has(track.id));
                  
                  if (newTracks.length > 0) {
                    console.log(`Adding ${newTracks.length} new tracks to playlist`);
                    updatedTracks = [...updatedTracks, ...newTracks];
                  }
                }
              }
            } catch (recError) {
              console.error("Failed to get track recommendations:", recError);
            }
          }
        }
        
        // Replace tracks if requested
        if (shouldReplaceTrack) {
          // For simplicity, replace 2-3 tracks in the playlist with new ones
          const numToReplace = Math.floor(Math.random() * 2) + 2; // 2-3 tracks
          
          // Select random positions to replace, avoiding the first 3 and last 3 tracks
          const positionsToReplace = [];
          const minPosition = 3;
          const maxPosition = tracks.length - 3;
          
          if (maxPosition > minPosition) {
            // Generate random positions to replace
            for (let i = 0; i < numToReplace; i++) {
              let position;
              do {
                position = Math.floor(Math.random() * (maxPosition - minPosition)) + minPosition;
              } while (positionsToReplace.includes(position));
              
              positionsToReplace.push(position);
            }
            
            // Get recommendations for replacement tracks
            const { getRecommendations } = await import('./spotify');
            
            try {
              // Get user for Spotify API call
              const user = await storage.getUser(parseInt(userId));
              
              if (user && user.spotifyAccessToken) {
                // Get seed tracks excluding the ones we're replacing - better selection algorithm
                let seedTracks: string[] = [];
                
                // Try to get tracks from different positions in the playlist
                const positions = [
                  0, // First track
                  Math.floor(tracks.length / 3), // One-third through
                  Math.floor(tracks.length * 2 / 3), // Two-thirds through
                ];
                
                // Make sure we're not using tracks we're planning to replace
                seedTracks = positions
                  .filter(pos => !positionsToReplace.includes(pos)) // Skip positions we're replacing
                  .filter(pos => pos >= 0 && pos < tracks.length) // Ensure position is valid
                  .map(pos => tracks[pos]?.id) // Get the track ID
                  .filter(id => typeof id === 'string' && id.length > 0); // Filter out invalid IDs
                  
                console.log("Selected replacement seed tracks from positions:", 
                  positions.filter(pos => !positionsToReplace.includes(pos)).slice(0, seedTracks.length));
                  
                // Add some fallback seed tracks if needed
                if (seedTracks.length < 2) {
                  // Try to find any other valid track IDs
                  for (let i = 0; i < tracks.length; i++) {
                    if (!positionsToReplace.includes(i) && 
                        tracks[i]?.id && 
                        !seedTracks.includes(tracks[i].id)) {
                      seedTracks.push(tracks[i].id);
                      if (seedTracks.length >= 2) break;
                    }
                  }
                }
                
                if (seedTracks.length > 0) {
                  // Get seed genres using the enhanced genre extraction service
                  let seedGenres: string[] = [];
                  try {
                    // Import the genre analysis service
                    const { extractGenresFromPrompt, getSpotifyGenreSeeds } = await import('./services/genreAnalysis');
                    
                    // Extract detailed genre information from the improvement prompt
                    const genreAnalysis = await extractGenresFromPrompt(improvementPrompt);
                    
                    if (genreAnalysis.genres && genreAnalysis.genres.length > 0) {
                      // Get Spotify genre seeds from the extracted genres (limit to 5 for API compatibility)
                      seedGenres = getSpotifyGenreSeeds(genreAnalysis.genres, 5);
                      console.log("Enhanced genre extraction for replacements:", JSON.stringify(genreAnalysis.genres.map(g => ({ name: g.name, confidence: g.confidence }))));
                    } else {
                      // Fallback to default genres if extraction failed
                      seedGenres = ["pop", "hip-hop"];
                      console.log("Enhanced genre extraction failed for replacements, using default genres");
                    }
                  } catch (error) {
                    console.error("Error in enhanced genre extraction for replacements:", error);
                    
                    // Fallback to simple keyword matching if enhanced extraction fails
                    if (improvementPrompt.toLowerCase().includes("hip hop") || 
                        improvementPrompt.toLowerCase().includes("rap") ||
                        improvementPrompt.toLowerCase().includes("tupac")) {
                      seedGenres = ["hip-hop", "rap"];
                    } else if (improvementPrompt.toLowerCase().includes("rock")) {
                      seedGenres = ["rock", "hard-rock", "alternative"];
                    } else if (improvementPrompt.toLowerCase().includes("pop")) {
                      seedGenres = ["pop", "dance-pop"];
                    } else if (improvementPrompt.toLowerCase().includes("country")) {
                      seedGenres = ["country"];
                    } else if (improvementPrompt.toLowerCase().includes("jazz")) {
                      seedGenres = ["jazz"];
                    } else if (improvementPrompt.toLowerCase().includes("classical")) {
                      seedGenres = ["classical"];
                    } else if (improvementPrompt.toLowerCase().includes("electronic") || 
                              improvementPrompt.toLowerCase().includes("edm")) {
                      seedGenres = ["electronic", "edm"];
                    } else {
                      // Default to some popular genres if none specified
                      seedGenres = ["pop", "hip-hop"];
                    }
                  }
                  
                  console.log("Using seed genres for replacements:", seedGenres);
                  
                  // Get recommendations from Spotify
                  const recommendations = await getRecommendations(
                    user.spotifyAccessToken,
                    seedTracks,
                    seedGenres,
                    numToReplace + 2 // Get a few extra options
                  );
                  
                  if (recommendations && recommendations.length > 0) {
                    console.log(`Successfully got ${recommendations.length} track recommendations for replacement`);
                    
                    // Filter out any tracks that are already in the playlist
                    const existingIds = new Set(tracks.map(t => t.id));
                    const replacementTracks = recommendations.filter(track => !existingIds.has(track.id));
                    
                    if (replacementTracks.length > 0) {
                      console.log(`Replacing ${positionsToReplace.length} tracks in the playlist`);
                      
                      // Replace the tracks at the selected positions
                      updatedTracks = tracks.map((track, index) => {
                        if (positionsToReplace.includes(index) && replacementTracks.length > 0) {
                          // Replace this track with a recommendation
                          const replacement = replacementTracks.shift();
                          console.log(`Replacing track at position ${index}: "${track.name}" with "${replacement.name}"`);
                          return replacement;
                        }
                        return track;
                      });
                    }
                  }
                }
              }
            } catch (recError) {
              console.error("Failed to get replacement track recommendations:", recError);
            }
          }
        }
      } catch (trackUpdateError) {
        console.error("Error updating tracks:", trackUpdateError);
        // Continue with the original tracks if there's an error
      }
      
      // Update the playlist in the database
      if (playlistId) {
        try {
          await storage.updatePlaylist(playlistId, {
            title: playlistIdeas.title,
            description: playlistIdeas.description,
          });
          console.log("Updated playlist in database with new title and description");
          
          // Always update songs in database no matter what
          // This ensures the database is always in sync with the latest tracks
          try {
            // Delete existing songs
            await storage.deleteSongsByPlaylistId(playlistId);
            
            // Check for duplicate tracks before saving
            console.log("Checking for duplicate tracks in improved playlist...");
            const uniqueIds = new Set<string>();
            const uniqueImprovedTracks: any[] = [];
            
            // First pass: identify unique tracks
            for (const track of updatedTracks) {
              if (!track.id) {
                console.warn("Track missing ID, skipping:", track.name);
                continue;
              }
              
              if (!uniqueIds.has(track.id)) {
                uniqueIds.add(track.id);
                uniqueImprovedTracks.push(track);
              } else {
                console.log(`Removing duplicate improved track: ${track.name} (ID: ${track.id})`);
              }
            }
            
            // Log duplicate removal if any
            if (uniqueImprovedTracks.length < updatedTracks.length) {
              console.log(`Removed ${updatedTracks.length - uniqueImprovedTracks.length} duplicate tracks from improved playlist.`);
              // Update the reference to use only unique tracks
              updatedTracks = uniqueImprovedTracks;
            }
            
            // Add the unique tracks
            for (let i = 0; i < updatedTracks.length; i++) {
              const track = updatedTracks[i];
              await storage.createSong({
                playlistId: playlistId,
                spotifyId: track.id,
                title: track.name,
                artist: track.artists.map((a: any) => a.name).join(", "),
                album: track.album.name,
                albumImageUrl: track.album.images[0]?.url || null,
                durationMs: track.duration_ms || 0,
                position: i
              });
            }
            console.log(`Re-saved ${updatedTracks.length} unique tracks to database`);
          } catch (songUpdateError) {
            console.error("Error updating songs in database:", songUpdateError);
          }
        } catch (updateError) {
          console.error("Error updating playlist in database:", updateError);
          // Continue even if database update fails
        }
      }
      
      // Additional debug logging to trace track modifications
      console.log("==============================================");
      console.log("PLAYLIST IMPROVEMENT SUMMARY:");
      console.log(`Original track count: ${tracks.length}`);
      console.log(`New track count: ${updatedTracks.length}`);
      console.log(`Track difference: ${updatedTracks.length - tracks.length}`);
      console.log("==============================================");
      
      // Always ensure we return the updated tracks (not the original ones)
      // Return the improved playlist
      res.json({
        title: playlistIdeas.title,
        description: playlistIdeas.description,
        tracks: updatedTracks,
        message: aiResponseText
      });
    } catch (error) {
      console.error("Error improving playlist:", error);
      res.status(500).json({ error: "Failed to improve playlist" });
    }
  });

  // Generate new cover image
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
        
        // Generate image with DALL-E
        const tempCoverImageUrl = await openai.generateCoverImage(finalImagePrompt);
        
        // Store the cover image in Supabase storage with full optimization
        const { storeAiGeneratedCoverWithOptimization } = await import('./services/supabaseStorage');
        const optimizedImages = await storeAiGeneratedCoverWithOptimization(tempCoverImageUrl);
        const permanentCoverImageUrl = optimizedImages.original;
        console.log("Stored optimized cover images in Supabase:", permanentCoverImageUrl);
        
        // Return the Supabase-stored image URL and the prompt used
        return res.json({ 
          coverImageUrl: permanentCoverImageUrl,
          promptUsed: finalImagePrompt 
        });
      } catch (genError) {
        console.error("Error in image generation:", genError);
        
        // If something goes wrong in the image generation process, return the default image
        const defaultCoverPath = "/images/covers/default-cover.png";
        console.log("Returning default cover image due to error:", defaultCoverPath);
        return res.json({ coverImageUrl: defaultCoverPath });
      }
    } catch (error) {
      console.error("Generate cover image error:", error);
      res.status(500).json({ 
        message: "Failed to generate cover image", 
        coverImageUrl: "/images/covers/default-cover.png" 
      });
    }
  });

  // Save playlist to Spotify
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
      
      // If no existing playlist or couldn't update, create a new one
      if (!existingPlaylistId) {
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
      for (let i = 0; i < uniqueTracks.length; i++) {
        const track = uniqueTracks[i];
        await storage.createSong({
          playlistId: playlist.id,
          spotifyId: track.id,
          title: track.name,
          artist: track.artists.map((a: any) => a.name).join(", "),
          album: track.album.name,
          albumImageUrl: track.album.images[0]?.url || null,
          durationMs: track.duration_ms || 0,
          position: i
        });
      }
      console.log(`Saved ${uniqueTracks.length} unique tracks to database`);

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
            // Try to get additional details from Spotify
            const spotifyDetails = await spotify.getPlaylistDetails(
              user.spotifyAccessToken,
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

  // Get playlist details by ID or Spotify ID
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
      
      res.json({
        id: dbPlaylist.id,
        spotifyId: dbPlaylist.spotifyId || null,
        title: dbPlaylist.title,
        description: dbPlaylist.description || '',
        coverImage: dbPlaylist.coverImageUrl || null,
        tracks: tracks,
        spotifyUrl: ''
      });
    } catch (error) {
      console.error("Get playlist details error:", error);
      res.status(500).json({ message: "Failed to get playlist details" });
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
      
      // Check authorization
      if (playlist.userId !== parseInt(userId)) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      // Get songs to find the one to delete
      const songs = await storage.getSongsByPlaylistId(playlistId);
      if (!songs || songs.length === 0) {
        return res.status(400).json({ message: "Playlist has no songs" });
      }
      
      // Find the song at the given position
      const songToDelete = songs.find(song => song.position === songPosition);
      if (!songToDelete) {
        return res.status(404).json({ message: "Song not found at this position" });
      }
      
      // If playlist is on Spotify, remove the song there too
      if (playlist.spotifyId && user.spotifyAccessToken) {
        try {
          // Check if we need to refresh the token
          let accessToken = user.spotifyAccessToken;
          
          // Try to remove from Spotify
          const spotifyTrackUri = `spotify:track:${songToDelete.spotifyId}`;
          
          // Create the API call to remove the track
          const spotifyEndpoint = `https://api.spotify.com/v1/playlists/${playlist.spotifyId}/tracks`;
          const response = await fetch(spotifyEndpoint, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              tracks: [{ uri: spotifyTrackUri }]
            })
          });
          
          // If token expired, refresh and try again
          if (response.status === 401 && user.spotifyRefreshToken) {
            console.log("Refreshing Spotify token...");
            const refreshResponse = await spotify.refreshAccessToken(user.spotifyRefreshToken);
            accessToken = refreshResponse.access_token;
            
            // Update the user's access token
            await storage.updateUser(user.id, {
              spotifyAccessToken: accessToken
            });
            
            // Try again with new token
            const retryResponse = await fetch(spotifyEndpoint, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                tracks: [{ uri: spotifyTrackUri }]
              })
            });
            
            if (!retryResponse.ok) {
              console.error("Failed to delete song from Spotify even after token refresh:", await retryResponse.text());
            }
          } else if (!response.ok) {
            console.error("Failed to delete song from Spotify:", await response.text());
          }
        } catch (error) {
          console.error("Error deleting song from Spotify:", error);
          // Continue to delete from database even if Spotify deletion fails
        }
      }
      
      // Delete the song from database
      const deleted = await storage.deleteSong(songToDelete.id);
      
      if (deleted) {
        // Update positions of remaining songs
        const remainingSongs = songs.filter(song => song.id !== songToDelete.id)
          .sort((a, b) => a.position - b.position);
        
        // Update positions to be consecutive
        for (let i = 0; i < remainingSongs.length; i++) {
          if (remainingSongs[i].position !== i) {
            await storage.updateSong(remainingSongs[i].id, { position: i });
          }
        }
        
        return res.status(200).json({ 
          message: "Song deleted successfully",
          songId: songToDelete.id
        });
      } else {
        return res.status(500).json({ message: "Failed to delete song" });
      }
    } catch (error) {
      console.error("Error deleting song from playlist:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Export a playlist from database to Spotify
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
          profile.id, // Add the Spotify user ID
          playlist.title,
          playlist.description || ""
        );
        
        // Now add the tracks to the playlist
        if (trackIds.length > 0) {
          console.log("Raw track IDs from database:", JSON.stringify(trackIds));
          
          // Debug: Check for any IDs that might be problematic
          trackIds.forEach((id, index) => {
            if (id.includes("spotify:track:")) {
              console.warn(`Track ID at position ${index} already contains prefix: ${id}`);
            }
            if (id.length !== 22) {
              console.warn(`Track ID at position ${index} has invalid length (${id.length}): ${id}`);
            }
          });

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
              console.log("Retry: Raw track IDs from database:", JSON.stringify(trackIds));
              
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

  // Saved prompts
  app.get("/api/prompts", async (req: Request, res: Response) => {
    try {
      const userId = req.query.userId as string;
      
      if (!userId) {
        return res.status(400).json({ message: "userId is required" });
      }

      const prompts = await storage.getSavedPromptsByUserId(parseInt(userId));
      res.json(prompts);
    } catch (error) {
      console.error("Get prompts error:", error);
      res.status(500).json({ message: "Failed to get prompts" });
    }
  });

  app.post("/api/prompt", async (req: Request, res: Response) => {
    try {
      const { userId, content } = req.body;
      
      if (!userId || !content) {
        return res.status(400).json({ message: "userId and content are required" });
      }

      const prompt = await storage.createSavedPrompt({
        userId: parseInt(userId),
        content
      });
      
      res.json(prompt);
    } catch (error) {
      console.error("Save prompt error:", error);
      res.status(500).json({ message: "Failed to save prompt" });
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

      // If playlist has been exported to Spotify, sync the track order
      let spotifySync = false;
      if (playlist.spotifyId) {
        try {
          // Call the Spotify sync endpoint
          const syncResponse = await fetch(`${req.protocol}://${req.get('host')}/api/playlist/${playlistId}/sync-spotify-order?userId=${userId}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            }
          });
          
          if (syncResponse.ok) {
            spotifySync = true;
            console.log(`✅ Successfully synced track order to Spotify for playlist ${playlistId}`);
          } else {
            console.warn(`⚠️ Failed to sync track order to Spotify for playlist ${playlistId}:`, await syncResponse.text());
          }
        } catch (error) {
          console.error(`❌ Error syncing track order to Spotify for playlist ${playlistId}:`, error);
        }
      }

      res.json({ 
        success: true, 
        message: spotifySync ? "Track order updated successfully and synced to Spotify" : "Track order updated successfully",
        updatedTracks: trackOrder.length,
        spotifySync
      });
    } catch (error) {
      console.error("Error reordering tracks:", error);
      res.status(500).json({ message: "Failed to reorder tracks" });
    }
  });

  app.delete("/api/prompt/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.query.userId as string;
      
      if (!userId) {
        return res.status(400).json({ message: "userId is required" });
      }

      await storage.deleteSavedPrompt(parseInt(id));
      res.json({ success: true });
    } catch (error) {
      console.error("Delete prompt error:", error);
      res.status(500).json({ message: "Failed to delete prompt" });
    }
  });
  
  // Migrate image URLs from temporary to permanent storage
  app.post("/api/migrate-images", async (req: Request, res: Response) => {
    try {
      const { userId } = req.body;
      
      if (!userId) {
        return res.status(400).json({ message: "userId is required" });
      }
      
      // Import image storage service
      const { saveImageFromUrl } = await import('./services/imageStorage');
      
      // Get all playlists with cover images
      const playlists = await storage.getPlaylistsByUserId(parseInt(userId));
      const migratedPlaylists = [];
      const failedPlaylists = [];
      
      // Process each playlist
      for (const playlist of playlists) {
        try {
          if (playlist.coverImageUrl && !playlist.coverImageUrl.startsWith('/images/')) {
            // Only migrate images that aren't already using our permanent storage
            console.log(`Migrating cover image for playlist: ${playlist.id} - ${playlist.title}`);
            
            // Download and save the image to local storage
            const permanentUrl = await saveImageFromUrl(playlist.coverImageUrl);
            
            // Update the playlist with the new permanent URL
            await storage.updatePlaylist(playlist.id, {
              coverImageUrl: permanentUrl
            });
            
            migratedPlaylists.push({
              id: playlist.id,
              title: playlist.title,
              oldUrl: playlist.coverImageUrl,
              newUrl: permanentUrl
            });
          }
        } catch (migrationError) {
          console.error(`Failed to migrate image for playlist ${playlist.id}:`, migrationError);
          failedPlaylists.push({
            id: playlist.id,
            title: playlist.title,
            error: migrationError.message
          });
        }
      }
      
      res.json({
        success: true,
        message: `Migration completed. ${migratedPlaylists.length} playlists migrated, ${failedPlaylists.length} failed.`,
        migratedPlaylists,
        failedPlaylists
      });
    } catch (error) {
      console.error("Image migration error:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to migrate images"
      });
    }
  });
  
  // Track replacement API
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
      
      if (!user || !user.spotifyAccessToken) {
        return res.status(401).json({ error: "Spotify authentication required" });
      }
      
      const userId = user.id;
      
      // Already checked user above, just reuse for access token
      
      // If needed, refresh the token
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
      
      // Generate a query for replacement track based on the original track
      let queryResult;
      let queryText;
      let avoidExplicit = false;
      
      if (customQuery) {
        queryText = customQuery;
        // Check if the custom query suggests avoiding explicit content
        avoidExplicit = customQuery.toLowerCase().includes("clean") || 
                       customQuery.toLowerCase().includes("no explicit") ||
                       customQuery.toLowerCase().includes("family friendly");
      } else {
        queryResult = await openai.generateReplacementTrackQuery(
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
      
      // Log genre suggestions if available
      if (queryResult?.genreSuggestions && queryResult.genreSuggestions.length > 0) {
        console.log("Genre suggestions from enhanced analysis:", queryResult.genreSuggestions);
      }
      
      let searchResults;
      
      try {
        // First try to search in our database with genre enhancement
        const { searchTracks } = await import('./db');
        
        // Use genre suggestions if available for more accurate genre-based search
        const genreSuggestions = queryResult?.genreSuggestions || [];
        console.log(`Using genre suggestions for search: ${JSON.stringify(genreSuggestions)}`);
        
        // Search using both text query and genre information
        searchResults = await searchTracks(
          queryText, 
          30, 
          0, 
          avoidExplicit,
          null, // no platform filter 
          genreSuggestions // pass genres for more accurate results
        );
        
        console.log(`Found ${searchResults.length} tracks in our database using enhanced genre search`);
        
        // Filter out tracks with zero or undefined duration
        searchResults = searchResults.filter(track => {
          if (!track.duration_ms || track.duration_ms === 0) {
            console.warn(`Filtered out replacement track with zero duration: ${track.name} by ${track.artists.map(a => a.name).join(', ')}`);
            return false;
          }
          return true;
        });
        console.log(`After duration filtering, ${searchResults.length} database tracks remain`);
        
        // If not enough results, fall back to Spotify API
        if (searchResults.length < 10) { // Increased from 5 to 10 to account for more filtering
          console.log('Not enough results from database, falling back to Spotify API');
          let spotifyResults = await spotify.searchTracks(accessToken, queryText, 25, avoidExplicit); // Increased from 15 to 25
          
          // Filter out Spotify tracks with zero duration too
          spotifyResults = spotifyResults.filter((track: any) => {
            if (!track.duration_ms || track.duration_ms === 0) {
              console.warn(`Filtered out Spotify replacement track with zero duration: ${track.name}`);
              return false;
            }
            return true;
          });
          
          // Combine results, avoiding duplicates
          const existingIds = new Set(searchResults.map(track => track.id));
          spotifyResults.forEach((track: any) => {
            if (!existingIds.has(track.id)) {
              searchResults.push(track);
              existingIds.add(track.id);
            }
          });
        }
      } catch (searchError) {
        console.error('Error searching database:', searchError);
        // Fall back to Spotify API
        let spotifyResults = await spotify.searchTracks(accessToken, queryText, 25, avoidExplicit); // Increased from 15 to 25
        
        // Filter out tracks with zero duration
        searchResults = spotifyResults.filter((track: any) => {
          if (!track.duration_ms || track.duration_ms === 0) {
            console.warn(`Filtered out Spotify replacement track with zero duration: ${track.name}`);
            return false;
          }
          return true;
        });
      }
      
      // Create sets of track IDs to filter out
      const playlistTrackIds = new Set(playlistTracks?.map((t: any) => t.id) || []);
      const previousSuggestionIds = new Set(previousSuggestions || []);
      
      // Filter out the original track, tracks by the same artist (unless requested), 
      // tracks already in the playlist, and previously suggested tracks
      const allowSameArtist = sessionId.toLowerCase().includes("same artist") || 
                             queryText.toLowerCase().includes("same artist") ||
                             queryText.toLowerCase().includes("by this artist");
                             
      const alternativeTracks = searchResults.filter((track: any) => {
        // Always filter out the exact same track
        if (track.id === trackId) return false;
        
        // Filter out tracks already in the playlist
        if (playlistTrackIds.has(track.id)) {
          console.log(`Filtered out track already in playlist: ${track.name}`);
          return false;
        }
        
        // Filter out tracks previously suggested for this track
        if (previousSuggestionIds.has(track.id)) {
          console.log(`Filtered out previously suggested track: ${track.name}`);
          return false;
        }
        
        // Filter out tracks by the same artist unless explicitly allowed
        if (!allowSameArtist) {
          const trackArtists = track.artists.map((a: any) => a.name.toLowerCase());
          if (trackArtists.includes(artistName.toLowerCase())) return false;
        }
        
        return true;
      }).slice(0, 5); // Limit to 5 alternatives
      
      // Generate more meaningful reasons for each alternative track
      const alternatives = alternativeTracks.map((track: any) => {
        // Create a descriptive reason using the genre suggestions if available
        let reason = `Similar to "${trackName}"`;
        
        if (queryResult?.genreSuggestions && queryResult.genreSuggestions.length > 0) {
          // Reference the first 1-2 genres that were identified
          const genreDescription = queryResult.genreSuggestions.slice(0, 2).join(' and ');
          reason += ` with ${genreDescription} influences`;
        } else {
          // Fallback to the generic reason if no genre info
          reason += ` with a ${
            Math.random() > 0.5 ? "similar" : "different"
          } vibe and ${
            Math.random() > 0.5 ? "matching" : "complementary"
          } energy`;
        }
        
        return {
          track,
          reason: reason + "."
        };
      });
      
      res.json({ 
        alternatives,
        originalQuery: queryText
      });
    } catch (error) {
      console.error("Error getting track replacements:", error);
      res.status(500).json({ error: "Failed to get replacement tracks" });
    }
  });

  // API endpoint to resolve track platform IDs
  app.post("/api/track/resolve-platforms", async (req: Request, res: Response) => {
    try {
      const { trackId } = req.body;
      
      if (!trackId) {
        return res.status(400).json({ message: "trackId is required" });
      }

      // Queue the track for platform resolution with high priority
      await import('./scripts/resolve-track-platforms').then(module => {
        return module.resolveTrackById(parseInt(trackId));
      });
      
      res.json({ 
        success: true,
        message: "Track has been queued for platform resolution. This process runs in the background and may take up to a minute to complete."
      });
    } catch (error) {
      console.error("Track platform resolution error:", error);
      res.status(500).json({ message: "Failed to queue track for platform resolution" });
    }
  });

  // API endpoint to search tracks from our database
  app.get("/api/tracks/search", async (req: Request, res: Response) => {
    try {
      const query = req.query.q as string || "";
      const limit = parseInt(req.query.limit as string || "20");
      const offset = parseInt(req.query.offset as string || "0");
      const platform = req.query.platform as string || null;
      const avoidExplicit = req.query.clean === "true";
      
      if (!query) {
        return res.status(400).json({ message: "Query parameter 'q' is required" });
      }
      
      console.log(`Searching tracks with query: "${query}", platform: ${platform || 'all'}, avoidExplicit: ${avoidExplicit}`);
      
      // Try to extract genres to enhance search
      let extractedGenres: string[] = [];
      try {
        // Import the genre analysis service for better search results
        const { extractGenresFromPrompt } = await import('./services/genreAnalysis');
        
        // Extract detailed genre information from the search query
        const genreAnalysis = await extractGenresFromPrompt(query);
        
        if (genreAnalysis.genres && genreAnalysis.genres.length > 0) {
          extractedGenres = genreAnalysis.genres.map(g => g.name);
          console.log(`Enhanced genre search: Found genres in query: ${extractedGenres.join(', ')}`);
        }
      } catch (error) {
        console.error("Error in genre extraction for track search:", error);
        // Continue with normal search if extraction fails
      }
      
      // Search database with genre enhancement
      const { searchTracks } = await import('./db');
      const tracks = await searchTracks(query, limit, offset, avoidExplicit, platform, extractedGenres);
      
      // For tracks with missing data, we could try to enrich them here if needed
      
      res.json({
        tracks,
        total: tracks.length, // This is just an estimate
        query,
        platform: platform || 'all'
      });
    } catch (error) {
      console.error("Track search error:", error);
      res.status(500).json({ message: "Failed to search tracks" });
    }
  });

  // Track import from JSON data
  app.post("/api/tracks/import", async (req: Request, res: Response) => {
    try {
      const { tracks } = req.body;
      
      if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
        return res.status(400).json({ message: "Request must include a 'tracks' array with at least one track" });
      }
      
      // Create a temporary file to store the JSON data
      const tempFilePath = `/tmp/tracks-import-${Date.now()}.json`;
      fs.writeFileSync(tempFilePath, JSON.stringify(tracks, null, 2));
      
      console.log(`Created temporary file for track import: ${tempFilePath} with ${tracks.length} tracks`);
      
      // Start the import process (this will happen asynchronously)
      const importPromise = importTracksFromJson(tempFilePath)
        .then(() => {
          console.log(`Track import completed for ${tracks.length} tracks`);
          // Clean up the temporary file
          fs.unlinkSync(tempFilePath);
        })
        .catch(error => {
          console.error("Error during track import:", error);
          // Still try to clean up the file
          try {
            if (fs.existsSync(tempFilePath)) {
              fs.unlinkSync(tempFilePath);
            }
          } catch (cleanupError) {
            console.error("Error cleaning up temporary file:", cleanupError);
          }
        });
      
      // Don't wait for the import to complete - return immediately
      res.json({ 
        message: `Started importing ${tracks.length} tracks`,
        status: "processing"
      });
    } catch (error) {
      console.error("Track import error:", error);
      res.status(500).json({ message: "Failed to import tracks" });
    }
  });

  // Admin endpoint to trigger genre update process
  app.post("/api/admin/update-genres", async (req: Request, res: Response) => {
    try {
      // This will be executed in the background
      import('./scripts/update-track-genres').then(module => {
        module.updateTrackGenres().catch(error => {
          console.error("Background genre update error:", error);
        });
      });
      
      res.json({ 
        success: true, 
        message: "Genre update process has been started. This runs in the background and may take several minutes to complete."
      });
    } catch (error) {
      console.error("Error starting genre update process:", error);
      res.status(500).json({ message: "Failed to start genre update process" });
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
      
      res.json({ credits: user.credits });
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
      
      if (user.credits < amount) {
        return res.status(400).json({ message: "Insufficient credits" });
      }
      
      // Deduct credits from user
      await storage.updateUser(userId, { 
        credits: user.credits - amount 
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
        credits: user.credits - amount,
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
      
      // Add credits to user
      await storage.updateUser(userId, { 
        credits: user.credits + amount 
      });
      
      // Record transaction
      await storage.createCreditTransaction({
        userId,
        amount,
        type: type || 'purchase',
        description: description || 'Credit purchase'
      });
      
      res.json({ 
        credits: user.credits + amount,
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

  // Smart Links API endpoints
  app.post('/api/smart-links', async (req, res) => {
    try {
      const { playlistId, promotedTrackId, customCoverImage, title, description } = req.body;
      
      // Generate unique share ID
      const shareId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      
      const smartLink = await storage.createSmartLink({
        shareId,
        playlistId,
        promotedTrackId,
        customCoverImage,
        title,
        description,
        views: 0
      });
      
      res.json(smartLink);
    } catch (error) {
      console.error('Error creating smart link:', error);
      res.status(500).json({ message: 'Failed to create smart link' });
    }
  });

  app.get('/api/smart-links/:shareId', async (req, res) => {
    try {
      const { shareId } = req.params;
      const smartLink = await storage.getSmartLink(shareId);
      
      if (!smartLink) {
        return res.status(404).json({ message: 'Smart link not found' });
      }

      // Update view count
      await storage.updateSmartLinkViews(shareId);
      
      // Get playlist with songs
      const playlistWithSongs = await storage.getPlaylistWithSongs(smartLink.playlistId);
      
      if (!playlistWithSongs) {
        return res.status(404).json({ message: 'Playlist not found' });
      }
      
      res.json({
        ...smartLink,
        playlist: playlistWithSongs.playlist,
        songs: playlistWithSongs.songs
      });
    } catch (error) {
      console.error('Error fetching smart link:', error);
      res.status(500).json({ message: 'Failed to fetch smart link' });
    }
  });

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

  // WhatsApp API routes - Load first to avoid conflicts
  try {
    const whatsappRoutes = await import('./api/whatsapp');
    app.use('/api/whatsapp', whatsappRoutes.default);
    console.log("WhatsApp routes loaded successfully");
  } catch (error) {
    console.warn("WhatsApp routes not loaded:", error.message);
  }

  // WhatsApp Bot Testing Endpoint - Register after other routes
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
      
      // Find tracks in database for the recommended songs
      const trackPromises = songRecommendations.songs.slice(0, 15).map(async (song) => {
        const tracks = await findTracksByTitleArtist(song.title, song.artist);
        return tracks.dbTracks && tracks.dbTracks.length > 0 ? tracks.dbTracks[0] : null;
      });

      const foundTracks = (await Promise.all(trackPromises)).filter(Boolean);
      
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

  return httpServer;
}
