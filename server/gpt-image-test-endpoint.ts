/**
 * Simple test endpoint for GPT Image testing
 * 
 * This is a dedicated module to handle test image generation requests
 * with support for both real API calls and test mode responses.
 */

import { Request, Response } from 'express';
import { generateOpenAIImage } from './services/openaiImageService';
import OpenAI from 'openai';

/**
 * Handler for GPT image test requests
 */
export async function handleGptImageTest(req: Request, res: Response) {
  try {
    // Always set content type to ensure JSON response
    res.setHeader('Content-Type', 'application/json');
    
    console.log('GPT Image test request received:', req.body);
    
    // Extract parameters
    const {
      prompt = 'A vibrant music album cover with abstract shapes and colors',
      negative_prompt = 'text, watermark, signature, blurry, distorted',
      model = 'gpt-image-1',
      directAPI = false,
      testMode = false
    } = req.body;
    
    // Handle test mode
    if (testMode === true) {
      console.log('Using test mode for GPT Image request');
      
      const imageUrl = '/images/covers/test-image.png';
      const timestamp = Date.now();
      
      // Return mock response
      return res.json({
        success: true,
        imageUrl,
        imageUrlWithTimestamp: `${imageUrl}?timestamp=${timestamp}`,
        model,
        prompt,
        negative_prompt,
        method: 'test'
      });
    }
    
    // Check for API key for non-test requests
    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY not found in environment');
      return res.status(500).json({
        success: false,
        error: 'OpenAI API key not configured'
      });
    }
    
    let imageUrl: string | null = null;
    
    // Choose API method based on directAPI flag
    if (directAPI) {
      // Direct API call
      console.log('Using direct OpenAI API call');
      
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
      
      const requestParams: any = {
        prompt,
        n: 1,
        model,
        response_format: 'url',
        size: '1024x1024',
      };
      
      if (model === 'gpt-image-1' && negative_prompt) {
        requestParams.negative_prompt = negative_prompt;
      }
      
      const response = await openai.images.generate(requestParams);
      
      if (!response.data || response.data.length === 0) {
        return res.status(500).json({
          success: false,
          error: 'No image data returned from OpenAI'
        });
      }
      
      imageUrl = response.data[0].url || null;
    } else {
      // Use service layer
      console.log('Using service layer for OpenAI image generation');
      
      imageUrl = await generateOpenAIImage({
        prompt,
        negative_prompt,
        model: model as 'gpt-image-1' | 'dall-e-3',
      });
    }
    
    if (!imageUrl) {
      return res.status(500).json({
        success: false,
        error: 'Failed to generate image'
      });
    }
    
    // Return success response
    return res.json({
      success: true,
      imageUrl,
      imageUrlWithTimestamp: `${imageUrl}?timestamp=${Date.now()}`,
      model,
      prompt,
      negative_prompt,
      method: directAPI ? 'direct' : 'service'
    });
    
  } catch (error: any) {
    console.error('Error in GPT Image test:', error);
    
    // Ensure we return a proper JSON response
    return res.status(500).json({
      success: false,
      error: 'Error generating image',
      message: error.message || 'Unknown error'
    });
  }
}