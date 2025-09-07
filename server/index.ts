import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import path from "path";
import { registerRoutes } from "./routes-fixed"; // Switch back to the working routes-fixed.ts
import { setupVite, serveStatic, log } from "./vite";
import { ensureDirectoriesExist } from "./services/imageStorage";
// Import image verification middleware and services
import { imageVerificationMiddleware } from "./middlewares/imageVerification";
import { addDirectDbRoutes } from "./direct-db-access"; // Add direct database access routes
import { addSpotifyExportRoutes } from "./routes-spotify-export"; // Add Spotify export routes
import { addDirectFinderRoutes } from "./direct-track-finder"; // Add simple track finding routes
import { addTestRoutes } from "./test-routes"; // Add test routes for diagnostics
import { addSimplifiedTracksEndpoint } from "./simplified-tracks"; // Add simplified tracks endpoint
import { addJsonTestEndpoint } from "./guaranteed-json-endpoint"; // Add guaranteed JSON test endpoint
import { addGptImageJsonEndpoint } from "./gpt-image-json-endpoint"; // Add guaranteed GPT Image JSON endpoint
import { addDatabaseStatsRoutes } from "./database-stats"; // Add database statistics routes
import { addDashboardRoutes } from "./dashboard-metrics"; // Add dashboard metrics routes
import { addThumbnailRoutes } from "./api/thumbnail-generation"; // Add thumbnail generation routes
import { addThumbnailServiceRoutes } from "./api/thumbnail-service"; // Add thumbnail service routes
import albumsRoutes from "./api/albumsRoutes"; // Add top albums routes
import { apiErrorMiddleware } from "./middlewares/apiErrorHandler"; // Import our new API error middleware
import { initCoverImageMonitoring } from "./services/coverImageMonitoring"; // Import cover image monitoring service
import { odesliBackgroundService } from "./services/odesliBackgroundService"; // Import Odesli background service
import { 
  generatePlaylistSocialImages, 
  getPlaylistSocialImages, 
  processMissingSocialImages,
  getSocialImageStats 
} from "./api/social-images"; // Import social image API routes
import { storage } from "./storage"; // Import storage for smart link metadata
import { smartLinkSSRMiddleware } from "./services/smartLinkSSR"; // Import smart link SSR service
import { simpleAuth } from "./auth/simple"; // Import simple auth middleware
import simpleAuthRoutes from "./auth/simple-routes"; // Import simple auth routes

// Define TypeScript type for global variables
declare global {
  var recentlyUsedTracks: Set<string>;
  var artistUsageCount: Map<string, number>;
}

// Initialize global track tracking variables
// This ensures we avoid duplicating tracks and overusing same artists across playlists
if (typeof global.recentlyUsedTracks === 'undefined') {
  global.recentlyUsedTracks = new Set<string>();
  console.log("Initialized global track tracking with empty set");
}

// Initialize global artist usage counter for better artist diversity
if (typeof global.artistUsageCount === 'undefined') {
  global.artistUsageCount = new Map<string, number>();
  console.log("Initialized global artist usage counter with empty map");
}

const app = express();
// Increase JSON payload limit to 50MB for large track imports
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));
// Add cookie parser middleware
app.use(cookieParser());

// Import and use news routes
import newsRoutes from './api/newsRoutes';
app.use('/api', newsRoutes);

// Import direct database access route for emergency fallback
import { getPlaylistByIdDirect } from './direct-db-access';

// Add image verification middleware to ensure all cover images exist
app.use(imageVerificationMiddleware);

// Initialize simple authentication middleware
app.use(simpleAuth);

// Add simple authentication routes
app.use('/api/auth', simpleAuthRoutes);

// Serve static files from the public directory
app.use(express.static(path.join(process.cwd(), "public")));

// Ensure image directories exist at startup
ensureDirectoriesExist().catch(err => {
  console.error("Failed to create image directories:", err);
});

// Start cover image monitoring service
initCoverImageMonitoring().then(() => {
  console.log("Cover image monitoring service started successfully");
}).catch(err => {
  console.error("Failed to initialize cover image monitoring service:", err);
});

// Direct API endpoints for smart links (bypass Vite middleware issues)
app.post("/api/v2/smart-links", async (req: Request, res: Response) => {
  // Force JSON content type with comprehensive headers
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
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
    const { storage } = await import('./storage');
    const newSmartLink = await storage.createSmartLink(smartLinkData);
    console.log('Smart link created successfully:', newSmartLink);
    
    // Generate optimized social images for the smart link
    try {
      const { socialImageOptimizer } = await import('./services/socialImageOptimizer');
      const playlist = await storage.getPlaylist(smartLinkData.playlistId);
      
      if (playlist?.coverImageUrl) {
        const coverImageUrl = customCoverImage || playlist.coverImageUrl;
        console.log(`Generating optimized social images for playlist ${smartLinkData.playlistId}`);
        
        // Generate optimized images and update the smart link with URLs
        const optimizedImages = await socialImageOptimizer.createOptimizedSocialImages(coverImageUrl, smartLinkData.playlistId);
        console.log(`✅ Optimized social images created for playlist ${smartLinkData.playlistId}:`, optimizedImages);
        
        // Update the smart link with the optimized image URLs
        await storage.updateSmartLinkSocialImages(newSmartLink.id, optimizedImages.socialUrl, optimizedImages.openGraphUrl);
      }
    } catch (error) {
      console.error('Error creating optimized images:', error);
    }
    
    return res.status(200).json(newSmartLink);
  } catch (error) {
    console.error('Error creating smart link:', error);
    return res.status(500).json({ message: 'Failed to create smart link', error: error.message });
  }
});

app.put("/api/v2/smart-links/:shareId", async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  try {
    const { shareId } = req.params;
    const { playlistId, promotedTrackId, customCoverImage, title, description } = req.body;
    
    console.log('Smart link update request:', { shareId, ...req.body });
    
    // Validate required fields
    if (!promotedTrackId || !title) {
      console.error('Missing required fields:', { promotedTrackId, title });
      return res.status(400).json({ message: 'Missing required fields: promotedTrackId and title are required' });
    }
    
    const { storage } = await import('./storage');
    
    // Check if smart link exists
    const existingSmartLink = await storage.getSmartLink(shareId);
    if (!existingSmartLink) {
      return res.status(404).json({ message: 'Smart link not found' });
    }
    
    // Update the smart link
    const updatedData = {
      promotedTrackId: parseInt(promotedTrackId),
      customCoverImage: customCoverImage || null,
      title,
      description: description || null,
    };
    
    console.log('Updating smart link with data:', updatedData);
    const updatedSmartLink = await storage.updateSmartLink(shareId, updatedData);
    console.log('Smart link updated successfully:', updatedSmartLink);
    
    // Generate optimized social images for the updated smart link
    try {
      const { socialImageOptimizer } = await import('./services/socialImageOptimizer');
      const playlist = await storage.getPlaylist(existingSmartLink.playlistId);
      
      if (playlist?.coverImageUrl) {
        const coverImageUrl = customCoverImage || playlist.coverImageUrl;
        console.log(`Regenerating optimized social images for playlist ${existingSmartLink.playlistId}`);
        
        const optimizedImages = await socialImageOptimizer.createOptimizedSocialImages(coverImageUrl, existingSmartLink.playlistId);
        console.log(`✅ Optimized social images updated for playlist ${existingSmartLink.playlistId}:`, optimizedImages);
        
        await storage.updateSmartLinkSocialImages(updatedSmartLink.id, optimizedImages.socialUrl, optimizedImages.openGraphUrl);
      }
    } catch (error) {
      console.error('Error updating optimized images:', error);
    }
    
    return res.status(200).json(updatedSmartLink);
  } catch (error) {
    console.error('Error updating smart link:', error);
    return res.status(500).json({ message: 'Failed to update smart link', error: error.message });
  }
});

app.get("/api/v2/users/:userId/smart-links", async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  
  try {
    const userId = parseInt(req.params.userId);
    const { storage } = await import('./storage');
    const smartLinks = await storage.getSmartLinksByUserId(userId);
    return res.json(smartLinks);
  } catch (error) {
    console.error('Error fetching user smart links:', error);
    return res.status(500).json({ message: 'Failed to fetch smart links' });
  }
});

// Delete smart link endpoint
app.delete("/api/v2/smart-links/:smartLinkId", async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  
  try {
    const smartLinkId = parseInt(req.params.smartLinkId);
    const { storage } = await import('./storage');
    
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

app.get("/api/users/:userId/smart-links", async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  
  try {
    const userId = parseInt(req.params.userId);
    const { storage } = await import('./storage');
    const smartLinks = await storage.getSmartLinksByUserId(userId);
    return res.json(smartLinks);
  } catch (error) {
    console.error('Error fetching user smart links:', error);
    return res.status(500).json({ message: 'Failed to fetch smart links' });
  }
});

// Public smart link endpoints
app.get("/api/smart-links/:shareId", async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  
  try {
    const { shareId } = req.params;
    const { storage } = await import('./storage');
    
    // Get smart link data
    const smartLink = await storage.getSmartLinkByShareId(shareId);
    if (!smartLink) {
      return res.status(404).json({ message: 'Smart link not found' });
    }
    
    // Increment view count
    await storage.incrementSmartLinkViews(shareId);
    
    // Return the smart link data with the incremented view count
    const updatedSmartLink = {
      ...smartLink,
      views: smartLink.views + 1
    };
    
    return res.json(updatedSmartLink);
  } catch (error) {
    console.error('Error fetching smart link:', error);
    return res.status(500).json({ message: 'Failed to fetch smart link' });
  }
});

// Generate optimized social images for smart links
app.post("/api/smart-links/:shareId/optimize-images", async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  
  try {
    const { shareId } = req.params;
    const { storage } = await import('./storage');
    const { socialImageOptimizer } = await import('./services/socialImageOptimizer');
    
    // Get smart link data
    const smartLink = await storage.getSmartLinkByShareId(shareId);
    if (!smartLink) {
      return res.status(404).json({ message: 'Smart link not found' });
    }
    
    // Get the cover image URL (custom or playlist default)
    const coverImageUrl = smartLink.customCoverImage || smartLink.playlist.coverImageUrl;
    if (!coverImageUrl) {
      return res.status(400).json({ message: 'No cover image available for optimization' });
    }
    
    // Generate optimized images
    const optimizedImages = await socialImageOptimizer.createOptimizedSocialImages(coverImageUrl, smartLink.playlist.id);
    
    return res.json({
      success: true,
      images: optimizedImages,
      message: 'Images optimized for social sharing'
    });
  } catch (error) {
    console.error('Error optimizing social images:', error);
    return res.status(500).json({ message: 'Failed to optimize images' });
  }
});

// Get optimized social images for smart links
app.get("/api/smart-links/:shareId/social-images", async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  
  try {
    const { shareId } = req.params;
    const { socialImageOptimizer } = await import('./services/socialImageOptimizer');
    
    // Get existing optimized images
    const optimizedImages = await socialImageOptimizer.getOptimizedImages(shareId);
    
    if (!optimizedImages) {
      return res.status(404).json({ message: 'No optimized images found' });
    }
    
    return res.json(optimizedImages);
  } catch (error) {
    console.error('Error fetching social images:', error);
    return res.status(500).json({ message: 'Failed to fetch social images' });
  }
});

// Server-side rendered smart link page with Open Graph meta tags
// Add specific exclusions to avoid conflicts with frontend routes
app.get("/smart-links/:shareId", async (req: Request, res: Response, next) => {
  const { shareId } = req.params;
  
  // Skip server-side rendering for these frontend routes
  if (shareId === 'create' || shareId === 'edit') {
    return next();
  }
  
  try {
    const { storage } = await import('./storage');
    const { socialImageOptimizer } = await import('./services/socialImageOptimizer');
    
    // Get smart link data
    const smartLink = await storage.getSmartLinkByShareId(shareId);
    if (!smartLink) {
      return res.status(404).send('Smart link not found');
    }
    
    // Try to get optimized social images first
    let ogImageUrl = smartLink.customCoverImage || smartLink.playlist.coverImageUrl;
    let socialImageUrl = ogImageUrl;
    
    try {
      const optimizedImages = await socialImageOptimizer.getOptimizedImages(smartLink.playlist.id);
      if (optimizedImages) {
        ogImageUrl = optimizedImages.openGraphUrl; // 1200x630 for Facebook/Twitter
        socialImageUrl = optimizedImages.socialUrl; // 800x800 under 100KB
        console.log(`Using optimized social images for smart link ${shareId}`);
      } else {
        console.log(`No optimized images found for playlist ${smartLink.playlist.id}, using original cover`);
      }
    } catch (error) {
      console.log(`Error fetching optimized images, falling back to original: ${error.message}`);
    }
    
    // Escape HTML characters in text content
    const escapeHtml = (text: string) => {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };

    const title = escapeHtml(smartLink.title);
    const description = escapeHtml(smartLink.description || `Discover amazing music with ${smartLink.playlist.title} playlist`);
    const currentUrl = `${req.protocol}://${req.get('host')}/smart-links/${shareId}`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  
  <!-- Basic meta tags -->
  <title>${title} - SongFuse</title>
  <meta name="description" content="${description}">
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="SongFuse">
  <meta property="og:url" content="${currentUrl}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  ${ogImageUrl ? `<meta property="og:image" content="${ogImageUrl}">` : ''}
  ${ogImageUrl ? `<meta property="og:image:secure_url" content="${ogImageUrl}">` : ''}
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${title} - Playlist Cover">
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@songfuse">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  ${ogImageUrl ? `<meta name="twitter:image" content="${ogImageUrl}">` : ''}
  
  <!-- Additional meta for messaging apps -->
  <meta name="theme-color" content="#d02b31">
  
  <!-- Redirect to React app after a short delay -->
  <script>
    setTimeout(function() {
      window.location.href = '/#/smart-links/${shareId}';
    }, 2000);
  </script>
</head>
<body style="font-family: Arial, sans-serif; padding: 40px; text-align: center; background: #f8f9fa;">
  <h1 style="color: #d02b31; margin-bottom: 20px;">${title}</h1>
  <p style="color: #666; margin-bottom: 30px; font-size: 18px;">${description}</p>
  ${ogImageUrl ? `<img src="${ogImageUrl}" alt="Playlist Cover" style="max-width: 300px; border-radius: 8px; margin: 20px 0;">` : ''}
  <p style="color: #999;">Loading SongFuse... <a href="/#/smart-links/${shareId}" style="color: #d02b31;">Click here if not redirected</a></p>
</body>
</html>`;
    
    res.send(html);
  } catch (error) {
    console.error('Error serving smart link page:', error);
    res.status(500).send('Error loading smart link');
  }
});

app.get("/api/smart-links/:shareId/tracks", async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  
  try {
    const { shareId } = req.params;
    const { storage } = await import('./storage');
    
    const tracks = await storage.getSmartLinkTracks(shareId);
    return res.json(tracks);
  } catch (error) {
    console.error('Error fetching smart link tracks:', error);
    return res.status(500).json({ message: 'Failed to fetch tracks' });
  }
});

// Playlist-based smart link endpoint
app.get("/api/smart-links/playlist/:playlistId", async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  
  try {
    const playlistId = parseInt(req.params.playlistId);
    const { storage } = await import('./storage');
    
    // First try to get an existing smart link for this playlist
    const existingSmartLink = await storage.getSmartLinkByPlaylistId(playlistId);
    if (existingSmartLink) {
      // Increment view count for existing smart links
      await storage.incrementSmartLinkViewsByPlaylistId(playlistId);
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
      shareId: `playlist-${playlistId}`,
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
      views: 0,
      createdAt: playlist.createdAt?.toISOString() || new Date().toISOString(),
      promotedTrackId: null
    };
    
    return res.json(smartLinkResponse);
  } catch (error) {
    console.error('Error fetching playlist smart link:', error);
    return res.status(500).json({ message: 'Failed to fetch playlist' });
  }
});

app.get("/api/smart-links/playlist/:playlistId/tracks", async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  
  try {
    const playlistId = parseInt(req.params.playlistId);
    const { storage } = await import('./storage');
    
    const tracks = await storage.getSmartLinkTracks(`playlist-${playlistId}`);
    return res.json(tracks);
  } catch (error) {
    console.error('Error fetching playlist tracks:', error);
    return res.status(500).json({ message: 'Failed to fetch tracks' });
  }
});

// Direct API endpoint for discover playlists
app.get("/api/discover/playlists", async (req: Request, res: Response) => {
  // Explicitly set content type to JSON
  res.setHeader('Content-Type', 'application/json');
  
  try {
    const limit = parseInt(req.query.limit as string || "20");
    const offset = parseInt(req.query.offset as string || "0");
    const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
    const isPublicOnly = req.query.isPublic === 'true';
    const spotifyOnly = req.query.spotifyOnly === 'true';
    
    console.log(`Getting playlists with limit: ${limit}, offset: ${offset}, isPublicOnly: ${isPublicOnly}, spotifyOnly: ${spotifyOnly}`);
    
    // Import storage to avoid circular dependencies
    const { storage } = await import('./storage');
    
    // Get public playlists with optional Spotify filter
    const playlists = await storage.getPublicPlaylists(limit, offset, userId, spotifyOnly);
    
    // Get creator usernames and song counts for each playlist
    const playlistsWithDetails = await Promise.all(playlists.map(async (playlist) => {
      const creator = await storage.getUser(playlist.userId);
      
      // Use a direct database query to get the count from playlist_tracks
      const { pool } = await import('./db');
      const result = await pool.query(`
        SELECT COUNT(*) as count 
        FROM playlist_tracks 
        WHERE playlist_id = $1
      `, [playlist.id]);
      const songCount = parseInt(result.rows[0]?.count || '0');
      
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

// Discover search endpoint for playlists
app.get("/api/discover/search", async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  
  try {
    const query = req.query.q as string || "";
    const limit = parseInt(req.query.limit as string || "20");
    const offset = parseInt(req.query.offset as string || "0");
    const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
    const isPublicOnly = req.query.isPublic === 'true';
    const spotifyOnly = req.query.spotifyOnly === 'true';
    
    console.log(`Searching playlists with query: "${query}", limit: ${limit}, offset: ${offset}, isPublicOnly: ${isPublicOnly}, spotifyOnly: ${spotifyOnly}`);
    
    if (!query.trim()) {
      // If no query provided, redirect to playlists endpoint with the same params
      const params = new URLSearchParams();
      params.append('limit', limit.toString());
      params.append('offset', offset.toString());
      if (userId) params.append('userId', userId.toString());
      if (isPublicOnly) params.append('isPublic', 'true');
      if (spotifyOnly) params.append('spotifyOnly', 'true');
      
      const redirectUrl = `/api/discover/playlists?${params.toString()}`;
      console.log(`Redirecting to: ${redirectUrl}`);
      return res.redirect(redirectUrl);
    }
    
    // Import storage to avoid circular dependencies
    const { storage } = await import('./storage');
    
    // Search playlists - storage.searchPlaylists should be updated to support spotifyOnly
    const playlists = await storage.searchPlaylists(query, limit, offset, userId, spotifyOnly);
    
    // Get creator usernames and song counts for each playlist
    const playlistsWithDetails = await Promise.all(playlists.map(async (playlist) => {
      const creator = await storage.getUser(playlist.userId);
      
      // Use direct database query to get the count from playlist_tracks
      const { pool } = await import('./db');
      const result = await pool.query(`
        SELECT COUNT(*) as count 
        FROM playlist_tracks 
        WHERE playlist_id = $1
      `, [playlist.id]);
      const songCount = parseInt(result.rows[0]?.count || '0');
      
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

// Direct API endpoint for fetching a single discover playlist with its tracks
app.get("/api/discover/playlist/:id", async (req: Request, res: Response) => {
  // Explicitly set content type to JSON
  res.setHeader('Content-Type', 'application/json');
  
  try {
    const playlistId = parseInt(req.params.id);
    
    if (isNaN(playlistId)) {
      return res.status(400).json({ message: "Invalid playlist ID" });
    }
    
    // Import storage to avoid circular dependencies
    const { storage } = await import('./storage');
    
    // Get the playlist
    const playlist = await storage.getPlaylist(playlistId);
    
    if (!playlist) {
      return res.status(404).json({ message: "Playlist not found" });
    }
    
    if (!playlist.isPublic) {
      return res.status(403).json({ message: "This playlist is not public" });
    }
    
    // Get the creator
    const creator = await storage.getUser(playlist.userId);
    
    // Use a direct database query to get the songs from playlist_tracks
    const { pool } = await import('./db');
    const tracksQuery = `
      SELECT 
        t.id,
        t.title,
        t.duration AS "durationMs",
        t.explicit,
        t.preview_url,
        t.release_date,
        pt.position,
        (
          SELECT json_agg(json_build_object('id', a.id, 'name', a.name))
          FROM tracks_to_artists tta
          JOIN artists a ON tta.artist_id = a.id
          WHERE tta.track_id = t.id
        ) AS artists,
        (
          SELECT json_agg(g.name)
          FROM tracks_to_genres tg
          JOIN genres g ON tg.genre_id = g.id
          WHERE tg.track_id = t.id
        ) AS genres,
        alb.title AS "albumName",
        alb.cover_image AS "albumImage",
        tpi.platform_id AS "spotifyId"
      FROM playlist_tracks pt
      JOIN tracks t ON pt.track_id = t.id
      LEFT JOIN albums alb ON t.album_id = alb.id
      LEFT JOIN track_platform_ids tpi ON t.id = tpi.track_id AND tpi.platform = 'spotify'
      WHERE pt.playlist_id = $1
      ORDER BY pt.position ASC
    `;
    
    const tracksResult = await pool.query(tracksQuery, [playlistId]);
    
    // Format the tracks for the frontend to match expected Song type
    const songs = tracksResult.rows.map(track => ({
      id: track.id,
      playlistId: playlistId,
      title: track.title,
      durationMs: track.durationMs,
      explicit: track.explicit,
      previewUrl: track.preview_url,
      releaseDate: track.release_date,
      position: track.position,
      // Format artist string from artists array
      artist: Array.isArray(track.artists) 
        ? track.artists.map((a: any) => a.name).join(', ')
        : 'Unknown Artist',
      album: track.albumName || null,
      albumImageUrl: track.albumImage || null,
      genres: track.genres || [],
      spotifyId: track.spotifyId
    }));
    
    // Return the playlist with its songs
    res.json({
      playlist,
      songs,
      creatorName: creator?.username || "Unknown User"
    });
  } catch (error) {
    console.error('Error fetching discover playlist:', error);
    res.status(500).json({ message: "Failed to fetch playlist details" });
  }
});

// Direct API endpoint for track import that bypasses Vite
// Direct API endpoint for track export that bypasses Vite
app.get("/_songfuse_api/tracks-export", async (req: Request, res: Response) => {
  // Explicitly set content type to JSON
  res.setHeader('Content-Type', 'application/json');
  
  try {
    // Dynamically import the pool to avoid circular dependencies
    const { pool } = await import('./db');
    
    console.log("Starting direct tracks export with raw SQL...");
    
    // Use a comprehensive SQL query to get complete artist data
    const query = `
      WITH artist_details AS (
        SELECT 
          ta.track_id,
          a.id AS artist_id,
          a.name AS artist_name,
          ta.is_primary
        FROM 
          tracks_to_artists ta
        JOIN 
          artists a ON ta.artist_id = a.id
      ),
      track_artists AS (
        SELECT 
          t.id AS track_id,
          CASE 
            WHEN COUNT(ad.artist_id) = 0 THEN '[]'::jsonb
            ELSE JSONB_AGG(
              JSONB_BUILD_OBJECT(
                'id', ad.artist_id, 
                'name', ad.artist_name, 
                'isPrimary', ad.is_primary,
                'artistId', ad.artist_id,
                'trackId', t.id,
                'relationKey', CONCAT(t.id, '-', ad.artist_id)
              ) ORDER BY ad.is_primary DESC, ad.artist_name
            )
          END as artists_data
        FROM 
          tracks t
        LEFT JOIN 
          artist_details ad ON t.id = ad.track_id
        GROUP BY 
          t.id
      ),
      track_genres AS (
        SELECT
          t.id AS track_id,
          CASE 
            WHEN COUNT(g.id) = 0 THEN ARRAY[]::text[]
            ELSE ARRAY_AGG(DISTINCT g.name) 
          END as genre_names
        FROM
          tracks t
        LEFT JOIN
          tracks_to_genres tg ON t.id = tg.track_id
        LEFT JOIN
          genres g ON tg.genre_id = g.id
        GROUP BY
          t.id
      )
      SELECT 
        t.id as track_id,
        t.title,
        t.release_date,
        t.duration,
        t.popularity,
        t.explicit,
        t.energy,
        t.tempo,
        t.danceability,
        t.valence,
        t.acousticness,
        t.instrumentalness,
        t.speechiness,
        t.liveness,
        COALESCE(tg.genre_names, ARRAY[]::text[]) as genres,
        tpi.platform_id as spotify_id,
        COALESCE(ta.artists_data, '[]'::jsonb) as artists_data
      FROM 
        tracks t
      LEFT JOIN 
        track_artists ta ON t.id = ta.track_id
      LEFT JOIN 
        track_genres tg ON t.id = tg.track_id
      LEFT JOIN 
        track_platform_ids tpi ON t.id = tpi.track_id AND tpi.platform = 'spotify'
      ORDER BY 
        t.id
      LIMIT 10000
    `;
    
    // Execute the query
    const result = await pool.query(query);
    
    if (!result || !result.rows || result.rows.length === 0) {
      console.log("No tracks found in the database");
      return res.status(404).json([]);
    }

    // Define interfaces for the artist data
    interface ArtistData {
      id: number;
      name: string;
      isPrimary: boolean;
      artistId: number;
      trackId: number;
      relationKey: string;
    }

    // Transform the tracks to a unified format with enhanced artist information
    const simplifiedTracks = result.rows.map(track => {
      // Parse the artists_data JSON array
      let artists: ArtistData[] = [];
      try {
        // Ensure artists_data is not null or undefined
        const artistsData = track.artists_data || '[]';
        
        // Convert the JSON data to an actual array of artist objects
        if (Array.isArray(artistsData)) {
          artists = artistsData;
        } else if (typeof artistsData === 'string') {
          artists = JSON.parse(artistsData);
        } else if (artistsData && typeof artistsData === 'object') {
          // Handle case where it's a single object
          artists = [artistsData];
        }
        
        // Final safeguard to ensure artists is always an array
        if (!Array.isArray(artists)) {
          artists = [];
          console.log(`Invalid artists format for track ${track.track_id}, defaulting to empty array`);
        }
      } catch (e) {
        console.log(`Error parsing artists data for track ${track.track_id}:`, e);
        artists = [];
      }

      // Create a formatted artist string for backward compatibility
      // Primary artists come first (sorted in the SQL query)
      const artistString = artists
        .map((a: ArtistData) => a.name)
        .filter(Boolean)
        .join(", ");

      return {
        id: track.track_id, // Database ID from tracks table
        dbId: track.track_id, // Also include as dbId for compatibility
        title: track.title,
        artists: artists, // Complete artist objects with id, name, isPrimary, artistId, trackId
        // Keep artist string for backward compatibility
        artist: artistString || "Unknown Artist",
        genres: Array.isArray(track.genres) ? track.genres.filter(Boolean) : [],
        releaseDate: track.release_date,
        spotifyId: track.spotify_id || null, // Spotify ID
        // Include additional track properties
        durationMs: track.duration, // In milliseconds
        duration: track.duration, // Also include with standard name
        popularity: track.popularity,
        explicit: track.explicit,
        // Audio features for enhanced track analysis
        audioFeatures: {
          energy: track.energy,
          tempo: track.tempo,
          danceability: track.danceability,
          valence: track.valence,
          acousticness: track.acousticness,
          instrumentalness: track.instrumentalness,
          speechiness: track.speechiness,
          liveness: track.liveness
        }
      };
    });

    console.log(`Exporting ${simplifiedTracks.length} tracks in simplified format`);
    
    // Return the tracks array
    return res.status(200).json(simplifiedTracks);
  } catch (error) {
    console.error("Track export error:", error);
    return res.status(500).json([]);
  }
});

// Direct API endpoint for track import that bypasses Vite
app.post("/_songfuse_api/tracks-import", async (req: Request, res: Response) => {
  // Explicitly set content type to JSON
  res.setHeader('Content-Type', 'application/json');
  
  try {
    // Prevent importing tracks from external sources
    console.log("Direct track import endpoint is disabled to prevent changes to the database");
    
    return res.status(403).json({ 
      message: "Track importing has been disabled. The system is using only existing database tracks.",
      status: "denied"
    });
  } catch (error) {
    console.error("Track import error:", error);
    return res.status(500).json({ message: "Failed to process track import request" });
  }
});

// Direct API endpoint for finding tracks by exact title
app.post("/api/direct-exact-title-matches", async (req: Request, res: Response) => {
  // Explicitly set content type to JSON
  res.setHeader('Content-Type', 'application/json');
  
  try {
    const { titles } = req.body;
    
    if (!titles || !Array.isArray(titles) || titles.length === 0) {
      return res.status(400).json({ error: 'Array of track titles is required' });
    }
    
    // Import the improved track matcher service
    const { findTracksByExactTitles } = await import('./services/improved-track-matcher');
    
    // Find tracks with exact title matches
    const tracks = await findTracksByExactTitles(titles);
    
    // Return the results
    return res.status(200).json({
      success: true,
      tracks,
      count: tracks.length,
      requested: titles.length
    });
  } catch (error) {
    console.error('Error finding exact title matches:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Test endpoint for finding tracks by both title and artist
app.post("/api/find-tracks-by-songs", async (req: Request, res: Response) => {
  // Explicitly set content type to JSON
  res.setHeader('Content-Type', 'application/json');
  
  try {
    const { songs } = req.body;
    
    if (!songs || !Array.isArray(songs) || songs.length === 0) {
      return res.status(400).json({ error: 'Array of songs is required' });
    }
    
    // Validate the song objects
    const validSongs = songs.filter(song => 
      song && typeof song.title === 'string' && typeof song.artist === 'string'
    ).map((song, index) => ({
      id: song.id || `song-${index}`,
      title: song.title,
      artist: song.artist
    }));
    
    if (validSongs.length === 0) {
      return res.status(400).json({ 
        error: 'No valid songs provided. Each song must have title and artist properties.'
      });
    }
    
    // Import the improved track matcher service
    const { findTracksByTitlesAndArtists } = await import('./services/improved-track-matcher');
    
    // Find tracks for these songs
    const songTracks = await findTracksByTitlesAndArtists(validSongs);
    
    // Return the results
    return res.status(200).json({
      success: true,
      matches: songTracks,
      matchCount: Object.keys(songTracks).length,
      requestedCount: validSongs.length
    });
  } catch (error) {
    console.error('Error finding tracks for songs:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Enhanced playlist creation endpoint
app.post("/api/playlist/generate-enhanced", async (req: Request, res: Response) => {
  // Explicitly set content type to JSON
  res.setHeader('Content-Type', 'application/json');
  
  try {
    const { prompt, userId, excludeExplicit = false, sessionId } = req.body;
    
    if (!prompt || !userId) {
      return res.status(400).json({ 
        success: false,
        error: 'Prompt and userId are required' 
      });
    }
    
    console.log(`Enhanced playlist generation request: ${prompt} (userId: ${userId})`);
    
    // Import the enhanced playlist creator
    const { createPlaylistFromPrompt } = await import('./services/playlist-creator-enhanced');
    
    // Generate the playlist
    const result = await createPlaylistFromPrompt(
      prompt,
      parseInt(userId),
      excludeExplicit,
      sessionId
    );
    
    // Return the playlist data
    return res.status(200).json({
      success: true,
      message: result.message,
      usedMcp: result.usedMcp,
      playlist: result.playlist
    });
  } catch (error) {
    console.error('Error generating enhanced playlist:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Test database connection first
  try {
    const { pool } = await import('./db');
    const testResult = await pool.query('SELECT 1 as test');
    console.log("✅ Database connection successful");
  } catch (error) {
    console.error("❌ Database connection failed:", error);
    console.error("Check DATABASE_URL environment variable and network connectivity");
    // Continue startup but log the issue
  }

  // Initialize Supabase Storage for reliable cloud-based cover images
  try {
    const { initializeStorageBucket } = await import('./services/supabaseStorage');
    await initializeStorageBucket();
    console.log("✅ Supabase Storage initialized - cover images will be stored in the cloud");
  } catch (error) {
    console.error("❌ Failed to initialize Supabase Storage:", error);
    // Fall back to local storage if Supabase fails
    await ensureDirectoriesExist();
    console.log("📁 Falling back to local image storage");
  }
  
  // Check for missing cover images and fix them automatically
  try {
    // We've moved to the new cover image sync service
    // This is now handled directly at server startup in the listen callback
  } catch (error) {
    console.error("Error during cover image verification:", error);
    // Continue server startup even if verification fails
  }
  
  // Start background embedding process automatically
  try {
    const { startBackgroundEmbeddingProcess } = await import('./services/background-tasks');
    console.log("Starting background embedding process on server init...");
    const taskId = startBackgroundEmbeddingProcess();
    console.log(`Background embedding process started with task ID: ${taskId}`);
  } catch (error) {
    console.error("Failed to start background embedding process:", error);
    // Continue server startup even if background process fails
  }
  
  // Add direct database access routes for emergency debugging BEFORE other routes
  addDirectDbRoutes(app);
  addSpotifyExportRoutes(app);
  addThumbnailRoutes(app);
  addThumbnailServiceRoutes(app);
  
  // Cover migration endpoint
  app.post("/api/admin/migrate-covers", async (req: Request, res: Response) => {
    try {
      console.log("🚀 Starting cover migration to cloud storage...");
      const { migrateCoversToCloud } = await import('./simple-cover-migration');
      const stats = await migrateCoversToCloud();
      
      res.json({
        success: true,
        message: "Cover migration completed",
        stats
      });
    } catch (error) {
      console.error("❌ Migration failed:", error);
      res.status(500).json({
        success: false,
        message: "Migration failed",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  // Dynamic metadata route for smart links - handles social media crawlers
  // This must come FIRST before any other routes to ensure proper priority
  app.get(["/share/:playlistId/:title?", "/share/:playlistId"], async (req: Request, res: Response, next: NextFunction) => {
    try {
      const playlistId = parseInt(req.params.playlistId);
      if (isNaN(playlistId)) {
        return next(); // Let client-side router handle it
      }

      // Increment view count for ALL visits to this playlist share route
      try {
        await storage.incrementSmartLinkViewsByPlaylistId(playlistId);
        console.log(`View count incremented for playlist ${playlistId}`);
      } catch (viewError) {
        console.error(`Failed to increment view count for playlist ${playlistId}:`, viewError);
        // Don't block the request if view tracking fails
      }

      // Check if this is a bot/crawler requesting metadata
      const userAgent = req.headers['user-agent'] || '';
      const isBot = /bot|crawler|spider|facebook|twitter|linkedin|pinterest|whatsapp|telegram|slack/i.test(userAgent);
      
      if (isBot) {
        console.log(`Social media crawler detected: ${userAgent}`);
        
        // Fetch playlist data for metadata
        const smartLink = await storage.getSmartLinkByPlaylistId(playlistId);
        
        if (!smartLink) {
          console.log(`Smart link not found for playlist ID: ${playlistId}`);
          return next(); // Let client-side router handle 404
        }

        // Get the actual playlist data to access cover image
        const playlist = await storage.getPlaylist(playlistId);
        const coverImage = smartLink.customCoverImage || playlist?.coverImageUrl;
        // Ensure proper URL formatting - if coverImage already has protocol, use it directly
        const absoluteCoverUrl = coverImage 
          ? (coverImage.startsWith('http') ? coverImage : `${req.protocol}://${req.get('host')}${coverImage}`)
          : `${req.protocol}://${req.get('host')}/images/covers/cover-1747487037971.jpg`;
        
        // Get track count
        const tracks = await storage.getSmartLinkTracks(`playlist-${playlistId}`);
        const trackCount = tracks?.length || 0;
        
        // Escape HTML special characters for safety
        const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => {
          const escapeMap: { [key: string]: string } = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
          };
          return escapeMap[char];
        });
        
        const safeTitle = escapeHtml(smartLink.title);
        const safeDescription = escapeHtml(smartLink.description || `Discover ${smartLink.title}, an AI-curated playlist with ${trackCount} tracks. Listen across all platforms on SongFuse.`);
        
        console.log(`Serving metadata for playlist: ${safeTitle}`);
        
        // Generate dynamic HTML with Open Graph and Twitter Card metadata
        const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
    <title>${safeTitle} - SongFuse Playlist</title>
    
    <!-- Primary Meta Tags -->
    <meta name="title" content="${safeTitle} - SongFuse Playlist">
    <meta name="description" content="${safeDescription}">

    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="music.playlist">
    <meta property="og:title" content="${safeTitle}">
    <meta property="og:description" content="${safeDescription}">
    <meta property="og:image" content="${absoluteCoverUrl}">
    <meta property="og:image:width" content="300">
    <meta property="og:image:height" content="300">
    <meta property="og:site_name" content="SongFuse">
    <meta property="og:url" content="${req.protocol}://${req.get('host')}${req.originalUrl}">

    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:title" content="${safeTitle}">
    <meta property="twitter:description" content="${safeDescription}">
    <meta property="twitter:image" content="${absoluteCoverUrl}">
    
    <!-- Music-specific metadata -->
    <meta property="music:creator" content="SongFuse AI">
    <meta property="music:song_count" content="${trackCount}">
    
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="icon" type="image/svg+xml" href="/src/assets/songfuse-brand.svg" />
  </head>
  <body>
    <div style="text-align: center; padding: 50px; font-family: 'Work Sans', sans-serif;">
      <h1>${safeTitle}</h1>
      <p>AI-curated playlist with ${trackCount} tracks</p>
      <img src="${absoluteCoverUrl}" alt="${safeTitle}" style="max-width: 300px; border-radius: 12px; margin: 20px 0;">
      <p><a href="${req.protocol}://${req.get('host')}${req.originalUrl}" style="color: #e11d48; text-decoration: none;">Open in SongFuse →</a></p>
    </div>
  </body>
</html>`;

        return res.send(html);
      }

      // For regular users, let client-side router handle it
      next();
    } catch (error) {
      console.error("Error serving smart link metadata:", error);
      next(); // Let client-side router handle it
    }
  });

  // Smart link SSR middleware will be registered later before Vite setup

  addDirectFinderRoutes(app);
  addTestRoutes(app); // Add test routes for diagnostic purposes
  addSimplifiedTracksEndpoint(app); // Add simplified tracks endpoint
  addJsonTestEndpoint(app); // Add guaranteed JSON test endpoint
  addGptImageJsonEndpoint(app); // Add guaranteed GPT Image JSON endpoint
  
  // Test cover image saving to filesystem
  app.post("/api/test-cover-save", async (req: Request, res: Response) => {
    try {
      res.setHeader('Content-Type', 'application/json');
      
      const openaiModule = await import('./openai');
      const saveCoverImageForPlaylist = openaiModule.saveCoverImageForPlaylist;
      
      // Use a small test image URL
      const testImageUrl = 'https://via.placeholder.com/250x250/FF5733/FFFFFF?text=TEST';
      const testPlaylistId = 99999; // Use a test ID that won't conflict
      
      console.log('🧪 Testing cover image save functionality...');
      const savedPath = await saveCoverImageForPlaylist(testImageUrl, testPlaylistId);
      
      res.json({ 
        success: true,
        message: "Cover image saved successfully to filesystem",
        savedPath: savedPath,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('❌ Cover save test failed:', error);
      res.status(500).json({ 
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  addDatabaseStatsRoutes(app); // Add database statistics
  app.use('/api', albumsRoutes); // Add top albums routes

  // Register regular application routes AFTER metadata route
  const httpServer = await registerRoutes(app);

  // Apply API error handling middleware for all /api/* routes
  // This ensures API routes always return JSON responses, even when errors occur
  app.use("/api", apiErrorMiddleware);

  // Force JSON responses for all API routes - prevents HTML fallback in production
  app.use("/api", (req, res, next) => {
    // Override the original end method to ensure JSON content type
    const originalEnd = res.end;
    res.end = function(chunk, encoding) {
      if (!res.headersSent && !res.getHeader('content-type')) {
        res.setHeader('Content-Type', 'application/json');
      }
      originalEnd.call(this, chunk, encoding);
    };
    next();
  });

  // Smart link routes temporarily disabled to fix template issue
  // Will implement simpler approach that works with existing setup
  // const { handleSocialMetaRequest } = await import('./social-meta-handler');

  // Add Odesli background service status endpoint
  app.get('/api/odesli-status', (req, res) => {
    const status = odesliBackgroundService.getStatus();
    res.json({
      service: 'odesli-background',
      ...status,
      message: status.isRunning ? 'Background service is running' : 'Background service is stopped'
    });
  });

  // Add API error handling middleware for all /api/* routes
  // This ensures API routes always return JSON responses, even when errors occur
  app.use(apiErrorMiddleware);

  // Global error handler for non-API routes
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = (err as any)?.status || (err as any)?.statusCode || 500;
    const message = (err instanceof Error) ? err.message : String(err) || "Internal Server Error";

    // Only handle non-API routes here
    if (!res.headersSent && !_req.path.startsWith('/api/')) {
      res.status(status).json({ message });
    }
    console.error("Global error handler:", err);
  });

  // Credit management API endpoints
  app.get('/api/users/:userId/credits', async (req: Request, res: Response) => {
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

  app.post('/api/users/:userId/credits/deduct', async (req: Request, res: Response) => {
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

  app.post('/api/users/:userId/credits/add', async (req: Request, res: Response) => {
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

  app.get('/api/users/:userId/credit-transactions', async (req: Request, res: Response) => {
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

  // Add dashboard metrics routes BEFORE the 404 handler
  addDashboardRoutes(app);
  
  // Add social image optimization routes
  app.post("/api/playlists/:id/social-images", generatePlaylistSocialImages);
  app.get("/api/playlists/:id/social-images", getPlaylistSocialImages);
  app.post("/api/admin/process-social-images", processMissingSocialImages);
  app.get("/api/admin/social-images/stats", getSocialImageStats);
  console.log("Social image optimization routes registered");

  // Thumbnail generation endpoint for optimized sidebar images
  app.get('/api/thumbnail', async (req: Request, res: Response) => {
    try {
      const { url, size } = req.query;
      
      if (!url || !size) {
        return res.status(400).json({ error: 'Missing url or size parameter' });
      }
      
      const targetSize = parseInt(size as string, 10);
      if (isNaN(targetSize) || targetSize < 16 || targetSize > 1024) {
        return res.status(400).json({ error: 'Invalid size parameter' });
      }

      // Import sharp for image processing
      const sharp = (await import('sharp')).default;
      const fetch = (await import('node-fetch')).default;
      
      // Fetch the original image
      const imageResponse = await fetch(url as string);
      if (!imageResponse.ok) {
        return res.status(404).json({ error: 'Image not found' });
      }
      
      const imageBuffer = await imageResponse.buffer();
      
      // Generate thumbnail
      const thumbnailBuffer = await sharp(imageBuffer)
        .resize(targetSize, targetSize, {
          fit: 'cover',
          position: 'center'
        })
        .jpeg({
          quality: 85,
          progressive: true
        })
        .toBuffer();
      
      // Set appropriate headers
      res.set({
        'Content-Type': 'image/jpeg',
        'Content-Length': thumbnailBuffer.length,
        'Cache-Control': 'public, max-age=31536000', // 1 year cache
        'ETag': `"${targetSize}-${Buffer.from(url as string).toString('base64').slice(0, 8)}"`
      });
      
      res.send(thumbnailBuffer);
      
    } catch (error) {
      console.error('Error generating thumbnail:', error);
      res.status(500).json({ error: 'Failed to generate thumbnail' });
    }
  });

  // Smart links for current user - uses existing pattern
  app.get("/api/smart-links/user", async (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json');
    
    try {
      // For now, use user ID 1 as default (same pattern as other endpoints)
      const userId = 1;
      
      const { storage } = await import('./storage');
      const smartLinks = await storage.getSmartLinksByUserId(userId);
      return res.json(smartLinks);
    } catch (error) {
      console.error('Error fetching user smart links:', error);
      return res.status(500).json({ message: 'Failed to fetch smart links' });
    }
  });

  // AI description generation for smart links
  app.post("/api/smart-links/generate-description", async (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json');
    
    console.log('AI Description API: Request received', req.body);
    
    try {
      const { playlistId, promotedTrackId, title } = req.body;
      
      console.log('AI Description API: Parsed request', { playlistId, promotedTrackId, title });
      
      if (!playlistId) {
        return res.status(400).json({ message: 'Playlist ID is required' });
      }

      // Get playlist data with tracks
      const { storage } = await import('./storage');
      const playlist = await storage.getPlaylist(playlistId);
      
      if (!playlist) {
        return res.status(404).json({ message: 'Playlist not found' });
      }

      // Get tracks for the playlist using direct database query
      const { pool } = await import('./db');
      const client = await pool.connect();
      
      console.log(`AI Description API: Connected to database for playlist ${playlistId}`);
      
      try {
        const tracksQuery = `
          SELECT 
            t.id,
            t.title,
            t.duration AS duration_ms,
            alb.title AS album_name,
            COALESCE(
              (SELECT 
                json_agg(json_build_object('id', a.id, 'name', a.name))
                FROM tracks_to_artists tta 
                JOIN artists a ON tta.artist_id = a.id
                WHERE tta.track_id = t.id
              ), 
              '[]'::json
            ) AS artists_json
          FROM playlist_tracks pt
          JOIN tracks t ON pt.track_id = t.id
          LEFT JOIN albums alb ON t.album_id = alb.id
          WHERE pt.playlist_id = $1
          ORDER BY pt.position ASC
          LIMIT 10
        `;
        
        const tracksResult = await client.query(tracksQuery, [playlistId]);
        
        console.log(`AI Description API: Found ${tracksResult.rows.length} tracks for playlist ${playlistId}`);
        console.log('Sample track:', tracksResult.rows[0]);
        
        if (!tracksResult.rows || tracksResult.rows.length === 0) {
          return res.status(400).json({ message: 'No tracks found in playlist' });
        }

        // Convert database results to the format expected by the AI generation function
        const tracks = tracksResult.rows.map(track => ({
          id: track.id,
          title: track.title,
          artist: Array.isArray(track.artists_json) 
            ? track.artists_json.map((a: any) => a.name).join(', ')
            : 'Unknown Artist',
          album: track.album_name || undefined,
          duration: track.duration_ms ? Math.floor(track.duration_ms / 1000) : undefined
        }));
        
        // Generate AI description using existing OpenAI service
        const { generateSmartLinkDescription } = await import('./openai');
        const description = await generateSmartLinkDescription({
          playlistTitle: playlist.title,
          playlistDescription: playlist.description || '',
          tracks: tracks,
          promotedTrackId: promotedTrackId,
          smartLinkTitle: title || playlist.title
        });

        return res.json({ description });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error generating smart link description:', error);
      return res.status(500).json({ message: 'Failed to generate description', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Alternative endpoint format for SmartLinkPublic component compatibility
  app.get("/api/playlists/:id/smart-link", async (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json');
    
    try {
      const playlistId = parseInt(req.params.id);
      const { storage } = await import('./storage');
      
      // First try to get an existing smart link for this playlist
      const existingSmartLink = await storage.getSmartLinkByPlaylistId(playlistId);
      if (existingSmartLink) {
        // Increment view count for existing smart links
        await storage.incrementSmartLinkViewsByPlaylistId(playlistId);
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
        shareId: `playlist-${playlistId}`,
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
        views: 0,
        createdAt: playlist.createdAt?.toISOString() || new Date().toISOString(),
        promotedTrackId: null
      };
      
      return res.json(smartLinkResponse);
    } catch (error) {
      console.error('Error fetching playlist smart link:', error);
      return res.status(500).json({ message: 'Failed to fetch playlist' });
    }
  });

  // Social image optimization endpoints
  app.post("/api/smart-links/:shareId/optimize-images", async (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json');
    
    try {
      const { shareId } = req.params;
      const { storage } = await import('./storage');
      const { socialImageOptimizer } = await import('./services/socialImageOptimizer');
      
      // Get smart link data
      const smartLink = await storage.getSmartLinkByShareId(shareId);
      if (!smartLink) {
        return res.status(404).json({ message: 'Smart link not found' });
      }
      
      // Get the cover image URL (custom or playlist default)
      const coverImageUrl = smartLink.customCoverImage || smartLink.playlist.coverImageUrl;
      if (!coverImageUrl) {
        return res.status(400).json({ message: 'No cover image available for optimization' });
      }
      
      // Generate optimized images
      const optimizedImages = await socialImageOptimizer.createOptimizedSocialImages(
        coverImageUrl, 
        smartLink.playlist.id
      );
      
      return res.json({
        success: true,
        images: optimizedImages,
        message: 'Images optimized for social sharing'
      });
    } catch (error) {
      console.error('Error optimizing social images:', error);
      return res.status(500).json({ message: 'Failed to optimize images' });
    }
  });

  app.get("/api/smart-links/:shareId/social-images", async (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json');
    
    try {
      const { shareId } = req.params;
      const { storage } = await import('./storage');
      const { socialImageOptimizer } = await import('./services/socialImageOptimizer');
      
      // Get smart link data to find playlist ID
      const smartLink = await storage.getSmartLinkByShareId(shareId);
      if (!smartLink) {
        return res.status(404).json({ message: 'Smart link not found' });
      }
      
      // Get existing optimized images
      const optimizedImages = await socialImageOptimizer.getOptimizedImages(smartLink.playlist.id);
      
      if (!optimizedImages) {
        return res.status(404).json({ message: 'No optimized images found' });
      }
      
      return res.json(optimizedImages);
    } catch (error) {
      console.error('Error fetching social images:', error);
      return res.status(500).json({ message: 'Failed to fetch social images' });
    }
  });

  // Add final API route protection before static serving
  app.use("/api", (req, res, next) => {
    if (!res.headersSent) {
      res.status(404).json({ error: "API endpoint not found", path: req.path });
    }
  });

  // Add smart link SSR middleware before Vite to handle social crawlers
  app.use(smartLinkSSRMiddleware());
  
  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, httpServer);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = process.env.PORT || 5000;
  httpServer.listen(port, "127.0.0.1", () => {
    log(`serving on port ${port}`);
    console.log(`🚀 SongFuse server started successfully`);
    console.log(`📱 Frontend: http://localhost:${port}`);
    console.log(`🔧 API: http://localhost:${port}/api`);
    
    // Start Odesli background service for smart links
    odesliBackgroundService.start();
    
    // Cover image sync removed as per user request
  });
})().catch(error => {
  console.error("💥 Server startup failed:", error);
  console.error("Stack trace:", error.stack);
  process.exit(1);
});

// Graceful shutdown handlers
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  odesliBackgroundService.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  odesliBackgroundService.stop();
  process.exit(0);
});
