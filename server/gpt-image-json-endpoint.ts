import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import OpenAI from 'openai';
import { generateOpenAIImage, preparePromptForGptImage } from './services/openaiImageService';

/**
 * Guaranteed JSON Endpoint for GPT Image Generation
 * 
 * This module provides a guaranteed JSON-only endpoint that strictly
 * enforces proper content type headers and always returns valid JSON
 * for GPT image generation requests.
 */

// Directory to store generated images
const IMAGE_DIR = path.join(process.cwd(), 'public', 'images', 'covers');

// Ensure the directory exists
if (!fs.existsSync(IMAGE_DIR)) {
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
  console.log(`Created image directory: ${IMAGE_DIR}`);
}

/**
 * Direct image generation for testing bypassing the service layer
 */
async function directImageGeneration(params: {
  prompt: string;
  model: string;
  negative_prompt?: string;
}): Promise<string | null> {
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    const requestParams: any = {
      prompt: params.prompt,
      n: 1,
      model: params.model,
    };
    
    // Set model-specific parameters
    if (params.model === 'gpt-image-1') {
      // gpt-image-1 only supports 1024x1024 size
      requestParams.size = '1024x1024';
      
      // Add quality parameter (low for faster response)
      requestParams.quality = 'low';
      console.log('Using low quality for gpt-image-1 for faster response');
      
      // gpt-image-1 doesn't support negative_prompt parameter
      if (params.negative_prompt) {
        console.log('Note: Negative prompt is ignored for gpt-image-1 as it is not supported');
      }
      // gpt-image-1 doesn't support response_format parameter
    } else if (params.model === 'dall-e-3') {
      // dall-e-3 can support other sizes
      requestParams.size = '1024x1024';
      requestParams.quality = 'standard';
      requestParams.response_format = 'b64_json'; // Only DALL-E supports response_format
    }
    
    console.log('Making direct OpenAI request with params:', JSON.stringify(requestParams, null, 2));
    
    // Generate the image
    const response = await openai.images.generate(requestParams);
    
    console.log('OpenAI response received:', JSON.stringify({
      created: response.created,
      data_count: response.data?.length,
      model: requestParams.model
    }, null, 2));
    
    // Handle different response formats based on model
    let imageData;
    
    // Log the full response to debug
    console.log('OpenAI Response structure (direct):', JSON.stringify({
      hasData: !!response.data,
      dataLength: response.data?.length || 0,
      dataItem: response.data?.[0] ? Object.keys(response.data[0]) : [],
      model: params.model
    }, null, 2));
    
    if (params.model === 'gpt-image-1') {
      // Check if we have response data
      if (!response.data || response.data.length === 0) {
        console.error('No image data returned from OpenAI gpt-image-1 API');
        return null;
      }
      
      const imageItem = response.data[0];
      
      // GPT-image-1 model may return either URL or b64_json format
      if (imageItem.url) {
        // Handle URL format response
        console.log('Got URL response from gpt-image-1');
        try {
          const imageUrl = imageItem.url;
          console.log('Downloading image from URL:', imageUrl);
          const imageResponse = await fetch(imageUrl);
          if (!imageResponse.ok) {
            throw new Error(`Failed to download image: ${imageResponse.status}`);
          }
          
          // Convert the image to base64
          const imageBuffer = await imageResponse.arrayBuffer();
          imageData = Buffer.from(imageBuffer).toString('base64');
        } catch (downloadError) {
          console.error('Failed to download image from URL:', downloadError);
          return null;
        }
      } else if (imageItem.b64_json) {
        // Handle b64_json format (same as dall-e-3)
        console.log('Got b64_json response from gpt-image-1');
        imageData = imageItem.b64_json;
      } else {
        console.error('Neither URL nor b64_json found in gpt-image-1 response:', Object.keys(imageItem));
        return null;
      }
    } else {
      // For dall-e-3, we get base64 data directly
      if (!response.data || response.data.length === 0 || !response.data[0].b64_json) {
        console.error('No image data returned from OpenAI DALL-E API');
        return null;
      }
      
      imageData = response.data[0].b64_json;
    }
    
    // Save the image to disk
    const filename = `test-${Date.now()}-${nanoid(6)}.png`;
    const filePath = path.join(IMAGE_DIR, filename);
    
    fs.writeFileSync(filePath, Buffer.from(imageData, 'base64'));
    console.log(`Image saved to ${filePath}`);
    
    // Return the public URL
    return `/images/covers/${filename}`;
  } catch (error) {
    console.error('Error in direct image generation:', error);
    throw error; // Re-throw for the handler to catch
  }
}

/**
 * Handle image generation test requests with guaranteed JSON responses
 */
export function handleGptImageTest(req: Request, res: Response) {
  // Always set proper JSON headers immediately
  res.setHeader('Content-Type', 'application/json');
  
  // Handle mock mode separately (no actual API calls)
  if (req.body.testMode === true) {
    console.log('Running in test mode - returning mock response');
    return res.json({
      success: true,
      imageUrl: '/images/covers/mock-image.png',
      imageUrlWithTimestamp: `/images/covers/mock-image.png?timestamp=${Date.now()}`,
      model: req.body.model || 'gpt-image-1',
      prompt: req.body.prompt || 'Mock prompt',
      negative_prompt: req.body.negative_prompt,
      method: 'mock'
    });
  }
  
  // Process real GPT image generation
  (async () => {
    try {
      console.log('Testing OpenAI GPT-Image generation');
      console.log('Request body:', req.body);
      
      // Extract parameters from request body with defaults
      const {
        prompt = 'A vibrant music album cover with abstract shapes and colors',
        negative_prompt = 'text, watermark, signature, blurry, distorted',
        model = 'gpt-image-1',
        directAPI = false
      } = req.body;
      
      // Verify we have a prompt that will work with the model
      const processedPrompt = preparePromptForGptImage(prompt);
      
      console.log(`Generating image with model: ${model}, prompt: "${processedPrompt}", using directAPI: ${directAPI}`);
      
      // Check if we have an API key
      if (!process.env.OPENAI_API_KEY) {
        console.error('OPENAI_API_KEY not found in environment');
        return res.status(500).json({
          success: false,
          error: 'OpenAI API key not configured',
          timestamp: new Date().toISOString()
        });
      }
      
      let imageUrl: string | null = null;
      
      // Choose whether to use direct API or service layer
      if (directAPI) {
        // Use direct API approach for better debugging
        const directOptions: any = {
          prompt: processedPrompt,
          model
        };
        
        // Only add negative_prompt for dall-e-3 model
        if (model === 'dall-e-3' && negative_prompt) {
          directOptions.negative_prompt = negative_prompt;
        }
        
        imageUrl = await directImageGeneration(directOptions);
      } else {
        // Generate the image using our service
        const imageOptions: any = {
          prompt: processedPrompt,
          model: model as 'gpt-image-1' | 'dall-e-3',
        };
        
        // Only add negative_prompt for dall-e-3 model
        if (model === 'dall-e-3' && negative_prompt) {
          imageOptions.negative_prompt = negative_prompt;
        }
        
        imageUrl = await generateOpenAIImage(imageOptions);
      }
      
      if (!imageUrl) {
        console.error('Failed to generate image');
        return res.status(500).json({
          success: false,
          error: 'Failed to generate image',
          timestamp: new Date().toISOString()
        });
      }
      
      // Return success response with image URL
      return res.json({
        success: true,
        imageUrl,
        model,
        prompt: processedPrompt,
        negative_prompt,
        method: directAPI ? 'direct' : 'service',
        // Add timestamp to prevent caching
        imageUrlWithTimestamp: `${imageUrl}?timestamp=${Date.now()}`
      });
      
    } catch (error: any) {
      console.error('Error in GPT-Image generation:', error);
      
      // Handle specific error cases
      if (error?.message?.includes('must contain the word')) {
        return res.status(400).json({
          success: false,
          error: 'Invalid prompt',
          message: 'The prompt must contain the word "music", "album", or "cover".',
          timestamp: new Date().toISOString()
        });
      }
      
      return res.status(500).json({
        success: false,
        error: 'Error generating image',
        message: error.message || 'Unknown error',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        timestamp: new Date().toISOString()
      });
    }
  })().catch(error => {
    // Final error handler to ensure we always return JSON
    console.error('Unhandled error in async handler:', error);
    res.status(500).json({
      success: false,
      error: 'Unexpected server error',
      message: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    });
  });
}

/**
 * Add the GPT Image test endpoint with guaranteed JSON response
 */
export function addGptImageJsonEndpoint(app: express.Application) {
  app.post('/api/json-gpt-image', (req: Request, res: Response) => {
    handleGptImageTest(req, res);
  });
  
  console.log('Guaranteed GPT Image JSON endpoint registered at /api/json-gpt-image');
}