/**
 * Smart Link Server-Side Rendering Service
 * 
 * This service generates server-rendered HTML for smart links to enable
 * proper social media sharing with rich previews and Open Graph meta tags.
 * 
 * When social media crawlers (Facebook, Twitter, WhatsApp, etc.) visit
 * smart link URLs, they receive properly formatted HTML with:
 * - Playlist title and description
 * - Cover image URLs (both social and Open Graph sizes)
 * - Platform-specific streaming links
 * - Proper meta tags for rich previews
 */

import { Request, Response } from 'express';
import { db } from '../db';
import { smartLinks, playlists } from '../../shared/schema';
import { eq } from 'drizzle-orm';

interface SmartLinkData {
  id: number;
  shareId: string;
  playlistId: number;
  title: string;
  description: string;
  customCoverImage?: string;
  views: number;
  createdAt: string;
  socialImageUrl?: string;
  openGraphImageUrl?: string;
  playlist?: {
    id: number;
    title: string;
    coverImageUrl?: string;
    spotifyId?: string;
  };
}

/**
 * Check if the request is from a social media crawler
 * These user agents typically don't execute JavaScript, so they need
 * server-rendered content to generate proper link previews
 */
function isSocialCrawler(userAgent: string): boolean {
  const crawlerPatterns = [
    'facebookexternalhit',
    'twitterbot',
    'linkedinbot',
    'whatsapp',
    'telegrambot',
    'skypeuripreview',
    'discordbot',
    'slackbot',
    'pinterest',
    'redditbot',
    'applebot'
  ];
  
  const agent = userAgent.toLowerCase();
  return crawlerPatterns.some(pattern => agent.includes(pattern));
}

/**
 * Fetch smart link data with associated playlist information
 * Supports both shareId and playlist-ID format lookups
 */
async function getSmartLinkData(shareId: string): Promise<SmartLinkData | null> {
  try {
    let smartLinkResult;
    
    // Check if this is a numeric playlist ID (new clean format)
    if (/^\d+$/.test(shareId)) {
      const playlistId = parseInt(shareId);
      
      // Look up by playlist ID instead of shareId
      [smartLinkResult] = await db
        .select({
          id: smartLinks.id,
          shareId: smartLinks.shareId,
          playlistId: smartLinks.playlistId,
          title: smartLinks.title,
          description: smartLinks.description,
          customCoverImage: smartLinks.customCoverImage,
          views: smartLinks.views,
          createdAt: smartLinks.createdAt,
          socialImageUrl: smartLinks.socialImageUrl,
          openGraphImageUrl: smartLinks.openGraphImageUrl,
          playlistTitle: playlists.title,
          playlistCoverImageUrl: playlists.coverImageUrl,
          playlistSpotifyId: playlists.spotifyId
        })
        .from(smartLinks)
        .leftJoin(playlists, eq(smartLinks.playlistId, playlists.id))
        .where(eq(smartLinks.playlistId, playlistId))
        .limit(1);
    } else if (shareId.startsWith('playlist-')) {
      // Legacy playlist-ID format
      const playlistId = parseInt(shareId.replace('playlist-', ''));
      
      // Look up by playlist ID instead of shareId
      [smartLinkResult] = await db
        .select({
          id: smartLinks.id,
          shareId: smartLinks.shareId,
          playlistId: smartLinks.playlistId,
          title: smartLinks.title,
          description: smartLinks.description,
          customCoverImage: smartLinks.customCoverImage,
          views: smartLinks.views,
          createdAt: smartLinks.createdAt,
          socialImageUrl: smartLinks.socialImageUrl,
          openGraphImageUrl: smartLinks.openGraphImageUrl,
          playlistTitle: playlists.title,
          playlistCoverImageUrl: playlists.coverImageUrl,
          playlistSpotifyId: playlists.spotifyId
        })
        .from(smartLinks)
        .leftJoin(playlists, eq(smartLinks.playlistId, playlists.id))
        .where(eq(smartLinks.playlistId, playlistId))
        .limit(1);
    } else {
      // Standard shareId lookup
      [smartLinkResult] = await db
        .select({
          id: smartLinks.id,
          shareId: smartLinks.shareId,
          playlistId: smartLinks.playlistId,
          title: smartLinks.title,
          description: smartLinks.description,
          customCoverImage: smartLinks.customCoverImage,
          views: smartLinks.views,
          createdAt: smartLinks.createdAt,
          socialImageUrl: smartLinks.socialImageUrl,
          openGraphImageUrl: smartLinks.openGraphImageUrl,
          playlistTitle: playlists.title,
          playlistCoverImageUrl: playlists.coverImageUrl,
          playlistSpotifyId: playlists.spotifyId
        })
        .from(smartLinks)
        .leftJoin(playlists, eq(smartLinks.playlistId, playlists.id))
        .where(eq(smartLinks.shareId, shareId))
        .limit(1);
    }

    if (!smartLinkResult) {
      // If no smart link exists but we're looking for a numeric or playlist-ID format,
      // create a virtual smart link response using playlist data
      let playlistId: number | null = null;
      
      if (/^\d+$/.test(shareId)) {
        // Numeric playlist ID (new clean format)
        playlistId = parseInt(shareId);
      } else if (shareId.startsWith('playlist-')) {
        // Legacy playlist-ID format
        playlistId = parseInt(shareId.replace('playlist-', ''));
      }
      
      if (playlistId) {
        // Get playlist data directly
        const [playlistResult] = await db
          .select({
            id: playlists.id,
            title: playlists.title,
            description: playlists.description,
            coverImageUrl: playlists.coverImageUrl,
            spotifyId: playlists.spotifyId
          })
          .from(playlists)
          .where(eq(playlists.id, playlistId))
          .limit(1);
        
        if (!playlistResult) {
          return null;
        }
        
        // Return a virtual smart link response
        return {
          id: playlistId,
          shareId: shareId,
          playlistId: playlistId,
          title: playlistResult.title || 'Untitled Playlist',
          description: playlistResult.description || `Discover amazing music with ${playlistResult.title}`,
          customCoverImage: undefined,
          views: 0,
          createdAt: new Date().toISOString(),
          socialImageUrl: undefined,
          openGraphImageUrl: undefined,
          playlist: {
            id: playlistResult.id,
            title: playlistResult.title,
            coverImageUrl: playlistResult.coverImageUrl ?? undefined,
            spotifyId: playlistResult.spotifyId ?? undefined,
            description: playlistResult.description ?? undefined
          }
        };
      }
      
      return null;
    }

    return {
      id: smartLinkResult.id,
      shareId: smartLinkResult.shareId,
      playlistId: smartLinkResult.playlistId,
      title: smartLinkResult.title ?? '',
      description: smartLinkResult.description ?? '',
      customCoverImage: smartLinkResult.customCoverImage ?? undefined,
      views: smartLinkResult.views ?? 0,
      createdAt: smartLinkResult.createdAt?.toISOString() ?? new Date().toISOString(),
      socialImageUrl: smartLinkResult.socialImageUrl ?? undefined,
      openGraphImageUrl: smartLinkResult.openGraphImageUrl ?? undefined,
      playlist: smartLinkResult.playlistTitle ? {
        id: smartLinkResult.playlistId,
        title: smartLinkResult.playlistTitle,
        coverImageUrl: smartLinkResult.playlistCoverImageUrl ?? undefined,
        spotifyId: smartLinkResult.playlistSpotifyId ?? undefined
      } : undefined
    };
  } catch (error) {
    console.error('Error fetching smart link data:', error);
    return null;
  }
}

/**
 * Get the best cover image URL for the smart link
 * Prioritizes custom cover image, then playlist cover, then fallback
 */
function getCoverImageUrl(smartLinkData: SmartLinkData): string {
  if (smartLinkData.customCoverImage) {
    return smartLinkData.customCoverImage;
  }
  
  if (smartLinkData.playlist?.coverImageUrl) {
    return smartLinkData.playlist.coverImageUrl;
  }
  
  // Fallback to a default SongFuse logo or image
  return 'https://ckhsgywhfvkyeonbhvfy.supabase.co/storage/v1/object/public/playlist-covers/songfuse-default.png';
}

/**
 * Get optimized social image URLs, creating them if they don't exist
 */
async function getOptimizedImageUrls(playlistId: number, coverImageUrl?: string): Promise<{ socialUrl?: string; openGraphUrl?: string }> {
  try {
    const { socialImageOptimizer } = await import('./socialImageOptimizer');
    
    // Try to get existing optimized images first
    let optimizedImages = await socialImageOptimizer.getOptimizedImages(playlistId);
    
    // If no optimized images exist and we have a cover image, create them
    if (!optimizedImages && coverImageUrl) {
      console.log(`Creating optimized social images for playlist ${playlistId}...`);
      try {
        optimizedImages = await socialImageOptimizer.createOptimizedSocialImages(coverImageUrl, playlistId);
        console.log(`✅ Generated optimized social images for playlist ${playlistId}`);
      } catch (createError) {
        console.error('Error creating optimized images:', createError);
        // Continue without optimized images - will use original cover
      }
    }
    
    if (optimizedImages) {
      return {
        socialUrl: optimizedImages.socialUrl,
        openGraphUrl: optimizedImages.openGraphUrl
      };
    }
    
    return {};
  } catch (error) {
    console.error('Error fetching optimized images:', error);
    return {};
  }
}

/**
 * Generate HTML with proper Open Graph and Twitter Card meta tags
 */
async function generateSmartLinkHTML(smartLinkData: SmartLinkData, hostUrl: string): Promise<string> {
  const coverImageUrl = getCoverImageUrl(smartLinkData);
  
  // Get optimized images (will create them if they don't exist)
  const optimizedImages = await getOptimizedImageUrls(smartLinkData.playlistId, coverImageUrl);
  
  // Use optimized images if available, fallback to stored images, then cover image
  const socialImageUrl = optimizedImages.socialUrl || smartLinkData.socialImageUrl || coverImageUrl;
  const openGraphImageUrl = optimizedImages.openGraphUrl || smartLinkData.openGraphImageUrl || coverImageUrl;
  
  const pageUrl = `${hostUrl}/share/${smartLinkData.shareId}/${encodeURIComponent(smartLinkData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}`;
  
  // Clean description for meta tags (remove HTML, limit length)
  const cleanDescription = smartLinkData.description
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/\n+/g, ' ') // Replace newlines with spaces
    .trim()
    .substring(0, 160); // Limit to 160 characters for meta description
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    
    <!-- Basic Meta Tags -->
    <title>${smartLinkData.title} | SongFuse</title>
    <meta name="description" content="${cleanDescription}">
    
    <!-- Open Graph Meta Tags (Facebook, LinkedIn, etc.) -->
    <meta property="og:type" content="music.playlist">
    <meta property="og:title" content="${smartLinkData.title}">
    <meta property="og:description" content="${cleanDescription}">
    <meta property="og:image" content="${openGraphImageUrl}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:url" content="${pageUrl}">
    <meta property="og:site_name" content="SongFuse">
    
    <!-- Twitter Card Meta Tags -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${smartLinkData.title}">
    <meta name="twitter:description" content="${cleanDescription}">
    <meta name="twitter:image" content="${socialImageUrl}">
    
    <!-- WhatsApp/Telegram optimized -->
    <meta property="og:image:alt" content="Playlist cover for ${smartLinkData.title}">
    
    <!-- Additional Music-specific Meta Tags -->
    ${smartLinkData.playlist?.spotifyId ? `<meta property="music:creator" content="SongFuse">` : ''}
    
    <!-- Canonical URL -->
    <link rel="canonical" href="${pageUrl}">
    
    <!-- Favicon -->
    <link rel="icon" href="/favicon.ico">
    
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .container {
            background: white;
            border-radius: 16px;
            padding: 32px;
            max-width: 600px;
            width: 100%;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
            text-align: center;
        }
        
        .cover-image {
            width: 200px;
            height: 200px;
            border-radius: 12px;
            object-fit: cover;
            margin: 0 auto 24px;
            display: block;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
        }
        
        .title {
            font-size: 28px;
            font-weight: bold;
            margin-bottom: 12px;
            color: #1a202c;
        }
        
        .description {
            font-size: 16px;
            color: #4a5568;
            line-height: 1.6;
            margin-bottom: 32px;
            white-space: pre-line;
        }
        
        .cta-button {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 16px 32px;
            border: none;
            border-radius: 8px;
            font-size: 18px;
            font-weight: 600;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            transition: transform 0.2s ease;
        }
        
        .cta-button:hover {
            transform: translateY(-2px);
        }
        
        .loading-text {
            margin-top: 16px;
            color: #718096;
            font-size: 14px;
        }
    </style>
    
    <!-- Redirect to React app after a short delay for human users -->
    <script>
        // Only redirect if this is not a bot/crawler
        if (!/bot|crawler|spider|crawling|whatsapp|telegram|facebook|twitter|linkedin/i.test(navigator.userAgent)) {
            setTimeout(function() {
                window.location.href = '${pageUrl}';
            }, 100);
        }
    </script>
</head>
<body>
    <div class="container">
        <img src="${coverImageUrl}" alt="Playlist cover for ${smartLinkData.title}" class="cover-image" />
        <h1 class="title">${smartLinkData.title}</h1>
        <div class="description">${smartLinkData.description}</div>
        <a href="${pageUrl}" class="cta-button">Listen Now on SongFuse</a>
        <div class="loading-text">Loading playlist...</div>
    </div>
</body>
</html>
  `.trim();
}

/**
 * Handle smart link requests with SSR
 * This middleware checks if the request is from a social crawler
 * and serves appropriate content accordingly
 */
export async function handleSmartLinkSSR(req: Request, res: Response): Promise<boolean> {
  try {
    const { shareId } = req.params;
    const userAgent = req.get('User-Agent') || '';
    const hostUrl = `${req.protocol}://${req.get('host')}`;
    
    console.log(`SSR: Processing smart link request for shareId: ${shareId}`);
    
    // Fetch smart link data first
    const smartLinkData = await getSmartLinkData(shareId);
    console.log(`SSR: Smart link data found:`, smartLinkData ? 'YES' : 'NO');
    
    // Increment view count for the smart link if it exists
    if (smartLinkData) {
      await db
        .update(smartLinks)
        .set({ 
          views: smartLinkData.views + 1,
          updatedAt: new Date()
        })
        .where(eq(smartLinks.shareId, shareId));
    }
    
    if (!smartLinkData) {
      // Smart link not found - return 404 with basic HTML
      res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Playlist Not Found | SongFuse</title>
            <meta name="robots" content="noindex">
        </head>
        <body>
            <h1>Playlist Not Found</h1>
            <p>The playlist you're looking for doesn't exist or has been removed.</p>
            <a href="/">Return to SongFuse</a>
        </body>
        </html>
      `);
      return true; // Request was handled
    }
    
    // Check if this is a social media crawler
    if (isSocialCrawler(userAgent)) {
      console.log(`SSR: Serving rendered HTML for crawler: ${userAgent.substring(0, 50)}...`);
      
      // Serve server-rendered HTML with proper meta tags
      res.set('Content-Type', 'text/html');
      const html = await generateSmartLinkHTML(smartLinkData, hostUrl);
      res.send(html);
      return true; // Request was handled by SSR
    } else {
      console.log(`SSR: Passing through to React app for human user: ${shareId}`);
      
      // For regular users (browsers), don't serve HTML here
      // Let the request continue to the React app which will handle the routing
      // The smart link data will be available via API calls
      return false; // Let the request continue to Vite/React
    }
  } catch (error) {
    console.error('Error in smart link SSR handler:', error);
    
    // Fallback to a basic error page
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
          <title>Error | SongFuse</title>
          <meta name="robots" content="noindex">
      </head>
      <body>
          <h1>Something went wrong</h1>
          <p>Please try again later.</p>
          <a href="/">Return to SongFuse</a>
      </body>
      </html>
    `);
    return true; // Request was handled with error page
  }
  
  // Should never reach here, but TypeScript requires it
  return false;
}

/**
 * Express middleware to handle smart link routes
 * Matches patterns like:
 * - /share/:shareId
 * - /share/:shareId/:titleSlug
 * - /share/playlist-:id/:titleSlug (legacy format)
 * - /share/:id/:titleSlug (new clean format)
 */
export function smartLinkSSRMiddleware() {
  return async (req: Request, res: Response, next: any) => {
    const path = req.path;
    
    // Handle different URL patterns
    const shareMatch = path.match(/^\/share\/([a-zA-Z0-9-]+)$/);
    const shareWithTitleMatch = path.match(/^\/share\/([a-zA-Z0-9-]+)\/([^\/]+)$/);
    
    if (shareMatch || shareWithTitleMatch) {
      const identifier = shareMatch ? shareMatch[1] : shareWithTitleMatch[1];
      
      // Check if it's a numeric playlist ID (new format)
      if (/^\d+$/.test(identifier)) {
        // New format: /share/{id}/{title} - use the numeric ID directly
        req.params.playlistId = identifier;
        req.params.shareId = identifier; // Use numeric ID as shareId
      } else if (identifier.startsWith('playlist-')) {
        // Legacy format: /share/playlist-{id}/{title}
        const playlistId = identifier.replace('playlist-', '');
        req.params.playlistId = playlistId;
        req.params.shareId = identifier;
      } else {
        // Traditional shareId format
        req.params.shareId = identifier;
      }
      
      const handled = await handleSmartLinkSSR(req, res);
      if (!handled) {
        next(); // Continue to React app if not handled by SSR
      }
      return;
    }
    
    // Not a smart link URL, continue to next middleware
    next();
  };
}