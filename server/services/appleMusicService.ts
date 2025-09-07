/**
 * Apple Music Top Albums Service
 * 
 * This service fetches and processes the Top 25 Albums from Apple's RSS API
 * providing trending album data for playlist creation inspiration.
 */

import { generateAlbumDescription } from '../openai';

interface AppleAlbum {
  artistName: string;
  id: string;
  name: string;
  releaseDate: string;
  kind: string;
  artistId: string;
  artistUrl: string;
  contentAdvisoryRating?: string;
  artworkUrl100: string;
  genres: Array<{
    genreId: string;
    name: string;
    url: string;
  }>;
  url: string;
}

interface AppleMusicResponse {
  feed: {
    title: string;
    updated: string;
    results: AppleAlbum[];
  };
}

interface ProcessedAlbum {
  id: string;
  title: string;
  artist: string;
  releaseDate: string;
  chartPosition: number;
  genre: string;
  coverImage: string;
  appleUrl: string;
  isExplicit: boolean;
  artistId: string;
  description?: string;
}

const APPLE_RSS_URL = 'https://rss.marketingtools.apple.com/api/v2/us/music/most-played/25/albums.json';

/**
 * Fetch Top 25 Albums from Apple Music RSS API
 */
export async function fetchTopAlbums(): Promise<ProcessedAlbum[]> {
  try {
    console.log('📊 Fetching Top 25 Albums from Apple Music...');
    
    const response = await fetch(APPLE_RSS_URL);
    if (!response.ok) {
      throw new Error(`Apple API responded with status: ${response.status}`);
    }
    
    const data: AppleMusicResponse = await response.json();
    
    if (!data.feed || !data.feed.results) {
      throw new Error('Invalid Apple Music API response structure');
    }
    
    const processedAlbums: ProcessedAlbum[] = data.feed.results.map((album, index) => ({
      id: album.id,
      title: album.name,
      artist: album.artistName,
      releaseDate: album.releaseDate,
      chartPosition: index + 1, // Position in Top 25
      genre: album.genres.find(g => g.name !== 'Music')?.name || 'Music',
      coverImage: album.artworkUrl100.replace('100x100bb', '300x300bb'), // Higher resolution
      appleUrl: album.url,
      isExplicit: album.contentAdvisoryRating === 'Explict', // Note: Apple has typo in their API
      artistId: album.artistId
    }));

    // Generate descriptions for albums (in parallel for better performance)
    console.log('📝 Generating album descriptions...');
    const albumsWithDescriptions = await Promise.all(
      processedAlbums.map(async (album) => {
        try {
          const description = await generateAlbumDescription(album);
          return { ...album, description };
        } catch (error) {
          console.warn(`Failed to generate description for ${album.title}:`, error);
          return album; // Return album without description if generation fails
        }
      })
    );
    
    console.log(`✅ Successfully processed ${albumsWithDescriptions.length} top albums with descriptions`);
    return albumsWithDescriptions;
    
  } catch (error) {
    console.error('❌ Failed to fetch top albums:', error);
    throw new Error(`Failed to fetch Apple Music top albums: ${error.message}`);
  }
}

/**
 * Generate playlist prompt based on album information
 */
export function generateAlbumPlaylistPrompt(album: ProcessedAlbum): string {
  const prompt = `Create a playlist inspired by the trending album "${album.title}" by ${album.artist}.

Album Details:
- Genre: ${album.genre}
- Release Date: ${album.releaseDate}
- Chart Position: #${album.chartPosition} in US
- Style: ${album.isExplicit ? 'Explicit content' : 'Clean'}

Create a playlist that captures the musical style, era, and energy of this album. Include songs that would appeal to fans of ${album.artist} and the ${album.genre} genre. The playlist should reflect the current trending sound that made this album popular.

Focus on:
- Similar artists and musical style
- Songs from the same genre and era
- Tracks that match the album's energy and mood
- Current trending music that complements this album`;

  return prompt;
}

/**
 * Get cached albums or fetch fresh data
 * This could be enhanced with database caching similar to news articles
 */
let cachedAlbums: ProcessedAlbum[] | null = null;
let lastFetch: Date | null = null;
const CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours in milliseconds

export async function getTopAlbums(): Promise<ProcessedAlbum[]> {
  try {
    // Check if we have cached data that's still valid
    if (cachedAlbums && lastFetch && (Date.now() - lastFetch.getTime()) < CACHE_DURATION) {
      console.log('📊 Serving cached top albums data');
      return cachedAlbums;
    }
    
    // Fetch fresh data
    const albums = await fetchTopAlbums();
    
    // Update cache
    cachedAlbums = albums;
    lastFetch = new Date();
    
    return albums;
    
  } catch (error) {
    console.error('❌ Error in getTopAlbums:', error);
    
    // Return cached data if available, even if stale
    if (cachedAlbums) {
      console.log('⚠️ Serving stale cached data due to fetch error');
      return cachedAlbums;
    }
    
    // No cached data available, throw error
    throw error;
  }
}