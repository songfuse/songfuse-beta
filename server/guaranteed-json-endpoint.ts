import express, { Request, Response } from 'express';

/**
 * Guaranteed JSON Endpoint
 * 
 * This module provides a guaranteed JSON-only endpoint that strictly
 * enforces proper content type headers and always returns valid JSON.
 * It's designed to help diagnose and fix issues with JSON parsing
 * in the application.
 */

/**
 * Handle JSON test requests with guaranteed JSON responses
 */
export function handleJsonTest(req: Request, res: Response) {
  // Always set proper JSON headers
  res.setHeader('Content-Type', 'application/json');
  
  try {
    // Echo back what was sent, along with metadata
    const responseData = {
      success: true,
      timestamp: new Date().toISOString(),
      requestData: req.body,
      serverInfo: {
        environment: process.env.NODE_ENV || 'unknown',
        timestamp: Date.now()
      }
    };
    
    // Ensure we're returning valid JSON
    res.status(200).json(responseData);
  } catch (error) {
    // Even errors will be formatted as proper JSON
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Add the JSON test endpoint to the Express app
 */
export function addJsonTestEndpoint(app: express.Application) {
  app.post('/api/json-test', (req: Request, res: Response) => {
    handleJsonTest(req, res);
  });
  
  console.log('Guaranteed JSON test endpoint registered at /api/json-test');
}