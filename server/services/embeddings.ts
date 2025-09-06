import { sql } from "drizzle-orm";
import { OpenAI } from "openai";
import { db } from "../db";
import { tracks, artists, genres as genresTable, tracksToArtists, tracksToGenres } from "@shared/schema";

// Initialize OpenAI client with production/development key selection
function initOpenAI() {
  try {
    const isProduction = process.env.NODE_ENV === 'production';
    
    // Select the appropriate API key based on environment
    let apiKey;
    
    if (isProduction && process.env.OPENAI_API_KEY_PROD) {
      // Use the production-specific key in production environment
      apiKey = process.env.OPENAI_API_KEY_PROD.trim();
      console.log("[embeddings] 🔐 Using PRODUCTION OpenAI API key");
    } else if (!process.env.OPENAI_API_KEY) {
      // Error if no key is available
      console.error("[embeddings] ⚠️ WARNING: OpenAI API key environment variable is not set");
      throw new Error("Missing OpenAI API key");
    } else {
      // Use the default key (typically for development)
      apiKey = process.env.OPENAI_API_KEY.trim();
      console.log("[embeddings] 🔑 Using default OpenAI API key");
    }
    
    return new OpenAI({ 
      apiKey,
      dangerouslyAllowBrowser: true, // This helps with compatibility in both environments
    });
  } catch (error) {
    console.error("[embeddings] ❌ Failed to initialize OpenAI client:", error);
    return new OpenAI({ apiKey: "invalid-key-placeholder" });
  }
}

const openai = initOpenAI();

/**
 * Generate an embedding vector for a track using OpenAI
 * @param trackTitle The track title
 * @param artistNames The artist names
 * @param genres The genre names
 * @returns An array of floating point numbers representing the embedding
 */
export async function generateEmbedding(
  trackTitle: string,
  artistNames: string[],
  genres: string[] = []
): Promise<number[]> {
  // Construct a text representation of the track
  let content = `Track: ${trackTitle}\nArtist: ${artistNames.join(", ")}\n`;
  
  if (genres.length > 0) {
    content += `Genres: ${genres.join(", ")}\n`;
  }
  
  try {
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: content,
      encoding_format: "float",
    });
    
    return embeddingResponse.data[0].embedding;
  } catch (error) {
    console.error(`Error generating embedding for track ${trackTitle}:`, error);
    throw error;
  }
}

/**
 * Fetch a track from the database by ID
 * @param trackId The track ID
 * @returns The track data or null
 */
async function getTrackById(trackId: number) {
  try {
    const trackResult = await db.select()
      .from(tracks)
      .where(sql`id = ${trackId}`)
      .limit(1);
    
    return trackResult.length > 0 ? trackResult[0] : null;
  } catch (error) {
    console.error(`Error fetching track ${trackId}:`, error);
    return null;
  }
}

/**
 * Store an embedding for a track in the database
 * @param trackId The track ID
 * @param embedding The embedding vector
 * @returns True if successful, false otherwise
 */
async function storeEmbedding(trackId: number, embedding: number[]): Promise<boolean> {
  try {
    await db.update(tracks)
      .set({ embedding })
      .where(sql`id = ${trackId}`);
    
    return true;
  } catch (error) {
    console.error(`Error storing embedding for track ${trackId}:`, error);
    return false;
  }
}

/**
 * Process embeddings for a batch of track IDs
 * @param trackIds Array of track IDs to process
 * @returns The number of successfully processed tracks
 */
export async function processTrackEmbeddings(trackIds: number[]): Promise<number> {
  let successCount = 0;
  
  for (const trackId of trackIds) {
    try {
      console.log(`Processing embedding for track ID ${trackId}...`);
      
      // Get track data
      const track = await getTrackById(trackId);
      
      if (!track) {
        console.error(`Track ${trackId} not found in database`);
        continue;
      }
      
      // Query to get related artist names for this track
      let artistNames: string[] = [];
      try {
        // Fetch artists directly using a join
        const artistResults = await db
          .select({ name: artists.name })
          .from(tracksToArtists)
          .innerJoin(artists, sql`${tracksToArtists.artistId} = ${artists.id}`)
          .where(sql`${tracksToArtists.trackId} = ${trackId}`);
        
        artistNames = artistResults.map(a => a.name);
      } catch (error) {
        console.warn(`Error fetching artist names for track ${trackId}:`, error);
      }
      
      // Query to get related genres for this track
      let genreNames: string[] = [];
      try {
        // Fetch genres directly using a join
        const genreResults = await db
          .select({ name: genresTable.name })
          .from(tracksToGenres)
          .innerJoin(genresTable, sql`${tracksToGenres.genreId} = ${genresTable.id}`)
          .where(sql`${tracksToGenres.trackId} = ${trackId}`);
        
        genreNames = genreResults.map(g => g.name);
      } catch (error) {
        console.warn(`Error fetching genres for track ${trackId}:`, error);
      }
      
      // Generate embedding
      const embedding = await generateEmbedding(track.title, artistNames, genreNames);
      
      // Store embedding
      const storeSuccess = await storeEmbedding(trackId, embedding);
      
      if (storeSuccess) {
        console.log(`✅ Successfully processed embedding for track ${trackId} - ${track.title}`);
        successCount++;
      } else {
        console.error(`❌ Failed to store embedding for track ${trackId}`);
      }
    } catch (error) {
      console.error(`❌ Error processing embedding for track ${trackId}:`, error);
    }
  }
  
  return successCount;
}

/**
 * Get stats about embeddings generation
 * @returns Stats including total tracks, tracks with embeddings, percentage complete
 */
export async function getEmbeddingStats() {
  const stats = await db.select({
    total: sql<number>`count(*)`,
    withEmbeddings: sql<number>`count(CASE WHEN embedding IS NOT NULL THEN 1 END)`,
    withoutEmbeddings: sql<number>`count(CASE WHEN embedding IS NULL THEN 1 END)`
  })
  .from(tracks);
  
  if (stats.length === 0) {
    return {
      total: 0,
      withEmbeddings: 0,
      withoutEmbeddings: 0,
      percentComplete: 0
    };
  }
  
  const result = stats[0];
  const percentComplete = result.total > 0 
    ? ((result.withEmbeddings / result.total) * 100).toFixed(2)
    : "0.00";
  
  return {
    ...result,
    percentComplete
  };
}

/**
 * Find tracks that match a given text query using embedding similarity search
 * @param query The text query to find matches for
 * @param limit Maximum number of results to return
 * @param avoidExplicit Whether to filter out explicit tracks
 * @returns Array of tracks matching the query
 */
export async function findTracksMatchingEmbedding(
  query: string,
  limit: number = 24,
  avoidExplicit: boolean = false
): Promise<any[]> {
  try {
    console.log(`Finding tracks matching embedding for query: "${query}"`); 
    
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query, [], []);
    
    // Get tracks with embeddings
    let trackQuery = db.select({
      id: tracks.id,
      title: tracks.title,
      explicit: tracks.explicit,
      embedding: tracks.embedding
    })
    .from(tracks)
    .where(sql`embedding IS NOT NULL`);
    
    // Add explicit filter if needed
    if (avoidExplicit) {
      trackQuery = trackQuery.where(sql`explicit = false`);
    }
    
    // Limit to 500 tracks to avoid memory issues
    const tracksWithEmbeddings = await trackQuery.limit(500);
    console.log(`Found ${tracksWithEmbeddings.length} tracks with embeddings to compare against`);
    
    // Calculate similarity for each track
    const tracksWithSimilarity = tracksWithEmbeddings
      .map(track => {
        // Calculate cosine similarity
        const similarity = cosineSimilarity(queryEmbedding, track.embedding as number[]);
        return {
          ...track,
          similarity
        };
      })
      .sort((a, b) => b.similarity - a.similarity) // Sort by similarity (highest first)
      .slice(0, limit); // Take only the top matches
    
    // Fetch full track details for the matches
    const matchingTrackIds = tracksWithSimilarity.map(t => t.id);
    
    // Get full track details
    const { dbTrackToSpotifyTrack } = await import('../db');
    const fullTracks = [];
    
    for (const trackId of matchingTrackIds) {
      const [track] = await db
        .select()
        .from(tracks)
        .where(sql`id = ${trackId}`);
      
      if (track) {
        const spotifyTrack = await dbTrackToSpotifyTrack(track);
        if (spotifyTrack) {
          fullTracks.push(spotifyTrack);
        }
      }
    }
    
    return fullTracks;
  } catch (error) {
    console.error('Error finding tracks by embedding:', error);
    return [];
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vectorA: number[], vectorB: number[]): number {
  if (!vectorA || !vectorB || vectorA.length !== vectorB.length) {
    return 0;
  }
  
  // Calculate dot product
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vectorA.length; i++) {
    dotProduct += vectorA[i] * vectorB[i];
    normA += vectorA[i] * vectorA[i];
    normB += vectorB[i] * vectorB[i];
  }
  
  // Handle zero vectors
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  // Calculate cosine similarity
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
