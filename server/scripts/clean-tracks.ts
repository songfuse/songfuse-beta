/**
 * Script to fix tracks with NULL release dates
 * Instead of deleting tracks, this now updates them with estimated release dates
 */

import { db } from '../db';
import { tracks, trackPlatformIds, tracksToArtists, tracksToGenres, artists } from '../../shared/schema';
import { eq, isNull, and, inArray } from 'drizzle-orm';
import fetch from 'node-fetch';

// New set of default years based on genres to use when Spotify doesn't provide release dates
const genreYearEstimates: Record<string, number> = {
  // Decades for easy assignment
  '50s': 1955,
  '60s': 1965,
  '70s': 1975,
  '80s': 1985,
  '90s': 1995,
  '2000s': 2005,
  '2010s': 2015,
  '2020s': 2023,
  
  // Genre-specific estimates
  'classic rock': 1975,
  'rock': 1990, 
  'pop': 2010,
  'hip hop': 2005,
  'rap': 2010,
  'dance': 2015,
  'electronic': 2015,
  'edm': 2015,
  'country': 2000,
  'r&b': 2005,
  'soul': 1975,
  'jazz': 1965,
  'blues': 1965,
  'folk': 1975,
  'indie': 2010,
  'alternative': 2000,
  'metal': 1990,
  'punk': 1985,
  'reggae': 1980,
  'latin': 2010,
  'classical': 1800,
  'soundtrack': 2000,
  'disco': 1978,
  'funk': 1975,
  'grunge': 1992,
  'new wave': 1983,
  'synthpop': 1985,
  'techno': 1995,
  'house': 1995,
  'trance': 2000,
  'ambient': 2005,
  'trap': 2015,
  'drill': 2018,
  'dancehall': 2010,
  'afrobeat': 2018,
  'k-pop': 2018,
  'j-pop': 2010
};

// Default year if we can't determine anything else
const DEFAULT_YEAR = 2020;

/**
 * Get a track's release date from Spotify using its Platform ID
 */
async function getSpotifyReleaseDate(spotifyId: string): Promise<Date | null> {
  try {
    // Attempt to load Spotify API
    const spotify = await import('../spotify');
    
    // Check for environment variables
    if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
      console.warn('Spotify credentials not found in environment variables');
      return null;
    }
    
    // Get credentials
    const credentials = await spotify.getClientCredentials();
    if (!credentials || !credentials.access_token) {
      console.warn('Failed to get Spotify credentials');
      return null;
    }
    
    // Fetch track details from Spotify
    const response = await fetch(`https://api.spotify.com/v1/tracks/${spotifyId}`, {
      headers: {
        'Authorization': `Bearer ${credentials.access_token}`
      }
    });
    
    if (!response.ok) {
      console.warn(`Failed to fetch track from Spotify: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    // Extract release date from response
    if (data && data.album && data.album.release_date) {
      // Spotify returns dates in various formats: YYYY, YYYY-MM, or YYYY-MM-DD
      // We'll parse them appropriately
      const releaseDate = data.album.release_date;
      let date: Date;
      
      if (releaseDate.length === 4) {
        // Just the year
        date = new Date(parseInt(releaseDate), 0, 1); // January 1st of the year
      } else if (releaseDate.length === 7) {
        // Year and month
        const [year, month] = releaseDate.split('-');
        date = new Date(parseInt(year), parseInt(month) - 1, 1); // 1st of the month
      } else {
        // Full date
        date = new Date(releaseDate);
      }
      
      // Check if date is valid
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching release date from Spotify:', error);
    return null;
  }
}

/**
 * Estimate release date based on genres
 */
async function estimateReleaseDateFromGenres(trackId: number): Promise<Date | null> {
  try {
    // Get the track's genres
    const genreResults = await db.select({
      genreName: tracksToGenres.genreName
    })
    .from(tracksToGenres)
    .where(eq(tracksToGenres.trackId, trackId));
    
    if (!genreResults.length) {
      return null;
    }
    
    // Get genre names
    const genres = genreResults.map(g => g.genreName.toLowerCase());
    
    // Check for decade hints in genre names
    const decadeMatches = genres.map(genre => {
      for (const [decadeKey, year] of Object.entries(genreYearEstimates)) {
        if (genre.includes(decadeKey)) {
          return year;
        }
      }
      return null;
    }).filter(Boolean);
    
    // If we found decade hints, use the average
    if (decadeMatches.length > 0) {
      const avgYear = Math.round(decadeMatches.reduce((sum, year) => sum + (year || 0), 0) / decadeMatches.length);
      return new Date(avgYear, 0, 1); // January 1st of the estimated year
    }
    
    // Check for other genre matches
    const genreMatches = genres.map(genre => {
      for (const [genreKey, year] of Object.entries(genreYearEstimates)) {
        if (genre.includes(genreKey)) {
          return year;
        }
      }
      return null;
    }).filter(Boolean);
    
    // If we found genre matches, use the average
    if (genreMatches.length > 0) {
      const avgYear = Math.round(genreMatches.reduce((sum, year) => sum + (year || 0), 0) / genreMatches.length);
      return new Date(avgYear, 0, 1); // January 1st of the estimated year
    }
    
    return null;
  } catch (error) {
    console.error('Error estimating release date from genres:', error);
    return null;
  }
}

/**
 * Fix tracks with NULL release dates by trying to determine and set actual dates
 * 
 * @param dryRun If true, will only log what would be changed without making changes
 * @returns Number of tracks that were processed
 */
export async function cleanTracksWithNullDates(dryRun: boolean = false): Promise<number> {
  try {
    console.log(`${dryRun ? '[DRY RUN] ' : ''}Starting release date fix for NULL release dates...`);
    
    // First, find all tracks with NULL release dates
    const tracksToFix = await db.select({ 
      id: tracks.id, 
      title: tracks.title
    })
    .from(tracks)
    .where(isNull(tracks.releaseDate));
    
    const trackCount = tracksToFix.length;
    
    if (trackCount === 0) {
      console.log('No tracks found with NULL release dates.');
      return 0;
    }
    
    console.log(`${dryRun ? '[DRY RUN] ' : ''}Found ${trackCount} tracks with NULL release dates to fix.`);
    
    if (dryRun) {
      // In dry run mode, just return the count without making changes
      console.log('[DRY RUN] The following tracks would be fixed:');
      tracksToFix.slice(0, 20).forEach((track, i) => {
        console.log(`${i + 1}. ID: ${track.id}, Title: ${track.title}`);
      });
      
      if (tracksToFix.length > 20) {
        console.log(`... and ${tracksToFix.length - 20} more tracks`);
      }
      
      return trackCount;
    }
    
    // Get the list of track IDs
    const trackIds = tracksToFix.map(track => track.id);
    
    // Use batches to avoid overwhelming the database
    const batchSize = 100;
    let updatedCount = 0;
    let skippedCount = 0;
    
    for (let i = 0; i < trackIds.length; i += batchSize) {
      const batch = trackIds.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(trackIds.length / batchSize);
      
      console.log(`Processing update batch ${batchNumber}/${totalBatches} (${batch.length} tracks)`);
      
      for (const trackId of batch) {
        try {
          // Step 1: Try to get Spotify release date
          const platformIdResult = await db.select({
            platformId: trackPlatformIds.platformId
          })
          .from(trackPlatformIds)
          .where(
            and(
              eq(trackPlatformIds.trackId, trackId),
              eq(trackPlatformIds.platform, 'spotify')
            )
          )
          .limit(1);
          
          const spotifyId = platformIdResult[0]?.platformId;
          let releaseDate: Date | null = null;
          
          if (spotifyId) {
            // Try to get release date from Spotify
            releaseDate = await getSpotifyReleaseDate(spotifyId);
            if (releaseDate) {
              console.log(`Found Spotify release date for track ${trackId}: ${releaseDate.toISOString()}`);
            }
          }
          
          // Step 2: If no Spotify date, try to estimate from genres
          if (!releaseDate) {
            releaseDate = await estimateReleaseDateFromGenres(trackId);
            if (releaseDate) {
              console.log(`Estimated release date for track ${trackId} from genres: ${releaseDate.toISOString()}`);
            }
          }
          
          // Step 3: If still no date, use default date
          if (!releaseDate) {
            releaseDate = new Date(DEFAULT_YEAR, 0, 1); // January 1st of default year
            console.log(`Using default release date for track ${trackId}: ${releaseDate.toISOString()}`);
          }
          
          // Update the track with the determined release date
          await db.update(tracks)
            .set({ releaseDate: releaseDate })
            .where(eq(tracks.id, trackId));
          
          updatedCount++;
        } catch (error) {
          console.error(`Error fixing release date for track ${trackId}:`, error);
          skippedCount++;
        }
      }
      
      console.log(`Progress: ${updatedCount + skippedCount}/${trackCount} tracks processed (${updatedCount} updated, ${skippedCount} skipped)`);
    }
    
    console.log(`Successfully processed ${updatedCount + skippedCount} tracks. Updated ${updatedCount}, skipped ${skippedCount}.`);
    return updatedCount + skippedCount;
  } catch (error) {
    console.error('Error fixing track release dates:', error);
    throw error;
  }
}

/**
 * Entry point for the script when run directly
 */
async function main() {
  try {
    // Get command line arguments
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run') || args.includes('-d');
    
    console.log(`Starting track cleanup${dryRun ? ' in dry run mode' : ''}...`);
    
    // Run the cleanup function
    const count = await cleanTracksWithNullDates(dryRun);
    
    console.log(`${dryRun ? '[DRY RUN] ' : ''}Track cleanup complete. ${count} tracks ${dryRun ? 'would be' : 'were'} deleted.`);
    
    // Exit with success
    process.exit(0);
  } catch (error) {
    console.error('Error in cleanup script:', error);
    process.exit(1);
  }
}

// Run the main function if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}