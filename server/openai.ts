import OpenAI from "openai";
import { GeneratedPlaylist, SpotifyTrack } from "@shared/schema";
import fs from 'fs';
import path from 'path';

// Ensure environment variables are loaded
import 'dotenv/config';

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
      ? `You are a professional music marketing expert who creates viral, shareable playlist titles and descriptions optimized for social media, streaming platforms, and SEO. Based on the user's improvement request, generate a NEW, IMPROVED title and description.

CRITICAL: Detect the language of the user's original prompt and respond in the SAME LANGUAGE throughout.

TITLE GUIDELINES - MARKETING OPTIMIZED:
- Create titles that are SHAREABLE and CLICKABLE (2-5 words max)
- Use POWER WORDS that create urgency, emotion, or curiosity
- Include trending music terms when relevant (vibes, feels, hits, energy, mood, anthems, bangers)
- Make titles that people want to screenshot and share
- Examples: "Viral TikTok Hits", "Late Night Feels", "Summer Anthems 2024", "Chill Vibes Only", "Throwback Energy", "Indie Gold", "Hip-Hop Heat"
- Avoid generic terms - be specific and memorable
- Consider seasonal relevance and trending topics
- Use alliteration and catchy phrases when possible

DESCRIPTION GUIDELINES - SEO & SHARING OPTIMIZED:
- Write 15-25 words that are highly shareable and searchable
- Include relevant genre keywords naturally
- Use emotional triggers and social proof language
- Include trending hashtags and emojis strategically (2-3 max)
- Make it sound like a must-listen playlist
- Examples: "The ultimate collection of indie hits that'll have you hitting repeat all day 🎵 #IndieVibes #NewMusic", "Perfect for your morning commute - these tracks will start your day right ☀️ #MorningPlaylist #GoodVibes"
- Include call-to-action language that encourages sharing
- Reference popular artists or trending sounds when relevant
- Use words like "ultimate", "essential", "must-listen", "viral", "trending"

Make both title and description feel like they belong on a trending playlist that everyone wants to discover and share.`
      : `You are a professional music marketing expert who creates viral, shareable playlist titles and descriptions optimized for social media, streaming platforms, and SEO.

CRITICAL: Detect the language of the user's original prompt and respond in the SAME LANGUAGE throughout.

TITLE GUIDELINES - MARKETING OPTIMIZED:
- Create titles that are SHAREABLE and CLICKABLE (2-5 words max)
- Use POWER WORDS that create urgency, emotion, or curiosity
- Include trending music terms when relevant (vibes, feels, hits, energy, mood, anthems, bangers)
- Make titles that people want to screenshot and share
- Examples: "Viral TikTok Hits", "Late Night Feels", "Summer Anthems 2024", "Chill Vibes Only", "Throwback Energy", "Indie Gold", "Hip-Hop Heat"
- Avoid generic terms - be specific and memorable
- Consider seasonal relevance and trending topics
- Use alliteration and catchy phrases when possible

DESCRIPTION GUIDELINES - SEO & SHARING OPTIMIZED:
- Write 15-25 words that are highly shareable and searchable
- Include relevant genre keywords naturally
- Use emotional triggers and social proof language
- Include trending hashtags and emojis strategically (2-3 max)
- Make it sound like a must-listen playlist
- Examples: "The ultimate collection of indie hits that'll have you hitting repeat all day 🎵 #IndieVibes #NewMusic", "Perfect for your morning commute - these tracks will start your day right ☀️ #MorningPlaylist #GoodVibes"
- Include call-to-action language that encourages sharing
- Reference popular artists or trending sounds when relevant
- Use words like "ultimate", "essential", "must-listen", "viral", "trending"

Make both title and description feel like they belong on a trending playlist that everyone wants to discover and share.`;

    const userPrompt = isImprovement
      ? `IMPROVEMENT REQUEST: "${prompt}". 

The playlist contains these tracks (showing first 5): 
${tracks.map(t => `"${t.name}" by ${t.artists.map(a => a.name).join(', ')}`).slice(0, 5).join('\n')} 
...and ${tracks.length - 5} more tracks by various artists.

Create a viral-worthy title and shareable description that will make people want to discover and share this playlist. Focus on trending music culture, social media appeal, and SEO optimization.

Respond with JSON in the format: { "title": "trending title", "description": "shareable description with hashtags and emojis" }`
      : `Create a viral-worthy playlist based on this prompt: "${prompt}".

The playlist contains these tracks (showing first 5):
${tracks.map(t => `"${t.name}" by ${t.artists.map(a => a.name).join(', ')}`).slice(0, 5).join('\n')}
...and ${tracks.length - 5} more tracks by various artists.

Create a viral-worthy title and shareable description that will make people want to discover and share this playlist. Focus on trending music culture, social media appeal, and SEO optimization.

Respond with JSON in the format: { "title": "trending title", "description": "shareable description with hashtags and emojis" }`;

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

    return {
      title: result.title,
      description: result.description
    };
  } catch (error) {
    console.error("Error generating playlist ideas:", error);
    // Use contextual fallback based on prompt
    return generateContextualFallback(prompt);
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
    const coverPrompt = generatePlaylistCoverPrompt(title, mood, genre, audience, userPrompt, tracks);
    
    console.log("Generated brand-neutral playlist cover prompt:", coverPrompt);
    return coverPrompt;
  } catch (error) {
    console.error("Error generating cover image description:", error);
    // Fallback to simple prompt
    return generatePlaylistCoverPrompt(title, "energetic", "pop", "general music lovers", userPrompt, tracks);
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

// Style rotation tracking to prevent repetitive patterns
let styleRotationIndex = 0;
const styleRotationHistory: string[] = [];

// Diversity analytics tracking
const diversityStats = {
  artStylesUsed: new Map<string, number>(),
  colorPalettesUsed: new Map<string, number>(),
  typographyStylesUsed: new Map<string, number>(),
  totalGenerations: 0
};

/**
 * Generate brand-neutral playlist cover image prompt with enhanced diversity
 */
/**
 * Generate character and topic-based elements for cover diversity
 */
function generateCharacterAndTopicElements(
  title: string,
  mood: string,
  genre: string,
  tracks: any[] = []
): string | null {
  // 70% chance to include character elements for diversity
  if (Math.random() > 0.7) {
    return null;
  }

  // Extract key themes from title and tracks
  const titleWords = title.toLowerCase().split(/\s+/);
  const trackArtists = tracks
    .filter(track => track && track.artists && Array.isArray(track.artists))
    .map(track => track.artists[0]?.name?.toLowerCase())
    .filter(Boolean)
    .slice(0, 10);

  // Diverse people representation with explicit diversity
  const diversePeople = [
    // Young adults (18-30)
    'a young Black woman with natural hair',
    'a young Asian man with modern style',
    'a young Latinx person with vibrant energy',
    'a young white woman with artistic flair',
    'a young Middle Eastern person with cultural elements',
    'a young Indigenous person with traditional touches',
    'a young South Asian woman with elegant styling',
    'a young mixed-race person with unique features',
    'a young person with a disability using adaptive equipment',
    'a young plus-size person with confidence',
    'a young person with visible tattoos and piercings',
    'a young person with a wheelchair',
    
    // Adults (30-50)
    'a mature Black man with distinguished presence',
    'a mature Asian woman with sophisticated style',
    'a mature Latinx person with warm expression',
    'a mature white man with creative energy',
    'a mature Middle Eastern woman with cultural grace',
    'a mature Indigenous man with traditional wisdom',
    'a mature South Asian man with professional elegance',
    'a mature mixed-race person with diverse heritage',
    'a mature person with a prosthetic limb',
    'a mature plus-size person with style',
    'a mature person with a service animal',
    'a mature person with a hearing aid',
    
    // Older adults (50+)
    'an older Black woman with silver hair and wisdom',
    'an older Asian man with distinguished features',
    'an older Latinx person with life experience',
    'an older white woman with artistic maturity',
    'an older Middle Eastern person with cultural depth',
    'an older Indigenous person with traditional knowledge',
    'an older South Asian woman with graceful aging',
    'an older mixed-race person with rich heritage',
    'an older person with a cane or walker',
    'an older person with glasses and wisdom',
    'an older person with gray hair and experience',
    'an older person with a mobility device'
  ];

  // Character archetypes based on mood and genre with diverse people
  const characterArchetypes = {
    // Energetic/Party moods
    'energetic': [
      'a dynamic dancer in motion with flowing fabric',
      'a vibrant street performer with colorful costume',
      'an energetic DJ with glowing equipment',
      'a breakdancer in mid-move with urban backdrop',
      'a festival-goer with neon accessories'
    ],
    'party': [
      'a party host with celebratory accessories',
      'a nightclub performer with dramatic lighting',
      'a festival attendee with face paint and glitter',
      'a DJ with turntables and neon effects',
      'a dancer with flowing, colorful outfit'
    ],
    
    // Chill/Relaxed moods
    'chill': [
      'a contemplative person in a peaceful setting',
      'a yoga practitioner in serene environment',
      'a coffee shop patron with warm lighting',
      'a beach-goer with sunset backdrop',
      'a reader in a cozy, book-filled space'
    ],
    'relaxed': [
      'a meditative person with soft lighting',
      'a nature walker in forest setting',
      'a tea drinker in minimalist space',
      'a stargazer with night sky background',
      'a hammock lounger with tropical vibes'
    ],
    
    // Emotional/Romantic moods
    'emotional': [
      'a thoughtful person with expressive gestures',
      'an artist painting with emotional intensity',
      'a musician playing with passion',
      'a poet writing with candlelight',
      'a person in rain with umbrella'
    ],
    'romantic': [
      'a diverse couple silhouetted against sunset',
      'a person with flowers and soft lighting',
      'a dancer in elegant pose',
      'a person with vintage romantic styling',
      'a person with candlelit dinner setting',
      'a same-sex couple in romantic embrace',
      'an interracial couple holding hands',
      'a couple of different ages showing love',
      'a couple with different cultural backgrounds'
    ],
    
    // Dark/Mysterious moods
    'dark': [
      'a mysterious person in shadow',
      'a gothic character with dramatic styling',
      'a night wanderer with city lights',
      'a person with mask and cloak',
      'a character with moonlit silhouette'
    ],
    'mysterious': [
      'a person with hidden face and intriguing pose',
      'a character with vintage detective styling',
      'a person with fog and atmospheric lighting',
      'a person with vintage camera and film noir style',
      'a character with steampunk accessories'
    ]
  };

  // Topic-based character suggestions
  const topicCharacters = {
    // Music-related topics
    'music': [
      'a musician with instrument',
      'a conductor with baton',
      'a singer with microphone',
      'a record collector with vinyl',
      'a music producer with studio equipment'
    ],
    'dance': [
      'a ballet dancer in elegant pose',
      'a hip-hop dancer with urban style',
      'a contemporary dancer with flowing movement',
      'a salsa dancer with vibrant costume',
      'a breakdancer with street art backdrop'
    ],
    'night': [
      'a night owl with city skyline',
      'a stargazer with telescope',
      'a nightclub patron with neon lights',
      'a midnight walker with street lamps',
      'a figure with fireflies and moon'
    ],
    'summer': [
      'a beach-goer with tropical vibes',
      'a festival attendee with flower crown',
      'a surfer with ocean waves',
      'a picnic-goer with sunny meadow',
      'a traveler with vintage suitcase'
    ],
    'winter': [
      'a figure with cozy winter clothing',
      'a skier with mountain backdrop',
      'a person with hot cocoa and fireplace',
      'a figure with snow and warm lighting',
      'a character with vintage winter accessories'
    ],
    'travel': [
      'a backpacker with world map',
      'a photographer with vintage camera',
      'a wanderer with compass and journal',
      'a traveler with passport and tickets',
      'a figure with suitcase and adventure gear'
    ],
    'love': [
      'a figure with heart-shaped elements',
      'a couple with romantic setting',
      'a person with flowers and soft lighting',
      'a figure with vintage love letter',
      'a character with wedding or celebration elements'
    ],
    'dream': [
      'a figure with cloud and star elements',
      'a dreamer with surreal background',
      'a person with floating elements',
      'a figure with ethereal lighting',
      'a character with fantasy accessories'
    ]
  };

  // Cultural and diverse character representations
  const culturalCharacters = [
    'a diverse character with traditional cultural elements',
    'a figure representing global music traditions',
    'a character with cultural festival styling',
    'a person with traditional dance costume',
    'a figure with cultural instrument and styling'
  ];

  // Select character based on mood
  let selectedCharacters = characterArchetypes[mood] || characterArchetypes['energetic'];
  
  // Add genre-specific characters (30% chance)
  if (Math.random() < 0.3) {
    const genreCharacters = [
      'urban street artist', 'breakdancer', 'graffiti artist', 'DJ with turntables',
      'smooth vocalist', 'elegant performer', 'sophisticated musician', 'soul singer',
      'energetic performer', 'colorful pop star', 'festival attendee', 'vibrant dancer',
      'electric guitarist', 'rock performer', 'concert goer', 'band member',
      'cyberpunk DJ', 'neon dancer', 'futuristic performer', 'digital artist',
      'artistic musician', 'coffee shop performer', 'vintage style artist', 'creative individual',
      'salsa dancer', 'latin performer', 'festival dancer', 'cultural musician',
      'saxophone player', 'jazz club performer', 'sophisticated musician', 'vintage jazz artist',
      'guitar player', 'country singer', 'rural performer', 'folk musician',
      'orchestra conductor', 'classical musician', 'elegant performer', 'concert pianist'
    ];
    selectedCharacters = [...selectedCharacters, ...genreCharacters];
  }

  // Combine diverse people with character archetypes for inclusive representation
  const combinedCharacters = [];
  
  // 60% chance to use diverse people with character archetypes
  if (Math.random() < 0.6) {
    const randomPerson = diversePeople[Math.floor(Math.random() * diversePeople.length)];
    const randomArchetype = selectedCharacters[Math.floor(Math.random() * selectedCharacters.length)];
    combinedCharacters.push(`${randomPerson} as ${randomArchetype}`);
  }
  
  // 40% chance to use just character archetypes (for variety)
  combinedCharacters.push(...selectedCharacters);
  
  // Add topic-based characters if title contains relevant keywords
  const topicKeywords = Object.keys(topicCharacters);
  for (const keyword of topicKeywords) {
    if (titleWords.some(word => word.includes(keyword)) || 
        trackArtists.some(artist => artist && artist.includes(keyword))) {
      combinedCharacters.push(...topicCharacters[keyword]);
    }
  }

  // Add cultural diversity (20% chance)
  if (Math.random() < 0.2) {
    combinedCharacters.push(...culturalCharacters);
  }

  // Select a random character from combined options
  const selectedCharacter = combinedCharacters[Math.floor(Math.random() * combinedCharacters.length)];

  // Character styling options
  const characterStyles = [
    'in artistic illustration style',
    'with stylized, modern art approach',
    'in contemporary digital art style',
    'with vintage poster art styling',
    'in abstract artistic representation',
    'with watercolor painting effect',
    'in minimalist line art style',
    'with collage and mixed media approach'
  ];

  // Environmental and situational diversity
  const environments = [
    'in a vibrant urban setting',
    'against a dreamy sunset backdrop',
    'in a cozy indoor atmosphere',
    'with a cosmic space background',
    'in a vintage retro environment',
    'with a nature-inspired setting',
    'in a futuristic digital landscape',
    'with a cultural festival atmosphere'
  ];

  const selectedStyle = characterStyles[Math.floor(Math.random() * characterStyles.length)];
  const selectedEnvironment = environments[Math.floor(Math.random() * environments.length)];

  // 50% chance to include environment
  const includeEnvironment = Math.random() < 0.5;
  
  if (includeEnvironment) {
    return `Include ${selectedCharacter} ${selectedStyle} ${selectedEnvironment}.`;
  } else {
    return `Include ${selectedCharacter} ${selectedStyle}.`;
  }
}

function generatePlaylistCoverPrompt(
  title: string, 
  mood: string, 
  genre: string, 
  audience: string, 
  userPrompt?: string,
  tracks: any[] = []
): string {
  // Enhanced art styles for maximum diversity
  const artStyles = [
    // Abstract & Geometric
    "abstract geometric shapes with neon lighting effects",
    "colorful abstract forms in collage style with paint splashes", 
    "surreal cosmic landscape with abstract geometric patterns",
    "dreamy abstract composition with glowing elements",
    "minimalist geometric design with bold color blocks",
    "fluid organic shapes with metallic accents",
    
    // Cultural & Artistic Movements
    "art nouveau inspired floral patterns with gold accents",
    "japanese ukiyo-e style with modern color palette",
    "african textile patterns with contemporary geometric elements",
    "scandinavian minimalist design with nature motifs",
    "mexican folk art inspired vibrant patterns",
    "indian mandala patterns with psychedelic colors",
    "chinese ink painting style with modern digital effects",
    "islamic geometric patterns with contemporary colors",
    
    // Photography & Mixed Media
    "vintage film photography aesthetic with grain texture",
    "double exposure photography with music elements",
    "polaroid collage style with handwritten elements",
    "darkroom experimental photography with light leaks",
    "macro photography of textured surfaces",
    "silhouette photography with dramatic lighting",
    
    // Digital Art Styles
    "cyberpunk neon cityscape with holographic elements",
    "retro synthwave design with grid patterns",
    "glitch art aesthetic with digital distortion",
    "3D rendered objects with surreal lighting",
    "pixel art style with modern color palette",
    "vector illustration with clean lines and gradients",
    
    // Nature & Organic
    "botanical illustrations with watercolor effects",
    "crystal formations with prismatic light effects",
    "ocean waves with iridescent colors",
    "forest silhouettes with ethereal lighting",
    "mountain landscapes with aurora effects",
    "desert dunes with mirage-like distortions",
    
    // Vintage & Retro
    "1950s advertising poster style with bold typography",
    "1970s psychedelic poster art with flowing patterns",
    "1980s neon sign aesthetic with grid backgrounds",
    "1990s grunge design with distressed textures",
    "vintage travel poster style with modern colors",
    "art deco inspired geometric patterns with metallic tones"
  ];
  
  // Enhanced color palettes for diverse moods and cultures
  const colorPalettes = [
    // Vibrant & Electric
    "electric blue and hot pink",
    "vivid orange and teal", 
    "galactic purple and neon green",
    "neon yellow and deep purple",
    "bright cyan and magenta",
    "lime green and electric blue",
    
    // Earth & Natural
    "forest green and warm gold",
    "deep ocean blue and coral",
    "sunset orange and sage green",
    "terracotta and cream",
    "moss green and rust",
    "sand beige and turquoise",
    
    // Monochrome & Sophisticated
    "black and white with silver accents",
    "charcoal gray and electric blue",
    "deep navy and gold",
    "cream and dark brown",
    "white and metallic silver",
    "black and neon yellow",
    
    // Pastel & Soft
    "lavender and mint green",
    "peach and sky blue",
    "rose pink and powder blue",
    "soft yellow and lilac",
    "sage green and blush pink",
    "cream and dusty rose",
    
    // Cultural & Regional
    "crimson red and gold (chinese new year)",
    "deep purple and saffron (indian festival)",
    "emerald green and white (celtic)",
    "royal blue and white (japanese)",
    "burgundy and cream (vintage european)",
    "turquoise and coral (mexican)",
    
    // Moody & Atmospheric
    "midnight blue and silver",
    "deep purple and copper",
    "dark green and bronze",
    "maroon and gold",
    "navy and rose gold",
    "black and iridescent"
  ];
  
  // Enhanced typography styles for global diversity
  const typographyStyles = [
    // Modern & Digital
    "graffiti-inspired lettering",
    "clean futuristic sans serif",
    "bold geometric typography",
    "neon glow lettering",
    "3D extruded text effects",
    "holographic text with rainbow colors",
    
    // Hand-drawn & Artistic
    "hand-painted brush script",
    "artistic calligraphy",
    "chalk lettering on textured background",
    "watercolor text with bleeding edges",
    "charcoal sketch lettering",
    "ink wash calligraphy",
    
    // Cultural & Regional
    "japanese brush stroke lettering",
    "arabic calligraphy inspired",
    "cyrillic typography style",
    "chinese seal script influence",
    "hindi devanagari inspired",
    "latin script with cultural flourishes",
    
    // Vintage & Retro
    "1950s diner lettering",
    "art deco typography",
    "vintage circus poster style",
    "typewriter font with ink smudges",
    "vintage movie title style",
    "retro neon sign typography",
    
    // Organic & Natural
    "wood grain text effect",
    "stone carved lettering",
    "moss covered text",
    "crystal formation typography",
    "leaf and vine lettering",
    "water droplet text effects",
    
    // Experimental & Abstract
    "melting text with liquid effects",
    "fragmented lettering",
    "mirror reflection typography",
    "shadow play lettering",
    "transparent glass text",
    "smoke and fire lettering"
  ];
  
  // Mood-specific style selection for better context matching
  const moodStyleMap = {
    'chill': ['botanical', 'watercolor', 'soft pastels', 'organic'],
    'energetic': ['neon', 'cyberpunk', 'electric', 'bold geometric'],
    'emotional': ['watercolor', 'soft', 'melting', 'atmospheric'],
    'romantic': ['art nouveau', 'floral', 'soft pastels', 'elegant'],
    'party': ['neon', 'psychedelic', 'vibrant', 'retro'],
    'nostalgic': ['vintage', 'retro', 'film grain', 'sepia'],
    'dark': ['gothic', 'moody', 'monochrome', 'dramatic']
  };
  
  // Genre-specific style enhancement
  const genreStyleMap = {
    'hip hop': ['graffiti', 'street art', 'urban', 'bold'],
    'r&b': ['smooth', 'elegant', 'sophisticated', 'gold accents'],
    'pop': ['bright', 'vibrant', 'modern', 'clean'],
    'rock': ['grunge', 'distressed', 'bold', 'edgy'],
    'electronic': ['cyberpunk', 'neon', 'futuristic', 'digital'],
    'indie': ['handmade', 'organic', 'artistic', 'unique'],
    'latin': ['vibrant', 'cultural', 'festive', 'warm colors'],
    'jazz': ['sophisticated', 'vintage', 'elegant', 'moody'],
    'country': ['rustic', 'natural', 'warm', 'earthy'],
    'classical': ['elegant', 'sophisticated', 'timeless', 'refined']
  };

  // Genre-specific character enhancements
  const genreCharacterMap = {
    'hip hop': ['urban street artist', 'breakdancer', 'graffiti artist', 'DJ with turntables'],
    'r&b': ['smooth vocalist', 'elegant performer', 'sophisticated musician', 'soul singer'],
    'pop': ['energetic performer', 'colorful pop star', 'festival attendee', 'vibrant dancer'],
    'rock': ['electric guitarist', 'rock performer', 'concert goer', 'band member'],
    'electronic': ['cyberpunk DJ', 'neon dancer', 'futuristic performer', 'digital artist'],
    'indie': ['artistic musician', 'coffee shop performer', 'vintage style artist', 'creative individual'],
    'latin': ['salsa dancer', 'latin performer', 'festival dancer', 'cultural musician'],
    'jazz': ['saxophone player', 'jazz club performer', 'sophisticated musician', 'vintage jazz artist'],
    'country': ['guitar player', 'country singer', 'rural performer', 'folk musician'],
    'classical': ['orchestra conductor', 'classical musician', 'elegant performer', 'concert pianist']
  };
  
  // Intelligent style selection based on mood and genre
  let selectedStyles = artStyles;
  if (moodStyleMap[mood]) {
    selectedStyles = artStyles.filter(style => 
      moodStyleMap[mood].some(keyword => style.toLowerCase().includes(keyword))
    );
  }
  if (genreStyleMap[genre]) {
    selectedStyles = selectedStyles.filter(style => 
      genreStyleMap[genre].some(keyword => style.toLowerCase().includes(keyword))
    );
  }
  
  // Fallback to all styles if filtering results in empty array
  if (selectedStyles.length === 0) {
    selectedStyles = artStyles;
  }
  
  // Intelligent rotation system to prevent repetitive patterns
  const getRotatedSelection = (array: string[], historyKey: string) => {
    // Filter out recently used combinations
    const recentHistory = styleRotationHistory.slice(-10); // Look at last 10 generations
    const availableOptions = array.filter(option => 
      !recentHistory.some(history => history.includes(option))
    );
    
    // Use available options if any, otherwise use all options
    const selectionArray = availableOptions.length > 0 ? availableOptions : array;
    
    // Use rotation index for more predictable variety
    const index = styleRotationIndex % selectionArray.length;
    const selected = selectionArray[index];
    
    // Update rotation index
    styleRotationIndex = (styleRotationIndex + 1) % selectionArray.length;
    
    return selected;
  };
  
  // Select elements with intelligent rotation
  const randomFocus = getRotatedSelection(selectedStyles, 'artStyle');
  const randomColors = getRotatedSelection(colorPalettes, 'colorPalette');
  const randomTypography = getRotatedSelection(typographyStyles, 'typography');
  
  // Track this combination to avoid repetition
  const combination = `${randomFocus}|${randomColors}|${randomTypography}`;
  styleRotationHistory.push(combination);
  
  // Keep history manageable (last 50 combinations)
  if (styleRotationHistory.length > 50) {
    styleRotationHistory.splice(0, styleRotationHistory.length - 50);
  }
  
  // Update diversity analytics
  diversityStats.totalGenerations++;
  diversityStats.artStylesUsed.set(randomFocus, (diversityStats.artStylesUsed.get(randomFocus) || 0) + 1);
  diversityStats.colorPalettesUsed.set(randomColors, (diversityStats.colorPalettesUsed.get(randomColors) || 0) + 1);
  diversityStats.typographyStylesUsed.set(randomTypography, (diversityStats.typographyStylesUsed.get(randomTypography) || 0) + 1);
  
  // Log diversity stats periodically
  if (diversityStats.totalGenerations % 10 === 0) {
    console.log(`🎨 Cover Image Diversity Stats (${diversityStats.totalGenerations} generations):`);
    console.log(`   Art Styles: ${diversityStats.artStylesUsed.size} unique styles used`);
    console.log(`   Color Palettes: ${diversityStats.colorPalettesUsed.size} unique palettes used`);
    console.log(`   Typography: ${diversityStats.typographyStylesUsed.size} unique styles used`);
  }
  
  // Build the dynamic prompt with enhanced diversity including characters
  let basePrompt = `A highly stylized, diverse artistic illustration that captures the essence of the music. Dynamic and visually striking, inspired by contemporary and traditional art movements from around the world. Include the playlist title and description in bold, artistic typography integrated into the design.`;
  
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
  
  // Add randomized elements with enhanced descriptions
  basePrompt += ` Art style: ${randomFocus}. Color palette: ${randomColors}. Typography: ${randomTypography}.`;
  
  // Add character and topic-based diversity elements
  const characterElements = generateCharacterAndTopicElements(title, mood, genre, tracks);
  if (characterElements) {
    basePrompt += ` ${characterElements}`;
  }
  
  // Add cultural and artistic diversity hints
  const diversityHints = [
    "incorporate elements from different cultural art traditions",
    "blend modern digital art with traditional techniques",
    "create a unique fusion of contemporary and classic styles",
    "draw inspiration from global artistic movements",
    "combine unexpected artistic elements for visual interest"
  ];
  const randomHint = diversityHints[Math.floor(Math.random() * diversityHints.length)];
  basePrompt += ` ${randomHint}.`;
  
  // Add seasonal and time-based diversity elements
  const currentHour = new Date().getHours();
  const currentMonth = new Date().getMonth();
  
  // Time-based style variations
  if (currentHour >= 6 && currentHour < 12) {
    basePrompt += ` Incorporate morning light and fresh energy.`;
  } else if (currentHour >= 12 && currentHour < 18) {
    basePrompt += ` Capture the vibrant energy of daytime.`;
  } else if (currentHour >= 18 && currentHour < 22) {
    basePrompt += ` Embrace the golden hour and evening atmosphere.`;
  } else {
    basePrompt += ` Create a nocturnal, mysterious ambiance.`;
  }
  
  // Seasonal variations
  const seasons = ['spring', 'summer', 'autumn', 'winter'];
  const season = seasons[Math.floor(currentMonth / 3)];
  const seasonalElements = {
    'spring': 'fresh blooms, pastel colors, and renewal themes',
    'summer': 'vibrant energy, bright colors, and outdoor vibes',
    'autumn': 'warm earth tones, falling leaves, and cozy atmosphere',
    'winter': 'cool tones, crystalline elements, and introspective mood'
  };
  
  if (Math.random() < 0.3) { // 30% chance to include seasonal elements
    basePrompt += ` Subtly incorporate ${seasonalElements[season]}.`;
  }
  
  // Add user guidance if provided
  if (userPrompt) {
    basePrompt += ` Additional guidance: ${userPrompt}`;
  }

  return basePrompt;
}

/**
 * Get diversity statistics for cover image generation
 */
export function getCoverImageDiversityStats() {
  return {
    totalGenerations: diversityStats.totalGenerations,
    uniqueArtStyles: diversityStats.artStylesUsed.size,
    uniqueColorPalettes: diversityStats.colorPalettesUsed.size,
    uniqueTypographyStyles: diversityStats.typographyStylesUsed.size,
    mostUsedArtStyle: Array.from(diversityStats.artStylesUsed.entries())
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'none',
    mostUsedColorPalette: Array.from(diversityStats.colorPalettesUsed.entries())
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'none',
    mostUsedTypography: Array.from(diversityStats.typographyStylesUsed.entries())
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'none',
    diversityScore: Math.round(
      ((diversityStats.artStylesUsed.size + diversityStats.colorPalettesUsed.size + diversityStats.typographyStylesUsed.size) / 
       (36 + 36 + 36)) * 100 // Total possible unique combinations
    )
  };
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
    console.log("Generating marketing-optimized title and description for playlist");
    console.log("Article data:", articleData);
    
    // Extract artist and track info for context
    const trackInfo = tracks.slice(0, 5).map(track => {
      const artistName = track.artists && track.artists[0] ? track.artists[0].name : 'Unknown Artist';
      return `"${track.name}" by ${artistName}`;
    }).join(', ');

    // Extract genres and popular artists for SEO
    const genres = [...new Set(tracks.map(track => track.genres || []).flat())].slice(0, 3);
    const popularArtists = tracks
      .map(track => track.artists?.[0]?.name)
      .filter(Boolean)
      .slice(0, 3);

    // Determine if this is an article-based playlist
    const isArticleBased = articleData && articleData.title;
    
    let systemContent = "";
    let userContent = "";

    if (isArticleBased) {
      // Special handling for article-based playlists with marketing focus
      systemContent = `You are a professional music marketing expert who creates viral, shareable playlist titles and descriptions optimized for social media, streaming platforms, and SEO.

CRITICAL: Detect the language of the user's original prompt and respond in the SAME LANGUAGE throughout.

TITLE GUIDELINES - MARKETING OPTIMIZED:
- Create titles that are SHAREABLE and CLICKABLE (2-5 words max)
- Use POWER WORDS that create urgency, emotion, or curiosity
- Include trending music terms when relevant (vibes, feels, hits, energy, mood)
- Make titles that people want to screenshot and share
- Examples: "Viral TikTok Hits", "Late Night Feels", "Summer Anthems 2024", "Chill Vibes Only", "Throwback Energy"
- Avoid generic terms - be specific and memorable
- Consider seasonal relevance and trending topics

DESCRIPTION GUIDELINES - SEO & SHARING OPTIMIZED:
- Write 15-25 words that are highly shareable and searchable
- Include relevant genre keywords naturally
- Use emotional triggers and social proof language
- Include trending hashtags and emojis strategically
- Make it sound like a must-listen playlist
- Examples: "The ultimate collection of indie hits that'll have you hitting repeat all day 🎵 #IndieVibes #NewMusic", "Perfect for your morning commute - these tracks will start your day right ☀️ #MorningPlaylist #GoodVibes"
- Include call-to-action language that encourages sharing
- Reference popular artists or trending sounds when relevant

Make both title and description feel like they belong on a trending playlist that everyone wants to discover and share.

Return as JSON: {"title": "trending title", "description": "shareable description with hashtags and emojis"}`;
      
      userContent = `Inspired by the music news article: "${articleData.title}"

Original prompt: "${prompt}"
Selected tracks: ${trackInfo}
${genres.length > 0 ? `Genres: ${genres.join(', ')}` : ''}
${popularArtists.length > 0 ? `Featured artists: ${popularArtists.join(', ')}` : ''}

Create a viral-worthy title and shareable description that will make people want to discover and share this playlist. Focus on trending music culture and social media appeal.`;
    } else {
      // Regular playlist generation with marketing focus
      systemContent = `You are a professional music marketing expert who creates viral, shareable playlist titles and descriptions optimized for social media, streaming platforms, and SEO.

CRITICAL: Detect the language of the user's original prompt and respond in the SAME LANGUAGE throughout.

TITLE GUIDELINES - MARKETING OPTIMIZED:
- Create titles that are SHAREABLE and CLICKABLE (2-5 words max)
- Use POWER WORDS that create urgency, emotion, or curiosity
- Include trending music terms when relevant (vibes, feels, hits, energy, mood, anthems, bangers)
- Make titles that people want to screenshot and share
- Examples: "Viral TikTok Hits", "Late Night Feels", "Summer Anthems 2024", "Chill Vibes Only", "Throwback Energy", "Indie Gold", "Hip-Hop Heat"
- Avoid generic terms - be specific and memorable
- Consider seasonal relevance and trending topics
- Use alliteration and catchy phrases when possible

DESCRIPTION GUIDELINES - SEO & SHARING OPTIMIZED:
- Write 15-25 words that are highly shareable and searchable
- Include relevant genre keywords naturally
- Use emotional triggers and social proof language
- Include trending hashtags and emojis strategically (2-3 max)
- Make it sound like a must-listen playlist
- Examples: "The ultimate collection of indie hits that'll have you hitting repeat all day 🎵 #IndieVibes #NewMusic", "Perfect for your morning commute - these tracks will start your day right ☀️ #MorningPlaylist #GoodVibes", "Your new obsession starts here - these bangers are pure fire 🔥 #TrendingMusic #ViralHits"
- Include call-to-action language that encourages sharing
- Reference popular artists or trending sounds when relevant
- Use words like "ultimate", "essential", "must-listen", "viral", "trending"

Make both title and description feel like they belong on a trending playlist that everyone wants to discover and share.

Return as JSON: {"title": "trending title", "description": "shareable description with hashtags and emojis"}`;
      
      userContent = `Original prompt: "${prompt}"
Selected tracks: ${trackInfo}
${genres.length > 0 ? `Genres: ${genres.join(', ')}` : ''}
${popularArtists.length > 0 ? `Featured artists: ${popularArtists.join(', ')}` : ''}

Create a viral-worthy title and shareable description that will make people want to discover and share this playlist. Focus on trending music culture, social media appeal, and SEO optimization.`;
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
      
      return {
        title: result.title,
        description: result.description
      };
    } catch (jsonError) {
      console.error("Error parsing JSON from OpenAI response:", jsonError);
      // Return empty if parsing fails
      return { title: "", description: "" };
    }
  } catch (error) {
    console.error("Error generating playlist title and description:", error);
    // Return empty if API call fails
    return { title: "", description: "" };
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
