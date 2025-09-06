import express, { type Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import * as spotify from "./spotify-fixed";
import * as openai from "./openai";
import { 
  insertUserSchema, 
  insertPlaylistSchema, 
  insertChatMessageSchema,
  SpotifyTrack
} from "@shared/schema";
import { db } from "./db";

export function registerRoutes(app: Express): Server {
  
  // Generate playlist endpoint with AI cover generation
  app.post("/api/generate-playlist", async (req: Request, res: Response) => {
    try {
      const { message, userId, sessionId, avoidExplicit } = req.body;
      
      if (!message || !userId || !sessionId) {
        return res.status(400).json({ error: "Missing required parameters" });
      }

      console.log(`🎵 Generating playlist for user ${userId}, session ${sessionId}`);
      console.log(`User prompt: "${message}"`);
      console.log(`Avoid explicit: ${avoidExplicit}`);

      // Store the user message
      await storage.createChatMessage({
        userId: parseInt(userId),
        sessionId,
        content: message,
        isUser: true
      });

      // Get all genres from database for context
      console.log("Fetching all genres from database for OpenAI context");
      const databaseGenres = await db.getAllDatabaseGenres();
      console.log(`Found ${databaseGenres.length} genres in database`);
      
      // Generate song recommendations with OpenAI
      const songRecommendations = await openai.generateSongRecommendations(message, databaseGenres);
      console.log(`OpenAI generated ${songRecommendations.songs.length} song recommendations`);
      
      // Search for tracks in database
      let tracks: SpotifyTrack[] = [];
      
      for (const suggestion of songRecommendations.songs) {
        if (tracks.length >= 24) break;
        
        console.log(`Searching for "${suggestion.title}" by ${suggestion.artist}`);
        
        const results = await db.findTracksByTitleArtist(
          [suggestion],
          5,
          avoidExplicit
        );
        
        const existingIds = new Set(tracks.map(t => t.id));
        for (const match of results.tracks) {
          if (!existingIds.has(match.id)) {
            tracks.push(match);
            existingIds.add(match.id);
            if (tracks.length >= 24) break;
          }
        }
      }
      
      console.log(`Found ${tracks.length} tracks in database`);
      
      // Generate playlist title and description
      const playlistIdeas = await openai.generatePlaylistIdeas(message, tracks);
      
      // Create AI response
      const aiResponseText = `I've created a playlist called "${playlistIdeas.title}" with ${tracks.length} songs based on your request. The description is: "${playlistIdeas.description}". You can preview the tracks, modify them, and adjust the title and description before saving.`;
      
      await storage.createChatMessage({
        userId: parseInt(userId),
        sessionId,
        content: aiResponseText,
        isUser: false
      });
      
      // Generate AI cover image automatically
      console.log("🎨 Generating AI cover image for playlist");
      try {
        const coverDescription = await openai.generateCoverImageDescription(
          playlistIdeas.title,
          playlistIdeas.description,
          tracks
        );
        console.log("Generated cover description:", coverDescription);
        
        const coverImageUrl = await openai.generateCoverImage(coverDescription);
        console.log("Generated cover image URL:", coverImageUrl);
        
        // Send response with AI-generated cover
        res.json({
          message: aiResponseText,
          playlist: {
            title: playlistIdeas.title,
            description: playlistIdeas.description,
            coverImageUrl: coverImageUrl,
            tracks
          }
        });
        return;
      } catch (coverError) {
        console.error("Cover generation error (proceeding without cover):", coverError);
        // Send response without cover if generation fails
        res.json({
          message: aiResponseText,
          playlist: {
            title: playlistIdeas.title,
            description: playlistIdeas.description,
            coverImageUrl: "",
            tracks
          }
        });
        return;
      }
      
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

  // Cover generation endpoint
  app.post("/api/cover/generate", async (req: Request, res: Response) => {
    try {
      const { title, description, tracks, customPrompt } = req.body;
      
      if (!title) {
        return res.status(400).json({ message: "title is required" });
      }

      let finalImagePrompt;
      
      if (customPrompt) {
        console.log("Using user-provided custom prompt:", customPrompt);
        finalImagePrompt = customPrompt;
      } else {
        console.log("Generating automatic cover description based on playlist info");
        finalImagePrompt = await openai.generateCoverImageDescription(title, description, tracks);
      }
      
      console.log("Final image generation prompt:", finalImagePrompt);
      
      const coverImageUrl = await openai.generateCoverImage(finalImagePrompt);
      
      res.json({ 
        coverImageUrl,
        promptUsed: finalImagePrompt 
      });
      
    } catch (error) {
      console.error("Cover generation error:", error);
      res.status(500).json({ message: "Failed to generate cover image" });
    }
  });

  // Get playlists
  app.get("/api/playlists", async (req: Request, res: Response) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.status(400).json({ message: "userId is required" });
      }

      const playlists = await storage.getUserPlaylists(parseInt(userId));
      res.json(playlists);
    } catch (error) {
      console.error("Get playlists error:", error);
      res.status(500).json({ message: "Failed to get playlists" });
    }
  });

  // Save playlist
  app.post("/api/playlist/save", async (req: Request, res: Response) => {
    try {
      const { userId, title, description, coverImageUrl, tracks, isPublic } = req.body;

      if (!userId || !title || !tracks || !Array.isArray(tracks)) {
        return res.status(400).json({ message: "userId, title, and tracks array are required" });
      }

      const playlist = await storage.createPlaylist({
        userId: parseInt(userId),
        title,
        description: description || "",
        coverImageUrl: coverImageUrl || "",
        isPublic: isPublic || false
      });

      res.json({ 
        message: "Playlist saved successfully", 
        playlistId: playlist.id 
      });
    } catch (error) {
      console.error("Save playlist error:", error);
      res.status(500).json({ message: "Failed to save playlist" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}