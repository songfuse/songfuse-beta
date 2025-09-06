
import { db, pool } from '../db';
import { tracks, albums, tracksToGenres, tracksToArtists, trackPlatformIds } from '@shared/schema';
import { eq, inArray, isNull } from 'drizzle-orm';

export async function removeTracksWithoutCovers() {
  console.log('Starting removal of tracks without album covers...');
  
  try {
    // Step 1: Get all tracks with albums that have null cover images
    const tracksWithoutCovers = await db
      .select({
        id: tracks.id,
        title: tracks.title
      })
      .from(tracks)
      .innerJoin(albums, eq(tracks.albumId, albums.id))
      .where(isNull(albums.coverImage));

    console.log(`Found ${tracksWithoutCovers.length} tracks without album covers to remove`);
    
    if (tracksWithoutCovers.length === 0) {
      console.log('No tracks without album covers to remove. Exiting.');
      return;
    }
    
    // Get the IDs of tracks to remove
    const trackIdsToRemove = tracksWithoutCovers.map(t => t.id);
    
    // Execute the removal within a transaction
    await db.transaction(async (tx) => {
      // Step 2: Remove genre associations
      console.log('Removing genre associations...');
      const deletedGenreAssociations = await tx
        .delete(tracksToGenres)
        .where(inArray(tracksToGenres.trackId, trackIdsToRemove))
        .returning();
      console.log(`Removed ${deletedGenreAssociations.length} genre associations`);
      
      // Step 3: Remove artist associations
      console.log('Removing artist associations...');
      const deletedArtistAssociations = await tx
        .delete(tracksToArtists)
        .where(inArray(tracksToArtists.trackId, trackIdsToRemove))
        .returning();
      console.log(`Removed ${deletedArtistAssociations.length} artist associations`);
      
      // Step 4: Remove platform IDs
      console.log('Removing platform IDs...');
      const deletedPlatformIds = await tx
        .delete(trackPlatformIds)
        .where(inArray(trackPlatformIds.trackId, trackIdsToRemove))
        .returning();
      console.log(`Removed ${deletedPlatformIds.length} platform IDs`);
      
      // Step 5: Remove the tracks themselves
      console.log('Removing tracks...');
      const deletedTracks = await tx
        .delete(tracks)
        .where(inArray(tracks.id, trackIdsToRemove))
        .returning();
      console.log(`Successfully removed ${deletedTracks.length} tracks without album covers`);
    });
    
    console.log('Tracks without album covers have been successfully removed from the database');
  } catch (error) {
    console.error('Error removing tracks without album covers:', error);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (import.meta.url === import.meta.resolve('./remove-tracks-without-covers.ts')) {
  removeTracksWithoutCovers()
    .then(() => {
      console.log('Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}
