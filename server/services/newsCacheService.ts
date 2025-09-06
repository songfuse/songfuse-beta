/**
 * News Cache Service - Daily refresh of music news to reduce AI costs
 */
import { db } from '../db';
import { newsArticles, type InsertNewsArticle } from '@shared/schema';
import { desc, sql } from 'drizzle-orm';
import { fetchAllNews, type NewsItem } from './rssService';

interface RSSNewsItem {
  title: string;
  link: string;
  pubDate: string;
  content?: string;
  contentSnippet?: string;
  description?: string;
  source?: string;
  sourceName?: string;
  guid?: string;
  categories?: string[];
}

/**
 * Check if news needs refresh (older than 24 hours)
 */
export async function shouldRefreshNews(): Promise<boolean> {
  try {
    const [latestNews] = await db
      .select({ lastFetched: newsArticles.lastFetched })
      .from(newsArticles)
      .orderBy(desc(newsArticles.lastFetched))
      .limit(1);

    if (!latestNews) {
      return true; // No news cached yet
    }

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return latestNews.lastFetched ? latestNews.lastFetched < oneDayAgo : true;
  } catch (error) {
    console.error('Error checking news refresh status:', error);
    return true; // Refresh on error to be safe
  }
}

/**
 * Fetch fresh music news from RSS feeds
 */
async function fetchFreshNews(): Promise<NewsItem[]> {
  console.log('🔄 Fetching fresh music news with images...');
  
  try {
    const newsItems = await fetchAllNews(50); // Fetch up to 50 articles with images
    console.log(`✅ Fetched ${newsItems.length} articles with image support`);
    return newsItems;
  } catch (error) {
    console.error('❌ Failed to fetch fresh news:', error);
    return [];
  }
}

/**
 * Filter news to only music-related articles
 */
function filterMusicNews(news: NewsItem[]): NewsItem[] {
  const musicKeywords = [
    'music', 'album', 'song', 'artist', 'band', 'concert', 'tour', 
    'playlist', 'streaming', 'spotify', 'apple music', 'charts',
    'grammy', 'billboard', 'single', 'EP', 'vinyl', 'genre'
  ];

  return news.filter(article => {
    const text = `${article.title} ${article.description} ${article.content}`.toLowerCase();
    return musicKeywords.some(keyword => text.includes(keyword));
  });
}

/**
 * Store news articles in database
 */
async function storeNewsInDatabase(news: NewsItem[]): Promise<void> {
  console.log(`💾 Storing ${news.length} news articles in database...`);

  for (const article of news) {
    try {
      const newsData: InsertNewsArticle = {
        title: article.title,
        link: article.link,
        description: article.description || article.contentSnippet || '',
        content: article.content || article.contentSnippet || '',
        pubDate: article.pubDate ? new Date(article.pubDate) : new Date(),
        source: article.source || '',
        sourceName: article.sourceName || '',
        guid: article.guid || '',
        categories: article.categories || [],
        imageUrl: article.imageUrl, // Include the extracted image URL
      };

      await db.insert(newsArticles)
        .values([newsData])
        .onConflictDoUpdate({
          target: newsArticles.link,
          set: {
            title: newsData.title,
            description: newsData.description,
            content: newsData.content,
            imageUrl: newsData.imageUrl, // Update image URL on conflict
            lastFetched: new Date(),
          }
        });

    } catch (error) {
      console.error(`❌ Failed to store article: ${article.title}`, error);
    }
  }

  console.log(`✅ Successfully stored news articles`);
}

/**
 * Refresh news cache - main function
 */
export async function refreshNewsCache(): Promise<{ success: boolean; count: number; message: string }> {
  try {
    console.log('🔄 Starting news cache refresh...');

    const freshNews = await fetchFreshNews();
    console.log(`📊 Fetched ${freshNews.length} total articles`);

    const musicNews = filterMusicNews(freshNews);
    console.log(`🎵 Filtered to ${musicNews.length} music-related articles`);

    await storeNewsInDatabase(musicNews);

    return {
      success: true,
      count: musicNews.length,
      message: `Successfully cached ${musicNews.length} music news articles`
    };
  } catch (error) {
    console.error('❌ News cache refresh failed:', error);
    return {
      success: false,
      count: 0,
      message: `News refresh failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Get the timestamp of the last news update
 */
export async function getLastNewsUpdate(): Promise<Date | null> {
  try {
    const [latestNews] = await db
      .select({ lastFetched: newsArticles.lastFetched })
      .from(newsArticles)
      .orderBy(desc(newsArticles.lastFetched))
      .limit(1);

    return latestNews?.lastFetched || null;
  } catch (error) {
    console.error('Error getting last news update:', error);
    return null;
  }
}

/**
 * Get cached news articles from database
 */
export async function getCachedNews(limit: number = 50): Promise<RSSNewsItem[]> {
  try {
    const cachedNews = await db
      .select()
      .from(newsArticles)
      .orderBy(desc(newsArticles.pubDate))
      .limit(limit);

    return cachedNews.map(article => ({
      title: article.title,
      link: article.link,
      pubDate: article.pubDate?.toISOString() || '',
      content: article.content || '',
      contentSnippet: article.description || '',
      description: article.description || '',
      imageUrl: article.imageUrl || undefined,
      source: article.source || '',
      sourceName: article.sourceName || '',
      guid: article.guid || '',
      categories: (article.categories as string[]) || []
    }));
  } catch (error) {
    console.error('❌ Failed to get cached news:', error);
    return [];
  }
}

/**
 * Clean old news articles (older than 7 days)
 */
export async function cleanOldNews(): Promise<void> {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    await db.delete(newsArticles)
      .where(sql`${newsArticles.createdAt} < ${sevenDaysAgo}`);
    
    console.log('🧹 Cleaned old news articles');
  } catch (error) {
    console.error('❌ Failed to clean old news:', error);
  }
}