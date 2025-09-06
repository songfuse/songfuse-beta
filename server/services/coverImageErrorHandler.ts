import { Request, Response } from 'express';

/**
 * Cover Image API Error Handler
 * 
 * This utility wraps cover image API endpoints to ensure they always return valid
 * JSON responses, even when errors occur. This prevents the Vite middleware from
 * returning HTML error pages for API routes.
 */

/**
 * Wrap the cover image generation API endpoint with proper error handling
 * 
 * @param req Express request object
 * @param res Express response object
 * @param handler The original handler function
 */
export async function handleCoverGenerateRequest(
  req: Request, 
  res: Response,
  handler: (req: Request, res: Response) => Promise<any>
) {
  // Always set content type to application/json for API routes
  res.setHeader('Content-Type', 'application/json');
  
  try {
    // Execute the handler with our request and response
    await handler(req, res);
    
    // If the handler doesn't explicitly end the response, handle it here
    if (!res.headersSent) {
      console.log("Cover generate: No response sent by handler");
      res.status(200).json({ 
        success: false,
        error: "No response from image generation service" 
      });
    }
  } catch (error) {
    // Log the error for debugging
    console.error("Cover generation API error:", error);
    
    // Ensure we send a proper JSON error response
    const status = (error as any)?.status || (error as any)?.statusCode || 500;
    const message = (error instanceof Error) ? error.message : String(error);
    
    if (!res.headersSent) {
      res.status(status).json({
        success: false,
        error: message
      });
    }
  }
}

/**
 * Wrap the cover image upload API endpoint with proper error handling
 * 
 * @param req Express request object
 * @param res Express response object
 * @param handler The original handler function
 */
export async function handleCoverUploadRequest(
  req: Request, 
  res: Response,
  handler: (req: Request, res: Response) => Promise<any>
) {
  // Always set content type to application/json for API routes
  res.setHeader('Content-Type', 'application/json');
  
  try {
    // Execute the handler with our request and response
    await handler(req, res);
    
    // If the handler doesn't explicitly end the response, handle it here
    if (!res.headersSent) {
      console.log("Cover upload: No response sent by handler");
      res.status(200).json({ 
        success: false,
        error: "No response from image upload service" 
      });
    }
  } catch (error) {
    // Log the error for debugging
    console.error("Cover upload API error:", error);
    
    // Ensure we send a proper JSON error response
    const status = (error as any)?.status || (error as any)?.statusCode || 500;
    const message = (error instanceof Error) ? error.message : String(error);
    
    if (!res.headersSent) {
      res.status(status).json({
        success: false,
        error: message
      });
    }
  }
}