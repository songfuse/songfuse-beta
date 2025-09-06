import Parser from 'rss-parser';
import fetch from 'node-fetch';

// Create a new RSS parser instance
const parser = new Parser({
  customFields: {
    item: [
      ['media:content', 'mediaContent'],
      ['enclosure', 'enclosure']
    ],
  }
});

export interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  content?: string;
  contentSnippet?: string;
  description?: string;
  imageUrl?: string;
  source: string;
  sourceName: string;
  guid?: string;
  categories?: string[];
}

// List of music news RSS feeds
const musicNewsFeeds = [
  { url: 'https://www.rollingstone.com/music/feed/', name: 'Rolling Stone' },
  { url: 'https://pitchfork.com/rss/news/', name: 'Pitchfork' },
  { url: 'https://consequence.net/category/music/feed/', name: 'Consequence of Sound' },
  { url: 'https://www.nme.com/music/feed', name: 'NME' },
  { url: 'https://www.billboard.com/feed/', name: 'Billboard' }
];

/**
 * Decode HTML entities in text
 */
function decodeHtmlEntities(text: string): string {
  const entities: { [key: string]: string } = {
    '&#38;': '&',
    '&amp;': '&',
    '&#8230;': '...',
    '&hellip;': '...',
    '&#8217;': "'",
    '&rsquo;': "'",
    '&#8220;': '"',
    '&ldquo;': '"',
    '&#8221;': '"',
    '&rdquo;': '"',
    '&#8211;': '–',
    '&ndash;': '–',
    '&#8212;': '—',
    '&mdash;': '—',
    '&lt;': '<',
    '&gt;': '>',
    '&nbsp;': ' ',
    '&quot;': '"'
  };
  
  let decoded = text;
  for (const [entity, replacement] of Object.entries(entities)) {
    decoded = decoded.replace(new RegExp(entity, 'g'), replacement);
  }
  
  // Handle any remaining numeric entities
  decoded = decoded.replace(/&#(\d+);/g, (match, num) => {
    return String.fromCharCode(parseInt(num, 10));
  });
  
  return decoded;
}

/**
 * Extracts an image URL from an item's content or enclosure
 * 
 * @param item The RSS item
 * @returns Image URL or undefined if no image found
 */
function extractImageUrl(item: any): string | undefined {
  // Try to get image from media:content
  if (item.mediaContent && item.mediaContent.$ && item.mediaContent.$.url) {
    return item.mediaContent.$.url;
  }
  
  // Try to get image from enclosure
  if (item.enclosure && item.enclosure.url && item.enclosure.type && item.enclosure.type.startsWith('image/')) {
    return item.enclosure.url;
  }
  
  // Try media:thumbnail
  if (item.mediaThumbnail && item.mediaThumbnail.$ && item.mediaThumbnail.$.url) {
    return item.mediaThumbnail.$.url;
  }
  
  // Try itunes:image
  if (item.itunesImage && item.itunesImage.$ && item.itunesImage.$.href) {
    return item.itunesImage.$.href;
  }
  
  // Try to extract first image from content if it exists
  if (item.content) {
    const imgMatch = item.content.match(/<img[^>]+src=["']([^"'>]+)["'][^>]*>/i);
    if (imgMatch && imgMatch[1]) {
      return imgMatch[1];
    }
  }
  
  // Try to extract first image from description if it exists
  if (item.description) {
    const imgMatch = item.description.match(/<img[^>]+src=["']([^"'>]+)["'][^>]*>/i);
    if (imgMatch && imgMatch[1]) {
      return imgMatch[1];
    }
  }
  
  // Try content:encoded if available
  if (item['content:encoded']) {
    const imgMatch = item['content:encoded'].match(/<img[^>]+src=["']([^"'>]+)["'][^>]*>/i);
    if (imgMatch && imgMatch[1]) {
      return imgMatch[1];
    }
  }
  
  return undefined;
}

/**
 * Fetches and parses an RSS feed
 * 
 * @param feedUrl The URL of the RSS feed
 * @param sourceName The name of the news source
 * @returns Array of parsed news items
 */
export async function fetchRssFeed(feedUrl: string, sourceName: string): Promise<NewsItem[]> {
  try {
    // Attempt to fetch and parse the feed
    const feed = await parser.parseURL(feedUrl);
    
    // Process and clean the items
    const items: NewsItem[] = feed.items.map(item => ({
      title: decodeHtmlEntities(item.title || 'No Title'),
      link: item.link || '',
      pubDate: item.pubDate || new Date().toISOString(),
      content: item.content ? decodeHtmlEntities(item.content) : undefined,
      contentSnippet: item.contentSnippet ? decodeHtmlEntities(item.contentSnippet) : undefined,
      description: decodeHtmlEntities(item.content || item.contentSnippet || ''),
      imageUrl: extractImageUrl(item) ? decodeHtmlEntities(extractImageUrl(item)!) : undefined,
      source: feedUrl,
      sourceName: sourceName,
      guid: item.guid,
      categories: item.categories
    }));
    
    return items;
  } catch (error) {
    console.error(`Error fetching RSS feed from ${sourceName}:`, error);
    return []; // Return empty array on error
  }
}

/**
 * Determines if a news item is relevant (events, releases, industry news) vs gossip
 * 
 * @param item The news item to evaluate
 * @returns true if the item is relevant, false if it's gossip/celebrity content
 */
function isRelevantMusicNews(item: NewsItem): boolean {
  const title = item.title.toLowerCase();
  const content = (item.contentSnippet || item.content || '').toLowerCase();
  const fullText = `${title} ${content}`;
  
  // Priority keywords for music events, releases, and industry news
  const relevantKeywords = [
    'album', 'ep', 'single', 'release', 'debut', 'drops', 'announce', 'announces',
    'tour', 'concert', 'festival', 'live', 'performance', 'show', 'venue',
    'collaboration', 'collab', 'featuring', 'feat', 'remix',
    'record deal', 'signs', 'label', 'studio', 'producer', 'production',
    'grammy', 'awards', 'nominated', 'wins', 'charts', 'billboard',
    'streaming', 'spotify', 'apple music', 'youtube music',
    'music video', 'video', 'clip', 'visual',
    'band', 'artist', 'musician', 'singer', 'rapper',
    'genre', 'rock', 'pop', 'hip hop', 'rap', 'country', 'jazz', 'electronic',
    'new music', 'latest', 'upcoming', 'preview', 'teaser', 'trailer'
  ];
  
  // Gossip/celebrity keywords to filter out
  const gossipKeywords = [
    'dating', 'relationship', 'boyfriend', 'girlfriend', 'married', 'divorce',
    'pregnant', 'baby', 'child', 'family', 'personal life',
    'scandal', 'controversy', 'drama', 'feud', 'fight', 'beef',
    'arrest', 'legal', 'court', 'lawsuit', 'charges', 'testifies', 'testimony',
    'rehab', 'addiction', 'mental health', 'therapy',
    'fashion', 'outfit', 'style', 'red carpet', 'party',
    'social media', 'instagram', 'twitter', 'tiktok', 'posts',
    'weight', 'body', 'plastic surgery', 'appearance',
    'broke into', 'torched', 'attacked', 'violence', 'threatening',
    'diddy', 'p diddy', 'sean combs', 'criminal', 'crime',
    'police', 'investigation', 'fbi', 'raid', 'searched',
    'death', 'died', 'killed', 'murdered', 'suicide',
    'drug', 'drugs', 'cocaine', 'overdose', 'substance abuse',
    'sex', 'sexual', 'assault', 'harassment', 'abuse',
    'celebrity news', 'gossip', 'rumor', 'rumors', 'allegedly',
    // Additional blacklist keywords
    'how to watch', 'where to watch', 'watch online', 'streaming guide',
    'cancelled', 'canceled', 'cancellation', 'ending', 'series finale',
    'dead', 'dies', 'passing', 'passed away', 'obituary', 'memorial'
  ];
  
  // Check for relevant keywords
  const hasRelevantContent = relevantKeywords.some(keyword => 
    fullText.includes(keyword)
  );
  
  // Check for gossip keywords
  const hasGossipContent = gossipKeywords.some(keyword => 
    fullText.includes(keyword)
  );
  
  // Prioritize articles with relevant content and no gossip
  if (hasRelevantContent && !hasGossipContent) {
    return true;
  }
  
  // If it has gossip content, filter it out
  if (hasGossipContent) {
    return false;
  }
  
  // If no specific keywords found, include it (neutral content)
  return true;
}

/**
 * Fetches news from multiple RSS feeds with smart filtering for music events and releases
 * 
 * @param limit Maximum number of items to return per feed
 * @returns Combined array of filtered news items from all feeds
 */
export async function fetchAllNews(limit: number = 5): Promise<NewsItem[]> {
  try {
    // Fetch all feeds in parallel
    const feedPromises = musicNewsFeeds.map(feed => 
      fetchRssFeed(feed.url, feed.name)
    );
    
    // Wait for all feeds to be fetched
    const allFeedsResults = await Promise.all(feedPromises);
    
    // Combine all items from all feeds
    let allItems: NewsItem[] = [];
    allFeedsResults.forEach(items => {
      allItems = [...allItems, ...items];
    });
    
    // Filter out gossip and irrelevant content
    const filteredItems = allItems.filter(item => isRelevantMusicNews(item));
    
    console.log(`Filtered ${allItems.length} news items down to ${filteredItems.length} relevant items`);
    
    // Sort by publication date (newest first)
    filteredItems.sort((a, b) => {
      const dateA = new Date(a.pubDate).getTime();
      const dateB = new Date(b.pubDate).getTime();
      return dateB - dateA;
    });
    
    // Return limited number of items
    return filteredItems.slice(0, limit);
  } catch (error) {
    console.error('Error fetching all news feeds:', error);
    return [];
  }
}