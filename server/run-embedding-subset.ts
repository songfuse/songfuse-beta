import { db } from "./db";
import { tracks } from "@shared/schema";
import { processTrackEmbeddings } from "./services/embeddings";
import { sql } from "drizzle-orm";

/**
 * Generate and store embeddings for a subset of tracks
 * This script processes a limited number of tracks for testing
 */
async function generateEmbeddingSubset() {
  try {
    console.log("Starting embedding generation for a test subset of tracks...");
    
    // Find a subset of tracks without embeddings
    // Get a diverse set by ordering by popularity and explicit status
    const tracksWithoutEmbeddings = await db.select({ id: tracks.id })
      .from(tracks)
      .where(sql`embedding IS NULL`)
      .orderBy(tracks.popularity, tracks.explicit)
      .limit(50); // Only process 50 tracks for testing

    if (tracksWithoutEmbeddings.length === 0) {
      console.log("No tracks without embeddings found.");
      return;
    }

    console.log(`Found ${tracksWithoutEmbeddings.length} tracks for embedding test subset.`);
    
    // Process tracks in smaller batches to avoid rate limits
    const trackIds = tracksWithoutEmbeddings.map(t => t.id);
    const batchSize = 10;
    
    for (let i = 0; i < trackIds.length; i += batchSize) {
      const batchIds = trackIds.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(trackIds.length/batchSize)} (${batchIds.length} tracks)`);
      
      const successCount = await processTrackEmbeddings(batchIds);
      console.log(`Successfully processed ${successCount}/${batchIds.length} embeddings in batch ${Math.floor(i/batchSize) + 1}`);
      
      // Add a delay between batches to avoid rate limits
      if (i + batchSize < trackIds.length) {
        console.log("Waiting 5 seconds before processing next batch...");
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    // Check how many tracks now have embeddings
    const withEmbeddings = await db.select({ count: sql<number>`count(*)` })
      .from(tracks)
      .where(sql`embedding IS NOT NULL`);

    console.log(`Embedding test complete. ${withEmbeddings[0]?.count || 0} tracks now have embeddings.`);
  } catch (error) {
    console.error("Error generating test embeddings:", error);
  } finally {
    process.exit(0);
  }
}

// Run the function
generateEmbeddingSubset();
