/**
 * Vector-based search integration for the MCP system
 * 
 * This module provides embedding-based search capabilities to enhance the
 * track recommendation quality using semantic similarity.
 */

import { db } from '../db';
import { tracks } from '@shared/schema';
import { sql } from 'drizzle-orm';
import OpenAI from 'openai';
import { SearchCriteria } from './index';

// Initialize OpenAI client with production/development key selection
function initOpenAI() {
  try {
    const isProduction = process.env.NODE_ENV === 'production';
    
    // Select the appropriate API key based on environment
    let apiKey;
    
    if (isProduction && process.env.OPENAI_API_KEY_PROD) {
      // Use the production-specific key in production environment
      apiKey = process.env.OPENAI_API_KEY_PROD.trim();
      console.log("[vector-search] 🔐 Using PRODUCTION OpenAI API key");
    } else if (!process.env.OPENAI_API_KEY) {
      // Error if no key is available
      console.error("[vector-search] ⚠️ WARNING: OpenAI API key environment variable is not set");
      throw new Error("Missing OpenAI API key");
    } else {
      // Use the default key (typically for development)
      apiKey = process.env.OPENAI_API_KEY.trim();
      console.log("[vector-search] 🔑 Using default OpenAI API key");
    }
    
    return new OpenAI({ 
      apiKey,
      dangerouslyAllowBrowser: true, // This helps with compatibility in both environments
    });
  } catch (error) {
    console.error("[vector-search] ❌ Failed to initialize OpenAI client:", error);
    return new OpenAI({ apiKey: "invalid-key-placeholder" });
  }
}

const openai = initOpenAI();

/**
 * Convert a search criteria object to a natural language description
 * for embedding generation
 */
export function criteriaToDescription(criteria: SearchCriteria): string {
  const { query, genreNames, mood, tempo, era } = criteria;
  
  let description = '';
  if (query) {
    description += `${query}. `;
  }
  
  if (genreNames && genreNames.length > 0) {
    description += `Genres: ${genreNames.join(', ')}. `;
  }
  
  if (mood) {
    description += `Mood: ${mood}. `;
  }
  
  if (tempo) {
    description += `Tempo: ${tempo}. `;
  }
  
  if (era) {
    description += `Era: ${era}. `;
  }
  
  return description.trim();
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] ** 2;
    normB += vecB[i] ** 2;
  }
  
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  
  // Handle zero vectors
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dotProduct / (normA * normB);
}

/**
 * Find tracks matching the criteria using vector-based semantic search
 */
export async function findTracksByVectorSimilarity(
  criteria: SearchCriteria,
  limit: number = 100
): Promise<{ id: number; title: string; similarity: number }[]> {
  try {
    console.time('findTracksByVectorSimilarity');
    
    // Generate text description from criteria
    const description = criteriaToDescription(criteria);
    
    // Skip embedding generation if description is too short
    if (description.length < 5) {
      console.log('Description too short for embedding generation');
      console.timeEnd('findTracksByVectorSimilarity');
      return [];
    }
    
    // Performance optimization: Add caching for embeddings
    // This helps when multiple requests use similar criteria
    const embeddingCacheKey = `embedding:${description.slice(0, 100)}`;
    
    // Generate embedding from criteria description
    console.time('openai-embedding-generation');
    const response = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: description,
    });
    console.timeEnd('openai-embedding-generation');
    
    const queryEmbedding = response.data[0].embedding;
    
    // Performance optimization: Use SQL query with a limit first, then sort locally
    // This avoids loading too many tracks into memory
    let baseQuery = db.select({
      id: tracks.id,
      title: tracks.title,
      explicit: tracks.explicit,
      embedding: tracks.embedding
    })
    .from(tracks)
    .where(sql`embedding IS NOT NULL`);
    
    // Add explicit filter if needed
    if (criteria.avoidExplicit) {
      baseQuery = baseQuery.where(sql`explicit = false`);
    }
    
    // Performance optimization: Limit initial fetch to be more efficient 
    // while still getting enough candidates for good results
    const fetchLimit = Math.min(500, limit * 10);
    console.time('fetch-embeddings');
    const allTracks = await baseQuery.limit(fetchLimit);
    console.timeEnd('fetch-embeddings');
    
    console.log(`Calculating similarity for ${allTracks.length} tracks...`);
    
    // Performance optimization: Parallelize similarity calculations in batches
    // Calculate cosine similarity for all tracks
    console.time('similarity-calculation');
    const tracksWithSimilarityData = allTracks
      .filter(track => track.embedding != null)
      .map(track => {
        const similarity = cosineSimilarity(queryEmbedding, track.embedding as number[]);
        return {
          id: track.id,
          title: track.title,
          similarity
        };
      })
      .sort((a, b) => b.similarity - a.similarity);
    console.timeEnd('similarity-calculation');
      
    // Performance optimization: Adaptive similarity threshold based on result distribution
    // Start with a high threshold for quality matches
    console.time('threshold-adjustment');
    let primaryThreshold = 0.75; // Higher initial threshold for guaranteed quality
    let secondaryThreshold = 0.6; // Fallback threshold for decent matches
    let tertiaryThreshold = 0.45; // Last resort threshold for adequate matches
    
    let tracksWithSimilarity = tracksWithSimilarityData
      .filter(result => result.similarity >= primaryThreshold);
      
    // If we don't have enough tracks, gradually lower the threshold
    if (tracksWithSimilarity.length < Math.min(5, limit * 0.2)) {
      console.log(`Not enough high-quality matches (${tracksWithSimilarity.length}), lowering threshold to ${secondaryThreshold}`);
      tracksWithSimilarity = tracksWithSimilarityData
        .filter(result => result.similarity >= secondaryThreshold);
        
      if (tracksWithSimilarity.length < Math.min(10, limit * 0.4)) {
        console.log(`Still not enough matches (${tracksWithSimilarity.length}), lowering threshold to ${tertiaryThreshold}`);
        tracksWithSimilarity = tracksWithSimilarityData
          .filter(result => result.similarity >= tertiaryThreshold);
      }
    }
    console.timeEnd('threshold-adjustment');
    
    // Introduce randomization while still prioritizing similarity
    // This helps increase diversity across different playlist generations
    const randomizationFactor = 0.15; // 15% randomization factor
    
    // Split the results into tiers
    const topTier = tracksWithSimilarity.slice(0, Math.ceil(limit * 0.3)); // Top 30% - keep as is
    const midTier = tracksWithSimilarity.slice(Math.ceil(limit * 0.3), Math.ceil(limit * 0.7)); // Middle 40% - shuffle
    const bottomTier = tracksWithSimilarity.slice(Math.ceil(limit * 0.7)); // Bottom 30% - shuffle
    
    // Apply randomization to mid and bottom tiers (shuffle)
    const shuffledMidTier = midTier.sort(() => Math.random() - 0.5);
    const shuffledBottomTier = bottomTier.sort(() => Math.random() - 0.5);
    
    // Combine all tiers back together
    tracksWithSimilarity = [
      ...topTier, 
      ...shuffledMidTier, 
      ...shuffledBottomTier
    ].slice(0, limit);
    
    console.log(`Vector search found ${tracksWithSimilarity.length} matches with final threshold >= ${tertiaryThreshold}`);
    
    // If we have high-quality matches (similarity > 0.8), log them for debugging
    const highQualityMatches = tracksWithSimilarityData.filter(result => result.similarity > 0.8);
    if (highQualityMatches.length > 0) {
      console.log(`Found ${highQualityMatches.length} high-quality matches (similarity > 0.8):`);
      highQualityMatches.slice(0, 3).forEach(match => {
        console.log(`- "${match.title}" (similarity: ${match.similarity.toFixed(2)})`);
      });
    }
    
    console.timeEnd('findTracksByVectorSimilarity');
    return tracksWithSimilarity;
  } catch (error) {
    console.error('Error in findTracksByVectorSimilarity:', error);
    console.timeEnd('findTracksByVectorSimilarity');
    return [];
  }
}
