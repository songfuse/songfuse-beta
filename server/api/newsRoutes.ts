import express, { Request, Response } from 'express';
import { fetchAllNews } from '../services/rssService';
import { shouldRefreshNews, refreshNewsCache, getCachedNews, cleanOldNews, getLastNewsUpdate } from '../services/newsCacheService';

const router = express.Router();

/**
 * GET /api/music-news
 * Returns latest music news from cache (refreshes daily to reduce AI costs)
 */
router.get('/music-news', async (req: Request, res: Response) => {
  try {
    // Get the limit parameter from the query string or use default
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    
    // Check if we need to refresh the news cache
    const needsRefresh = await shouldRefreshNews();
    
    if (needsRefresh) {
      console.log('🔄 News cache is stale, refreshing...');
      const refreshResult = await refreshNewsCache();
      
      if (refreshResult.success) {
        console.log(`✅ News cache refreshed: ${refreshResult.message}`);
        // Clean up old articles while we're at it
        await cleanOldNews();
      } else {
        console.error('❌ News cache refresh failed, falling back to live fetch');
        // Fallback to live fetch if cache refresh fails
        const newsItems = await fetchAllNews(limit);
        return res.json({
          success: true,
          data: newsItems,
          cached: false,
          message: 'Using live data due to cache refresh failure'
        });
      }
    }
    
    // Get cached news from database
    const cachedNews = await getCachedNews(limit);
    
    // Get the last update timestamp
    const lastUpdate = await getLastNewsUpdate();
    
    // Return the cached news items with timestamp
    res.json({
      success: true,
      data: cachedNews,
      cached: true,
      count: cachedNews.length,
      lastUpdated: lastUpdate ? lastUpdate.toISOString() : null,
      message: 'Data served from cache (refreshed daily)'
    });
  } catch (error) {
    console.error('Error fetching music news:', error);
    
    // Fallback to live fetch on any error
    try {
      const fallbackLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const newsItems = await fetchAllNews(fallbackLimit);
      res.json({
        success: true,
        data: newsItems,
        cached: false,
        message: 'Fallback to live data due to cache error'
      });
    } catch (fallbackError) {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch music news',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
});

export default router;