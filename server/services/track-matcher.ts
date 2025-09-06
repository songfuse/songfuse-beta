/**
 * Track Matcher Service
 * 
 * This service provides a reliable, precise track matching capability between
 * AI-recommended song titles/artists and tracks in our database.
 */
import { db } from '../db';
import * as schema from '@shared/schema';
import { eq, and, like, or, desc, inArray, sql } from 'drizzle-orm';

/**
 * Find a database track by exact title match
 * 
 * @param title The exact title to search for
 * @returns The matching track or null if not found
 */
export async function findTrackByExactTitle(title: string): Promise<schema.Track | null> {
  try {
    // First try a direct case-insensitive match
    const [track] = await db
      .select()
      .from(schema.tracks)
      .where(sql`LOWER(${schema.tracks.title}) = LOWER(${title})`)
      .limit(1);
    
    if (track) {
      console.log(`[EXACT MATCHER] Found match with case-insensitive search: DB:"${track.title}" - Requested:"${title}"`);
      return track;
    }
    
    // If no match found, try a simpler approach with basic character removal
    // This removes common punctuation differences that can cause matching issues
    const normalizedTitle = title.replace(/[\s.',":_\-!?]/g, '').toLowerCase();
    
    // Use a simpler approach with multiple replacements
    const [trackNormalized] = await db
      .select()
      .from(schema.tracks)
      .where(
        sql`LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${schema.tracks.title}, ' ', ''), '.', ''), ',', ''), '''', ''), '-', '')) = ${normalizedTitle}`
      )
      .limit(1);
    
    if (trackNormalized) {
      console.log(`[EXACT MATCHER] Found match with normalized search: DB:"${trackNormalized.title}" - Requested:"${title}"`);
      return trackNormalized;
    }
    
    return null;
  } catch (error) {
    console.error(`Error finding track with exact title "${title}":`, error);
    return null;
  }
}

/**
 * Find a database track by exact title and artist
 * 
 * @param title The exact title to search for
 * @param artistName The exact artist name to search for
 * @returns The matching track or null if not found
 */
export async function findTrackByExactTitleAndArtist(
  title: string, 
  artistName: string
): Promise<schema.Track | null> {
  try {
    // First try to find artist with case-insensitive matching
    const [artist] = await db
      .select()
      .from(schema.artists)
      .where(sql`LOWER(${schema.artists.name}) = LOWER(${artistName})`)
      .limit(1);
    
    if (!artist) {
      // Try with normalized artist name using a more comprehensive approach
      // Remove all non-alphanumeric characters and lowercase
      const normalizedArtistName = artistName
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/[\s.',":_\-!?]/g, '') // Remove common punctuation
        .toLowerCase();
      
      // Log the normalized artist name for debugging
      console.log(`Normalized artist name: "${artistName}" -> "${normalizedArtistName}"`);
      
      // Query using a more flexible matching approach
      // First, log the normalized artist name for debugging
      console.log(`Trying to find artist with normalized name: "${normalizedArtistName}"`);
      
      // Test the SQL command directly to see if it works
      const testQuery = `SELECT name, 
         LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
           TRANSLATE(name, 'áéíóúÁÉÍÓÚüÜñÑ', 'aeiouAEIOUuUnN'), 
           ' ', ''), '.', ''), ',', ''), '''', ''), '-', '')) as normalized_name
         FROM artists 
         WHERE name LIKE '%${artistName.replace(/'/g, "''")}%' LIMIT 5`;
         
      console.log(`Test query: ${testQuery}`);
      const testResults = await db.execute(testQuery);
      console.log(`Similar artists found: ${testResults.rows?.length || 0}`);
      
      if (testResults.rows?.length) {
        testResults.rows.forEach((r: any) => {
          console.log(`Artist: "${r.name}" -> normalized: "${r.normalized_name}"`);
        });
      }
      
      // Now run the search query with the normalized artist name directly in the query
      // This avoids parameter binding issues
      const artistQueryString = `
        SELECT * FROM artists 
        WHERE LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
          TRANSLATE(name, 'áéíóúÁÉÍÓÚüÜñÑ', 'aeiouAEIOUuUnN'), 
          ' ', ''), '.', ''), ',', ''), '''', ''), '-', '')) = '${normalizedArtistName}' 
        LIMIT 1`;
        
      console.log(`Artist query: ${artistQueryString}`);
      const artistQuery = await db.execute(artistQueryString);
      
      const artistNormalized = artistQuery.rows?.[0];
        
      if (!artistNormalized) {
        console.log(`No artist found with normalized name: "${artistName}"`);
        return null;
      }
      
      console.log(`[EXACT MATCHER] Found artist with normalized search: DB:"${artistNormalized.name}" - Requested:"${artistName}"`);
      
      // Use the normalized artist match
      const [trackWithArtist] = await db
        .select({
          track: schema.tracks
        })
        .from(schema.tracks)
        .innerJoin(
          schema.tracksToArtists,
          eq(schema.tracks.id, schema.tracksToArtists.trackId)
        )
        .where(
          and(
            sql`LOWER(${schema.tracks.title}) = LOWER(${title})`,
            eq(schema.tracksToArtists.artistId, artistNormalized.id)
          )
        )
        .limit(1);
        
      if (trackWithArtist) {
        console.log(`[EXACT MATCHER] Found match with normalized artist search: DB:"${trackWithArtist.track.title}" by "${artistNormalized.name}" - Requested:"${title}" by "${artistName}"`);
        return trackWithArtist.track;
      }
      
      // Try with normalized title too using our comprehensive approach
      const normalizedTitle = title
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/[\s.',":_\-!?]/g, '') // Remove common punctuation
        .toLowerCase();
        
      console.log(`Normalized title: "${title}" -> "${normalizedTitle}"`);
      
      // Use direct SQL with TRANSLATE for better accent handling
      // First try the diagnostic query
      const testTitleQuery = `SELECT t.id, t.title, 
           LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
             TRANSLATE(t.title, 'áéíóúÁÉÍÓÚüÜñÑ', 'aeiouAEIOUuUnN'), 
             ' ', ''), '.', ''), ',', ''), '''', ''), '-', '')) as normalized_title
         FROM tracks t
         JOIN tracks_to_artists tta ON t.id = tta.track_id
         WHERE tta.artist_id = ${artistNormalized.id}
         LIMIT 5`;
         
      console.log(`Testing title normalization for artist "${artistNormalized.name}"...`);
      const testTitleResults = await db.execute(testTitleQuery);
      
      if (testTitleResults.rows?.length) {
        console.log(`Found ${testTitleResults.rows.length} tracks by this artist:`);
        testTitleResults.rows.forEach((r: any) => {
          console.log(`Track ${r.id}: "${r.title}" -> normalized: "${r.normalized_title}"`);
          if (r.normalized_title === normalizedTitle) {
            console.log(`MATCH FOUND! Normalized "${r.title}" = "${normalizedTitle}"`);
          }
        });
      }
      
      // Now run the actual track query with inline values
      const trackQueryString = `
        SELECT t.* FROM tracks t
        JOIN tracks_to_artists tta ON t.id = tta.track_id
        WHERE 
          LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
            TRANSLATE(t.title, 'áéíóúÁÉÍÓÚüÜñÑ', 'aeiouAEIOUuUnN'), 
            ' ', ''), '.', ''), ',', ''), '''', ''), '-', '')) = '${normalizedTitle}'
          AND tta.artist_id = ${artistNormalized.id}
        LIMIT 1`;
        
      console.log(`Track query: ${trackQueryString}`);
      const trackQuery = await db.execute(trackQueryString);
      
      // Convert the row to a Track object
      const trackWithNormalizedTitle = trackQuery.rows?.[0] as schema.Track | undefined;
        
      if (trackWithNormalizedTitle) {
        console.log(`[EXACT MATCHER] Found match with fully normalized search: DB:"${trackWithNormalizedTitle.title}" by "${artistNormalized.name}" - Requested:"${title}" by "${artistName}"`);
        return trackWithNormalizedTitle;
      }
      
      return null;
    }
    
    // Now get track with this title that has this artist - using case-insensitive matching
    const [trackWithArtist] = await db
      .select({
        track: schema.tracks
      })
      .from(schema.tracks)
      .innerJoin(
        schema.tracksToArtists,
        eq(schema.tracks.id, schema.tracksToArtists.trackId)
      )
      .where(
        and(
          sql`LOWER(${schema.tracks.title}) = LOWER(${title})`,
          eq(schema.tracksToArtists.artistId, artist.id)
        )
      )
      .limit(1);
      
    if (trackWithArtist) {
      console.log(`[EXACT MATCHER] Found match with case-insensitive title+artist search: DB:"${trackWithArtist.track.title}" by "${artist.name}" - Requested:"${title}" by "${artistName}"`);
      return trackWithArtist.track;
    }
    
    // Try with normalized title as a fallback using the same comprehensive approach
    const normalizedTitle = title
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[\s.',":_\-!?]/g, '') // Remove common punctuation
      .toLowerCase();
        
    console.log(`Normalized title: "${title}" -> "${normalizedTitle}"`);
      
    // Use direct SQL with TRANSLATE for better accent handling
    // First try the diagnostic query
    const testTitleQuery = `SELECT t.id, t.title, 
         LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
           TRANSLATE(t.title, 'áéíóúÁÉÍÓÚüÜñÑ', 'aeiouAEIOUuUnN'), 
           ' ', ''), '.', ''), ',', ''), '''', ''), '-', '')) as normalized_title
       FROM tracks t
       JOIN tracks_to_artists tta ON t.id = tta.track_id
       WHERE tta.artist_id = ${artist.id}
       LIMIT 5`;
       
    console.log(`Testing title normalization for artist "${artist.name}"...`);
    const testTitleResults = await db.execute(testTitleQuery);
    
    if (testTitleResults.rows?.length) {
      console.log(`Found ${testTitleResults.rows.length} tracks by this artist:`);
      testTitleResults.rows.forEach((r: any) => {
        console.log(`Track ${r.id}: "${r.title}" -> normalized: "${r.normalized_title}"`);
        if (r.normalized_title === normalizedTitle) {
          console.log(`MATCH FOUND! Normalized "${r.title}" = "${normalizedTitle}"`);
        }
      });
    }
    
    // Now run the actual track query with inline values
    const trackQueryString = `
      SELECT t.* FROM tracks t
      JOIN tracks_to_artists tta ON t.id = tta.track_id
      WHERE 
        LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
          TRANSLATE(t.title, 'áéíóúÁÉÍÓÚüÜñÑ', 'aeiouAEIOUuUnN'), 
          ' ', ''), '.', ''), ',', ''), '''', ''), '-', '')) = '${normalizedTitle}'
        AND tta.artist_id = ${artist.id}
      LIMIT 1`;
      
    console.log(`Track query: ${trackQueryString}`);
    const trackQuery = await db.execute(trackQueryString);
    
    // Convert the row to a Track object
    const trackWithNormalizedTitle = trackQuery.rows?.[0] as schema.Track | undefined;
      
    if (trackWithNormalizedTitle) {
      console.log(`[EXACT MATCHER] Found match with normalized title search: DB:"${trackWithNormalizedTitle.title}" by "${artist.name}" - Requested:"${title}" by "${artistName}"`);
      return trackWithNormalizedTitle;
    }
    
    return null;
  } catch (error) {
    console.error(`Error finding track with title "${title}" and artist "${artistName}":`, error);
    return null;
  }
}

/**
 * Legacy function for MCP compatibility
 * This acts as a bridge between the old function signature used in MCP and our improved exact matcher
 * 
 * @param title The title to search for
 * @param artist The artist to search for
 * @param limit The maximum number of results to return
 * @param avoidExplicit Whether to exclude explicit tracks
 * @returns An array of tracks in Spotify format
 */
export async function findTracksByTitleArtist(
  title: string,
  artist: string,
  limit: number = 1,
  avoidExplicit: boolean = false
): Promise<schema.SpotifyTrack[]> {
  console.log(`Legacy finder called: findTracksByTitleArtist("${title}", "${artist}", ${limit}, ${avoidExplicit})`);
  
  try {
    // Use our improved db.ts version with a single song suggestion
    const { findTracksByTitleArtist: findTracksInDb } = await import('../db');
    
    // Call the improved version with a single song suggestion
    const result = await findTracksInDb(
      [{ title, artist }],
      limit,
      avoidExplicit
    );
    
    // Return just the Spotify format tracks
    return result.tracks;
  } catch (error) {
    console.error(`Error in legacy findTracksByTitleArtist:`, error);
    return [];
  }
}

/**
 * Convert a database track to a Spotify-like format with complete details
 */
export async function trackToSpotifyFormat(track: schema.Track): Promise<schema.SpotifyTrack> {
  // Get artists
  const artistsResult = await db
    .select({
      artist: schema.artists
    })
    .from(schema.tracksToArtists)
    .innerJoin(
      schema.artists,
      eq(schema.tracksToArtists.artistId, schema.artists.id)
    )
    .where(eq(schema.tracksToArtists.trackId, track.id));
  
  const artists = artistsResult.map(item => ({
    id: item.artist.id.toString(),
    name: item.artist.name,
    ...(item.artist.picture ? { images: [{ url: item.artist.picture }] } : {})
  }));
  
  // Get album
  let album = { name: '', images: [] };
  if (track.albumId) {
    const albumResult = await db
      .select()
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
  const spotifyIdResult = await db
    .select()
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
  const platformUrls = await db
    .select()
    .from(schema.trackPlatformIds)
    .where(eq(schema.trackPlatformIds.trackId, track.id));
  
  // Create platforms object
  const platforms: Record<string, { id: string, url: string }> = {};
  for (const platform of platformUrls) {
    platforms[platform.platform] = {
      id: platform.platformId,
      url: platform.platformUrl || ''
    };
  }
  
  // Format as SpotifyTrack
  return {
    id: spotifyId,
    name: track.title,
    artists,
    album,
    duration_ms: track.duration || 0,
    preview_url: track.previewUrl,
    explicit: track.explicit || false,
    popularity: track.popularity || 0,
    platforms,
    // Add database ID as dbId for direct reference when saving to playlist
    dbId: track.id,
    // Add a redundant databaseId property for backward compatibility only
    // This will be gradually phased out as we standardize on dbId
    databaseId: track.id
  };
}

/**
 * Find tracks from a list of AI-recommended songs, using exact matching
 */
export async function findRecommendedTracks(
  recommendations: Array<{ title: string, artist: string }>,
  limit = 24
): Promise<{
  tracks: schema.SpotifyTrack[];
  matchedCount: number;
  totalRequested: number;
}> {
  try {
    console.log('Finding tracks for AI recommendations using exact matching');
    console.log(`Looking for ${recommendations.length} tracks, limit: ${limit}`);
    
    // Log all recommendations for debugging
    recommendations.forEach((rec, i) => {
      console.log(`${i+1}. "${rec.title}" by ${rec.artist}`);
    });
    
    const matchedTracks: schema.SpotifyTrack[] = [];
    const processedTitles = new Set<string>();
    
    for (const { title, artist } of recommendations) {
      if (matchedTracks.length >= limit) {
        console.log(`Reached limit of ${limit} tracks, stopping search`);
        break;
      }
      
      const titleKey = title.toLowerCase();
      if (processedTitles.has(titleKey)) {
        console.log(`Skipping duplicate song: "${title}" by ${artist}`);
        continue;
      }
      
      console.log(`Looking for: "${title}" (using exact title matching only)`);
      
      // Use only exact title matching for simplicity and better match rate
      let track = await findTrackByExactTitle(title);
      
      if (track) {
        console.log(`✓ Found track in database: "${track.title}" (ID: ${track.id})`);
        const spotifyTrack = await trackToSpotifyFormat(track);
        matchedTracks.push(spotifyTrack);
        processedTitles.add(titleKey);
      } else {
        console.log(`✗ No exact title match found for: "${title}" - skipping this track`);
      }
    }
    
    console.log(`Found ${matchedTracks.length} tracks out of ${recommendations.length} recommended`);
    
    return {
      tracks: matchedTracks,
      matchedCount: matchedTracks.length,
      totalRequested: recommendations.length
    };
  } catch (error) {
    console.error('Error finding recommended tracks:', error);
    return {
      tracks: [],
      matchedCount: 0,
      totalRequested: recommendations.length
    };
  }
}