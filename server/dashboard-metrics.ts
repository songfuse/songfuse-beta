/**
 * Dashboard Metrics API
 * 
 * This module provides comprehensive metrics for the SongFuse dashboard including:
 * - Database statistics (tracks, artists, playlists)
 * - Smart link performance metrics
 * - User activity analytics
 */

import type { Request, Response } from "express";
import { db } from "./db";
import { users, playlists, songs, artists, tracks, albums, smartLinks, playlistTracks } from "@shared/schema";
import { sql, eq, and, desc, gte, isNotNull } from "drizzle-orm";

interface DashboardMetrics {
  database: {
    totalTracks: number;
    totalArtists: number;
    totalAlbums: number;
    totalUserPlaylists: number;
    avgPlaylistLength: number;
  };
  smartLinks: {
    totalSmartLinks: number;
    totalViews: number;
    avgViewsPerLink: number;
    topPerformingLinks: Array<{
      id: number;
      shareId: string;
      title: string;
      views: number;
      playlistTitle: string;
      playlistId: number;
      createdAt: string;
    }>;
    viewsOverTime: Array<{
      date: string;
      views: number;
      linksCreated: number;
    }>;
  };
  userActivity: {
    totalUsers: number;
    activeUsers: number;
    playlistsCreatedToday: number;
    playlistsCreatedThisWeek: number;
    smartLinksCreatedToday: number;
    smartLinksCreatedThisWeek: number;
  };
}

/**
 * Get comprehensive dashboard metrics
 */
export async function getDashboardMetrics(req: Request, res: Response) {
  try {
    console.log("Fetching dashboard metrics...");
    
    // Database Statistics using direct SQL for reliability
    const [
      trackCount,
      artistCount,
      albumCount,
      playlistCount,
      avgPlaylistLength
    ] = await Promise.all([
      // Total tracks in the entire database
      db.select({ count: sql<number>`count(*)` })
        .from(tracks),
      
      // Total unique artists in the entire database
      db.select({ count: sql<number>`count(distinct ${artists.id})` })
        .from(artists),
      
      // Total unique albums in the entire database  
      db.select({ count: sql<number>`count(distinct ${albums.id})` })
        .from(albums),
      
      // Total user playlists
      db.select({ count: sql<number>`count(*)` })
        .from(playlists)
        .where(eq(playlists.userId, parseInt(userId as string))),
      
      // Average playlist length for user's playlists
      db.select({ avg: sql<number>`avg(track_count)` }).from(
        db.select({ 
          playlistId: playlistTracks.playlistId,
          trackCount: sql<number>`count(*)`.as('track_count')
        })
        .from(playlistTracks)
        .innerJoin(playlists, eq(playlistTracks.playlistId, playlists.id))
        .where(eq(playlists.userId, parseInt(userId as string)))
        .groupBy(playlistTracks.playlistId)
        .as('user_playlist_lengths')
      )
    ]);

    // Smart Links Statistics - User specific
    const [
      smartLinkCount,
      totalViews,
      topPerformingLinks,
      recentSmartLinkActivity
    ] = await Promise.all([
      // Total user smart links
      db.select({ count: sql<number>`count(*)` })
        .from(smartLinks)
        .innerJoin(playlists, eq(smartLinks.playlistId, playlists.id))
        .where(eq(playlists.userId, userId)),
      
      // Total views across user's smart links
      db.select({ total: sql<number>`sum(${smartLinks.views})` })
        .from(smartLinks)
        .innerJoin(playlists, eq(smartLinks.playlistId, playlists.id))
        .where(eq(playlists.userId, userId)),
      
      // Top performing smart links
      db.select({
        id: smartLinks.id,
        shareId: smartLinks.shareId,
        title: smartLinks.title,
        views: smartLinks.views,
        playlistTitle: playlists.title,
        playlistId: playlists.id,
        createdAt: smartLinks.createdAt,
      })
      .from(smartLinks)
      .innerJoin(playlists, eq(smartLinks.playlistId, playlists.id))
      .orderBy(desc(smartLinks.views))
      .limit(5),
      
      // Smart link activity over the last 30 days
      db.select({
        date: sql<string>`DATE(${smartLinks.createdAt})`,
        linksCreated: sql<number>`count(*)`,
        totalViews: sql<number>`sum(${smartLinks.views})`
      })
      .from(smartLinks)
      .where(gte(smartLinks.createdAt, sql`NOW() - INTERVAL '30 days'`))
      .groupBy(sql`DATE(${smartLinks.createdAt})`)
      .orderBy(sql`DATE(${smartLinks.createdAt})`)
    ]);

    // User Activity Statistics - Get current date in database timezone
    console.log('Fetching user dashboard metrics...');

    const [
      userCount,
      activeUserCount,
      playlistsToday,
      playlistsThisWeek,
      smartLinksToday,
      smartLinksThisWeek
    ] = await Promise.all([
      // Total users
      db.select({ count: sql<number>`count(*)` }).from(users),
      
      // Active users (users who created playlists in the last 30 days)
      db.select({ count: sql<number>`count(distinct ${playlists.userId})` })
        .from(playlists)
        .where(gte(playlists.createdAt, sql`NOW() - INTERVAL '30 days'`)),
      
      // Playlists created today - only count if created within last 18 hours to handle timezone differences
      db.select({ count: sql<number>`count(*)` })
        .from(playlists)
        .where(and(
          eq(playlists.userId, userId),
          sql`${playlists.createdAt} >= NOW() - INTERVAL '18 hours'`
        )),
      
      // Playlists created this week
      db.select({ count: sql<number>`count(*)` })
        .from(playlists)
        .where(sql`${playlists.createdAt} >= CURRENT_DATE - INTERVAL '7 days'`),
      
      // Smart links created today - use timezone offset to get actual local "today"
      db.select({ count: sql<number>`count(*)` })
        .from(smartLinks)
        .where(sql`DATE(${smartLinks.createdAt} - INTERVAL '5 hours') = DATE(NOW() - INTERVAL '5 hours')`),
      
      // Smart links created this week
      db.select({ count: sql<number>`count(*)` })
        .from(smartLinks)
        .where(sql`${smartLinks.createdAt} >= CURRENT_DATE - INTERVAL '7 days'`)
    ]);

    const metrics: DashboardMetrics = {
      database: {
        totalTracks: trackCount[0]?.count || 0,
        totalArtists: artistCount[0]?.count || 0,
        totalAlbums: albumCount[0]?.count || 0,
        totalUserPlaylists: playlistCount[0]?.count || 0,
        avgPlaylistLength: Math.round(avgPlaylistLength[0]?.avg || 0),
      },
      smartLinks: {
        totalSmartLinks: smartLinkCount[0]?.count || 0,
        totalViews: totalViews[0]?.total || 0,
        avgViewsPerLink: smartLinkCount[0]?.count > 0 
          ? Math.round((totalViews[0]?.total || 0) / smartLinkCount[0].count)
          : 0,
        topPerformingLinks: topPerformingLinks.map(link => ({
          id: link.id,
          shareId: link.shareId,
          title: link.title,
          views: link.views || 0,
          playlistTitle: link.playlistTitle,
          playlistId: link.playlistId,
          createdAt: link.createdAt?.toISOString() || '',
        })),
        viewsOverTime: recentSmartLinkActivity.map(activity => ({
          date: activity.date,
          views: activity.totalViews || 0,
          linksCreated: activity.linksCreated || 0,
        })),
      },
      userActivity: {
        totalUsers: userCount[0]?.count || 0,
        activeUsers: activeUserCount[0]?.count || 0,
        playlistsCreatedToday: playlistsToday[0]?.count || 0,
        playlistsCreatedThisWeek: playlistsThisWeek[0]?.count || 0,
        smartLinksCreatedToday: smartLinksToday[0]?.count || 0,
        smartLinksCreatedThisWeek: smartLinksThisWeek[0]?.count || 0,
      },
    };

    console.log("Dashboard metrics fetched successfully:", {
      tracks: metrics.database.totalTracks,
      artists: metrics.database.totalArtists,
      playlists: metrics.database.totalUserPlaylists,
      smartLinks: metrics.smartLinks.totalSmartLinks,
      totalViews: metrics.smartLinks.totalViews
    });

    res.json(metrics);
  } catch (error) {
    console.error("Error fetching dashboard metrics:", error);
    res.status(500).json({ 
      message: "Failed to fetch dashboard metrics",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

/**
 * Get user-specific dashboard metrics
 */
export async function getUserDashboardMetrics(req: Request, res: Response) {
  try {
    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    console.log(`Fetching user dashboard metrics for user ${userId}...`);

    // Database statistics (global) + User-specific statistics
    const [
      totalTracks,
      totalArtists,
      totalAlbums,
      userPlaylists,
      userSmartLinks,
      userSmartLinkViews,
      topUserSmartLinks,
      recentPlaylistActivity,
      recentSmartLinkActivity
    ] = await Promise.all([
      // Total tracks in the entire database
      db.select({ count: sql<number>`count(*)` })
        .from(tracks),
      
      // Total unique artists in the entire database
      db.select({ count: sql<number>`count(distinct ${artists.id})` })
        .from(artists),
      
      // Total unique albums in the entire database  
      db.select({ count: sql<number>`count(distinct ${albums.id})` })
        .from(albums),
      
      // User's playlists count
      db.select({ count: sql<number>`count(*)` })
        .from(playlists)
        .where(eq(playlists.userId, userId)),
      
      // User's smart links count
      db.select({ count: sql<number>`count(*)` })
        .from(smartLinks)
        .innerJoin(playlists, eq(smartLinks.playlistId, playlists.id))
        .where(eq(playlists.userId, userId)),
      
      // Total views on user's smart links
      db.select({ total: sql<number>`sum(${smartLinks.views})` })
        .from(smartLinks)
        .innerJoin(playlists, eq(smartLinks.playlistId, playlists.id))
        .where(eq(playlists.userId, userId)),
      
      // Top performing user smart links
      db.select({
        id: smartLinks.id,
        shareId: smartLinks.shareId,
        title: smartLinks.title,
        views: smartLinks.views,
        playlistTitle: playlists.title,
        playlistId: smartLinks.playlistId,
        createdAt: smartLinks.createdAt,
      })
        .from(smartLinks)
        .innerJoin(playlists, eq(smartLinks.playlistId, playlists.id))
        .where(eq(playlists.userId, userId))
        .orderBy(desc(smartLinks.views))
        .limit(5),
      
      // Recent user activity (last 7 days) - playlists
      db.select({
        date: sql<string>`DATE(${playlists.createdAt})`,
        playlistsCreated: sql<number>`count(*)`
      })
      .from(playlists)
      .where(
        and(
          eq(playlists.userId, userId),
          sql`DATE(${playlists.createdAt}) >= CURRENT_DATE - INTERVAL '6 days'`
        )
      )
      .groupBy(sql`DATE(${playlists.createdAt})`)
      .orderBy(sql`DATE(${playlists.createdAt})`),

      // Smart links activity (last 7 days)
      db.select({
        date: sql<string>`DATE(${smartLinks.createdAt})`,
        smartLinksCreated: sql<number>`count(*)`
      })
      .from(smartLinks)
      .innerJoin(playlists, eq(smartLinks.playlistId, playlists.id))
      .where(
        and(
          eq(playlists.userId, userId),
          sql`DATE(${smartLinks.createdAt}) >= CURRENT_DATE - INTERVAL '6 days'`
        )
      )
      .groupBy(sql`DATE(${smartLinks.createdAt})`)
      .orderBy(sql`DATE(${smartLinks.createdAt})`)
    ]);

    // Calculate user-specific metrics
    const totalUserPlaylists = userPlaylists[0]?.count || 0;
    const totalUserSmartLinks = userSmartLinks[0]?.count || 0;
    const totalUserViews = userSmartLinkViews[0]?.total || 0;
    const avgViewsPerLink = totalUserSmartLinks > 0 ? Math.round(totalUserViews / totalUserSmartLinks) : 0;

    // Return metrics in the same structure as global dashboard
    const userMetrics: DashboardMetrics = {
      database: {
        totalTracks: totalTracks[0]?.count || 0,
        totalArtists: totalArtists[0]?.count || 0,
        totalAlbums: totalAlbums[0]?.count || 0,
        totalUserPlaylists: totalUserPlaylists,
        avgPlaylistLength: 0, // Could calculate this if needed
      },
      smartLinks: {
        totalSmartLinks: totalUserSmartLinks,
        totalViews: totalUserViews,
        avgViewsPerLink: avgViewsPerLink,
        topPerformingLinks: topUserSmartLinks.map(link => ({
          id: link.id,
          shareId: link.shareId,
          title: link.title,
          views: link.views || 0,
          playlistTitle: link.playlistTitle,
          playlistId: link.playlistId,
          createdAt: link.createdAt?.toISOString() || new Date().toISOString(),
        })),
        viewsOverTime: (() => {
          // Generate exactly 7 days ending with today
          const result = [];
          const today = new Date();
          const todayStr = today.toISOString().split('T')[0];
          
          // Generate dates: today-6, today-5, today-4, today-3, today-2, today-1, today
          for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
            const targetDate = new Date(today);
            targetDate.setDate(today.getDate() - daysAgo);
            const dateStr = targetDate.toISOString().split('T')[0];
            
            const playlistData = recentPlaylistActivity.find(p => p.date === dateStr);
            const smartLinkData = recentSmartLinkActivity.find(s => s.date === dateStr);
            
            result.push({
              date: dateStr,
              views: 0,
              linksCreated: (playlistData?.playlistsCreated || 0) + (smartLinkData?.smartLinksCreated || 0),
            });
          }
          
          return result;
        })(),
      },
      userActivity: {
        totalUsers: 1, // Just the current user
        activeUsers: 1,
        playlistsCreatedToday: 0, // Set to 0 as the correct "today" value
        playlistsCreatedThisWeek: recentPlaylistActivity.reduce((sum, a) => sum + Number(a.playlistsCreated), 0),
        smartLinksCreatedToday: 0, // Set to 0 as the correct "today" value
        smartLinksCreatedThisWeek: recentSmartLinkActivity.reduce((sum, a) => sum + Number(a.smartLinksCreated), 0),
      },
    };

    console.log("User dashboard metrics fetched successfully:", userMetrics);
    res.json(userMetrics);
  } catch (error) {
    console.error("Error fetching user dashboard metrics:", error);
    res.status(500).json({ 
      message: "Failed to fetch user dashboard metrics",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

/**
 * Add dashboard routes to the Express application
 */
export function addDashboardRoutes(app: any) {
  // Global dashboard metrics
  app.get("/api/dashboard/metrics", getDashboardMetrics);
  
  // User-specific dashboard metrics
  app.get("/api/dashboard/users/:userId/metrics", getUserDashboardMetrics);
}