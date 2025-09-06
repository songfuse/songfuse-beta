import OpenAI from "openai";

// Initialize OpenAI client with proper production/development key selection
function initializeOpenAI() {
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Select appropriate API key based on environment
  let apiKey;
  
  if (isProduction && process.env.OPENAI_API_KEY_PROD) {
    apiKey = process.env.OPENAI_API_KEY_PROD.trim();
    console.log("[GenreAnalysis] 🔐 Using PRODUCTION OpenAI API key");
  } else {
    apiKey = process.env.OPENAI_API_KEY || "";
    console.log("[GenreAnalysis] 🔑 Using default OpenAI API key");
  }
  
  return new OpenAI({
    apiKey,
    dangerouslyAllowBrowser: true,
  });
}

const openai = initializeOpenAI();

/**
 * Extract genres from a prompt using OpenAI
 */
export async function extractGenresFromPrompt(
  prompt: string
): Promise<{
  genres: Array<{ name: string; confidence: number }>;
}> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `You are a music genre expert. Analyze the given text and extract music genres mentioned or implied. Consider both explicit genre mentions and contextual clues that suggest specific genres.

Return a JSON array of objects with "name" for the genre and "confidence" (0-1) representing how confident you are that this genre is relevant.

Sort results by confidence, highest first. Only include genres with confidence > 0.4.

Your response MUST be a properly formatted JSON object with no additional text, markdown formatting, or explanations.

Example response:
{
  "genres": [
    {"name": "hip hop", "confidence": 0.95},
    {"name": "r&b", "confidence": 0.8},
    {"name": "trap", "confidence": 0.6}
  ]
}`
        },
        {
          role: "user",
          content: prompt
        }
      ]
      // Removed incompatible response_format parameter
    });

    if (!response.choices[0].message.content) {
      return { genres: [] };
    }

    const result = JSON.parse(response.choices[0].message.content);
    return result;
  } catch (error) {
    console.error("Error extracting genres:", error);
    return { genres: [] };
  }
}

/**
 * Get Spotify genre seeds from extracted genres
 * Returns an array of strings to use as seed_genres in the Spotify API
 * with an optional limit on the number of genres
 */
export function getSpotifyGenreSeeds(
  extractedGenres: Array<{name: string; confidence: number; spotifySeeds?: string[]}>,
  limit = 5
): string[] {
  if (!extractedGenres || extractedGenres.length === 0) {
    // Fallback to popular genres
    return ["pop", "hip-hop", "rock"];
  }
  
  // Collect all unique Spotify genre seeds from extracted genres
  const allSeeds = new Set<string>();
  
  // Prioritize seeds from high-confidence genres
  extractedGenres.forEach(genre => {
    if (genre.spotifySeeds && genre.spotifySeeds.length > 0) {
      genre.spotifySeeds.forEach(seed => allSeeds.add(seed));
    } else {
      // If no specific seeds, use the genre name itself if it's a simple term
      if (genre.name.indexOf(' ') === -1) {
        allSeeds.add(genre.name.toLowerCase());
      }
    }
  });
  
  // Convert to array and limit
  return Array.from(allSeeds).slice(0, limit);
}