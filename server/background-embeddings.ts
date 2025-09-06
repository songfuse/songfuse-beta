import { db } from "./db";
import { tracks } from "@shared/schema";
import { processTrackEmbeddings } from "./services/embeddings";
import { sql } from "drizzle-orm";

/**
 * Continuous background process to generate embeddings for all tracks
 * This script runs indefinitely, processing tracks in batches with appropriate
 * delays to avoid overwhelming the system or hitting API rate limits
 */
async function backgroundEmbeddingProcess() {
  console.log("🔄 Starting continuous background embedding process...");
  
  // Track statistics for reporting
  let totalProcessed = 0;
  let totalSuccess = 0;
  let startTime = Date.now();
  
  // Configure batch sizes and delays
  const batchSize = 20;         // Number of tracks to process in each batch (increased for speed)
  const batchDelay = 5;         // Seconds to wait between batches (reduced for speed)
  const reportInterval = 100;   // Number of tracks after which to report progress
  const maxPerHour = 1000;      // Maximum tracks to process per hour (increased rate limit)
  
  try {
    while (true) { // Continuous loop
      // Check if we should pause for rate limiting
      const processedThisHour = totalProcessed % maxPerHour;
      const hourlyReset = 3600; // 1 hour in seconds
      
      if (processedThisHour >= maxPerHour - batchSize) {
        // We're approaching our hourly limit, let's wait until the next hour
        const resetDelay = hourlyReset - ((Date.now() - startTime) / 1000) % hourlyReset;
        console.log(`🕒 Hourly rate limit approaching, pausing for ${Math.ceil(resetDelay)} seconds before continuing...`);
        await new Promise(resolve => setTimeout(resolve, resetDelay * 1000));
        console.log("⏩ Resuming embedding process");
      }
      
      // Get current embedding statistics
      const embeddingStats = await db.select({
        total: sql<number>`count(*)`,
        withEmbeddings: sql<number>`count(CASE WHEN embedding IS NOT NULL THEN 1 END)`,
        withoutEmbeddings: sql<number>`count(CASE WHEN embedding IS NULL THEN 1 END)`
      })
      .from(tracks);
      
      const stats = embeddingStats[0];
      if (!stats) {
        console.log("❌ No tracks found in database.");
        break;
      }
      
      // If all tracks have embeddings, we're done
      if (stats.withoutEmbeddings === 0) {
        console.log("✅ All tracks have embeddings! Background process complete.");
        break;
      }
      
      // Print statistics every reportInterval tracks
      if (totalProcessed % reportInterval === 0) {
        console.log(`\n📊 Embedding Statistics at ${new Date().toISOString()}:\n` +
          `- Total tracks: ${stats.total}\n` +
          `- Tracks with embeddings: ${stats.withEmbeddings} (${((stats.withEmbeddings / stats.total) * 100).toFixed(2)}%)\n` +
          `- Tracks without embeddings: ${stats.withoutEmbeddings} (${((stats.withoutEmbeddings / stats.total) * 100).toFixed(2)}%)\n` +
          `- Session progress: ${totalProcessed} processed, ${totalSuccess} successful`);
      }
      
      // Get the next batch of tracks without embeddings, ordered by popularity
      const tracksWithoutEmbeddings = await db.select({ id: tracks.id })
        .from(tracks)
        .where(sql`embedding IS NULL`)
        .orderBy(sql`popularity DESC NULLS LAST`)
        .limit(batchSize);
      
      if (tracksWithoutEmbeddings.length === 0) {
        console.log("No more tracks without embeddings found.");
        break;
      }
      
      // Process this batch
      const batchIds = tracksWithoutEmbeddings.map(t => t.id);
      console.log(`\n🔄 Processing batch of ${batchIds.length} tracks: [${batchIds.join(", ")}]`);
      
      const batchSuccessCount = await processTrackEmbeddings(batchIds);
      totalProcessed += batchIds.length;
      totalSuccess += batchSuccessCount;
      
      console.log(`✅ Batch complete: ${batchSuccessCount}/${batchIds.length} successful`);
      console.log(`📈 Overall progress: ${totalSuccess}/${totalProcessed} tracks successfully processed`);
      
      // Add a delay between batches to avoid overwhelming the system
      console.log(`⏱️ Waiting ${batchDelay} seconds before next batch...`);
      await new Promise(resolve => setTimeout(resolve, batchDelay * 1000));
    }
  } catch (error) {
    console.error("❌ Error in background embedding process:", error);
    
    // Instead of exiting, just pause and then continue
    console.log("⚠️ Encountered an error, pausing for 60 seconds and then continuing...");
    await new Promise(resolve => setTimeout(resolve, 60 * 1000));
    return backgroundEmbeddingProcess(); // Restart the process
  }
}

// Run the background process
console.log("🚀 Starting background embedding process at", new Date().toISOString());
backgroundEmbeddingProcess()
  .then(() => {
    console.log("✅ Background embedding process completed successfully at", new Date().toISOString());
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Fatal error in background embedding process:", error);
    process.exit(1);
  });
