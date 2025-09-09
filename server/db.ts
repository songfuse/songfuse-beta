import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";
import { and, eq, SQL, sql, desc, like, or, inArray, count } from 'drizzle-orm';

// Check for the database URL
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?"
  );
}

// Create a connection pool with improved configuration
export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 20000,
  connectionTimeoutMillis: 5000,
  options: '--search_path=public,auth'
});
export const db = drizzle(pool, { schema });

/**
 * Execute raw SQL queries directly with retry logic
 * This is useful for operations not easily handled by Drizzle ORM
 * 
 * @param query SQL query string
 * @param params Optional query parameters
 * @returns Query result
 */
export async function execute(query: string, params?: any[]) {
  const maxRetries = 3;
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await pool.query(query, params);
    } catch (error) {
      lastError = error as Error;
      console.error(`Database query attempt ${attempt} failed:`, error);
      
      // If it's a control plane error, wait and retry
      if (error && typeof error === 'object' && 'code' in error && error.code === 'XX000') {
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
          console.log(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      
      // For other errors, don't retry
      throw error;
    }
  }
  
  throw lastError || new Error('Database operation failed after retries');
}

/**
 * Execute Drizzle queries with retry logic
 */
export async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  const maxRetries = 3;
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      console.error(`Database operation attempt ${attempt} failed:`, error);
      
      // If it's a control plane error, wait and retry
      if (error && typeof error === 'object' && 'code' in error && error.code === 'XX000') {
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
          console.log(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      
      // For other errors, don't retry
      throw error;
    }
  }
  
  throw lastError || new Error('Database operation failed after retries');
}

/**
 * Get all genre names from the database
 * Used to provide context to OpenAI for song recommendations
 */
export async function getAllDatabaseGenres(): Promise<string[]> {
  try {
    // Get genre counts first
    const genreCounts = await db
      .select({
        id: schema.genres.id,
        name: schema.genres.name,
        count: count(schema.tracksToGenres.trackId)
      })
      .from(schema.genres)
      .leftJoin(
        schema.tracksToGenres,
        eq(schema.genres.id, schema.tracksToGenres.genreId)
      )
      .groupBy(schema.genres.id)
      .orderBy(desc(count(schema.tracksToGenres.trackId)));
      
    return genreCounts.map(genre => genre.name);
  } catch (error) {
    console.error("Error getting all database genres:", error);
    return [];
  }
}

/**
 * Get a track by Spotify ID and convert it to Spotify-like format
 */
export async function getTrackBySpotifyId(
  spotifyId: string
): Promise<schema.SpotifyTrack | null> {
  try {
    // First, find the track ID in our database
    const trackPlatformResult = await db.select()
      .from(schema.trackPlatformIds)
      .where(
        and(
          eq(schema.trackPlatformIds.platformId, spotifyId),
          eq(schema.trackPlatformIds.platform, 'spotify')
        )
      )
      .limit(1);
    
    if (trackPlatformResult.length === 0) {
      return null;
    }
    
    // Get the track from our database
    const trackResult = await db.select()
      .from(schema.tracks)
      .where(eq(schema.tracks.id, trackPlatformResult[0].trackId))
      .limit(1);
    
    if (trackResult.length === 0) {
      return null;
    }
    
    // Convert to Spotify-like track format
    return dbTrackToSpotifyTrack(trackResult[0]);
  } catch (error) {
    console.error('Error finding track by Spotify ID:', error);
    return null;
  }
}

/**
 * Convert a database track to a Spotify-like track format
 */
/**
 * Get all tracks from the database and convert them to Spotify-like format
 * This function is used to export all tracks for backup/migration
 */
export async function getAllTracks(
  limit = 1000,
  offset = 0
): Promise<schema.SpotifyTrack[]> {
  try {
    // Get all tracks with pagination
    const tracksResult = await db.select()
      .from(schema.tracks)
      .limit(limit)
      .offset(offset)
      .orderBy(schema.tracks.id);
    
    // Convert each track to Spotify format
    const tracks: schema.SpotifyTrack[] = [];
    for (const track of tracksResult) {
      try {
        const spotifyTrack = await dbTrackToSpotifyTrack(track);
        tracks.push(spotifyTrack);
      } catch (error) {
        console.error(`Error converting track ${track.id} to Spotify format:`, error);
      }
    }
    
    return tracks;
  } catch (error) {
    console.error('Error getting all tracks:', error);
    return [];
  }
}

export async function dbTrackToSpotifyTrack(
  track: schema.Track, 
  includeArtists = true, 
  includeAlbum = true
): Promise<schema.SpotifyTrack> {
  try {
    // Get track artists if requested
    let artists = [];
    if (includeArtists) {
      // Query artists for this track
      const trackArtists = await db.select({
        artist: schema.artists
      })
      .from(schema.tracksToArtists)
      .innerJoin(
        schema.artists,
        eq(schema.tracksToArtists.artistId, schema.artists.id)
      )
      .where(eq(schema.tracksToArtists.trackId, track.id));
      
      // Convert to format expected by SpotifyTrack
      artists = trackArtists.map(item => ({
        name: item.artist.name,
        id: item.artist.id.toString(),
        // Include artist picture if available
        ...(item.artist.picture ? { images: [{ url: item.artist.picture }] } : {})
      }));
    }
    
    // Get album if requested
    let album = { name: '', images: [] };
    if (includeAlbum && track.albumId) {
      // Query album
      const albumResult = await db.select()
        .from(schema.albums)
        .where(eq(schema.albums.id, track.albumId))
        .limit(1);
      
      if (albumResult.length > 0) {
        album = {
          name: albumResult[0].title,
          images: albumResult[0].coverImage ? [{ url: albumResult[0].coverImage }] : []
        };
      }
    }
    
    // Get Spotify ID
    const spotifyIdResult = await db.select()
      .from(schema.trackPlatformIds)
      .where(
        and(
          eq(schema.trackPlatformIds.trackId, track.id),
          eq(schema.trackPlatformIds.platform, 'spotify')
        )
      )
      .limit(1);
    
    const spotifyId = spotifyIdResult.length > 0 ? spotifyIdResult[0].platformId : `local-${track.id}`;
    
    // Get all platform URLs
    const platformUrls = await db.select()
      .from(schema.trackPlatformIds)
      .where(eq(schema.trackPlatformIds.trackId, track.id));
    
    // Create platforms object for extended info
    const platforms: Record<string, { id: string, url: string }> = {};
    for (const platform of platformUrls) {
      // Keep the platform keys as they are in the database for consistency
      // This ensures youtube, apple_music, etc. are properly identified
      platforms[platform.platform] = {
        id: platform.platformId,
        url: platform.platformUrl || ''
      };
    }
    
    // Add audio features if available
    const audioFeatures: any = {};
    
    if (track.tempo || track.energy || track.danceability || track.valence || 
        track.acousticness || track.instrumentalness || track.liveness || track.speechiness) {
      
      audioFeatures.audio_features = {
        tempo: track.tempo || undefined,
        energy: track.energy || undefined,
        danceability: track.danceability || undefined,
        valence: track.valence || undefined,
        acousticness: track.acousticness || undefined,
        instrumentalness: track.instrumentalness || undefined,
        liveness: track.liveness || undefined,
        speechiness: track.speechiness || undefined
      };
    }
    
    // Convert to SpotifyTrack format with extended multi-platform support
    return {
      id: spotifyId,
      name: track.title,
      artists: artists,
      album: album,
      duration_ms: track.duration ? track.duration * 1000 : 0,
      preview_url: track.previewUrl,
      explicit: track.explicit,
      popularity: track.popularity || 50,
      platforms: platforms, // Add platform-specific URLs
      ...audioFeatures, // Add audio features if available
      // Add the database ID directly to the track object
      dbId: track.id // This is essential for saving to playlist with database ID
    };
  } catch (error) {
    console.error('Error converting database track to Spotify track:', error);
    throw new Error('Failed to convert track format');
  }
}

/**
 * Search tracks in the database
 * 
 * @param query The search query text
 * @param limit Maximum number of results to return
 * @param offset Pagination offset
 * @param avoidExplicit Whether to exclude explicit tracks
 * @param platform Optional platform filter
 * @param genreNames Optional array of specific genre names to search for
 * @returns Array of tracks matching the search criteria
 */
export async function searchTracks(
  query: string,
  limit = 20,
  offset = 0,
  avoidExplicit = false,
  platform: string | null = null,
  genreNames: string[] = [], 
  decades: number[] = [], // Add decade support for decade-specific searches
  silent = false // Option to skip logging (used when called from optimized paths)
): Promise<schema.SpotifyTrack[]> {
  try {
    if (!silent) {
      console.log(`[GENERAL SEARCH] Searching tracks with query: "${query}" and genres: ${JSON.stringify(genreNames)}`);
    }
    
    // Get track IDs that match our genres first if genre names are provided
    let genreMatchingTrackIds: number[] = [];
    if (genreNames.length > 0) {
      try {
        // Get genre IDs for the requested genre names (case insensitive)
        const genreMatches = await db
          .select()
          .from(schema.genres)
          .where(
            or(...genreNames.map(name => 
              like(schema.genres.name, `%${name}%`)
            ))
          );

        if (genreMatches.length > 0) {
          console.log(`Found ${genreMatches.length} matching genres: ${genreMatches.map(g => g.name).join(', ')}`);
          
          // Get tracks associated with these genres
          const genreIds = genreMatches.map(g => g.id);
          
          const trackGenreLinks = await db
            .select({ trackId: schema.tracksToGenres.trackId })
            .from(schema.tracksToGenres)
            .where(inArray(schema.tracksToGenres.genreId, genreIds));
            
          genreMatchingTrackIds = trackGenreLinks.map(link => link.trackId);
          console.log(`Found ${genreMatchingTrackIds.length} tracks matching requested genres`);
        } else {
          console.log('No matching genres found in database');
        }
      } catch (genreError) {
        console.error('Error during genre-based search:', genreError);
        // Continue with text search if genre search fails
      }
    }

    // Base query - Note: We don't use spotifyId directly since it doesn't exist in the DB
    let baseQuery = db.select({
      track: schema.tracks
    })
    .from(schema.tracks);
    
    // Filter by explicit content if requested
    if (avoidExplicit) {
      baseQuery = baseQuery.where(eq(schema.tracks.explicit, false));
    }
    
    // Filter by decades if requested
    if (decades.length > 0) {
      console.log(`Filtering tracks by decades: ${decades.join(', ')}`);
      
      // Check if we have any tracks with non-NULL release dates
      const hasNonNullDates = await db.select({ count: sql`count(*)` })
        .from(schema.tracks)
        .where(sql`${schema.tracks.releaseDate} IS NOT NULL`)
        .then(result => parseInt(result[0].count.toString()) > 0);
      
      if (hasNonNullDates) {
        // Create conditions for each decade
        const decadeConditions = decades.map(decade => {
          const startYear = decade;
          const endYear = decade + 9;
          return sql`${schema.tracks.releaseDate} IS NOT NULL AND EXTRACT(YEAR FROM ${schema.tracks.releaseDate}) BETWEEN ${startYear} AND ${endYear}`;
        });
        
        // Add decade conditions
        baseQuery = baseQuery.where(or(...decadeConditions));
      } else {
        console.warn(`Skipping decade filtering (${decades.join(', ')}) because all tracks have NULL release dates`);
        // Continue without adding decade filter conditions
      }
    }
    
    // Filter by platform if specified
    if (platform) {
      // We need to do a separate query because joins are causing issues
      const tracksWithPlatform = await db.select({ trackId: schema.trackPlatformIds.trackId })
        .from(schema.trackPlatformIds)
        .where(eq(schema.trackPlatformIds.platform, platform));
        
      const platformTrackIds = tracksWithPlatform.map(t => t.trackId);
      
      if (platformTrackIds.length > 0) {
        baseQuery = baseQuery.where(
          inArray(schema.tracks.id, platformTrackIds)
        );
      } else {
        // No tracks found with this platform, return empty result
        return [];
      }
    }
    
    // If we have genre results, prioritize those tracks
    if (genreMatchingTrackIds.length > 0) {
      // We'll do two separate queries: one for genre matches and one for text matches
      // Then we'll combine them with genre matches first
      // This ensures genre-matched tracks are prioritized

      // First query: Get tracks that match by genre
      const genreQuery = db.select({
        track: schema.tracks
      })
      .from(schema.tracks)
      .where(inArray(schema.tracks.id, genreMatchingTrackIds))
      .limit(limit)
      .orderBy(desc(schema.tracks.popularity));
      
      // Apply the same filters as the base query
      if (avoidExplicit) {
        genreQuery.where(eq(schema.tracks.explicit, false));
      }
      
      // If platform filter was applied, add it to genre query too
      if (platform) {
        genreQuery.where(
          inArray(schema.tracks.id, platformTrackIds)
        );
      }
      
      // Add decade filtering to genre query as well
      if (decades.length > 0) {
        // Check if we have any tracks with non-NULL release dates
        const hasNonNullDates = await db.select({ count: sql`count(*)` })
          .from(schema.tracks)
          .where(sql`${schema.tracks.releaseDate} IS NOT NULL`)
          .then(result => parseInt(result[0].count.toString()) > 0);
        
        if (hasNonNullDates) {
          const decadeConditions = decades.map(decade => {
            const startYear = decade;
            const endYear = decade + 9;
            return sql`${schema.tracks.releaseDate} IS NOT NULL AND EXTRACT(YEAR FROM ${schema.tracks.releaseDate}) BETWEEN ${startYear} AND ${endYear}`;
          });
          
          genreQuery.where(or(...decadeConditions));
        } else {
          console.warn(`Skipping decade filtering for genre query because all tracks have NULL release dates`);
        }
      }
        
      const genreResults = await genreQuery;
      
      // Convert results to SpotifyTrack format
      const genreTracks: schema.SpotifyTrack[] = [];
      for (const result of genreResults) {
        const track = await dbTrackToSpotifyTrack(result.track);
        genreTracks.push(track);
      }
      
      console.log(`Found ${genreTracks.length} tracks by genre match`);
      
      // If we already have enough tracks by genre, just return those
      if (genreTracks.length >= limit) {
        return genreTracks.slice(0, limit);
      }
      
      // Otherwise, get additional tracks by text search
      const remainingLimit = limit - genreTracks.length;
      
      // Exclude tracks we already found
      const existingTrackIds = new Set(genreResults.map(result => result.track.id));
      
      // Add text search condition for track title
      const searchTerms = query.split(' ').filter(term => term.length > 0);
      
      if (searchTerms.length > 0) {
        // Use a simple LIKE query for each search term
        const likeConditions = searchTerms.map(term => 
          like(schema.tracks.title, `%${term}%`)
        );
        
        // Search by title - combine conditions with OR
        const textQuery = db.select({
          track: schema.tracks
        })
        .from(schema.tracks)
        .where(or(...likeConditions))
        .where(sql`${schema.tracks.id} NOT IN (${sql.join(Array.from(existingTrackIds), sql`, `)})`)
        .limit(remainingLimit)
        .orderBy(desc(schema.tracks.popularity));
        
        // Apply the same filters as the base query
        if (avoidExplicit) {
          textQuery.where(eq(schema.tracks.explicit, false));
        }
        
        // If platform filter was applied, add it to text query too
        if (platform) {
          textQuery.where(
            inArray(schema.tracks.id, platformTrackIds)
          );
        }
        
        // Apply decade filtering to text query if needed
        if (decades.length > 0) {
          // Check if we have any tracks with non-NULL release dates
          const hasNonNullDates = await db.select({ count: sql`count(*)` })
            .from(schema.tracks)
            .where(sql`${schema.tracks.releaseDate} IS NOT NULL`)
            .then(result => parseInt(result[0].count.toString()) > 0);
          
          if (hasNonNullDates) {
            const decadeConditions = decades.map(decade => {
              const startYear = decade;
              const endYear = decade + 9;
              return sql`${schema.tracks.releaseDate} IS NOT NULL AND EXTRACT(YEAR FROM ${schema.tracks.releaseDate}) BETWEEN ${startYear} AND ${endYear}`;
            });
            
            textQuery.where(or(...decadeConditions));
          } else {
            console.warn(`Skipping decade filtering for text query because all tracks have NULL release dates`);
          }
        }
        
        const textResults = await textQuery;
        
        // Convert text results to SpotifyTrack format
        for (const result of textResults) {
          const track = await dbTrackToSpotifyTrack(result.track);
          genreTracks.push(track);
        }
        
        console.log(`Added ${textResults.length} additional tracks by text match`);
      }
      
      return genreTracks;
    } else {
      // No genre matches, fall back to text search only
      
      // Add text search condition for track title
      const searchTerms = query.split(' ').filter(term => term.length > 0);
      
      // This is a simplified search - in a real app, you'd want to use
      // full-text search capabilities of your database
      if (searchTerms.length > 0) {
        // Use a simple LIKE query for each search term
        const likeConditions = searchTerms.map(term => 
          like(schema.tracks.title, `%${term}%`)
        );
        
        // Search by title - combine conditions with OR
        baseQuery = baseQuery.where(
          likeConditions.length > 0 ? or(...likeConditions) : undefined
        );
      }
      
      // Apply pagination
      baseQuery = baseQuery
        .limit(limit)
        .offset(offset)
        .orderBy(desc(schema.tracks.popularity));
      
      // Execute query  
      const results = await baseQuery;
      
      // Convert results to SpotifyTrack format
      const tracks: schema.SpotifyTrack[] = [];
      for (const result of results) {
        const track = await dbTrackToSpotifyTrack(result.track);
        tracks.push(track);
      }
      
      return tracks;
    }
  } catch (error) {
    console.error('Error searching tracks:', error);
    return [];
  }
}

/**
 * Search for tracks by song title and artist name
 * This function is used to find matches for AI-recommended songs
 */
/**
 * Find tracks in the database by title using EXACT matching only
 * 
 * This function uses the same direct database approach as the /direct-track-finder endpoint
 * to ensure consistent results throughout the application.
 */
export async function findTracksByTitleArtist(
  songSuggestions: Array<{
    title: string;
    artist: string;
    genre?: string;
  }>,
  limit = 24,
  avoidExplicit = false
): Promise<{
  // Return both Spotify format and database format tracks
  // This allows the caller to use whichever format they need
  tracks: schema.SpotifyTrack[];
  dbTracks: Array<{
    id: number;
    title: string;
    dbId: number;  // Adding explicit database ID
    spotifyId?: string;  // Optional Spotify ID
  }>;
}> {
  try {
    console.log(`===================================`);
    console.log(`DIRECT FINDER: EXACT TITLE MATCHING ONLY`);
    console.log(`===================================`);
    console.log(`Using the same SQL approach as /direct-track-finder endpoint`);
    
    // Log all song suggestions for debugging
    console.log(`AI RECOMMENDED SONGS TO SEARCH FOR:`);
    songSuggestions.slice(0, 30).forEach((song, index) => {
      console.log(`${index + 1}. "${song.title}" by ${song.artist}${song.genre ? ` (${song.genre})` : ''}`);
    });
    
    // Store tracks in both formats
    const matchedTracks: schema.SpotifyTrack[] = [];
    const dbTracksResult: Array<{
      id: number;
      title: string;
      dbId: number;
      spotifyId?: string;
    }> = [];
    
    const processedIds = new Set<number>();
    
    // Use the existing pool connection instead of creating a new one
    // This avoids CommonJS/ESM compatibility issues
    
    let client;
    try {
      // Get a client from the existing pool declared at the top of this file
      client = await pool.connect();
      console.log("DIRECT FINDER: Database connection established");
      
      // Process each song suggestion with a direct SQL query - EXACT MATCH ONLY
      for (const suggestion of songSuggestions) {
        if (matchedTracks.length >= limit) {
          console.log(`DIRECT FINDER: Reached limit of ${limit} tracks, stopping search`);
          break;
        }
        
        const { title, artist } = suggestion;
        console.log(`DIRECT FINDER: Looking for exact title match: "${title}"`);
        
        try {
          // EXACT MATCH QUERY - identical to the one in direct-track-finder.ts
          const result = await client.query(
            'SELECT * FROM "tracks" WHERE title = $1 LIMIT 1',
            [title]
          );
          
          let foundTrack = null;
          
          if (result.rows.length > 0) {
            foundTrack = result.rows[0];
            console.log(`✓ DIRECT FINDER: Found exact match for "${title}", ID: ${foundTrack.id}`);
            
            // Get the Spotify ID for this track
            const spotifyIdResult = await client.query(
              'SELECT platform_id FROM "track_platform_ids" WHERE track_id = $1 AND platform = $2 LIMIT 1',
              [foundTrack.id, 'spotify']
            );
            
            const spotifyId = spotifyIdResult.rows.length > 0 ? spotifyIdResult.rows[0].platform_id : undefined;
            
            // Add database track format with explicit database ID
            dbTracksResult.push({
              id: foundTrack.id,
              title: foundTrack.title,
              dbId: foundTrack.id,  // Explicit database ID field
              spotifyId
            });
            
            // Convert to Spotify track format for backward compatibility
            const spotifyTrack = await dbTrackToSpotifyTrack(foundTrack);
            
            // Add to matched tracks
            matchedTracks.push(spotifyTrack);
            processedIds.add(foundTrack.id);
          } else {
            // If no exact match, skip this track entirely
            console.log(`⚠️ DIRECT FINDER: No exact match found for "${title}"`);
          }
        } catch (searchError) {
          console.error(`DIRECT FINDER: Error searching for track:`, searchError);
        }
      }
    } finally {
      // Release the database client
      if (client) {
        console.log("DIRECT FINDER: Releasing database client");
        client.release();
      }
    }
    
    console.log(`DIRECT FINDER: Found ${matchedTracks.length}/${songSuggestions.length} tracks (EXACT matches only)`);
    
    // Return up to the requested limit in both formats
    return {
      tracks: matchedTracks.slice(0, limit),
      dbTracks: dbTracksResult.slice(0, limit)
    };
  } catch (error) {
    console.error("DIRECT FINDER: Error in findTracksByTitleArtist:", error);
    return { tracks: [], dbTracks: [] };
  }
}

/**
 * Import a track from Spotify
 */
export async function importTrackFromSpotify(
  spotifyTrack: schema.SpotifyTrack
): Promise<schema.Track> {
  try {
    return await db.transaction(async (tx) => {
      // Check if track already exists by Spotify ID
      const existingTrackId = await tx.select({
        trackId: schema.trackPlatformIds.trackId
      })
      .from(schema.trackPlatformIds)
      .where(
        and(
          eq(schema.trackPlatformIds.platform, 'spotify'),
          eq(schema.trackPlatformIds.platformId, spotifyTrack.id)
        )
      )
      .limit(1);
      
      if (existingTrackId.length > 0) {
        // Track already exists, get it
        const [existingTrack] = await tx.select()
          .from(schema.tracks)
          .where(eq(schema.tracks.id, existingTrackId[0].trackId))
          .limit(1);
        
        return existingTrack;
      }
      
      // Process album
      let albumId: number | null = null;
      if (spotifyTrack.album) {
        const albumTitle = spotifyTrack.album.name;
        const albumCover = spotifyTrack.album.images[0]?.url || null;
        
        // Check if album exists
        const existingAlbum = await tx.select()
          .from(schema.albums)
          .where(eq(schema.albums.title, albumTitle))
          .limit(1);
        
        if (existingAlbum.length > 0) {
          albumId = existingAlbum[0].id;
        } else {
          // Create new album
          const [newAlbum] = await tx.insert(schema.albums)
            .values({
              title: albumTitle,
              coverImage: albumCover
            })
            .returning();
          
          albumId = newAlbum.id;
        }
      }
      
      // Skip tracks with zero or undefined duration
      if (!spotifyTrack.duration_ms || spotifyTrack.duration_ms === 0) {
        console.warn(`Skipped importing track with zero duration: ${spotifyTrack.name} (${spotifyTrack.id})`);
        return null;
      }
      
      // Create track
      const [track] = await tx.insert(schema.tracks)
        .values({
          title: spotifyTrack.name,
          albumId: albumId,
          duration: Math.floor(spotifyTrack.duration_ms / 1000), // Convert milliseconds to seconds
          explicit: spotifyTrack.explicit || false,
          popularity: spotifyTrack.popularity || 50,
          previewUrl: spotifyTrack.preview_url || null
        })
        .returning();
      
      // Process artists
      for (const spotifyArtist of spotifyTrack.artists) {
        // Check if artist exists
        const existingArtist = await tx.select()
          .from(schema.artists)
          .where(eq(schema.artists.name, spotifyArtist.name))
          .limit(1);
        
        let artistId: number;
        if (existingArtist.length > 0) {
          artistId = existingArtist[0].id;
        } else {
          // Create artist with image if available
          const artistPicture = spotifyArtist.images && spotifyArtist.images.length > 0 
            ? spotifyArtist.images[0].url 
            : null;
            
          const [newArtist] = await tx.insert(schema.artists)
            .values({
              name: spotifyArtist.name,
              picture: artistPicture
            })
            .returning();
          
          artistId = newArtist.id;
          
          // Add Spotify ID for artist if available
          if (spotifyArtist.id) {
            await tx.insert(schema.artistPlatformIds)
              .values({
                artistId: artistId,
                platform: 'spotify',
                platformId: spotifyArtist.id
              });
          }
        }
        
        // Link artist to track
        await tx.insert(schema.tracksToArtists)
          .values({
            trackId: track.id,
            artistId: artistId
          });
        
        // Link artist to album if we have one
        if (albumId) {
          // Check if already linked
          const existingLink = await tx.select()
            .from(schema.albumsToArtists)
            .where(
              and(
                eq(schema.albumsToArtists.albumId, albumId),
                eq(schema.albumsToArtists.artistId, artistId)
              )
            )
            .limit(1);
          
          if (existingLink.length === 0) {
            await tx.insert(schema.albumsToArtists)
              .values({
                albumId: albumId,
                artistId: artistId
              });
          }
        }
      }
      
      // Add Spotify ID
      await tx.insert(schema.trackPlatformIds)
        .values({
          trackId: track.id,
          platform: 'spotify',
          platformId: spotifyTrack.id
        });
      
      // Queue for cross-platform resolution
      const { queueTrackForPlatformResolution } = await import('./services/odesli');
      queueTrackForPlatformResolution(track.id, spotifyTrack.id);
      
      return track;
    });
  } catch (error) {
    console.error('Error importing track from Spotify:', error);
    throw new Error('Failed to import track');
  }
}

/**
 * Import a full playlist from Spotify
 */
export async function importPlaylistFromSpotify(
  spotifyPlaylistId: string,
  spotifyAccessToken: string
): Promise<number[]> {
  try {
    // Import spotify API
    const spotify = await import('./spotify');
    
    // Get playlist details
    const playlistDetails = await spotify.getPlaylistDetails(
      spotifyAccessToken, 
      spotifyPlaylistId
    );
    
    // Import each track
    const trackIds: number[] = [];
    
    for (const item of playlistDetails.tracks.items) {
      try {
        const track = await importTrackFromSpotify(item.track);
        // Check if track was skipped due to having 0 duration
        if (track) {
          trackIds.push(track.id);
        }
      } catch (error) {
        console.error(`Error importing track ${item.track.id}:`, error);
        // Continue with other tracks
      }
    }
    
    return trackIds;
  } catch (error) {
    console.error('Error importing playlist from Spotify:', error);
    throw new Error('Failed to import playlist');
  }
}

/**
 * Utility function to find a track by Spotify ID
 * This is a centralized function to ensure consistent track lookups across the application
 * 
 * @param spotifyId The Spotify ID to look up
 * @returns The internal track ID if found, null otherwise
 */
export async function findTrackIdBySpotifyId(spotifyId: string): Promise<number | null> {
  try {
    if (!spotifyId) {
      console.warn("No Spotify ID provided for lookup");
      return null;
    }
    
    console.log(`Looking up track with Spotify ID: ${spotifyId}`);
    
    // Use a direct query for better performance with proper error handling
    const platformMatches = await db
      .select({
        trackId: schema.trackPlatformIds.trackId
      })
      .from(schema.trackPlatformIds)
      .where(
        and(
          eq(schema.trackPlatformIds.platform, 'spotify'),
          eq(schema.trackPlatformIds.platformId, spotifyId)
        )
      )
      .limit(1);
    
    if (platformMatches.length > 0) {
      const trackId = platformMatches[0].trackId;
      console.log(`✓ Found track by Spotify ID lookup: track_id=${trackId}`);
      return trackId;
    }
    
    console.log(`⚠ No track found with Spotify ID: ${spotifyId}`);
    return null;
  } catch (error) {
    console.error(`Error looking up track by Spotify ID ${spotifyId}:`, error);
    return null;
  }
}

/**
 * Utility function to establish relationship between a song and track
 * This ensures consistent track-song relationship creation across the application
 * 
 * @param songId The ID of the song in our database
 * @param spotifyId The Spotify ID of the track
 * @returns true if relationship was created successfully, false otherwise
 */
export async function createTrackSongRelationship(songId: number, spotifyId: string): Promise<boolean> {
  try {
    if (!songId || !spotifyId) {
      console.warn(`Missing required parameters: songId=${songId}, spotifyId=${spotifyId}`);
      return false;
    }
    
    // First find the track ID using our centralized function
    const trackId = await findTrackIdBySpotifyId(spotifyId);
    
    if (!trackId) {
      console.warn(`Could not find track with Spotify ID: ${spotifyId}`);
      return false;
    }
    
    // Create the relationship
    try {
      await db.insert(schema.tracksSongs)
        .values({
          songId: songId,
          trackId: trackId
        })
        .onConflictDoNothing();
      
      console.log(`✓ Created track-song relationship: song ${songId} → track ${trackId}`);
      
      // Verify the relationship was created
      const verifyResult = await db
        .select()
        .from(schema.tracksSongs)
        .where(
          and(
            eq(schema.tracksSongs.songId, songId),
            eq(schema.tracksSongs.trackId, trackId)
          )
        )
        .limit(1);
      
      if (verifyResult.length > 0) {
        console.log(`✓ Verified relationship exists in database`);
        return true;
      } else {
        console.log(`⚠ Warning: Relationship creation may have failed, not found in database`);
        return false;
      }
    } catch (error) {
      console.error(`Error creating track-song relationship for song ${songId}, track ID ${trackId}:`, error);
      return false;
    }
  } catch (error) {
    console.error(`Error in createTrackSongRelationship for song ${songId}, Spotify ID ${spotifyId}:`, error);
    return false;
  }
}