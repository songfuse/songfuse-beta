import { Request, Response } from 'express';

/**
 * Simplified Tracks Endpoint
 * This endpoint provides a minimal representation of track data
 * with just the essential fields needed for reference
 */
export function addSimplifiedTracksEndpoint(app: any) {
  app.get("/api/simplified-tracks", async (req: Request, res: Response) => {
    try {
      // Dynamically import the pool to avoid circular dependencies
      const { pool } = await import('./db');
      
      console.log("Starting simplified tracks export...");
      
      // Use a simplified SQL query to get only essential data
      const query = `
        WITH artist_details AS (
          SELECT 
            ta.track_id,
            JSONB_AGG(
              JSONB_BUILD_OBJECT(
                'id', a.id, 
                'name', a.name, 
                'isPrimary', ta.is_primary
              ) ORDER BY ta.is_primary DESC, a.name
            ) as artists_data
          FROM 
            tracks_to_artists ta
          JOIN 
            artists a ON ta.artist_id = a.id
          GROUP BY 
            ta.track_id
        )
        SELECT 
          t.id as track_id,
          t.title,
          tpi.platform_id as spotify_id,
          ad.artists_data
        FROM 
          tracks t
        JOIN 
          artist_details ad ON t.id = ad.track_id
        LEFT JOIN 
          track_platform_ids tpi ON t.id = tpi.track_id AND tpi.platform = 'spotify'
        ORDER BY 
          t.id
      `;
      
      // Execute the query
      const result = await pool.query(query);
      
      if (!result || !result.rows || result.rows.length === 0) {
        console.log("No tracks found in the database");
        return res.status(404).json([]);
      }

      // Define interfaces for the simplified artist data
      interface SimpleArtistData {
        id: number;
        name: string;
        isPrimary: boolean;
      }

      // Transform the tracks to a simplified format
      const simplifiedTracks = result.rows.map(track => {
        // Parse the artists_data JSON array
        let artists: SimpleArtistData[] = [];
        try {
          // Parse artist data safely
          const artistsData = track.artists_data || '[]';
          artists = Array.isArray(artistsData) ? artistsData : 
            (typeof artistsData === 'string' ? JSON.parse(artistsData) : 
            (artistsData ? [artistsData] : []));
        } catch (e) {
          console.log(`Error parsing artists data for track ${track.track_id}:`, e);
          artists = [];
        }

        // Create a formatted artist string
        const artistString = artists
          .map((a: SimpleArtistData) => a.name)
          .filter(Boolean)
          .join(", ");

        return {
          id: track.track_id,          // Database track ID
          title: track.title,          // Track title
          artists: artists,            // Array of artist objects
          artist: artistString,        // String of artist names
          spotifyId: track.spotify_id  // Spotify platform ID
        };
      });

      console.log(`Exporting ${simplifiedTracks.length} simplified tracks`);
      
      // Return the simplified tracks array
      return res.json(simplifiedTracks);
    } catch (error) {
      console.error("Simplified track export error:", error);
      return res.status(500).json({ error: "Failed to export simplified tracks" });
    }
  });

  console.log("Simplified tracks endpoint registered");
}