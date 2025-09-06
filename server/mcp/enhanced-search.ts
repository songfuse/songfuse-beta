/**
 * Enhanced Track Search with Audio Features and Release Date Support
 * 
 * This module combines vector similarity search with audio feature filtering
 * and release date filtering for more accurate playlist generation.
 */

import { db } from '../db';
import { tracks } from '@shared/schema';
import { sql, desc, asc, between, and, or, eq, gte, lte } from 'drizzle-orm';
import { SearchCriteria } from './index';
import { findTracksByVectorSimilarity } from './vector-search';
import { SpotifyTrack } from '@shared/schema';

// Interface for enhanced search parameters
export interface EnhancedSearchParams extends SearchCriteria {
  // Audio features filters
  minTempo?: number;
  maxTempo?: number;
  minEnergy?: number;
  maxEnergy?: number;
  minDanceability?: number;
  maxDanceability?: number;
  minValence?: number; // Positivity/happiness
  maxValence?: number;
  minAcousticness?: number;
  maxAcousticness?: number;
  
  // Time/era filters
  startYear?: number;
  endYear?: number;
  decadeFilter?: string; // e.g. "1980s", "1990s"
  
  // Diversity parameters
  diversityFactor?: number; // 0-1, higher means more diverse results
  limitArtistRepetition?: boolean; // Limit songs from same artist
  maxTracksPerArtist?: number; // Maximum tracks from the same artist
}

/**
 * Parse decade string to start/end years
 * @param decade Decade string (e.g. "1980s", "90s")
 * @returns Object with startYear and endYear
 */
function parseDecade(decade: string): { startYear: number, endYear: number } | null {
  // Handle common decade formats
  const full = /^(\d{4})s$/i; // e.g. "1980s"
  const short = /^(\d{1,2})s$/i; // e.g. "80s"
  
  let match = decade.match(full);
  if (match) {
    const startYear = parseInt(match[1]);
    return { startYear, endYear: startYear + 9 };
  }
  
  match = decade.match(short);
  if (match) {
    const year = parseInt(match[1]);
    // Assume 2-digit years: anything >= 50 is 1900s, < 50 is 2000s
    const startYear = year >= 50 ? 1900 + year : 2000 + year;
    return { startYear, endYear: startYear + 9 };
  }
  
  return null;
}

/**
 * Convert release date timestamp to year
 * @param releaseDate Date object or string
 * @returns Year as number or null if invalid
 */
function extractYearFromDate(releaseDate: Date | string | null): number | null {
  if (!releaseDate) return null;
  
  try {
    const date = typeof releaseDate === 'string' ? new Date(releaseDate) : releaseDate;
    return date.getFullYear();
  } catch (error) {
    console.error('Error extracting year from date:', error);
    return null;
  }
}

/**
 * Find tracks using both vector similarity and audio feature filtering
 */
export async function findEnhancedTracks(
  params: EnhancedSearchParams,
  limit: number = 100
): Promise<number[]> {
  console.time('findEnhancedTracks');
  
  try {
    // Step 1: Get initial track candidates using vector similarity
    // We get more than needed to have room for filtering
    const vectorLimit = Math.max(limit * 3, 150);
    const vectorMatches = await findTracksByVectorSimilarity(params, vectorLimit);
    
    if (!vectorMatches.length) {
      console.log('No vector matches found');
      console.timeEnd('findEnhancedTracks');
      return [];
    }
    
    console.log(`Found ${vectorMatches.length} initial vector matches`);
    
    // Step 2: Process time/era filters if specified
    let yearStart: number | undefined = undefined;
    let yearEnd: number | undefined = undefined;
    
    if (params.startYear) yearStart = params.startYear;
    if (params.endYear) yearEnd = params.endYear;
    
    // If decade is specified, it overrides start/end years
    if (params.decadeFilter) {
      const decadeRange = parseDecade(params.decadeFilter);
      if (decadeRange) {
        yearStart = decadeRange.startYear;
        yearEnd = decadeRange.endYear;
        console.log(`Parsed decade "${params.decadeFilter}" to year range: ${yearStart}-${yearEnd}`);
      }
    }
    
    // Extract just the IDs for the database query
    const trackIds = vectorMatches.map(t => t.id);
    
    // Step 3: Build audio feature filters dynamically
    let conditions = [];
    
    // Always include the vector-matched track IDs
    conditions.push(sql`${tracks.id} IN (${sql.join(trackIds, sql`, `)})`);
    
    // Add explicit filter if specified
    if (params.avoidExplicit) {
      conditions.push(sql`${tracks.explicit} = false`);
    }
    
    // Add release date filter if specified
    if (yearStart && yearEnd) {
      console.log(`Applying release date filter: ${yearStart}-${yearEnd}`);
      // Check if we have any tracks with non-NULL release dates
      const hasNonNullDates = await db.select({ count: sql`count(*)` })
        .from(tracks)
        .where(sql`${tracks.releaseDate} IS NOT NULL`)
        .then(result => parseInt(result[0].count.toString()) > 0);
      
      if (hasNonNullDates) {
        // If we have non-NULL dates, apply the release date filter
        conditions.push(sql`${tracks.releaseDate} IS NOT NULL AND EXTRACT(YEAR FROM ${tracks.releaseDate}) BETWEEN ${yearStart} AND ${yearEnd}`);
      } else {
        // If all dates are NULL, log a warning but don't apply the filter
        console.warn(`Skipping release date filter (${yearStart}-${yearEnd}) because all tracks have NULL release dates`);
      }
    } else if (yearStart) {
      console.log(`Applying release date filter: after ${yearStart}`);
      const hasNonNullDates = await db.select({ count: sql`count(*)` })
        .from(tracks)
        .where(sql`${tracks.releaseDate} IS NOT NULL`)
        .then(result => parseInt(result[0].count.toString()) > 0);
      
      if (hasNonNullDates) {
        conditions.push(sql`${tracks.releaseDate} IS NOT NULL AND EXTRACT(YEAR FROM ${tracks.releaseDate}) >= ${yearStart}`);
      } else {
        console.warn(`Skipping release date filter (after ${yearStart}) because all tracks have NULL release dates`);
      }
    } else if (yearEnd) {
      console.log(`Applying release date filter: before ${yearEnd}`);
      const hasNonNullDates = await db.select({ count: sql`count(*)` })
        .from(tracks)
        .where(sql`${tracks.releaseDate} IS NOT NULL`)
        .then(result => parseInt(result[0].count.toString()) > 0);
      
      if (hasNonNullDates) {
        conditions.push(sql`${tracks.releaseDate} IS NOT NULL AND EXTRACT(YEAR FROM ${tracks.releaseDate}) <= ${yearEnd}`);
      } else {
        console.warn(`Skipping release date filter (before ${yearEnd}) because all tracks have NULL release dates`);
      }
    }
    
    // Add audio feature filters if specified
    if (params.minTempo !== undefined) conditions.push(sql`${tracks.tempo} >= ${params.minTempo}`);
    if (params.maxTempo !== undefined) conditions.push(sql`${tracks.tempo} <= ${params.maxTempo}`);
    
    if (params.minEnergy !== undefined) conditions.push(sql`${tracks.energy} >= ${params.minEnergy}`);
    if (params.maxEnergy !== undefined) conditions.push(sql`${tracks.energy} <= ${params.maxEnergy}`);
    
    if (params.minDanceability !== undefined) conditions.push(sql`${tracks.danceability} >= ${params.minDanceability}`);
    if (params.maxDanceability !== undefined) conditions.push(sql`${tracks.danceability} <= ${params.maxDanceability}`);
    
    if (params.minValence !== undefined) conditions.push(sql`${tracks.valence} >= ${params.minValence}`);
    if (params.maxValence !== undefined) conditions.push(sql`${tracks.valence} <= ${params.maxValence}`);
    
    if (params.minAcousticness !== undefined) conditions.push(sql`${tracks.acousticness} >= ${params.minAcousticness}`);
    if (params.maxAcousticness !== undefined) conditions.push(sql`${tracks.acousticness} <= ${params.maxAcousticness}`);
    
    // Execute the query with all conditions combined
    console.time('fetch-filtered-tracks');
    const filteredTracks = await db.select({
      id: tracks.id,
      title: tracks.title,
      releaseDate: tracks.releaseDate,
      tempo: tracks.tempo,
      energy: tracks.energy,
      danceability: tracks.danceability,
      valence: tracks.valence
    })
    .from(tracks)
    .where(and(...conditions))
    .limit(limit * 2); // Get extra for diversity processing
    console.timeEnd('fetch-filtered-tracks');
    
    console.log(`Found ${filteredTracks.length} tracks after audio feature and date filtering`);
    
    // Step 4: Preserve vector similarity ordering while incorporating filters
    // This is important to maintain relevance to the original query
    const vectorScoreMap = new Map(vectorMatches.map(track => [track.id, track.similarity]));
    
    const enhancedResults = filteredTracks.map(track => {
      return {
        id: track.id,
        title: track.title,
        similarity: vectorScoreMap.get(track.id) || 0,
        releaseDate: track.releaseDate,
        tempo: track.tempo,
        energy: track.energy,
        danceability: track.danceability,
        valence: track.valence
      };
    });
    
    // Sort by vector similarity, maintaining the relevance order
    const sortedResults = enhancedResults.sort((a, b) => b.similarity - a.similarity);
    
    // Step 5: Apply diversity factoring if specified
    let finalResults = sortedResults;
    
    // Add diversity factor through randomization where appropriate
    if (params.diversityFactor && params.diversityFactor > 0) {
      const diversityPercent = params.diversityFactor;
      
      // Split into tiers
      const tierSize = Math.ceil(finalResults.length / 3);
      const topTier = finalResults.slice(0, tierSize);
      const midTier = finalResults.slice(tierSize, 2 * tierSize);
      const bottomTier = finalResults.slice(2 * tierSize);
      
      // Apply randomization to mid and bottom tiers based on diversity factor
      if (diversityPercent > 0.3) {
        // Shuffle mid and bottom tiers more aggressively for higher diversity
        const shuffledMid = midTier.sort(() => Math.random() - 0.5);
        const shuffledBottom = bottomTier.sort(() => Math.random() - 0.5);
        finalResults = [...topTier, ...shuffledMid, ...shuffledBottom];
      } else if (diversityPercent > 0.1) {
        // Shuffle just the bottom tier for mild diversity
        const shuffledBottom = bottomTier.sort(() => Math.random() - 0.5);
        finalResults = [...topTier, ...midTier, ...shuffledBottom];
      }
    }
    
    // Step 6: Limit artist repetition if requested
    if (params.limitArtistRepetition && finalResults.length > limit / 2) {
      console.log('Limiting artist repetition in results');
      // This requires an additional query to get artist info
      const maxPerArtist = params.maxTracksPerArtist || 2;
      
      // Get all track IDs for artist data
      const allTrackIds = finalResults.map(t => t.id);
      
      // Fetch artist data for these tracks
      const artistData = await db.execute(sql`
        SELECT 
          ta.track_id, 
          a.name as artist_name,
          a.id as artist_id
        FROM 
          tracks_to_artists ta
        INNER JOIN 
          artists a ON ta.artist_id = a.id
        WHERE 
          ta.track_id IN (${sql.join(allTrackIds, sql`, `)})
      `);
      
      // Map tracks to their artists
      const trackToArtistsMap: Record<number, { id: number, name: string }[]> = {};
      
      if (artistData && artistData.rows) {
        artistData.rows.forEach((row: any) => {
          const trackId = parseInt(row.track_id);
          if (!trackToArtistsMap[trackId]) {
            trackToArtistsMap[trackId] = [];
          }
          trackToArtistsMap[trackId].push({
            id: parseInt(row.artist_id),
            name: row.artist_name
          });
        });
      }
      
      // Enforce artist diversity
      const artistCount: Record<number, number> = {}; // Track count per artist
      const diverseTracks: number[] = [];
      
      for (const track of finalResults) {
        const artists = trackToArtistsMap[track.id] || [];
        const primaryArtist = artists[0]; // Use first artist (typically the main one)
        
        if (!primaryArtist) {
          // No artist info, include the track
          diverseTracks.push(track.id);
          continue;
        }
        
        const artistId = primaryArtist.id;
        
        // Check if we've reached the limit for this artist
        if (!artistCount[artistId]) {
          artistCount[artistId] = 0;
        }
        
        if (artistCount[artistId] < maxPerArtist) {
          diverseTracks.push(track.id);
          artistCount[artistId]++;
        }
        
        // Stop once we have enough tracks
        if (diverseTracks.length >= limit) {
          break;
        }
      }
      
      // If we don't have enough diverse tracks, add more from the original list
      if (diverseTracks.length < limit) {
        console.log(`Added only ${diverseTracks.length} tracks after artist diversity, needs ${limit}`);
        // Add remaining tracks, even if exceeding the artist limit
        for (const track of finalResults) {
          if (!diverseTracks.includes(track.id)) {
            diverseTracks.push(track.id);
            if (diverseTracks.length >= limit) break;
          }
        }
      }
      
      console.log(`Selected ${diverseTracks.length} tracks after applying artist diversity`);
      console.timeEnd('findEnhancedTracks');
      return diverseTracks.slice(0, limit);
    }
    
    // Return just the IDs for the final results
    const finalTrackIds = finalResults.slice(0, limit).map(t => t.id);
    console.log(`Returning ${finalTrackIds.length} tracks from enhanced search`);
    console.timeEnd('findEnhancedTracks');
    return finalTrackIds;
  } catch (error) {
    console.error('Error in findEnhancedTracks:', error);
    console.timeEnd('findEnhancedTracks');
    return [];
  }
}

/**
 * Helper function to map audio mood terms to audio feature ranges
 * This converts human-friendly terms to actual parameter ranges
 */
export function mapMoodToAudioFeatures(mood: string): Partial<EnhancedSearchParams> {
  const features: Partial<EnhancedSearchParams> = {};
  
  // Normalize the mood string
  const normalizedMood = mood.toLowerCase().trim();
  
  // Energy-related moods
  if (['energetic', 'upbeat', 'powerful', 'intense', 'energizing'].some(term => normalizedMood.includes(term))) {
    features.minEnergy = 70;
  } else if (['calm', 'relaxed', 'chill', 'mellow', 'peaceful'].some(term => normalizedMood.includes(term))) {
    features.maxEnergy = 40;
  }
  
  // Danceability-related moods
  if (['dance', 'danceable', 'groovy', 'funky'].some(term => normalizedMood.includes(term))) {
    features.minDanceability = 70;
  } else if (['serious', 'reflective', 'complex'].some(term => normalizedMood.includes(term))) {
    features.maxDanceability = 40;
  }
  
  // Valence-related moods (happiness/positivity)
  if (['happy', 'cheerful', 'positive', 'uplifting', 'joyful'].some(term => normalizedMood.includes(term))) {
    features.minValence = 70;
  } else if (['sad', 'melancholic', 'sombre', 'dark', 'gloomy'].some(term => normalizedMood.includes(term))) {
    features.maxValence = 30;
  }
  
  // Acousticness-related moods
  if (['acoustic', 'unplugged', 'organic'].some(term => normalizedMood.includes(term))) {
    features.minAcousticness = 70;
  } else if (['electronic', 'produced', 'synthetic'].some(term => normalizedMood.includes(term))) {
    features.maxAcousticness = 30;
  }
  
  // Tempo-related moods
  if (['fast', 'quick', 'uptempo', 'rapid'].some(term => normalizedMood.includes(term))) {
    features.minTempo = 120;
  } else if (['slow', 'downtempo', 'gentle'].some(term => normalizedMood.includes(term))) {
    features.maxTempo = 90;
  }
  
  return features;
}

/**
 * Helper function to map era terms to year ranges
 * This converts human-friendly terms to actual year ranges
 */
export function mapEraToYearRange(era: string): { startYear?: number, endYear?: number, decadeFilter?: string } {
  const result: { startYear?: number, endYear?: number, decadeFilter?: string } = {};
  
  // Normalize the era string
  const normalizedEra = era.toLowerCase().trim();
  
  // Map decades
  if (normalizedEra.includes('50s') || normalizedEra.includes('1950s') || normalizedEra.includes('fifties')) {
    result.startYear = 1950;
    result.endYear = 1959;
    result.decadeFilter = '1950s';
  } else if (normalizedEra.includes('60s') || normalizedEra.includes('1960s') || normalizedEra.includes('sixties')) {
    result.startYear = 1960;
    result.endYear = 1969;
    result.decadeFilter = '1960s';
  } else if (normalizedEra.includes('70s') || normalizedEra.includes('1970s') || normalizedEra.includes('seventies')) {
    result.startYear = 1970;
    result.endYear = 1979;
    result.decadeFilter = '1970s';
  } else if (normalizedEra.includes('80s') || normalizedEra.includes('1980s') || normalizedEra.includes('eighties')) {
    result.startYear = 1980;
    result.endYear = 1989;
    result.decadeFilter = '1980s';
  } else if (normalizedEra.includes('90s') || normalizedEra.includes('1990s') || normalizedEra.includes('nineties')) {
    result.startYear = 1990;
    result.endYear = 1999;
    result.decadeFilter = '1990s';
  } else if (normalizedEra.includes('2000s') || normalizedEra.includes('00s') || normalizedEra.includes('aughts')) {
    result.startYear = 2000;
    result.endYear = 2009;
    result.decadeFilter = '2000s';
  } else if (normalizedEra.includes('2010s') || normalizedEra.includes('10s')) {
    result.startYear = 2010;
    result.endYear = 2019;
    result.decadeFilter = '2010s';
  } else if (normalizedEra.includes('2020s') || normalizedEra.includes('20s')) {
    result.startYear = 2020;
    result.endYear = 2029; // Future!
    result.decadeFilter = '2020s';
  }
  
  // Map broader eras
  else if (['vintage', 'classic', 'oldies', 'classics'].some(term => normalizedEra.includes(term))) {
    result.endYear = 1979; // Anything before the 80s
  } else if (['modern', 'contemporary', 'current', 'recent', 'today'].some(term => normalizedEra.includes(term))) {
    result.startYear = 2010; // Recent music (2010+)
  } else if (['old school', 'retro'].some(term => normalizedEra.includes(term))) {
    result.startYear = 1970;
    result.endYear = 1999; // 70s-90s
  }
  
  return result;
}