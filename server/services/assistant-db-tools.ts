import { config } from 'dotenv';
import { db } from "../db";
import { eq, like, and, or, sql, desc, asc } from "drizzle-orm";
import { tracks, tracksToArtists, artists, tracksToGenres, genres } from "@shared/schema";
import { dbTrackToSpotifyTrack } from "../db";

// Load environment variables
config();

/**
 * Database tools for OpenAI Assistant
 * These functions provide direct database access to the AI assistant
 * instead of relying on static JSON files
 */

export interface TrackSearchParams {
  query?: string;
  genre?: string;
  artist?: string;
  limit?: number;
  avoidExplicit?: boolean;
  minTempo?: number;
  maxTempo?: number;
  minEnergy?: number;
  maxEnergy?: number;
  minValence?: number;
  maxValence?: number;
  minDanceability?: number;
  maxDanceability?: number;
  yearFrom?: number;
  yearTo?: number;
}

export interface TrackResult {
  id: number;
  title: string;
  artist: string;
  genre?: string;
  tempo?: number;
  energy?: number;
  valence?: number;
  danceability?: number;
  explicit: boolean;
  releaseDate?: string;
  popularity?: number;
}

/**
 * Search tracks by text query with vector similarity
 */
export async function searchTracksByText(params: TrackSearchParams): Promise<TrackResult[]> {
  const limit = params.limit || 24;
  
  try {
    // If we have a text query, use vector similarity search
    if (params.query) {
      const { findTracksMatchingEmbedding } = await import('../embeddings');
      const vectorResults = await findTracksMatchingEmbedding(
        params.query,
        limit,
        params.avoidExplicit || false
      );
      
      return vectorResults.map(track => ({
        id: track.id,
        title: track.name,
        artist: track.artists[0]?.name || 'Unknown Artist',
        genre: track.genres?.[0],
        tempo: track.tempo,
        energy: track.energy,
        valence: track.valence,
        danceability: track.danceability,
        explicit: track.explicit,
        releaseDate: track.album?.release_date,
        popularity: track.popularity
      }));
    }
    
    // Fallback to regular database search
    return await searchTracksByCriteria(params);
  } catch (error) {
    console.error('Error in searchTracksByText:', error);
    return [];
  }
}

/**
 * Search tracks by specific criteria (genre, artist, audio features)
 */
export async function searchTracksByCriteria(params: TrackSearchParams): Promise<TrackResult[]> {
  const limit = params.limit || 24;
  
  try {
    let query = db
      .select({
        id: tracks.id,
        title: tracks.title,
        explicit: tracks.explicit,
        tempo: tracks.tempo,
        energy: tracks.energy,
        valence: tracks.valence,
        danceability: tracks.danceability,
        releaseDate: tracks.releaseDate,
        popularity: tracks.popularity
      })
      .from(tracks);
    
    // Add filters based on parameters
    const conditions = [];
    
    if (params.avoidExplicit) {
      conditions.push(eq(tracks.explicit, false));
    }
    
    if (params.minTempo !== undefined) {
      conditions.push(sql`${tracks.tempo} >= ${params.minTempo}`);
    }
    
    if (params.maxTempo !== undefined) {
      conditions.push(sql`${tracks.tempo} <= ${params.maxTempo}`);
    }
    
    if (params.minEnergy !== undefined) {
      conditions.push(sql`${tracks.energy} >= ${params.minEnergy}`);
    }
    
    if (params.maxEnergy !== undefined) {
      conditions.push(sql`${tracks.energy} <= ${params.maxEnergy}`);
    }
    
    if (params.minValence !== undefined) {
      conditions.push(sql`${tracks.valence} >= ${params.minValence}`);
    }
    
    if (params.maxValence !== undefined) {
      conditions.push(sql`${tracks.valence} <= ${params.maxValence}`);
    }
    
    if (params.minDanceability !== undefined) {
      conditions.push(sql`${tracks.danceability} >= ${params.minDanceability}`);
    }
    
    if (params.maxDanceability !== undefined) {
      conditions.push(sql`${tracks.danceability} <= ${params.maxDanceability}`);
    }
    
    if (params.yearFrom !== undefined) {
      conditions.push(sql`EXTRACT(YEAR FROM ${tracks.releaseDate}) >= ${params.yearFrom}`);
    }
    
    if (params.yearTo !== undefined) {
      conditions.push(sql`EXTRACT(YEAR FROM ${tracks.releaseDate}) <= ${params.yearTo}`);
    }
    
    // Apply conditions
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    // Add ordering
    query = query.orderBy(desc(tracks.popularity), desc(tracks.id));
    
    const trackResults = await query.limit(limit);
    
    // Get artist and genre information for each track
    const results: TrackResult[] = [];
    
    for (const track of trackResults) {
      // Get primary artist
      const artistResult = await db
        .select({ name: artists.name })
        .from(artists)
        .innerJoin(tracksToArtists, eq(artists.id, tracksToArtists.artistId))
        .where(and(
          eq(tracksToArtists.trackId, track.id),
          eq(tracksToArtists.isPrimary, true)
        ))
        .limit(1);
      
      // Get genre
      const genreResult = await db
        .select({ name: genres.name })
        .from(genres)
        .innerJoin(tracksToGenres, eq(genres.id, tracksToGenres.genreId))
        .where(eq(tracksToGenres.trackId, track.id))
        .limit(1);
      
      results.push({
        id: track.id,
        title: track.title,
        artist: artistResult[0]?.name || 'Unknown Artist',
        genre: genreResult[0]?.name,
        tempo: track.tempo,
        energy: track.energy,
        valence: track.valence,
        danceability: track.danceability,
        explicit: track.explicit,
        releaseDate: track.releaseDate?.toISOString().split('T')[0],
        popularity: track.popularity
      });
    }
    
    return results;
  } catch (error) {
    console.error('Error in searchTracksByCriteria:', error);
    return [];
  }
}

/**
 * Search tracks by genre
 */
export async function searchTracksByGenre(genreName: string, limit: number = 24): Promise<TrackResult[]> {
  try {
    const results = await db
      .select({
        id: tracks.id,
        title: tracks.title,
        explicit: tracks.explicit,
        tempo: tracks.tempo,
        energy: tracks.energy,
        valence: tracks.valence,
        danceability: tracks.danceability,
        releaseDate: tracks.releaseDate,
        popularity: tracks.popularity,
        artistName: artists.name,
        genreName: genres.name
      })
      .from(tracks)
      .innerJoin(tracksToGenres, eq(tracks.id, tracksToGenres.trackId))
      .innerJoin(genres, eq(tracksToGenres.genreId, genres.id))
      .innerJoin(tracksToArtists, eq(tracks.id, tracksToArtists.trackId))
      .innerJoin(artists, eq(tracksToArtists.artistId, artists.id))
      .where(and(
        eq(genres.name, genreName),
        eq(tracksToArtists.isPrimary, true)
      ))
      .orderBy(desc(tracks.popularity))
      .limit(limit);
    
    return results.map(track => ({
      id: track.id,
      title: track.title,
      artist: track.artistName,
      genre: track.genreName,
      tempo: track.tempo,
      energy: track.energy,
      valence: track.valence,
      danceability: track.danceability,
      explicit: track.explicit,
      releaseDate: track.releaseDate?.toISOString().split('T')[0],
      popularity: track.popularity
    }));
  } catch (error) {
    console.error('Error in searchTracksByGenre:', error);
    return [];
  }
}

/**
 * Search tracks by artist
 */
export async function searchTracksByArtist(artistName: string, limit: number = 24): Promise<TrackResult[]> {
  try {
    const results = await db
      .select({
        id: tracks.id,
        title: tracks.title,
        explicit: tracks.explicit,
        tempo: tracks.tempo,
        energy: tracks.energy,
        valence: tracks.valence,
        danceability: tracks.danceability,
        releaseDate: tracks.releaseDate,
        popularity: tracks.popularity,
        artistName: artists.name,
        genreName: genres.name
      })
      .from(tracks)
      .innerJoin(tracksToArtists, eq(tracks.id, tracksToArtists.trackId))
      .innerJoin(artists, eq(tracksToArtists.artistId, artists.id))
      .leftJoin(tracksToGenres, eq(tracks.id, tracksToGenres.trackId))
      .leftJoin(genres, eq(tracksToGenres.genreId, genres.id))
      .where(and(
        like(artists.name, `%${artistName}%`),
        eq(tracksToArtists.isPrimary, true)
      ))
      .orderBy(desc(tracks.popularity))
      .limit(limit);
    
    return results.map(track => ({
      id: track.id,
      title: track.title,
      artist: track.artistName,
      genre: track.genreName,
      tempo: track.tempo,
      energy: track.energy,
      valence: track.valence,
      danceability: track.danceability,
      explicit: track.explicit,
      releaseDate: track.releaseDate?.toISOString().split('T')[0],
      popularity: track.popularity
    }));
  } catch (error) {
    console.error('Error in searchTracksByArtist:', error);
    return [];
  }
}

/**
 * Get all available genres
 */
export async function getAllGenres(): Promise<string[]> {
  try {
    const results = await db
      .select({ name: genres.name })
      .from(genres)
      .orderBy(asc(genres.name));
    
    return results.map(genre => genre.name);
  } catch (error) {
    console.error('Error getting genres:', error);
    return [];
  }
}

/**
 * Get all available artists
 */
export async function getAllArtists(): Promise<string[]> {
  try {
    const results = await db
      .select({ name: artists.name })
      .from(artists)
      .orderBy(asc(artists.name));
    
    return results.map(artist => artist.name);
  } catch (error) {
    console.error('Error getting artists:', error);
    return [];
  }
}

/**
 * Get random tracks for playlist generation
 */
export async function getRandomTracks(limit: number = 24, avoidExplicit: boolean = false): Promise<TrackResult[]> {
  try {
    let query = db
      .select({
        id: tracks.id,
        title: tracks.title,
        explicit: tracks.explicit,
        tempo: tracks.tempo,
        energy: tracks.energy,
        valence: tracks.valence,
        danceability: tracks.danceability,
        releaseDate: tracks.releaseDate,
        popularity: tracks.popularity
      })
      .from(tracks);
    
    if (avoidExplicit) {
      query = query.where(eq(tracks.explicit, false));
    }
    
    const trackResults = await query
      .orderBy(sql`RANDOM()`)
      .limit(limit);
    
    // Get artist and genre information for each track
    const results: TrackResult[] = [];
    
    for (const track of trackResults) {
      // Get primary artist
      const artistResult = await db
        .select({ name: artists.name })
        .from(artists)
        .innerJoin(tracksToArtists, eq(artists.id, tracksToArtists.artistId))
        .where(and(
          eq(tracksToArtists.trackId, track.id),
          eq(tracksToArtists.isPrimary, true)
        ))
        .limit(1);
      
      // Get genre
      const genreResult = await db
        .select({ name: genres.name })
        .from(genres)
        .innerJoin(tracksToGenres, eq(genres.id, tracksToGenres.genreId))
        .where(eq(tracksToGenres.trackId, track.id))
        .limit(1);
      
      results.push({
        id: track.id,
        title: track.title,
        artist: artistResult[0]?.name || 'Unknown Artist',
        genre: genreResult[0]?.name,
        tempo: track.tempo,
        energy: track.energy,
        valence: track.valence,
        danceability: track.danceability,
        explicit: track.explicit,
        releaseDate: track.releaseDate?.toISOString().split('T')[0],
        popularity: track.popularity
      });
    }
    
    return results;
  } catch (error) {
    console.error('Error getting random tracks:', error);
    return [];
  }
}

/**
 * Get track statistics for the assistant
 */
export async function getTrackStatistics(): Promise<{
  totalTracks: number;
  totalArtists: number;
  totalGenres: number;
  averageTempo: number;
  averageEnergy: number;
  averageValence: number;
  averageDanceability: number;
}> {
  try {
    const stats = await db
      .select({
        totalTracks: sql<number>`COUNT(DISTINCT ${tracks.id})`,
        totalArtists: sql<number>`COUNT(DISTINCT ${artists.id})`,
        totalGenres: sql<number>`COUNT(DISTINCT ${genres.id})`,
        averageTempo: sql<number>`AVG(${tracks.tempo})`,
        averageEnergy: sql<number>`AVG(${tracks.energy})`,
        averageValence: sql<number>`AVG(${tracks.valence})`,
        averageDanceability: sql<number>`AVG(${tracks.danceability})`
      })
      .from(tracks)
      .leftJoin(tracksToArtists, eq(tracks.id, tracksToArtists.trackId))
      .leftJoin(artists, eq(tracksToArtists.artistId, artists.id))
      .leftJoin(tracksToGenres, eq(tracks.id, tracksToGenres.trackId))
      .leftJoin(genres, eq(tracksToGenres.genreId, genres.id));
    
    return {
      totalTracks: stats[0]?.totalTracks || 0,
      totalArtists: stats[0]?.totalArtists || 0,
      totalGenres: stats[0]?.totalGenres || 0,
      averageTempo: Math.round(stats[0]?.averageTempo || 0),
      averageEnergy: Math.round(stats[0]?.averageEnergy || 0),
      averageValence: Math.round(stats[0]?.averageValence || 0),
      averageDanceability: Math.round(stats[0]?.averageDanceability || 0)
    };
  } catch (error) {
    console.error('Error getting track statistics:', error);
    return {
      totalTracks: 0,
      totalArtists: 0,
      totalGenres: 0,
      averageTempo: 0,
      averageEnergy: 0,
      averageValence: 0,
      averageDanceability: 0
    };
  }
}
