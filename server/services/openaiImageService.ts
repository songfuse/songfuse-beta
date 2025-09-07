/**
 * OpenAI Image Generation Service
 * 
 * This service handles integration with OpenAI's image generation APIs,
 * including the latest gpt-image-1 model.
 */

import OpenAI from 'openai';
import { createReadStream } from 'fs';
import fs from 'fs';
import path from 'path';
// Import coverImageUtils dynamically to avoid circular dependencies

// Always use the production API key for image generation to avoid authentication errors
const OPENAI_API_KEY = process.env.OPENAI_API_KEY_PROD || process.env.OPENAI_API_KEY;

// Check API key
if (!OPENAI_API_KEY) {
  console.error('OpenAI API key is required for image generation');
}

// Log which key we're using (without exposing the actual key)
console.log(`Image Generation Service: Using ${OPENAI_API_KEY?.startsWith('sk-proj-') ? 'PROJECT' : 'PRODUCTION'} OpenAI API key (${OPENAI_API_KEY?.substring(0, 7)}...)`);

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// Define options interface
interface OpenAIImageOptions {
  prompt: string;
  negative_prompt?: string;
  model?: 'gpt-image-1' | 'dall-e-3';
  size?: '1024x1024' | '1792x1024' | '1024x1792';
  quality?: 'low' | 'medium' | 'high' | 'auto'; // GPT-image-1 supported values
  style?: 'natural' | 'vivid';
  n?: number;
}

/**
 * Generate image using OpenAI's image generation APIs and ensure it's stored locally
 * 
 * @param options The options for image generation
 * @param playlistId Optional playlist ID to associate with the image
 * @returns URL to the generated image or null if failed
 */
export async function generateOpenAIImage(options: OpenAIImageOptions, playlistId?: number): Promise<string | null> {
  try {
    console.log(`Generating image with model ${options.model || 'gpt-image-1'}`, { 
      prompt: options.prompt.substring(0, 100) + (options.prompt.length > 100 ? '...' : ''),
      size: options.size || '1024x1024',
      quality: options.quality || 'high'
    });
    
    // Import the storage service dynamically to avoid circular dependencies
    const { storeAiGeneratedCoverWithOptimization } = await import('./supabaseStorage');
    const { ensureCoverDirectories } = await import('./coverImageStorage');
    
    // Ensure cover directories exist before we start
    await ensureCoverDirectories();
    
    // Default model is now gpt-image-1
    const model = options.model || 'gpt-image-1';
    
    // Setup the request parameters based on model
    if (model === 'gpt-image-1') {
      // gpt-image-1 model has different parameters
      const gptImageOptions: any = {
        model: 'gpt-image-1',
        prompt: preparePromptForGptImage(options.prompt),
        size: options.size || '1024x1024',
        quality: options.quality || 'high', // high is the highest quality for gpt-image-1
        n: options.n || 1
      };
      
      const response = await openai.images.generate(gptImageOptions);
      
      // Log the successful response structure
      console.log(`Successfully generated image with ${model} model. Response has ${response.data.length} images.`);
      
      // GPT Image can return either a URL or a base64 string
      let imageSource: string | null = null;
      
      if (response.data[0].url) {
        // If URL is available, use it
        imageSource = response.data[0].url;
        console.log(`Generated ${model} URL:`, imageSource.substring(0, 50) + '...');
      } else if (response.data[0].b64_json) {
        // If base64 data is available, create a data URL
        console.log(`Got base64 data from ${model}, creating data URL`);
        imageSource = `data:image/png;base64,${response.data[0].b64_json}`;
      }
      
      if (!imageSource) {
        console.log("No image URL or base64 data returned from OpenAI");
        return null;
      }
      
      // Store the image in Supabase with full optimization and get the permanent URL
      const optimizedImages = await storeAiGeneratedCoverWithOptimization(imageSource, playlistId);
      const localImageUrl = optimizedImages.original;
      console.log(`Stored GPT-generated image locally at: ${localImageUrl}`);
      
      return localImageUrl;
    } else {
      // DALL-E 3 model (fallback)
      const dalleOptions = {
        model: "dall-e-3",
        prompt: options.prompt,
        n: options.n || 1,
        size: options.size || "1024x1024",
        quality: (options.quality === 'low' ? 'standard' : options.quality) || "standard",
        style: options.style || "vivid",
      };
      
      const response = await openai.images.generate(dalleOptions);
      console.log("Successfully generated image with DALL-E 3 model");
      
      const imageUrl = response.data[0]?.url;
      console.log("Generated DALL-E 3 URL:", imageUrl ? (imageUrl.substring(0, 50) + '...') : 'null');
      
      if (!imageUrl) {
        console.log("No image URL returned from OpenAI");
        return null;
      }
      
      // Store the DALL-E image in Supabase with full optimization and get the permanent URL
      const optimizedImages = await storeAiGeneratedCoverWithOptimization(imageUrl, playlistId);
      const localImageUrl = optimizedImages.original;
      console.log(`Stored DALL-E-generated image in Supabase at: ${localImageUrl}`);
      
      return localImageUrl;
    }
  } catch (error) {
    console.error("Error generating image:", error);
    return null;
  }
}

/**
 * Modify the prompt to ensure it works with OpenAI's content policy for gpt-image-1
 * 
 * @param prompt The original prompt
 * @returns The modified prompt
 */
export function preparePromptForGptImage(prompt: string): string {
  // Ensure we're not requesting celebrity or real people imagery
  if (prompt.toLowerCase().includes('celebrity') || 
      prompt.toLowerCase().includes('famous person') ||
      prompt.toLowerCase().includes('famous artist')) {
    
    prompt = prompt.replace(/celebrity|famous person|famous artist/gi, 'fictional character');
    prompt += ' (without depicting any real celebrities or real people)';
  }
  
  // Ensure abstract, non-human design to avoid racial bias
  if (prompt.toLowerCase().includes('portrait') || prompt.toLowerCase().includes('characters') || prompt.toLowerCase().includes('people')) {
    prompt += ', abstract geometric design only, no human figures or faces';
  }
  
  // Reinforce abstract approach
  if (!prompt.toLowerCase().includes('abstract') && !prompt.toLowerCase().includes('geometric')) {
    prompt += ', abstract geometric design, no human figures';
  }
  
  // Ensure the prompt is appropriate for all audiences
  if (!prompt.toLowerCase().includes('appropriate') && 
      !prompt.toLowerCase().includes('suitable')) {
    
    prompt = `${prompt}, appropriate and professional`;
  }
  
  return prompt;
}

/**
 * Download an image from a URL and save it locally
 * 
 * @param imageUrl URL of the image to download
 * @param playlistId Optional playlist ID to update in database
 * @returns Local path to the saved image
 */
export async function saveImageFromUrl(imageUrl: string, playlistId?: number): Promise<string> {
  try {
    // If the URL is already a local path, just return it
    if (imageUrl.startsWith('/')) {
      console.log("Image is already local:", imageUrl);
      return imageUrl;
    }
    
    // Create a fetch request to get the image
    const response = await fetch(imageUrl);
    
    if (!response.ok) {
      console.error(`Failed to fetch image: ${response.status} ${response.statusText}`);
      return '/images/covers/default-cover.png';
    }
    
    // Get the image data as binary
    const imageData = await response.arrayBuffer();
    
    // Create a directory for covers if it doesn't exist
    const publicDir = path.join(process.cwd(), 'public', 'images', 'covers');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    
    // Create a unique filename based on timestamp
    const filename = `cover-${Date.now()}.jpg`;
    const filePath = path.join(publicDir, filename);
    
    // Write the image data to file
    fs.writeFileSync(filePath, Buffer.from(imageData));
    
    // Create a URL path for the image
    const localUrl = `/images/covers/${filename}`;
    console.log(`Saved image to ${localUrl}`);
    
    // If a playlist ID is provided, update the database
    if (playlistId) {
      try {
        // Import dynamically to avoid circular dependencies
        const { updatePlaylistCoverInDatabase } = await import('./coverImageUtils');
        const updated = await updatePlaylistCoverInDatabase(playlistId, localUrl);
        if (updated) {
          console.log(`Updated playlist ${playlistId} cover in database`);
        } else {
          console.error(`Failed to update playlist ${playlistId} cover in database`);
        }
      } catch (dbError) {
        console.error(`Error updating playlist cover in database:`, dbError);
      }
    }
    
    return localUrl;
  } catch (error) {
    console.error("Error saving image from URL:", error);
    return '/images/covers/default-cover.png';
  }
}