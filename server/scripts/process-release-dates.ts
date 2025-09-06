/**
 * Script to process release dates for tracks in smaller batches
 * This runs a standalone process that can be safely interrupted and restarted
 * Now using OpenAI to estimate release dates where possible
 */
import { db } from '../db';
import { tracks } from '../../shared/schema';
import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import OpenAI from 'openai';

// Initialize OpenAI client
let openai: OpenAI | null = null;
function getOpenAIClient() {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_PROD;
    console.log('📝 Debug - API Key check:', apiKey ? 'OpenAI API key found (length: ' + apiKey.length + ')' : 'No OpenAI API key found!');
    
    if (!apiKey) {
      console.warn('⚠️ No OpenAI API key found, will use genre-based estimation only');
      return null;
    }
    
    try {
      console.log('🤖 Initializing OpenAI client for release date estimation');
      openai = new OpenAI({
        apiKey,
      });
      console.log('✅ OpenAI client initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize OpenAI client:', error);
      return null;
    }
  }
  return openai;
}

// Configuration
const BATCH_SIZE = 10; // Process 10 tracks at a time
const MAX_BATCHES = 5;  // Process up to 5 batches (50 tracks)
const DELAY_BETWEEN_BATCHES = 1000; // 1 second delay between batches
const USE_OPENAI = true; // Set to false to disable OpenAI and use only genre-based estimation

// Define a diverse set of release dates to distribute across the catalog (fallback)
const decades = [
  1960, 1965, 1970, 1975, 1980, 1985, 1990, 1995,
  2000, 2005, 2010, 2015, 2020, 2022, 2023, 2024
];

// Genre-to-decade mapping for better estimation (fallback)
const genreToDecadeMap: Record<string, number[]> = {
  // Classic genres
  'rock': [1965, 1970, 1975, 1980, 1985, 1990],
  'classical': [1700, 1750, 1800, 1850, 1900, 1950],
  'jazz': [1940, 1950, 1960, 1970],
  'blues': [1930, 1940, 1950, 1960],
  'folk': [1950, 1960, 1970, 1980],
  
  // Modern genres
  'electronic': [1990, 1995, 2000, 2005, 2010, 2015, 2020],
  'dance': [1990, 1995, 2000, 2005, 2010, 2015, 2020],
  'hip hop': [1985, 1990, 1995, 2000, 2005, 2010, 2015, 2020],
  'pop': [1970, 1980, 1990, 2000, 2010, 2020],
  'r&b': [1960, 1970, 1980, 1990, 2000, 2010, 2020],
  
  // Recent genres
  'trap': [2010, 2015, 2020, 2022, 2023],
  'edm': [2010, 2015, 2020],
  'k-pop': [2010, 2015, 2020, 2022, 2023],
  'indie': [2000, 2005, 2010, 2015, 2020]
};

// Define months (0-11) to add variety
const months = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/**
 * Get more information about a track for better release date estimation
 */
async function getTrackDetails(trackId: number) {
  try {
    // Import schema and drizzle dependencies
    const schema = await import('../../shared/schema');
    const { eq } = await import('drizzle-orm');
    
    // Get artist names
    const trackArtistNames = await db
      .select({ name: schema.artists.name })
      .from(schema.tracksToArtists)
      .innerJoin(schema.artists, eq(schema.tracksToArtists.artistId, schema.artists.id))
      .where(eq(schema.tracksToArtists.trackId, trackId));
    
    // Get album info
    const trackWithAlbum = await db
      .select({
        albumName: schema.albums.title
      })
      .from(schema.tracks)
      .leftJoin(schema.albums, eq(schema.tracks.albumId, schema.albums.id))
      .where(eq(schema.tracks.id, trackId))
      .limit(1);
      
    // Get track genres
    const trackGenres = await db
      .select({ name: schema.genres.name })
      .from(schema.tracksToGenres)
      .innerJoin(schema.genres, eq(schema.tracksToGenres.genreId, schema.genres.id))
      .where(eq(schema.tracksToGenres.trackId, trackId));
      
    return {
      artistNames: trackArtistNames.map(a => a.name).filter(Boolean),
      albumName: trackWithAlbum[0]?.albumName || '',
      genres: trackGenres.map(g => g.name).filter(Boolean)
    };
  } catch (error) {
    console.error(`Error getting track details for ID ${trackId}:`, error);
    return {
      artistNames: [],
      albumName: '',
      genres: []
    };
  }
}

/**
 * Estimate release date using OpenAI API
 */
async function estimateReleaseDateWithAI(trackTitle: string, details: { artistNames: string[], albumName: string, genres: string[] }): Promise<Date | null> {
  console.log(`\n===== Starting OpenAI Release Date Estimation =====`);
  
  const openaiClient = getOpenAIClient();
  if (!openaiClient) {
    console.log('❌ No OpenAI client available, skipping AI estimation');
    return null;
  }
  
  console.log(`✅ OpenAI client available, proceeding with estimation`);
  
  try {
    // Join artists with commas
    const artistsText = details.artistNames.length > 0 
      ? `by ${details.artistNames.join(', ')}`
      : '';
      
    // Create album text if available
    const albumText = details.albumName 
      ? `from the album "${details.albumName}"`
      : '';
      
    // Join genres with commas
    const genresText = details.genres.length > 0
      ? `Genres: ${details.genres.join(', ')}`
      : '';
      
    // Create the prompt
    const prompt = `Estimate the release year and month of the song "${trackTitle}" ${artistsText} ${albumText}. ${genresText}

Please respond with only a JSON object with format:
{
  "year": [year as number],
  "month": [month as number from 1-12],
  "confidence": [confidence score from 0.0-1.0]
}

If you're not sure, provide your best estimate with a lower confidence score. For very recent songs, the year can be as recent as 2024.`;

    console.log(`📝 Full query to OpenAI:\n"${trackTitle}" ${artistsText} ${albumText} ${genresText}`);
    
    console.log(`🔄 Calling OpenAI API with model: gpt-4o...`);
    
    const response = await openaiClient.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        { role: "system", content: "You are a music database specialist with extensive knowledge of music release dates from all eras and genres. Provide only the JSON object requested with no additional text." },
        { role: "user", content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 150,
      response_format: { type: "json_object" }
    });
    console.log("✅ OpenAI API response received successfully");
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.log('⚠️ Empty response from OpenAI');
      return null;
    }
    
    try {
      const result = JSON.parse(content);
      const { year, month, confidence } = result;
      
      // Validate the response
      if (typeof year !== 'number' || typeof month !== 'number' || typeof confidence !== 'number') {
        console.log('⚠️ Invalid response format from OpenAI:', content);
        return null;
      }
      
      // Month in JavaScript Date is 0-indexed, so subtract 1
      const jsMonth = month - 1;
      
      // Random day between 1-28 for better distribution
      const day = Math.floor(Math.random() * 28) + 1;
      
      console.log(`🤖 OpenAI estimated: ${year}-${month} (confidence: ${(confidence * 100).toFixed(1)}%)`);
      
      return new Date(year, jsMonth, day);
    } catch (parseError) {
      console.error('⚠️ Failed to parse OpenAI response:', parseError);
      console.log('Response was:', content);
      return null;
    }
  } catch (openaiError) {
    console.error('⚠️ OpenAI API error:', openaiError);
    return null;
  }
}

/**
 * Process a small batch of tracks
 */
async function processBatch(batchNumber: number, batchSize: number): Promise<number> {
  console.log(`\n==== Processing batch ${batchNumber} (${batchSize} tracks) ====`);
  
  // Get tracks without release dates
  const tracksToFix = await db.select({
    id: tracks.id,
    title: tracks.title
  })
  .from(tracks)
  .where(sql`release_date IS NULL`)
  .limit(batchSize);
  
  if (tracksToFix.length === 0) {
    console.log('No more tracks without release dates found.');
    return 0;
  }
  
  console.log(`Found ${tracksToFix.length} tracks with NULL dates, processing...`);
  
  // Process each track
  for (let i = 0; i < tracksToFix.length; i++) {
    const track = tracksToFix[i];
    let releaseDate: Date | null = null;
    
    // First try to get the release date from OpenAI if enabled
    if (USE_OPENAI) {
      console.log(`\nProcessing track: ${track.title} (ID: ${track.id})`);
      const trackDetails = await getTrackDetails(track.id);
      releaseDate = await estimateReleaseDateWithAI(track.title, trackDetails);
    }
    
    // If OpenAI didn't work or is disabled, fall back to genre-based estimation
    if (!releaseDate) {
      console.log(`Using genre-based fallback for track: ${track.title}`);
      
      // Try to get genres for this track
      let decadeToUse = decades[track.id % decades.length]; // Default fallback
      let genreSpecificDecade = false;
      
      try {
        // Get track genres
        const { genres, tracksToGenres } = await import('../../shared/schema');
        const { eq } = await import('drizzle-orm');
        
        const trackGenres = await db
          .select({ name: genres.name })
          .from(tracksToGenres)
          .innerJoin(genres, eq(tracksToGenres.genreId, genres.id))
          .where(eq(tracksToGenres.trackId, track.id));
        
        if (trackGenres && trackGenres.length > 0) {
          // Find the first genre that matches our mapping
          for (const genreRow of trackGenres) {
            const genreName = genreRow.name?.toLowerCase() || "";
            
            // Check if this genre has a specific decade range
            for (const [mappedGenre, decadeOptions] of Object.entries(genreToDecadeMap)) {
              if (genreName.includes(mappedGenre)) {
                // Use the genre's decade range
                decadeToUse = decadeOptions[track.id % decadeOptions.length];
                genreSpecificDecade = true;
                break;
              }
            }
            
            if (genreSpecificDecade) break;
          }
        }
      } catch (error) {
        // If there's an error getting genres, just use the fallback
        console.log(`Error getting genres for track ${track.id}, using fallback decade`);
      }
      
      // Use the track ID to select a month and day (makes distribution more random but deterministic)
      const month = months[(track.id * 7) % months.length]; // multiply by prime number for better distribution
      const day = (track.id % 28) + 1; // day between 1-28 to avoid invalid dates
      
      releaseDate = new Date(decadeToUse, month, day);
      console.log(`Fallback date: ${releaseDate.toISOString().split('T')[0]}`);
    }
    
    // Update the track with the new release date
    await db.update(tracks)
      .set({ releaseDate })
      .where(eq(tracks.id, track.id));
    
    if (i % 5 === 0 || i === tracksToFix.length - 1) {
      process.stdout.write(`Progress: ${i + 1}/${tracksToFix.length}\r`);
    }
  }
  
  console.log(`\nCompleted batch ${batchNumber}, processed ${tracksToFix.length} tracks`);
  return tracksToFix.length;
}

/**
 * Get current statistics
 */
async function printStats(): Promise<void> {
  const totalTracks = await db.execute(sql`SELECT COUNT(*) as count FROM tracks`);
  const totalTrackCount = Number(totalTracks.rows[0]?.count) || 8332;
  
  const tracksWithoutDates = await db.execute(sql`SELECT COUNT(*) as count FROM tracks WHERE release_date IS NULL`);
  const withoutDatesCount = Number(tracksWithoutDates.rows[0]?.count) || 0;
  
  const tracksWithDates = totalTrackCount - withoutDatesCount;
  const percentComplete = Math.round((tracksWithDates / totalTrackCount) * 100 * 10) / 10;
  
  console.log(`\nCurrent statistics:
  - Total tracks: ${totalTrackCount}
  - Tracks with dates: ${tracksWithDates} (${percentComplete}%)
  - Tracks without dates: ${withoutDatesCount} (${Math.round((withoutDatesCount / totalTrackCount) * 100 * 10) / 10}%)
  `);
}

/**
 * Main function that can accept custom configuration
 * @param config Optional configuration to override defaults
 */
async function main(config?: {
  MAX_BATCHES?: number;
  BATCH_SIZE?: number;
  DELAY_BETWEEN_BATCHES?: number;
}) {
  // Use provided config or defaults
  const MAX_BATCHES_TO_USE = config?.MAX_BATCHES || MAX_BATCHES;
  const BATCH_SIZE_TO_USE = config?.BATCH_SIZE || BATCH_SIZE;
  const DELAY_BETWEEN_BATCHES_TO_USE = config?.DELAY_BETWEEN_BATCHES || DELAY_BETWEEN_BATCHES;
  
  console.log('Starting release date processing...');
  console.log(`Configuration: ${MAX_BATCHES_TO_USE} batches of ${BATCH_SIZE_TO_USE} tracks with ${DELAY_BETWEEN_BATCHES_TO_USE}ms delay`);
  await printStats();
  
  let processedTotal = 0;
  
  for (let i = 0; i < MAX_BATCHES_TO_USE; i++) {
    const processed = await processBatch(i + 1, BATCH_SIZE_TO_USE);
    processedTotal += processed;
    
    if (processed === 0) {
      console.log('No more tracks to process, stopping.');
      break;
    }
    
    // Print updated stats after each batch
    await printStats();
    
    // If not the last batch, wait before continuing
    if (i < MAX_BATCHES_TO_USE - 1 && processed > 0) {
      console.log(`Waiting ${DELAY_BETWEEN_BATCHES_TO_USE/1000} seconds before next batch...`);
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_TO_USE));
    }
  }
  
  console.log(`Completed processing ${processedTotal} tracks in total.`);
  return processedTotal;
}

// Export the main function for use in other modules
export { main };

// Run the main function if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => {
      console.log('Process completed successfully');
      process.exit(0);
    })
    .catch(err => {
      console.error('Error:', err);
      process.exit(1);
    });
}