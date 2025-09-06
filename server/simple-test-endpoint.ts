/**
 * Super simplified test endpoint
 * This endpoint provides a simple mock response for testing with no dependencies
 */

import { Request, Response } from 'express';

export function handleTestModeImage(req: Request, res: Response) {
  // Explicitly set content type
  res.setHeader('Content-Type', 'application/json');
  
  // Create a timestamp for cache-busting
  const timestamp = Date.now();
  
  // Extract parameters if they exist
  const {
    prompt = 'Test prompt',
    negative_prompt = '',
    model = 'gpt-image-1'
  } = req.body || {};
  
  // Create a very simple response
  const response = {
    success: true,
    imageUrl: '/images/covers/default-cover.png',
    imageUrlWithTimestamp: `/images/covers/default-cover.png?timestamp=${timestamp}`,
    model,
    prompt,
    negative_prompt,
    method: 'test-simple'
  };
  
  // Send response as JSON
  return res.json(response);
}