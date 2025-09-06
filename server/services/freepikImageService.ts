/**
 * Freepik Mystic Image Generation Service
 * 
 * This service handles integration with Freepik's Mystic API for AI image generation.
 * Documentation: https://docs.freepik.com/api-reference/mystic/post-mystic
 */

import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { nanoid } from 'nanoid';

// Constants
const FREEPIK_API_KEY = process.env.FREEPIK_API_KEY;
const FREEPIK_MYSTIC_URL = 'https://api.freepik.com/v1/mystic';
const IMAGE_DIR = path.join(process.cwd(), 'public', 'images', 'covers');

// Ensure the directory exists
if (!fs.existsSync(IMAGE_DIR)) {
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
}

interface FreepikMysticOptions {
  prompt: string;
  negative_prompt?: string;
  width?: number;
  height?: number;
  seed?: number;
  style?: string;
  num_images?: number;
}

interface FreepikResponse {
  data?: {
    id: string;
    images: string[];
  };
  error?: string;
}

/**
 * Generate image using Freepik's Mystic API
 * 
 * @param options The options for image generation
 * @returns URL to the generated image or null if failed
 */
export async function generateFreepikImage(options: FreepikMysticOptions): Promise<string | null> {
  if (!FREEPIK_API_KEY) {
    console.error('FREEPIK_API_KEY not set in environment variables');
    throw new Error('Freepik API key is not configured');
  }

  try {
    // Set default options
    const requestOptions: FreepikMysticOptions = {
      prompt: options.prompt,
      negative_prompt: options.negative_prompt || '',
      width: options.width || 1024,
      height: options.height || 1024,
      num_images: options.num_images || 1,
      style: options.style || 'photographic',
    };

    if (options.seed) {
      requestOptions.seed = options.seed;
    }

    console.log('Making request to Freepik Mystic API with options:', JSON.stringify(requestOptions, null, 2));

    // Make the request to Freepik's API
    const response = await fetch(FREEPIK_MYSTIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Api-Key': FREEPIK_API_KEY
      },
      body: JSON.stringify(requestOptions)
    });

    const data = await response.json() as FreepikResponse;

    if (!response.ok || data.error) {
      console.error('Error from Freepik Mystic API:', data.error || response.statusText);
      return null;
    }

    if (!data.data?.images?.length) {
      console.error('No images returned from Freepik Mystic API');
      return null;
    }

    // Get the base64 image string from the response
    const base64ImageData = data.data.images[0];
    
    // Remove the data URL prefix if present
    const base64Data = base64ImageData.replace(/^data:image\/\w+;base64,/, '');
    
    // Generate a unique filename
    const filename = `cover-${Date.now()}-${nanoid(12)}.png`;
    const filePath = path.join(IMAGE_DIR, filename);
    
    // Save the image to disk
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
    
    // Return the relative URL to the image
    return `/images/covers/${filename}`;
  } catch (error) {
    console.error('Error generating image with Freepik Mystic:', error);
    return null;
  }
}