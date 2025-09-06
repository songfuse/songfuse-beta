/**
 * Script to import tracks into the database from a JSON file
 * This module handles parsing track data and storing it in the database
 */

import fs from 'fs';
import path from 'path';
import { db } from '../db';
import { albums, artists, tracks, tracksToArtists, genres, tracksToGenres, trackPlatformIds, platformEnum } from '../../shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import fetch from 'node-fetch';

/**
 * Import tracks from a JSON file
 * 
 * @param filePath Path to the JSON file containing track data
 */
export async function importTracksFromJson(filePath: string): Promise<void> {
  try {
    console.log(`Importing tracks from ${filePath}...`);
    
    // Read and parse the JSON file
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const tracksData = JSON.parse(fileContent);
    
    if (!Array.isArray(tracksData)) {
      throw new Error('JSON file must contain an array of tracks');
    }
    
    console.log(`Found ${tracksData.length} tracks in JSON file`);
    
    // Process tracks in batches to avoid overloading the database
    const batchSize = 10;
    for (let i = 0; i < tracksData.length; i += batchSize) {
      const batch = tracksData.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1} (tracks ${i + 1} to ${Math.min(i + batchSize, tracksData.length)})`);
      
      // Process each track in the batch
      for (const trackData of batch) {
        await processTrack(trackData);
      }
    }
    
    console.log('Track import completed successfully');
  } catch (error) {
    console.error('Error importing tracks:', error);
    throw error;
  }
}

/**
 * Process a single track from the import data
 * 
 * @param trackData The track data from the import file
 */
async function processTrack(trackData: any): Promise<void> {
  try {
    // Basic validation
    if (!trackData.title || !trackData.artists || !trackData.artists.length || !trackData.artists[0].name) {
      console.warn('Skipping track due to missing required fields:', JSON.stringify(trackData).substring(0, 100) + '...');
      return;
    }
    
    // Check for Spotify ID (required for cross-platform resolution)
    if (!trackData.platforms?.spotify?.id) {
      console.warn('Skipping track due to missing Spotify ID:', trackData.title);
      return;
    }
    
    // Check if track already exists by Spotify ID
    const spotifyId = trackData.platforms.spotify.id;
    const existingPlatform = await db.select()
      .from(trackPlatformIds)
      .where(and(
        eq(trackPlatformIds.platform, 'spotify'),
        eq(trackPlatformIds.platformId, spotifyId)
      ))
      .limit(1);
    
    if (existingPlatform.length > 0) {
      console.log(`Track "${trackData.title}" already exists with Spotify ID: ${spotifyId}`);
      return;
    }
    
    // Prepare artists and get their IDs
    const artistIds = await processArtists(trackData.artists);
    
    // Process album or create default if missing
    let albumId: number | null = null;
    if (trackData.album) {
      albumId = await processAlbum(trackData.album, artistIds[0]);
    } else {
      // Create a default album named after the track
      albumId = await processAlbum({ 
        title: `${trackData.title} - Single`,
        coverImage: trackData.artists[0].picture || null,
        releaseDate: null
      }, artistIds[0]);
    }
    
    // Handle track duration (optional)
    const duration = trackData.duration || null;
    
    // Insert the track
    const [insertedTrack] = await db.insert(tracks)
      .values({
        title: trackData.title,
        duration: duration,
        albumId: albumId,
        releaseDate: trackData.releaseDate || null,
        explicit: trackData.explicit || false,
        previewUrl: trackData.previewUrl || null,
        popularity: trackData.popularity || null,
        // Initialize embedding as null
        embedding: null,
        
        // Audio features
        tempo: trackData.audioFeatures?.tempo || null,
        energy: trackData.audioFeatures?.energy || null,
        danceability: trackData.audioFeatures?.danceability || null,
        valence: trackData.audioFeatures?.valence || null,
        acousticness: trackData.audioFeatures?.acousticness || null,
        instrumentalness: trackData.audioFeatures?.instrumentalness || null,
        liveness: trackData.audioFeatures?.liveness || null,
        speechiness: trackData.audioFeatures?.speechiness || null
      })
      .returning();
    
    const trackId = insertedTrack.id;
    console.log(`Successfully inserted track "${trackData.title}" with ID ${trackId}`);
    
    // Link track to artists
    await linkTrackArtists(trackId, artistIds);
    
    // Add genre associations if present
    if (trackData.genres && Array.isArray(trackData.genres) && trackData.genres.length > 0) {
      await processGenres(trackId, trackData.genres);
    }
    
    // Add platform IDs
    if (trackData.platforms) {
      await processPlatforms(trackId, trackData.platforms);
    }
    
    // Queue track for cross-platform ID resolution if it has a Spotify ID
    console.log(`Queueing track ${trackId} for cross-platform ID resolution`);
    await queuePlatformResolution(trackId, spotifyId);
    
    // If audioFeatures is missing, queue for audio features retrieval from Spotify
    if (!trackData.audioFeatures && spotifyId) {
      await queueAudioFeaturesRetrieval(trackId, spotifyId);
    }
    
    return;
  } catch (error) {
    console.error(`Error processing track "${trackData.title}":`, error);
    throw error; 
  }
}

/**
 * Process the artists data, creating new artists if they don't exist
 * 
 * @param artistsData Array of artist objects from the import data
 * @returns Array of artist IDs
 */
async function processArtists(artistsData: any[]): Promise<number[]> {
  const artistIds: number[] = [];
  
  for (const artistData of artistsData) {
    if (!artistData.name) continue;
    
    // Check if artist already exists
    const existingArtist = await db.select()
      .from(artists)
      .where(eq(artists.name, artistData.name))
      .limit(1);
    
    if (existingArtist.length > 0) {
      artistIds.push(existingArtist[0].id);
    } else {
      // Create new artist
      const [insertedArtist] = await db.insert(artists)
        .values({
          name: artistData.name,
          picture: artistData.picture || null
        })
        .returning();
      
      artistIds.push(insertedArtist.id);
    }
  }
  
  return artistIds;
}

/**
 * Process the album data, creating a new album if it doesn't exist
 * 
 * @param albumData Album object from the import data
 * @param primaryArtistId ID of the primary artist
 * @returns ID of the album
 */
async function processAlbum(albumData: any, primaryArtistId: number): Promise<number> {
  if (!albumData.title) {
    throw new Error('Album title is required');
  }
  
  // Check if album already exists with this title
  const existingAlbum = await db.select()
    .from(albums)
    .where(eq(albums.title, albumData.title))
    .limit(1);
  
  if (existingAlbum.length > 0) {
    return existingAlbum[0].id;
  }
  
  // Create new album
  const [insertedAlbum] = await db.insert(albums)
    .values({
      title: albumData.title,
      coverImage: albumData.coverImage || null,
      releaseDate: albumData.releaseDate || null
    })
    .returning();
  
  return insertedAlbum.id;
}

/**
 * Link a track to its artists
 * 
 * @param trackId ID of the track
 * @param artistIds Array of artist IDs
 */
async function linkTrackArtists(trackId: number, artistIds: number[]): Promise<void> {
  for (let i = 0; i < artistIds.length; i++) {
    const artistId = artistIds[i];
    const isPrimary = i === 0; // First artist is considered primary
    
    await db.insert(tracksToArtists)
      .values({
        trackId: trackId,
        artistId: artistId,
        isPrimary: isPrimary
      })
      .onConflictDoNothing();
  }
}

/**
 * Process genre data, creating genres if they don't exist
 * 
 * @param trackId ID of the track
 * @param genreNames Array of genre names
 */
async function processGenres(trackId: number, genreNames: string[]): Promise<void> {
  for (const genreName of genreNames) {
    // Skip empty genre names
    if (!genreName.trim()) continue;
    
    // Check if genre exists
    let genreId: number;
    const existingGenre = await db.select()
      .from(genres)
      .where(eq(genres.name, genreName))
      .limit(1);
    
    if (existingGenre.length > 0) {
      genreId = existingGenre[0].id;
    } else {
      // Create new genre
      const [insertedGenre] = await db.insert(genres)
        .values({ name: genreName })
        .returning();
      
      genreId = insertedGenre.id;
    }
    
    // Link track to genre
    await db.insert(tracksToGenres)
      .values({
        trackId: trackId,
        genreId: genreId
      })
      .onConflictDoNothing();
  }
}

/**
 * Process platform IDs for a track
 * 
 * @param trackId ID of the track
 * @param platformsData Object containing platform IDs
 */
async function processPlatforms(trackId: number, platformsData: any): Promise<void> {
  const supportedPlatforms = [
    'spotify', 'apple_music', 'youtube', 'youtube_music',
    'amazon_music', 'tidal', 'deezer'
  ];
  
  for (const platform of supportedPlatforms) {
    const platformData = platformsData[platform];
    if (!platformData || !platformData.id) continue;
    
    await db.insert(trackPlatformIds)
      .values({
        trackId: trackId,
        platform: platform,
        platformId: platformData.id,
        platformUrl: platformData.url || null
      })
      .onConflictDoNothing();
  }
}

/**
 * Queue a track for cross-platform ID resolution
 * This function will send a request to the resolution service
 * 
 * @param trackId ID of the track
 * @param spotifyId Spotify ID of the track
 */
async function queuePlatformResolution(trackId: number, spotifyId: string): Promise<void> {
  try {
    // Import the service dynamically to avoid circular dependencies
    const { queueTrackForPlatformResolution } = await import('../services/odesli');
    
    // Queue the track for platform resolution
    await queueTrackForPlatformResolution(trackId, spotifyId);
  } catch (error) {
    console.error(`Error queueing track ${trackId} for platform resolution:`, error);
    // We don't throw here to avoid stopping the import process
  }
}

/**
 * Queue a track for audio features retrieval from Spotify
 * 
 * @param trackId ID of the track
 * @param spotifyId Spotify ID of the track
 */
async function queueAudioFeaturesRetrieval(trackId: number, spotifyId: string): Promise<void> {
  try {
    // Import the service dynamically to avoid circular dependencies
    const { queueTrackForAudioFeatures } = await import('../services/audio-features');
    
    // Queue the track for audio features retrieval
    if (typeof queueTrackForAudioFeatures === 'function') {
      await queueTrackForAudioFeatures(trackId, spotifyId);
    } else {
      console.warn('queueTrackForAudioFeatures function not available, audio features will not be fetched');
    }
  } catch (error) {
    console.error(`Error queueing track ${trackId} for audio features retrieval:`, error);
    // We don't throw here to avoid stopping the import process
  }
}