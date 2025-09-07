/**
 * Background service for Odesli platform resolution
 * This service runs continuously in the background and processes tracks
 * that need platform resolution (smart links)
 */
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { trackPlatformIds } from '@shared/schema';
import { eq } from 'drizzle-orm';

interface OdesliResponse {
  entityUniqueId: string;
  userCountry: string;
  linksByPlatform: {
    [key: string]: {
      entityUniqueId: string;
      url: string;
      nativeAppUriMobile?: string;
      nativeAppUriDesktop?: string;
    }
  };
  entitiesByUniqueId: {
    [key: string]: {
      id: string;
      type: string;
      title?: string;
      artistName?: string;
      thumbnailUrl?: string;
      thumbnailWidth?: number;
      thumbnailHeight?: number;
      apiProvider: string;
      platforms: string[];
    }
  };
}

class OdesliBackgroundService {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 5; // Process 5 tracks at a time
  private readonly INTERVAL_MS = 30000; // Check every 30 seconds
  private readonly MAX_RETRIES = 3;

  constructor() {
    console.log('🎵 Odesli Background Service initialized');
  }

  /**
   * Start the background service
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️  Odesli Background Service is already running');
      return;
    }

    console.log('🚀 Starting Odesli Background Service...');
    this.isRunning = true;

    // Start processing immediately
    this.processTracks();

    // Set up interval for continuous processing
    this.intervalId = setInterval(() => {
      this.processTracks();
    }, this.INTERVAL_MS);

    console.log(`✅ Odesli Background Service started (checking every ${this.INTERVAL_MS / 1000}s)`);
  }

  /**
   * Stop the background service
   */
  stop() {
    if (!this.isRunning) {
      console.log('⚠️  Odesli Background Service is not running');
      return;
    }

    console.log('🛑 Stopping Odesli Background Service...');
    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    console.log('✅ Odesli Background Service stopped');
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      intervalMs: this.INTERVAL_MS,
      batchSize: this.BATCH_SIZE
    };
  }

  /**
   * Process tracks that need platform resolution
   */
  private async processTracks() {
    try {
      // Get count of tracks that need platform resolution
      const tracksToProcessQuery = await db.execute(sql`
        SELECT COUNT(*) as count
        FROM tracks t
        WHERE EXISTS (
          SELECT 1 FROM track_platform_ids pl
          WHERE pl.track_id = t.id
          AND pl.platform = 'spotify'
        )
        AND NOT EXISTS (
          SELECT 1 FROM track_platform_ids pl2
          WHERE pl2.track_id = t.id
          AND pl2.platform IN ('youtube', 'apple_music', 'amazon_music', 'tidal', 'deezer')
        )
      `);

      const totalTracks = parseInt(tracksToProcessQuery.rows[0].count as string);

      if (totalTracks === 0) {
        console.log('✅ No tracks need platform resolution');
        return;
      }

      console.log(`🎯 Found ${totalTracks} tracks that need platform resolution`);

      // Get a batch of tracks to process
      const tracksQuery = await db.execute(sql`
        SELECT t.id, t.title, pl.platform_id as spotify_id
        FROM tracks t
        JOIN track_platform_ids pl ON pl.track_id = t.id
        WHERE pl.platform = 'spotify'
        AND NOT EXISTS (
          SELECT 1 FROM track_platform_ids pl2
          WHERE pl2.track_id = t.id
          AND pl2.platform IN ('youtube', 'apple_music', 'amazon_music', 'tidal', 'deezer')
        )
        ORDER BY t.id
        LIMIT ${this.BATCH_SIZE}
      `);

      const tracks = tracksQuery.rows as Array<{ id: number; title: string; spotify_id: string }>;

      if (tracks.length === 0) {
        console.log('✅ No tracks in current batch');
        return;
      }

      console.log(`🔄 Processing batch of ${tracks.length} tracks...`);

      // Process each track
      for (const track of tracks) {
        await this.resolveTrackPlatforms(track.id, track.title, track.spotify_id);
        
        // Add a small delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      console.log(`✅ Processed batch of ${tracks.length} tracks`);

    } catch (error) {
      console.error('❌ Error in Odesli Background Service:', error);
    }
  }

  /**
   * Resolve platform IDs for a specific track using Odesli API
   */
  private async resolveTrackPlatforms(trackId: number, trackTitle: string, spotifyId: string) {
    try {
      console.log(`🔍 Resolving platforms for track ${trackId}: ${trackTitle} (Spotify ID: ${spotifyId})`);

      const spotifyUrl = `https://open.spotify.com/track/${spotifyId}`;
      
      const response = await fetch('https://api.song.link/v1-alpha/links', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: spotifyUrl,
          userCountry: 'US',
          songIfSingle: true
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Odesli API returned ${response.status}: ${response.statusText} - ${errorText}`);
      }

      const data: OdesliResponse = await response.json();

      // Extract platform IDs from the response
      const platformMappings: { [key: string]: string } = {
        'spotify': 'spotify',
        'youtubeMusic': 'youtube',
        'appleMusic': 'apple_music',
        'amazonMusic': 'amazon_music',
        'tidal': 'tidal',
        'deezer': 'deezer'
      };

      let platformsAdded = 0;

      for (const [platform, linkData] of Object.entries(data.linksByPlatform)) {
        const dbPlatform = platformMappings[platform];
        if (dbPlatform && dbPlatform !== 'spotify') {
          try {
            // Extract platform ID from URL
            const platformId = this.extractPlatformId(platform, linkData.url);
            if (platformId) {
              await db.insert(trackPlatformIds).values({
                trackId: trackId,
                platform: dbPlatform,
                platformId: platformId
              }).onConflictDoNothing();

              platformsAdded++;
            }
          } catch (error) {
            console.error(`Error adding ${dbPlatform} platform ID for track ${trackId}:`, error);
          }
        }
      }

      console.log(`✅ Found ${platformsAdded} platform IDs for track ${trackId}`);

    } catch (error) {
      console.error(`❌ Error resolving platforms for track ${trackId}:`, error);
    }
  }

  /**
   * Extract platform ID from URL
   */
  private extractPlatformId(platform: string, url: string): string | null {
    try {
      const urlObj = new URL(url);
      
      switch (platform) {
        case 'youtubeMusic':
          const youtubeMatch = url.match(/[?&]v=([^&]+)/);
          return youtubeMatch ? youtubeMatch[1] : null;
          
        case 'apple_music':
          const appleMatch = url.match(/\/album\/[^\/]+\/(\d+)/);
          return appleMatch ? appleMatch[1] : null;
          
        case 'amazonMusic':
          const amazonMatch = url.match(/\/track\/([^\/\?]+)/);
          return amazonMatch ? amazonMatch[1] : null;
          
        case 'tidal':
          const tidalMatch = url.match(/\/track\/(\d+)/);
          return tidalMatch ? tidalMatch[1] : null;
          
        case 'deezer':
          const deezerMatch = url.match(/\/track\/(\d+)/);
          return deezerMatch ? deezerMatch[1] : null;
          
        default:
          return null;
      }
    } catch (error) {
      console.error(`Error extracting platform ID from ${url}:`, error);
      return null;
    }
  }
}

// Export singleton instance
export const odesliBackgroundService = new OdesliBackgroundService();
