/**
 * Test routes for verifying functionality of various modules
 * These routes are used for diagnostic purposes and testing only
 */

import express, { Request, Response } from 'express';

/**
 * Test endpoint for the assistant-playlist track finder function
 * This endpoint tests the exact same findTrackInDatabase function used in the production code
 */
export async function testAssistantTrackMatcher(req: Request, res: Response) {
  try {
    const { title, artist } = req.body;
    
    if (!title) {
      return res.status(400).json({
        success: false,
        message: "Track title is required"
      });
    }
    
    // Import the function from assistant-playlist
    const { findTrackInDatabase } = await import('./services/assistant-playlist');
    if (!findTrackInDatabase) {
      throw new Error("Function findTrackInDatabase not found");
    }
    
    // Call the function with the provided parameters
    const result = await findTrackInDatabase(title, artist);
    
    if (!result) {
      return res.json({
        success: false,
        message: "Track not found"
      });
    }
    
    // Return a simplified response with more reliable property access
    return res.json({
      success: true,
      track: {
        id: result.id,
        dbId: 'dbId' in result ? result.dbId : ('databaseId' in result ? result.databaseId : result.id),
        title: 'name' in result ? result.name : ('title' in result ? result.title : ""),
        artist: 'artists' in result && Array.isArray(result.artists) && result.artists.length > 0 
               ? result.artists[0].name : "",
        spotifyId: 'id' in result ? result.id : ""
      }
    });
  } catch (error) {
    console.error("Error testing assistant track matcher:", error);
    return res.status(500).json({
      success: false,
      message: `Error: ${error.message || "Unknown error"}`
    });
  }
}

/**
 * Test endpoint for exact title matching
 * This uses the new case-insensitive matching from track-matcher.ts
 */
export async function testExactTitleMatch(req: Request, res: Response) {
  try {
    const { title } = req.body;
    
    if (!title) {
      return res.status(400).json({
        success: false,
        message: "Track title is required"
      });
    }
    
    // Import the function from track-matcher
    const { findTrackByExactTitle } = await import('./services/track-matcher');
    
    // Call the function with the provided title
    const track = await findTrackByExactTitle(title);
    
    // Return appropriate response
    if (!track) {
      return res.json({
        success: false,
        message: `No track found with title "${title}"`
      });
    }
    
    return res.json({
      success: true,
      track: {
        id: track.id,
        title: track.title,
        releaseDate: track.releaseDate,
        duration: track.duration,
        popularity: track.popularity,
        explicit: track.explicit
      }
    });
  } catch (error) {
    console.error("Error in exact title match test:", error);
    return res.status(500).json({
      success: false,
      message: `Error: ${error instanceof Error ? error.message : "Unknown error"}`
    });
  }
}

/**
 * Test endpoint for exact title+artist matching
 * This uses the new case-insensitive + normalized matching from track-matcher.ts
 */
export async function testExactTitleArtistMatch(req: Request, res: Response) {
  try {
    const { title, artist } = req.body;
    
    if (!title) {
      return res.status(400).json({
        success: false,
        message: "Track title is required"
      });
    }

    if (!artist) {
      return res.status(400).json({
        success: false,
        message: "Artist name is required"
      });
    }
    
    // Log the input values for debugging
    console.log(`------ EXACT TITLE+ARTIST TEST ------`);
    console.log(`Input: title="${title}", artist="${artist}"`);
    
    // Show normalized values 
    const normalizedTitle = title
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // Remove accents
      .replace(/[\s.',":_\-!?]/g, '')  // Remove punctuation
      .toLowerCase();
      
    const normalizedArtist = artist
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // Remove accents
      .replace(/[\s.',":_\-!?]/g, '')  // Remove punctuation
      .toLowerCase();
      
    console.log(`Normalized: title="${normalizedTitle}", artist="${normalizedArtist}"`);
    
    // Import the function from track-matcher
    const { findTrackByExactTitleAndArtist } = await import('./services/track-matcher');
    
    // Call the function with the provided title and artist
    const track = await findTrackByExactTitleAndArtist(title, artist);
    
    // Return appropriate response
    if (!track) {
      return res.json({
        success: false,
        message: `No track found with title "${title}" and artist "${artist}"`
      });
    }
    
    // Get the artist name for the track
    const { db } = await import('./db');
    const { tracksToArtists, artists } = await import('../shared/schema');
    const { eq } = await import('drizzle-orm');
    
    const artistData = await db
      .select({
        artist: artists
      })
      .from(tracksToArtists)
      .innerJoin(
        artists, 
        eq(tracksToArtists.artistId, artists.id)
      )
      .where(
        eq(tracksToArtists.trackId, track.id)
      )
      .limit(1);
      
    const artistName = artistData.length > 0 ? artistData[0].artist.name : "Unknown";
    
    return res.json({
      success: true,
      track: {
        id: track.id,
        title: track.title,
        artist: artistName,
        releaseDate: track.releaseDate,
        duration: track.duration,
        popularity: track.popularity,
        explicit: track.explicit
      }
    });
  } catch (error) {
    console.error("Error in exact title+artist match test:", error);
    return res.status(500).json({
      success: false,
      message: `Error: ${error instanceof Error ? error.message : "Unknown error"}`
    });
  }
}

/**
 * Add all test routes to the Express app
 */
export function addTestRoutes(app: express.Application) {
  app.post('/api/test/assistant-track-matcher', testAssistantTrackMatcher);
  app.post('/api/test/exact-title-match', testExactTitleMatch);
  app.post('/api/test/title-artist-match', testExactTitleArtistMatch);
  console.log('Test routes registered');
}