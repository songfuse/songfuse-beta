import { Request, Response, NextFunction } from 'express';

/**
 * API route wrapper to ensure proper JSON error handling
 * This wrapper ensures all API routes return JSON responses, even when errors occur
 * 
 * @param handler The async API route handler
 * @returns A wrapped handler that catches errors and ensures JSON responses
 */
export function apiHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Set content type to application/json for all API routes
    res.setHeader('Content-Type', 'application/json');
    
    try {
      // Execute the original handler
      await handler(req, res, next);
      
      // If the handler doesn't explicitly end the response, handle it here
      if (!res.headersSent) {
        res.status(200).json({ success: true, message: "Operation completed but no data returned" });
      }
    } catch (error) {
      console.error(`API error in ${req.method} ${req.path}:`, error);
      
      // Ensure we send a proper JSON error response
      if (!res.headersSent) {
        const status = (error as any)?.status || (error as any)?.statusCode || 500;
        const message = (error instanceof Error) ? error.message : String(error) || "Internal Server Error";
        
        res.status(status).json({
          success: false,
          error: message,
          status,
          path: req.path
        });
      }
      
      // Don't pass the error to next() as that would trigger Express's HTML error handler
      // next(error); - Commented out to prevent HTML error pages
    }
  };
}

/**
 * Middleware to catch any errors that might have been missed
 * This is a last-resort handler to ensure we never return HTML for API errors
 */
export function apiErrorMiddleware(err: any, req: Request, res: Response, next: NextFunction) {
  // Only handle API routes
  if (!req.path.startsWith('/api/')) {
    return next(err);
  }
  
  console.error(`API error middleware caught error in ${req.method} ${req.path}:`, err);
  
  // Ensure we send a proper JSON error response
  if (!res.headersSent) {
    const status = (err as any)?.status || (err as any)?.statusCode || 500;
    const message = (err instanceof Error) ? err.message : String(err) || "Internal Server Error";
    
    res.status(status).json({
      success: false,
      error: message,
      status,
      path: req.path,
      handledBy: "apiErrorMiddleware"
    });
  }
  
  // Don't pass the error to next() as that would trigger Express's HTML error handler
}