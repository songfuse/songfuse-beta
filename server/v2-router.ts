import express, { Request, Response } from 'express';
import { savePlaylist, getPlaylistDetails } from './routes-playlist-simplified';
import { playlistStorage } from './playlist_storage_simplified';
import { updatePlaylistCover, syncSessionCoverWithPlaylist } from './services/playlistCoverService';
import { storage } from './storage';

// Create a dedicated router for v2 API endpoints
const v2Router = express.Router();

// Add middleware to ensure we're always returning JSON
v2Router.use((req, res, next) => {
  console.log("=== V2 ROUTER MIDDLEWARE CALLED ===");
  console.log("V2 Router - Request method:", req.method);
  console.log("V2 Router - Request URL:", req.url);
  res.setHeader('Content-Type', 'application/json');
  next();
});

// Add playlist-related endpoints
v2Router.post('/playlist/save', (req, res) => {
  console.log("=== V2 ROUTER - PLAYLIST SAVE ENDPOINT CALLED ===");
  console.log("V2 Router - Request method:", req.method);
  console.log("V2 Router - Request URL:", req.url);
  console.log("V2 Router - Request body:", req.body);
  savePlaylist(req, res);
});
v2Router.get('/playlist/:idOrSpotifyId', getPlaylistDetails);

// Smart Links endpoints
v2Router.delete('/smart-links/:smartLinkId', async (req: Request, res: Response) => {
  try {
    const smartLinkId = parseInt(req.params.smartLinkId);
    
    // Check if smart link exists
    const smartLink = await storage.getSmartLinkById(smartLinkId);
    if (!smartLink) {
      return res.status(404).json({ message: 'Smart link not found' });
    }
    
    // Delete the smart link
    await storage.deleteSmartLink(smartLinkId);
    
    return res.json({ 
      success: true, 
      message: 'Smart link deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting smart link:', error);
    return res.status(500).json({ message: 'Failed to delete smart link' });
  }
});

// Test endpoint for cover image service
v2Router.post('/test-cover-update', async (req: Request, res: Response) => {
  try {
    const { playlistId, coverImageUrl, sessionId } = req.body;
    
    if (!playlistId) {
      return res.status(400).json({
        success: false,
        message: "Missing playlistId in request"
      });
    }
    
    // Get the playlist before update
    const beforePlaylist = await playlistStorage.getPlaylist(parseInt(playlistId));
    
    let result;
    if (coverImageUrl) {
      // Test direct cover update with provided URL
      result = await updatePlaylistCover(parseInt(playlistId), coverImageUrl);
    } else if (sessionId) {
      // Test syncing with session cover
      result = await syncSessionCoverWithPlaylist(sessionId, parseInt(playlistId));
    } else {
      return res.status(400).json({
        success: false,
        message: "Either coverImageUrl or sessionId must be provided"
      });
    }
    
    // Get the playlist after update to confirm change
    const afterPlaylist = await playlistStorage.getPlaylist(parseInt(playlistId));
    
    return res.json({
      success: result.success,
      playlistId,
      beforeCover: beforePlaylist?.coverImageUrl,
      afterCover: afterPlaylist?.coverImageUrl,
      resultCover: result.resultUrl,
      message: result.success 
        ? "Cover image updated successfully" 
        : "Cover image update failed"
    });
  } catch (error) {
    console.error("Error in cover image test:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// Test endpoint for session cover storage
v2Router.post('/test-session-cover', async (req: Request, res: Response) => {
  try {
    const { sessionId, coverImageUrl } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "Missing sessionId in request"
      });
    }
    
    if (!coverImageUrl) {
      // Get the current session cover
      const currentCover = await storage.getCoverImageForSession(sessionId);
      return res.json({
        success: true,
        sessionId,
        currentCover
      });
    } else {
      // Store a new cover in the session
      await storage.storeCoverImageForSession(sessionId, coverImageUrl);
      
      // Verify it was stored
      const storedCover = await storage.getCoverImageForSession(sessionId);
      
      return res.json({
        success: storedCover === coverImageUrl,
        sessionId,
        originalCover: coverImageUrl,
        storedCover
      });
    }
  } catch (error) {
    console.error("Error in session cover test:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// Direct test endpoint for debugging
v2Router.post('/direct-test', async (req: Request, res: Response) => {
  try {
    console.log("V2 direct test endpoint called with body:", req.body);
    
    // Create a playlist directly using the simplified storage
    const playlist = await playlistStorage.createPlaylist({
      title: "V2 Direct Test " + new Date().toISOString(),
      description: "Direct test of V2 simplified schema",
      userId: req.body.userId || 1,
      isPublic: true
    });
    
    return res.json({
      success: true,
      message: "V2 direct test successful!",
      playlist
    });
  } catch (error) {
    console.error("Error in V2 direct test:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

export default v2Router;