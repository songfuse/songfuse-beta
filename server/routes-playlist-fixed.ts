import express, { Request, Response, Router, NextFunction } from "express";
import { getPlaylistByIdDirect } from './direct-db-access';

/**
 * This is a simplified version of the playlist endpoints that uses direct
 * database access to avoid schema mismatches and ensure tracks are properly fetched
 * from the database.
 */
export function createPlaylistRoutes(): Router {
  const router = express.Router();

  // Get a playlist by ID
  router.get("/api/playlist/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Use our direct DB access function for playlists
      return getPlaylistByIdDirect(req, res);
    } catch (error) {
      next(error);
    }
  });

  return router;
}