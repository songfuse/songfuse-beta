import OpenAI from "openai";
import { GeneratedPlaylist, SpotifyTrack } from "@shared/schema";
import fs from 'fs';
import path from 'path';

// Initialize OpenAI with proper error handling for different key formats
function initializeOpenAI() {
  try {
    const isProduction = process.env.NODE_ENV === 'production';
    
    // Select the appropriate API key based on environment
    let apiKey;
    
    if (isProduction) {
      apiKey = process.env.OPENAI_API_KEY_PROD;
      if (!apiKey) {
        console.error("⚠️ WARNING: Production API key (OPENAI_API_KEY_PROD) not found");
        // Fallback to regular key if prod key is missing
        apiKey = process.env.OPENAI_API_KEY;
      }
    } else {
      apiKey = process.env.OPENAI_API_KEY;
    }
    
    if (!apiKey) {
      console.error("⚠️ WARNING: No OpenAI API key found in environment variables");
      throw new Error("Missing OpenAI API key");
    }

    apiKey = apiKey.trim();
    const keyType = apiKey.startsWith('sk-proj-') ? 'PROJECT' : 'PRODUCTION';
    const envType = isProduction ? 'PRODUCTION' : 'DEVELOPMENT';
    console.log(`🔑 Using ${keyType} OpenAI API key in ${envType} environment (${apiKey.substring(0, 7)}...)`);
    
    // Debug information about environment and key
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`API Key prefix: ${apiKey.substring(0, 7)}... (length: ${apiKey.length})`);
    
    // Check if using project key format
    const isProjectKey = apiKey.startsWith("sk-proj-");
    if (isProjectKey) {
      console.warn("⚠️ NOTICE: Using OpenAI project key format (sk-proj-) which works in development but may have issues in production");
      
      // Add additional production debugging for project keys
      if (isProduction) {
        console.log("⚠️ PRODUCTION ALERT: Using project key format in production environment");
        console.log("If you experience API errors in production, please consider using a standard API key");
      }
    }
    
    // Set up configuration based on environment and key type
    const baseConfig: Record<string, any> = { apiKey };
    
    // Add extra settings for environment-specific behavior
    if (isProduction) {
      console.log("Production mode: Using enhanced API compatibility settings");
      // In production, add settings that might help with compatibility
      baseConfig.dangerouslyAllowBrowser = true;
      
      // Add robust error handling logging
      baseConfig.defaultHeaders = {
        "X-Environment": "production"
      };
      
      console.log("Production OpenAI client configuration:", Object.keys(baseConfig).join(", "));
    } else {
      console.log("Development mode: Using standard API settings");
      // In development, use settings known to work with project keys
      baseConfig.dangerouslyAllowBrowser = true;
    }
    
    // Better logging for what we're doing
    console.log(`OpenAI client initialized with: ${Object.keys(baseConfig).join(', ')}`);
    
    // Create the OpenAI client with our environment-specific config
    return new OpenAI(baseConfig);
  } catch (error) {
    console.error("❌ Failed to initialize OpenAI client:", error);
    
    // Return a client with an invalid key, which will throw proper errors when called
    // but won't crash the app on initialization
    return new OpenAI({ apiKey: "invalid-key-placeholder" });
  }
}

export const openai = initializeOpenAI();

/**
 * Generate song recommendations based on the user's prompt using OpenAI
 * This will return song titles, artists, and genres that match the prompt
 */
export async function generateSongRecommendations(
  prompt: string,
  databaseGenres: string[] = []
): Promise<{
  songs: Array<{
    title: string;
    artist: string;
    genre?: string;
    popularity?: number;
    year?: number;
  }>;
  genres: string[];
}> {
  try {
    console.log("OpenAI generateSongRecommendations called with prompt:", prompt);
    console.log("Available database genres:", databaseGenres.slice(0, 10), "...");

    // Extract key information from the prompt
    const decadeMatches = prompt.match(/\b(19\d0s|20\d0s|\d0s)\b/g) || [];
    const yearMatches = prompt.match(/\b(19\d{2}|20\d{2})\b/g) || [];
    const artistMatches = prompt.match(/by\s+([^,\.]+)(?:,|\sand\s|$)/gi) || [];

    // Create structured analysis of the prompt
    const promptAnalysis = {
      decades: decadeMatches.map(d => d.toLowerCase()),
      years: yearMatches.map(y => parseInt(y)),
      artists: artistMatches.map(a => a.replace(/^by\s+/i, '').trim()),
      wantsOldMusic: prompt.toLowerCase().includes('classic') || prompt.toLowerCase().includes('old'),
      wantsNewMusic: prompt.toLowerCase().includes('recent') || prompt.toLowerCase().includes('new'),
      wantsSimilar: prompt.toLowerCase().includes('similar') || prompt.toLowerCase().includes('like')
    };

    console.log("Prompt analysis:", JSON.stringify(promptAnalysis, null, 2));

    const systemPrompt = `You are a music expert specializing in creating HIGHLY DIVERSE song recommendations that match specific prompts.
    For a given prompt, analyze the genre requirements and generate a list of exactly 100 VARIED song recommendations that match those genres while avoiding repetitive patterns.

    CRITICAL DIVERSITY INSTRUCTIONS:
    - GENRE VARIETY: Extract multiple genres from the prompt and distribute recommendations across them evenly
      * Never concentrate more than 15% of recommendations in any single sub-genre
      * Include at least 5-7 different genres or sub-genres in your recommendations 
      * Look for unexpected genre combinations that still match the prompt's mood
    - ARTIST DIVERSITY:
      * No artist should appear more than once in the list (STRICTLY ENFORCED)
      * Focus on varied artists from different regions, backgrounds and popularity levels
      * Balance between 50% well-known and 50% lesser-known artists
      * Include artists from different countries and cultural backgrounds
    - STYLISTIC RANGE:
      * Avoid recommending songs that sound too similar (vary tempo, instruments, vocal styles)
      * Include acoustic, electronic, and hybrid production styles 
      * Vary lyrical themes and song structures
      * Include both recent hits and deep cuts from artist catalogs
    - TEMPORAL DISTRIBUTION:
      * If prompt specifies a time period (decade, year, era), focus on that period
      * If no time period specified, distribute recommendations across decades:
        - 40% Recent tracks (past 3 years)
        - 30% Modern tracks (3-10 years old) 
        - 20% Semi-recent (10-20 years old)
        - 10% Classic tracks (20+ years old)
    - Use the following analysis to guide your selection: ${JSON.stringify(promptAnalysis)}
    - If 'wantsNewMusic' is true, adjust to 50% recent tracks
    - EXTREMELY IMPORTANT VERIFICATION: Before finalizing recommendations, verify that:
      * NO ARTIST APPEARS TWICE (double-check this carefully)
      * Check that you haven't recommended the same songs as other recent playlists
      * Ensure broad diversity across genres, song styles, tempos, and moods
      * Avoid overrepresenting popular genres like dancehall, k-pop, afro electronic`;

    // Include database genres in the prompt if available
    const genreGuidance = databaseGenres.length > 0 
      ? `The available genres in our database are: ${databaseGenres.slice(0, 30).join(', ')}${databaseGenres.length > 30 ? ' and more' : ''}.
        When specifying genres, only use genres from this list for better matching.` 
      : '';

    const userPrompt = `Generate 100 EXTREMELY DIVERSE and VARIED song recommendations based on this prompt: "${prompt}".
    ${genreGuidance}

    CRITICAL DIVERSITY REQUIREMENTS:
    1. Maximum variety across genres, artists, styles, and time periods
    2. Avoid songs that have appeared in multiple other playlists (especially dancehall, k-pop, afro electronic)
    3. Include at least 5-7 different genres or sub-genres 
    4. Include artists from different regions and popularity levels
    5. Vary tempos, production styles, and vocal approaches
    6. NO ARTIST SHOULD APPEAR MORE THAN ONCE (strictly enforce this)

    Respond with JSON in the format: 
    {
      "songs": [
        {"title": "Song Title", "artist": "Artist Name", "genre": "Genre Name"},
        ...
      ],
      "genres": ["Genre1", "Genre2", "Genre3", "Genre4", "Genre5"] // List 5 varied genres that match this prompt
    }`;

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: userPrompt
        }
      ],

      temperature: 0.8, // Increased for more variety
      max_tokens: 4000 // Ensure enough tokens for 100 unique songs
    });

    // Verify uniqueness of recommendations
    if (response.choices[0].message.content) {
      const data = JSON.parse(response.choices[0].message.content);
      const artists = new Set();
      const songs = new Set();
      const uniqueSongs = [];

      // Filter out any duplicates
      for (const song of (data.songs || [])) {
        const songKey = `${song.title.toLowerCase()}-${song.artist.toLowerCase()}`;
        if (!artists.has(song.artist.toLowerCase()) && !songs.has(songKey)) {
          artists.add(song.artist.toLowerCase());
          songs.add(songKey);
          uniqueSongs.push(song);
        }
      }

      data.songs = uniqueSongs;
      console.log(`Generated ${uniqueSongs.length} unique songs from ${artists.size} different artists`);
      return {
        songs: data.songs,
        genres: data.genres || []
      };
    }

    if (response.choices[0].message.content) {
      const data = JSON.parse(response.choices[0].message.content);
      console.log(`Generated ${data.songs?.length || 0} song recommendations and ${data.genres?.length || 0} genres`);
      return {
        songs: data.songs || [],
        genres: data.genres || []
      };
    }

    throw new Error("Empty response from OpenAI");
  } catch (error) {
    console.error("Error generating song recommendations:", error);
    return { songs: [], genres: [] };
  }
}

/**
 * Generate a playlist based on the user's prompt using OpenAI
 */
export async function generatePlaylistIdeas(
  prompt: string,
  tracks: SpotifyTrack[]
): Promise<{
  title: string;
  description: string;
}> {
  try {
    console.log("OpenAI generatePlaylistIdeas called with prompt:", prompt);

    // Check if this is an improvement request (contains the word "improve")
    const isImprovement = prompt.toLowerCase().includes("improve");
    
    console.log("Using modern playlist-style title and description generation");

    const systemPrompt = isImprovement 
      ? `You are a modern music curator who creates modern playlist titles and descriptions that feel authentic and engaging. Based on the user's improvement request, generate a NEW, IMPROVED title and description.

CRITICAL: Detect the language of the user's original prompt and respond in the SAME LANGUAGE throughout.

TITLE GUIDELINES - MANDATORY 3-4 word format:
- REQUIRED: Exactly 3-4 words only
- REQUIRED: First word must be ALL UPPERCASE
- REQUIRED: Remaining words lowercase (except proper nouns)
- EXAMPLES: "GOLDEN hour vibes", "MIDNIGHT drive feels", "SUMMER nostalgia hits"
- NO EXCEPTIONS: Never exceed 4 words
- NO COLONS, NO SUBTITLES, NO LONG PHRASES

DESCRIPTION GUIDELINES - Write 10-20 words that are:
- Engaging and modern, contemporary playlist style
- Playful, casual, and emotionally resonant
- Include 1-2 relevant emojis when appropriate
- Use cultural lingo and conversational language
- Invite listeners to press play
- Avoid overexplaining - keep it cool and inviting
- Examples: "for when you need to feel everything at once 💔", "your new obsession starts here ✨", "vibes for late night drives and deep thoughts 🌙"

Make both title and description feel authentic, not like corporate marketing copy.`
      : `You are a modern music curator who creates modern playlist titles and descriptions that feel authentic and engaging.

CRITICAL: Detect the language of the user's original prompt and respond in the SAME LANGUAGE throughout.

TITLE GUIDELINES - MANDATORY 3-4 word format:
- REQUIRED: Exactly 3-4 words only
- REQUIRED: First word must be ALL UPPERCASE
- REQUIRED: Remaining words lowercase (except proper nouns)
- EXAMPLES: "GOLDEN hour vibes", "MIDNIGHT drive feels", "SUMMER nostalgia hits"
- NO EXCEPTIONS: Never exceed 4 words
- NO COLONS, NO SUBTITLES, NO LONG PHRASES

DESCRIPTION GUIDELINES - Write 10-20 words that are:
- Engaging and modern, contemporary playlist style
- Playful, casual, and emotionally resonant
- Include 1-2 relevant emojis when appropriate
- Use cultural lingo and conversational language
- Invite listeners to press play
- Avoid overexplaining - keep it cool and inviting
- Examples: "for when you need to feel everything at once 💔", "your new obsession starts here ✨", "vibes for late night drives and deep thoughts 🌙"

Make both title and description feel authentic, not like corporate marketing copy.`;

    const userPrompt = isImprovement
      ? `IMPROVEMENT REQUEST: "${prompt}". 

The playlist contains these tracks (showing first 5): 
${tracks.map(t => `"${t.name}" by ${t.artists.map(a => a.name).join(', ')}`).slice(0, 5).join('\n')} 
...and ${tracks.length - 5} more tracks by various artists.

Create a short, catchy title (3-4 words with UPPERCASE first word) and engaging description (10-20 words) that follows modern playlist style.

Respond with JSON in the format: { "title": "your title", "description": "your description" }`
      : `Create a unique playlist based on this prompt: "${prompt}".

The playlist contains these tracks (showing first 5):
${tracks.map(t => `"${t.name}" by ${t.artists.map(a => a.name).join(', ')}`).slice(0, 5).join('\n')}
...and ${tracks.length - 5} more tracks by various artists.

Create a short, catchy title (3-4 words with UPPERCASE first word) and engaging description (10-20 words) that follows modern playlist style.

Respond with JSON in the format: { "title": "your title", "description": "your description" }`;

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: userPrompt
        }
      ]
    });

    const responseContent = response.choices[0].message.content || '{"title": "My Playlist", "description": "A collection of songs."}';
    console.log("OpenAI raw response:", responseContent);

    const result = JSON.parse(responseContent);

    console.log("Parsed JSON result:", result);

    // Add signature to the end of the description
    const signature = "\n\nMade with love by songfuse.app";
    return {
      title: result.title,
      description: result.description + signature
    };
  } catch (error) {
    console.error("Error generating playlist ideas:", error);
    // Add signature to the end of the description (even in error case) - use modern playlist style
    const signature = "\n\nMade with love by songfuse.app";
    return {
      title: "CURATED music vibes",
      description: "vibes for when you need the perfect soundtrack ✨" + signature
    };
  }
}

/**
 * Generate a brand-neutral cover image prompt based on playlist info
 * @param title The playlist title
 * @param description The playlist description
 * @param tracks The tracks in the playlist
 * @param userPrompt Optional user prompt to guide the image generation
 */
export async function generateCoverImageDescription(
  title: string,
  description: string,
  tracks: any[] = [],
  userPrompt?: string
): Promise<string> {
  try {
    console.log("Generating brand-neutral playlist cover image prompt for:", title);
    
    // Ensure tracks is an array and extract artist info
    const safeTracks = Array.isArray(tracks) ? tracks : [];
    const artists = safeTracks
      .filter(track => track && typeof track === 'object')
      .map(track => {
        if (track.artists && Array.isArray(track.artists) && track.artists[0]?.name) {
          return track.artists[0].name;
        }
        return '';
      })
      .filter(Boolean);
    const uniqueArtists = Array.from(new Set(artists)).slice(0, 5);

    // Analyze the playlist to determine genre, mood, and audience
    const { genre, mood, audience } = analyzePlaylistContext(title, description, uniqueArtists);
    
    // Generate brand-neutral playlist cover prompt
    const coverPrompt = generatePlaylistCoverPrompt(title, mood, genre, audience, userPrompt);
    
    console.log("Generated brand-neutral playlist cover prompt:", coverPrompt);
    return coverPrompt;
  } catch (error) {
    console.error("Error generating cover image description:", error);
    // Fallback to simple prompt
    return generatePlaylistCoverPrompt(title, "energetic", "pop", "general music lovers", userPrompt);
  }
}

/**
 * Analyze playlist context to determine genre, mood, and target audience
 */
function analyzePlaylistContext(title: string, description: string, artists: string[]): {
  genre: string;
  mood: string;
  audience: string;
} {
  const text = `${title} ${description} ${artists.join(' ')}`.toLowerCase();
  
  // Genre detection based on keywords
  const genreKeywords = {
    'hip hop': ['hip hop', 'rap', 'drake', 'kendrick', 'travis', 'future', 'migos'],
    'r&b': ['r&b', 'soul', 'sza', 'frank ocean', 'the weeknd', 'beyonce', 'rihanna'],
    'pop': ['pop', 'taylor swift', 'ariana grande', 'dua lipa', 'billie eilish', 'olivia rodrigo'],
    'rock': ['rock', 'metal', 'punk', 'arctic monkeys', 'imagine dragons', 'onerepublic'],
    'electronic': ['electronic', 'edm', 'house', 'techno', 'calvin harris', 'avicii', 'skrillex'],
    'indie': ['indie', 'alternative', 'vampire weekend', 'tame impala', 'radiohead'],
    'latin': ['latin', 'reggaeton', 'spanish', 'bad bunny', 'j balvin', 'shakira'],
    'jazz': ['jazz', 'blues', 'swing', 'smooth', 'miles davis', 'ella fitzgerald'],
    'country': ['country', 'folk', 'acoustic', 'taylor swift', 'kacey musgraves', 'chris stapleton'],
    'classical': ['classical', 'orchestra', 'symphony', 'piano', 'violin', 'bach', 'mozart']
  };
  
  let detectedGenre = 'pop'; // default
  let maxMatches = 0;
  
  for (const [genre, keywords] of Object.entries(genreKeywords)) {
    const matches = keywords.filter(keyword => text.includes(keyword)).length;
    if (matches > maxMatches) {
      maxMatches = matches;
      detectedGenre = genre;
    }
  }
  
  // Mood detection based on keywords
  const moodKeywords = {
    'chill': ['chill', 'relax', 'calm', 'peaceful', 'mellow', 'ambient', 'soft'],
    'energetic': ['energetic', 'hype', 'pump', 'power', 'intense', 'high energy', 'workout'],
    'emotional': ['emotional', 'sad', 'heartbreak', 'melancholy', 'deep', 'feelings', 'cry'],
    'romantic': ['romantic', 'love', 'date', 'valentine', 'crush', 'relationship', 'intimate'],
    'party': ['party', 'dance', 'club', 'night', 'fun', 'celebration', 'weekend'],
    'nostalgic': ['nostalgic', 'throwback', 'vintage', 'old school', 'classic', 'memories', 'retro'],
    'dark': ['dark', 'moody', 'gothic', 'mysterious', 'brooding', 'intense', 'dramatic']
  };
  
  let detectedMood = 'energetic'; // default
  maxMatches = 0;
  
  for (const [mood, keywords] of Object.entries(moodKeywords)) {
    const matches = keywords.filter(keyword => text.includes(keyword)).length;
    if (matches > maxMatches) {
      maxMatches = matches;
      detectedMood = mood;
    }
  }
  
  // Audience detection based on context
  const audienceKeywords = {
    'Gen Z': ['tiktok', 'viral', 'trending', 'gen z', 'young', 'teen', 'college'],
    'millennials': ['millennial', '90s', '2000s', 'nostalgic', 'throwback', 'classic'],
    'music enthusiasts': ['discover', 'underground', 'indie', 'deep cuts', 'vinyl', 'audiophile'],
    'party-goers': ['party', 'club', 'dance', 'night out', 'weekend', 'celebration'],
    'fitness enthusiasts': ['workout', 'gym', 'running', 'motivation', 'exercise', 'cardio'],
    'general music lovers': [] // fallback
  };
  
  let detectedAudience = 'general music lovers'; // default
  maxMatches = 0;
  
  for (const [audience, keywords] of Object.entries(audienceKeywords)) {
    if (keywords.length === 0) continue; // skip fallback
    const matches = keywords.filter(keyword => text.includes(keyword)).length;
    if (matches > maxMatches) {
      maxMatches = matches;
      detectedAudience = audience;
    }
  }
  
  return {
    genre: detectedGenre,
    mood: detectedMood,
    audience: detectedAudience
  };
}

/**
 * Generate brand-neutral playlist cover image prompt
 */
function generatePlaylistCoverPrompt(
  title: string, 
  mood: string, 
  genre: string, 
  audience: string, 
  userPrompt?: string
): string {
  // Rotating focus prompts for variety (abstract and inclusive)
  const focusPrompts = [
    "abstract geometric shapes with neon lighting effects",
    "colorful abstract forms in collage style with paint splashes", 
    "surreal cosmic landscape with abstract geometric patterns",
    "dreamy abstract composition with glowing elements"
  ];
  
  // Randomize color palettes
  const colorPalettes = [
    "electric blue and hot pink",
    "vivid orange and teal", 
    "galactic purple and neon green",
    "neon yellow and deep purple",
    "bright cyan and magenta",
    "lime green and electric blue"
  ];
  
  // Vary typography styles
  const typographyStyles = [
    "graffiti-inspired lettering",
    "clean futuristic sans serif",
    "hand-painted brush script",
    "bold geometric typography",
    "neon glow lettering",
    "artistic calligraphy"
  ];
  
  // Randomly select elements for variety
  const randomFocus = focusPrompts[Math.floor(Math.random() * focusPrompts.length)];
  const randomColors = colorPalettes[Math.floor(Math.random() * colorPalettes.length)];
  const randomTypography = typographyStyles[Math.floor(Math.random() * typographyStyles.length)];
  
  // Build the dynamic prompt (inclusive and abstract)
  let basePrompt = `A vibrant, highly stylized pop-art neon illustration, with surreal abstract elements and cosmic vibes. Dynamic and colorful, inspired by modern digital art and contemporary design. Include the playlist title and description in bold, artistic typography integrated into the design. Abstract and geometric design only, no human figures or faces.`;
  
  // Add playlist context
  if (title && title !== 'Untitled Playlist') {
    basePrompt += ` Playlist: "${title}"`;
  }
  
  // Add description context if available
  if (mood && mood !== 'energetic') {
    basePrompt += ` Description: "${mood} ${genre} vibes"`;
  } else if (genre && genre !== 'pop') {
    basePrompt += ` Description: "${genre} music collection"`;
  }
  
  // Add randomized elements
  basePrompt += ` Focus: ${randomFocus}. Color palette: ${randomColors}. Typography: ${randomTypography}.`;
  
  // Add user guidance if provided
  if (userPrompt) {
    basePrompt += ` Additional guidance: ${userPrompt}`;
  }

  return basePrompt;
}

/**
 * Robust cover image saving with comprehensive error handling
 */
export async function saveCoverImageForPlaylist(imageUrl: string, playlistId: number): Promise<string> {
  const fs = require('fs');
  const path = require('path');
  const sharp = require('sharp');
  const fetch = require('node-fetch');

  try {
    console.log(`Saving cover image for playlist ${playlistId} from URL: ${imageUrl}`);
    
    // Create necessary directories
    const publicDir = path.join(process.cwd(), 'public');
    const imagesDir = path.join(publicDir, 'images');
    
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    // Download the image
    console.log('Downloading image from OpenAI...');
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
    }

    const imageBuffer = await response.buffer();
    console.log(`Downloaded image buffer of size: ${imageBuffer.length} bytes`);

    // Generate unique filename with timestamp and random ID
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 15);
    const filename = `cover-${timestamp}-${playlistId}-${randomId}.png`;
    const filepath = path.join(imagesDir, filename);

    // Process and save the image using Sharp
    console.log('Processing image with Sharp...');
    await sharp(imageBuffer)
      .resize(500, 500) // Ensure square format
      .png({ quality: 90 })
      .toFile(filepath);

    const savedImageUrl = `/images/${filename}`;
    console.log(`Cover image saved successfully: ${savedImageUrl}`);
    
    return savedImageUrl;
  } catch (error) {
    console.error('Error saving cover image:', error);
    // Return a fallback image URL or throw error
    throw new Error(`Failed to save cover image: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate cover image and store in Supabase with optimization
 */
export async function generateCoverImage(description: string, playlistId?: number): Promise<string> {
  try {
    console.log("Generating cover image with gpt-image-1, prompt:", description);
    
    // Use the openaiImageService for gpt-image-1 generation
    const { generateOpenAIImage } = await import('./services/openaiImageService');
    
    const imageUrl = await generateOpenAIImage({
      prompt: description,
      model: 'gpt-image-1',
      size: '1024x1024',
      quality: 'high'
    }, playlistId);

    if (!imageUrl) {
      throw new Error("No image URL returned from gpt-image-1");
    }

    console.log("Cover image generated successfully with gpt-image-1:", imageUrl);
    return imageUrl;
  } catch (error) {
    console.error("Error generating cover image with gpt-image-1:", error);
    throw error;
  }
}

/**
 * Process the chat message and generate a response
 */
export async function processChatMessage(
  message: string,
  context?: { playlistId?: number; tracks?: any[] }
): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `You are a helpful music assistant for SongFuse, an AI-powered playlist generator. 
          Help users with their music-related questions and provide recommendations.
          Keep responses concise and friendly.`
        },
        {
          role: "user",
          content: message
        }
      ],
      temperature: 0.7,
      max_tokens: 500
    });

    return response.choices[0].message.content || "I'm not sure how to help with that. Could you ask something else about music?";
  } catch (error) {
    console.error("Error processing chat message:", error);
    return "Sorry, I'm having trouble responding right now. Please try again later.";
  }
}

/**
 * Generate a replacement track query based on the original track and prompt
 */
export async function generateReplacementTrackQuery(
  originalTrack: any,
  prompt: string
): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `You are a music expert. Given a track and a replacement prompt, generate a search query 
          to find a similar but different track that matches the user's request.
          Return only the search query without any additional text.`
        },
        {
          role: "user",
          content: `Original track: "${originalTrack.name}" by ${originalTrack.artists?.[0]?.name || 'Unknown'}
          Replacement request: ${prompt}
          
          Generate a search query for a replacement track:`
        }
      ],
      temperature: 0.8,
      max_tokens: 100
    });

    return response.choices[0].message.content?.trim() || `${originalTrack.name} similar`;
  } catch (error) {
    console.error("Error generating replacement track query:", error);
    return `${originalTrack.name} similar`;
  }
}

/**
 * Generate a playlist using the MCP service for better performance
 * This function is disabled by user request - MCP should not be used
 */
export async function generatePlaylistWithMCP(
  prompt: string,
  trackLimit: number = 20
): Promise<any> {
  throw new Error("MCP service is disabled by user request");
}

/**
 * Generate an engaging title and description for a playlist
 * @param tracks Array of tracks in the playlist
 * @param prompt The original user prompt that generated the playlist
 * @param articleData Optional article data for context (title and link)
 * @returns Object containing title and description
 */
export async function generatePlaylistTitleAndDescription(
  tracks: any[],
  prompt: string,
  articleData?: { title: string; link: string }
): Promise<{ title: string; description: string }> {
  try {
    console.log("Generating modern Spotify-style title and description for playlist");
    console.log("Article data:", articleData);
    
    // Extract artist and track info for context
    const trackInfo = tracks.slice(0, 5).map(track => {
      const artistName = track.artists && track.artists[0] ? track.artists[0].name : 'Unknown Artist';
      return `"${track.name}" by ${artistName}`;
    }).join(', ');

    // Determine if this is an article-based playlist
    const isArticleBased = articleData && articleData.title;
    
    let systemContent = "";
    let userContent = "";

    if (isArticleBased) {
      // Special handling for article-based playlists using the same format rules as regular playlists
      systemContent = `You are a modern music curator who creates Spotify-style playlist titles and descriptions that feel authentic and engaging, inspired by music news articles.

CRITICAL: Detect the language of the user's original prompt and respond in the SAME LANGUAGE throughout.

TITLE GUIDELINES - MANDATORY 3-4 word format:
- REQUIRED: Exactly 3-4 words only
- REQUIRED: First word must be ALL UPPERCASE
- REQUIRED: Remaining words lowercase (except proper nouns)
- EXAMPLES: "GOLDEN hour vibes", "MIDNIGHT drive feels", "SUMMER nostalgia hits"
- NO EXCEPTIONS: Never exceed 4 words
- NO COLONS, NO SUBTITLES, NO LONG PHRASES
- Connect to the article theme but maintain playlist-friendly style

DESCRIPTION GUIDELINES - Write 10-20 words that are:
- Engaging and modern, contemporary playlist style
- Playful, casual, and emotionally resonant
- Include 1-2 relevant emojis when appropriate
- Use cultural lingo and conversational language
- Invite listeners to press play
- Avoid overexplaining - keep it cool and inviting
- Examples: "for when you need to feel everything at once 💔", "your new obsession starts here ✨", "vibes for late night drives and deep thoughts 🌙"
- Can subtly reference the article theme but focus on the musical experience

Make both title and description feel authentic, not like corporate marketing copy.

Return as JSON: {"title": "WORD word word", "description": "engaging description ✨"}`;
      
      userContent = `Inspired by the music news article: "${articleData.title}"

Original prompt: "${prompt}"
Selected tracks: ${trackInfo}

Create a short, catchy title (3-4 words with UPPERCASE first word) and engaging description (10-20 words) that follows modern playlist style while subtly connecting to the article theme.`;
    } else {
      // Regular playlist generation
      systemContent = `You are a modern music curator who creates modern playlist titles and descriptions that feel authentic and engaging.

CRITICAL: Detect the language of the user's original prompt and respond in the SAME LANGUAGE throughout.

TITLE GUIDELINES - MANDATORY 3-4 word format:
- REQUIRED: Exactly 3-4 words only
- REQUIRED: First word must be ALL UPPERCASE
- REQUIRED: Remaining words lowercase (except proper nouns)
- EXAMPLES: "GOLDEN hour vibes", "MIDNIGHT drive feels", "SUMMER nostalgia hits"
- NO EXCEPTIONS: Never exceed 4 words
- NO COLONS, NO SUBTITLES, NO LONG PHRASES

DESCRIPTION GUIDELINES - Write 10-20 words that are:
- Engaging and modern, contemporary playlist style
- Playful, casual, and emotionally resonant
- Include 1-2 relevant emojis when appropriate
- Use cultural lingo and conversational language
- Invite listeners to press play
- Avoid overexplaining - keep it cool and inviting
- Examples: "for when you need to feel everything at once 💔", "your new obsession starts here ✨", "vibes for late night drives and deep thoughts 🌙"

Make both title and description feel authentic, not like corporate marketing copy.

Return as JSON: {"title": "WORD word word", "description": "engaging description ✨"}`;
      
      userContent = `Original prompt: "${prompt}"
Selected tracks: ${trackInfo}

Create a short, catchy title (3-4 words with UPPERCASE first word) and engaging description (10-20 words) that follows modern playlist style.`;
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system", 
          content: systemContent
        },
        {
          role: "user",
          content: userContent
        }
      ],
      temperature: 0.8
    });
    
    // Parse the JSON response
    try {
      const content = response.choices[0].message.content || '{"title":"","description":""}';
      const result = JSON.parse(content);
      
      // Ensure the response has both title and description
      if (!result.title || !result.description) {
        throw new Error("Response missing title or description");
      }
      
      // Add signature to the end of the description (keep in English as it's a brand name)
      const signature = "\n\nMade with love by songfuse.app";
      return {
        title: result.title,
        description: result.description + signature
      };
    } catch (jsonError) {
      console.error("Error parsing JSON from OpenAI response:", jsonError);
      // Fallback values if parsing fails - use modern playlist style
      const signature = "\n\nMade with love by songfuse.app";
      const fallbackDescription = `vibes for when you need the perfect soundtrack ✨`;
      
      return {
        title: "curated",
        description: fallbackDescription + signature
      };
    }
  } catch (error) {
    console.error("Error generating playlist title and description:", error);
    // Fallback values if API call fails
    const signature = "\n\nMade with love by songfuse.app";
    const fallbackDescription = `A curated collection of tracks based on "${prompt}". Featuring artists from different genres and eras, this playlist offers a diverse musical experience that captures the essence of your request.`;
    
    return {
      title: `Playlist inspired by ${prompt.substring(0, 20)}...`,
      description: fallbackDescription + signature
    };
  }
}

/**
 * Generate a compelling description for an album based on its metadata
 */
export async function generateAlbumDescription(album: {
  title: string;
  artist: string;
  genre: string;
  releaseDate: string;
  chartPosition: number;
  isExplicit?: boolean;
}): Promise<string> {
  try {
    const prompt = `Write a compelling 2-3 sentence description for the album "${album.title}" by ${album.artist}. 

Album Details:
- Genre: ${album.genre}
- Release Date: ${album.releaseDate}
- Chart Position: #${album.chartPosition} in US
- ${album.isExplicit ? 'Content: Explicit' : 'Content: Clean'}

Write a description that:
1. Captures the album's musical style and energy
2. Explains why it's currently trending
3. Appeals to music fans and playlist creators
4. Is engaging and informative
5. Mentions the artist's style or the album's impact

Keep it concise, engaging, and under 150 characters. Focus on what makes this album special and why it's popular right now.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a music expert and playlist curator who writes compelling, concise album descriptions that help people understand why an album is trending and what makes it special."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 200,
      temperature: 0.7,
    });

    const description = response.choices[0]?.message?.content?.trim();
    
    if (!description) {
      throw new Error('No description generated');
    }

    return description;

  } catch (error) {
    console.error('Error generating album description:', error);
    
    // Fallback description
    return `${album.title} by ${album.artist} is currently trending at #${album.chartPosition} on Apple Music. This ${album.genre.toLowerCase()} album showcases the artist's signature style and has captured listeners' attention with its compelling sound.`;
  }
}

/**
 * Generate a compelling description for a smart link based on playlist tracks and vibe
 */
export async function generateSmartLinkDescription({
  playlistTitle,
  playlistDescription,
  tracks,
  promotedTrackId,
  smartLinkTitle
}: {
  playlistTitle: string;
  playlistDescription?: string;
  tracks: any[];
  promotedTrackId?: number;
  smartLinkTitle?: string;
}): Promise<string> {
  try {
    // Find the promoted track if specified
    const promotedTrack = promotedTrackId ? tracks.find(t => t.id === promotedTrackId) : tracks[0];
    
    // Get track info for context
    const trackInfo = tracks.slice(0, 8).map(track => 
      `"${track.title}" by ${track.artist}${track.album ? ` (from ${track.album})` : ''}`
    ).join('\n');

    const systemPrompt = `You are a modern music curator and social media expert who creates viral, engaging descriptions for playlist sharing links. Your descriptions should be:

- 15-30 words maximum
- Young, trendy, and marketing-savvy
- Include relevant emojis (1-2 max)
- Capture the vibe and energy of the music
- Make people want to click and listen
- Use contemporary slang and cultural references
- Focus on the emotional impact and mood
- Be shareable and social media friendly

Examples of good descriptions:
- "vibes for late night drives and deep thoughts 🌙✨"
- "your new obsession starts here - trust us on this one 🔥"
- "for when you need to feel everything at once 💔"
- "the perfect soundtrack to your main character moment ✨"
- "songs that hit different when you're in your feels 🎵"

Make it feel authentic, not corporate. Think like a music influencer or playlist curator on social media.`;

    const userPrompt = `Create a compelling description for this playlist sharing link:

Playlist: "${playlistTitle}"
${playlistDescription ? `Original Description: "${playlistDescription}"` : ''}
${smartLinkTitle ? `Smart Link Title: "${smartLinkTitle}"` : ''}

Featured Track: "${promotedTrack?.title}" by ${promotedTrack?.artist}
${promotedTrack?.album ? `Album: ${promotedTrack.album}` : ''}

Tracks in playlist:
${trackInfo}
${tracks.length > 8 ? `...and ${tracks.length - 8} more tracks` : ''}

Generate a viral, engaging description that captures the essence and vibe of this playlist. Make it sound like something a music influencer would write.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: userPrompt
        }
      ],
      max_tokens: 100,
      temperature: 0.8,
    });

    const description = response.choices[0]?.message?.content?.trim();
    
    if (!description) {
      throw new Error('No description generated');
    }

    return description;

  } catch (error) {
    console.error('Error generating smart link description:', error);
    
    // Fallback description
    return `Discover amazing music with ${tracks.length} carefully curated tracks 🎵✨`;
  }
}
