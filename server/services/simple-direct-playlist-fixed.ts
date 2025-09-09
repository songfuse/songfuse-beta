import { config } from 'dotenv';
import OpenAI from 'openai';
import { db } from "../db";
import { tracks, tracksToArtists, artists, tracksToGenres, genres } from "@shared/schema";
import { sql, eq, like, or, inArray, and } from "drizzle-orm";

// Load environment variables
config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface PlaylistRequest {
  prompt: string;
  userId?: string;
  sessionId?: string;
}

interface PlaylistResult {
  success: boolean;
  songs?: string[];
  tracks?: any[];
  message?: string;
  error?: string;
  strategy?: string;
  reasoning?: string;
}

/**
 * Enhanced Direct API with AI-powered intelligent song selection (FIXED VERSION)
 */
export async function generateSimplePlaylist(request: PlaylistRequest): Promise<PlaylistResult> {
  const { prompt, userId, sessionId } = request;
  
  console.log(`🚀 ENHANCED DIRECT API (FIXED): Starting playlist generation for: "${prompt}"`);
  console.time(`enhanced-playlist-${sessionId || 'unknown'}`);
  
  try {
    // Step 1: Analyze the prompt to determine search strategy
    console.log("🧠 Step 1: Analyzing prompt with AI...");
    const analysis = await analyzePromptWithAI(prompt);
    console.log(`📊 AI Analysis: ${analysis.strategy} - ${analysis.reasoning}`);
    
    // Step 2: Get candidate tracks based on analysis
    console.log("🔍 Step 2: Searching for candidate tracks...");
    const candidateTracks = await searchTracksByStrategy(analysis);
    console.log(`🎵 Found ${candidateTracks.length} candidate tracks`);
    
    if (candidateTracks.length === 0) {
      console.log("⚠️ No tracks found, falling back to random selection");
      return await generateRandomFallback(sessionId);
    }
    
    // Step 3: Use AI to select the best 24 tracks
    console.log("🤖 Step 3: AI selecting best tracks...");
    const selectedTracks = await selectBestTracksWithAI(candidateTracks, prompt, 24);
    console.log(`✨ AI selected ${selectedTracks ? selectedTracks.length : 0} tracks`);
    
    if (!selectedTracks || selectedTracks.length === 0) {
      console.log("⚠️ No tracks selected by AI, using first 24 from candidates");
      const fallbackTracks = candidateTracks.slice(0, 24);
      const trackIds = fallbackTracks.map(track => track.id.toString());
      
      return {
        success: true,
        songs: trackIds,
        tracks: fallbackTracks,
        message: `Playlist generated using ${analysis.strategy} strategy with fallback selection`,
        strategy: analysis.strategy,
        reasoning: analysis.reasoning
      };
    }
    
    const trackIds = selectedTracks.map(track => track.id.toString());
    
    // Generate marketing-focused title and description
    console.log("🎯 Step 4: Generating marketing-focused title and description...");
    const { title, description } = await generateMarketingTitleAndDescription(prompt, selectedTracks, analysis);
    
    console.timeEnd(`enhanced-playlist-${sessionId || 'unknown'}`);
    console.log(`✅ ENHANCED DIRECT API: Successfully generated playlist with ${trackIds.length} songs`);
    console.log(`📝 Generated title: "${title}"`);
    
    return {
      success: true,
      songs: trackIds,
      tracks: selectedTracks,
      title: title,
      description: description,
      message: `Playlist generated using ${analysis.strategy} strategy with AI selection`,
      strategy: analysis.strategy,
      reasoning: analysis.reasoning
    };
    
  } catch (error) {
    console.error("❌ ENHANCED DIRECT API: Error generating playlist:", error);
    console.timeEnd(`enhanced-playlist-${sessionId || 'unknown'}`);
    
    // Fallback to random selection if AI fails
    console.log("🆘 Falling back to random selection due to error");
    return await generateRandomFallback(sessionId);
  }
}

/**
 * Analyze the user prompt with AI to determine the best search strategy
 */
async function analyzePromptWithAI(prompt: string): Promise<{strategy: string, reasoning: string, params: any}> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{
        role: "user",
        content: `Analyze this playlist request and determine the best search strategy:

Request: "${prompt}"

Available strategies:
1. "random" - For general requests like "surprise me", "random music"
2. "text" - For mood/vibe requests like "happy music", "chill vibes", "energetic"
3. "genre" - For genre-specific requests like "rock playlist", "jazz music"
4. "artist" - For artist-specific requests like "songs by The Beatles"
5. "criteria" - For audio feature requests like "high energy workout", "slow songs"

Respond with ONLY this JSON format:
{
  "strategy": "random|text|genre|artist|criteria",
  "reasoning": "Brief explanation of why this strategy was chosen",
  "params": {
    // Strategy-specific parameters
  }
}

Examples:
- "happy summer music" → {"strategy": "text", "reasoning": "Mood-based request", "params": {"query": "happy summer"}}
- "rock playlist" → {"strategy": "genre", "reasoning": "Genre-specific request", "params": {"genres": ["rock"]}}
- "songs by The Beatles" → {"strategy": "artist", "reasoning": "Artist-specific request", "params": {"artists": ["The Beatles"]}}
- "high energy workout" → {"strategy": "criteria", "reasoning": "Audio feature request", "params": {"minEnergy": 0.7, "minDanceability": 0.6}}
- "surprise me" → {"strategy": "random", "reasoning": "Random selection requested", "params": {"limit": 24}}`
      }],
      temperature: 0.3,
      max_tokens: 300
    });

    let jsonText = response.choices[0].message.content || '{}';
    
    // Remove markdown code blocks if present
    if (jsonText.includes('```json')) {
      const jsonMatch = jsonText.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1].trim();
      }
    }
    
    // Remove any leading/trailing text before/after JSON
    const jsonStart = jsonText.indexOf('{');
    const jsonEnd = jsonText.lastIndexOf('}') + 1;
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      jsonText = jsonText.substring(jsonStart, jsonEnd);
    }
    
    const analysis = JSON.parse(jsonText);
    return analysis;
  } catch (error) {
    console.error("Error in AI analysis:", error);
    // Fallback to random strategy
    return {
      strategy: "random",
      reasoning: "Fallback to random due to AI analysis error",
      params: { limit: 24 }
    };
  }
}

/**
 * Search tracks based on the AI analysis strategy
 */
async function searchTracksByStrategy(analysis: {strategy: string, params: any}): Promise<any[]> {
  console.log(`🔍 Searching using strategy: ${analysis.strategy}`);
  
  try {
    switch (analysis.strategy) {
      case 'random':
        return await getRandomTracks(50);
      
      case 'text':
        return await searchTracksByText(analysis.params.query, 50);
      
      case 'genre':
        return await searchTracksByGenres(analysis.params.genres, 50);
      
      case 'artist':
        return await searchTracksByArtists(analysis.params.artists, 50);
      
      case 'criteria':
        return await searchTracksByCriteria(analysis.params, 50);
      
      default:
        return await getRandomTracks(50);
    }
  } catch (error) {
    console.error(`Error in ${analysis.strategy} search:`, error);
    return await getRandomTracks(50);
  }
}

/**
 * Use AI to select the best tracks from candidates
 */
async function selectBestTracksWithAI(candidateTracks: any[], prompt: string, limit: number): Promise<any[]> {
  if (candidateTracks.length <= limit) {
    return candidateTracks;
  }

  try {
    console.log(`🤖 AI selecting best ${limit} tracks from ${candidateTracks.length} candidates`);
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{
        role: "user",
        content: `Select the best ${limit} tracks for this playlist request: "${prompt}"

Available tracks (${candidateTracks.length} total):
${JSON.stringify(candidateTracks.slice(0, 100), null, 2)} ${candidateTracks.length > 100 ? '\n... (showing first 100)' : ''}

Selection criteria:
- Relevance to the request
- Variety (avoid too many songs from same artist)
- Good flow and pacing
- Quality and appeal
- Mix of different styles/genres when appropriate

Return ONLY this JSON format:
{
  "selected_tracks": [
    {"id": "track_id_1", "title": "Track Title 1"},
    {"id": "track_id_2", "title": "Track Title 2"},
    ...
  ]
}

Select exactly ${limit} tracks.`
      }],
      temperature: 0.4,
      max_tokens: 2000
    });

    let jsonText = response.choices[0].message.content || '{}';
    
    // Remove markdown code blocks if present
    if (jsonText.includes('```json')) {
      const jsonMatch = jsonText.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1].trim();
      }
    }
    
    // Remove any leading/trailing text before/after JSON
    const jsonStart = jsonText.indexOf('{');
    const jsonEnd = jsonText.lastIndexOf('}') + 1;
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      jsonText = jsonText.substring(jsonStart, jsonEnd);
    }
    
    const result = JSON.parse(jsonText);
    const selectedTracks = result.selected_tracks || [];
    
    if (selectedTracks && selectedTracks.length > 0) {
      // Map back to full track objects
      const mappedTracks = selectedTracks.map(selected => 
        candidateTracks.find(track => track.id.toString() === selected.id.toString())
      ).filter(Boolean);
      
      console.log(`✅ AI mapped ${mappedTracks.length} tracks from ${selectedTracks.length} selections`);
      
      if (mappedTracks.length >= limit) {
        return mappedTracks.slice(0, limit);
      } else {
        console.log(`⚠️ AI selected ${mappedTracks.length} tracks, filling with random to reach ${limit}`);
        const remaining = limit - mappedTracks.length;
        const randomTracks = candidateTracks.filter(track => 
          !mappedTracks.some(mapped => mapped.id === track.id)
        ).slice(0, remaining);
        return [...mappedTracks, ...randomTracks];
      }
    } else {
      console.log(`⚠️ AI selected 0 tracks, using first ${limit} from candidates`);
      return candidateTracks.slice(0, limit);
    }
  } catch (error) {
    console.error("Error in AI track selection:", error);
    return candidateTracks.slice(0, limit);
  }
}

/**
 * Fallback to random selection if everything else fails
 */
async function generateRandomFallback(sessionId?: string): Promise<PlaylistResult> {
  console.log("🎲 Using random fallback selection");
  
  try {
    const result = await getRandomTracks(24);
    const trackIds = result.map(track => track.id.toString());
    
    return {
      success: true,
      songs: trackIds,
      tracks: result,
      title: "",
      description: "",
      message: "Playlist generated using random selection (fallback)",
      strategy: "random"
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      message: "Failed to generate playlist even with fallback"
    };
  }
}

/**
 * Get random tracks (SIMPLIFIED VERSION)
 */
async function getRandomTracks(limit: number): Promise<any[]> {
  const result = await db
    .select({
      id: tracks.id,
      title: tracks.title,
      energy: tracks.energy,
      danceability: tracks.danceability,
      valence: tracks.valence,
      duration: tracks.duration,
      explicit: tracks.explicit,
      popularity: tracks.popularity,
      previewUrl: tracks.previewUrl,
      artist_names: sql<string[]>`array_agg(DISTINCT ${artists.name})`,
      genre_names: sql<string[]>`array_agg(DISTINCT ${genres.name})`
    })
    .from(tracks)
    .leftJoin(tracksToArtists, eq(tracks.id, tracksToArtists.trackId))
    .leftJoin(artists, eq(tracksToArtists.artistId, artists.id))
    .leftJoin(tracksToGenres, eq(tracks.id, tracksToGenres.trackId))
    .leftJoin(genres, eq(tracksToGenres.genreId, genres.id))
    .groupBy(tracks.id)
    .orderBy(sql`RANDOM()`)
    .limit(limit);
  
  return result;
}

/**
 * Search tracks by text (mood/vibe) - SIMPLIFIED VERSION
 */
async function searchTracksByText(query: string, limit: number): Promise<any[]> {
  console.log(`🔍 Text search for: "${query}" (limit: ${limit})`);
  
  try {
    // Split query into words for better matching
    const words = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
    
    if (words.length === 0) {
      console.log("⚠️ No meaningful words in query, using random");
      return await getRandomTracks(limit);
    }
    
    // Create multiple search conditions
    const conditions = [];
    
    // Search in track titles
    words.forEach(word => {
      conditions.push(like(tracks.title, `%${word}%`));
    });
    
    // Search in artist names
    words.forEach(word => {
      conditions.push(like(artists.name, `%${word}%`));
    });
    
    // Search in genre names
    words.forEach(word => {
      conditions.push(like(genres.name, `%${word}%`));
    });
    
    const result = await db
      .select({
        id: tracks.id,
        title: tracks.title,
        energy: tracks.energy,
        danceability: tracks.danceability,
        valence: tracks.valence,
        duration: tracks.duration,
        explicit: tracks.explicit,
        popularity: tracks.popularity,
        previewUrl: tracks.previewUrl,
        artist_names: sql<string[]>`array_agg(DISTINCT ${artists.name})`,
        genre_names: sql<string[]>`array_agg(DISTINCT ${genres.name})`
      })
      .from(tracks)
      .leftJoin(tracksToArtists, eq(tracks.id, tracksToArtists.trackId))
      .leftJoin(artists, eq(tracksToArtists.artistId, artists.id))
      .leftJoin(tracksToGenres, eq(tracks.id, tracksToGenres.trackId))
      .leftJoin(genres, eq(tracksToGenres.genreId, genres.id))
      .where(or(...conditions))
      .groupBy(tracks.id)
      .limit(limit);
    
    console.log(`✅ Text search found ${result.length} tracks`);
    return result;
  } catch (error) {
    console.error("❌ Error in text search:", error);
    return await getRandomTracks(limit);
  }
}

/**
 * Search tracks by genres - SIMPLIFIED VERSION
 */
async function searchTracksByGenres(genreNames: string[], limit: number): Promise<any[]> {
  console.log(`🎵 Genre search for: ${genreNames.join(', ')} (limit: ${limit})`);
  
  try {
    const result = await db
      .select({
        id: tracks.id,
        title: tracks.title,
        energy: tracks.energy,
        danceability: tracks.danceability,
        valence: tracks.valence,
        duration: tracks.duration,
        explicit: tracks.explicit,
        popularity: tracks.popularity,
        previewUrl: tracks.previewUrl,
        artist_names: sql<string[]>`array_agg(DISTINCT ${artists.name})`,
        genre_names: sql<string[]>`array_agg(DISTINCT ${genres.name})`
      })
      .from(tracks)
      .leftJoin(tracksToArtists, eq(tracks.id, tracksToArtists.trackId))
      .leftJoin(artists, eq(tracksToArtists.artistId, artists.id))
      .leftJoin(tracksToGenres, eq(tracks.id, tracksToGenres.trackId))
      .leftJoin(genres, eq(tracksToGenres.genreId, genres.id))
      .where(inArray(genres.name, genreNames))
      .groupBy(tracks.id)
      .limit(limit);
    
    console.log(`✅ Genre search found ${result.length} tracks`);
    return result;
  } catch (error) {
    console.error("❌ Error in genre search:", error);
    return await getRandomTracks(limit);
  }
}

/**
 * Search tracks by artists - SIMPLIFIED VERSION
 */
async function searchTracksByArtists(artistNames: string[], limit: number): Promise<any[]> {
  console.log(`🎤 Artist search for: ${artistNames.join(', ')} (limit: ${limit})`);
  
  try {
    const result = await db
      .select({
        id: tracks.id,
        title: tracks.title,
        energy: tracks.energy,
        danceability: tracks.danceability,
        valence: tracks.valence,
        duration: tracks.duration,
        explicit: tracks.explicit,
        popularity: tracks.popularity,
        previewUrl: tracks.previewUrl,
        artist_names: sql<string[]>`array_agg(DISTINCT ${artists.name})`,
        genre_names: sql<string[]>`array_agg(DISTINCT ${genres.name})`
      })
      .from(tracks)
      .leftJoin(tracksToArtists, eq(tracks.id, tracksToArtists.trackId))
      .leftJoin(artists, eq(tracksToArtists.artistId, artists.id))
      .leftJoin(tracksToGenres, eq(tracks.id, tracksToGenres.trackId))
      .leftJoin(genres, eq(tracksToGenres.genreId, genres.id))
      .where(inArray(artists.name, artistNames))
      .groupBy(tracks.id)
      .limit(limit);
    
    console.log(`✅ Artist search found ${result.length} tracks`);
    return result;
  } catch (error) {
    console.error("❌ Error in artist search:", error);
    return await getRandomTracks(limit);
  }
}

/**
 * Search tracks by audio feature criteria - SIMPLIFIED VERSION
 */
async function searchTracksByCriteria(criteria: any, limit: number): Promise<any[]> {
  try {
    const conditions = [];
    
    if (criteria.minEnergy !== undefined) {
      conditions.push(sql`${tracks.energy} >= ${criteria.minEnergy}`);
    }
    if (criteria.maxEnergy !== undefined) {
      conditions.push(sql`${tracks.energy} <= ${criteria.maxEnergy}`);
    }
    if (criteria.minDanceability !== undefined) {
      conditions.push(sql`${tracks.danceability} >= ${criteria.minDanceability}`);
    }
    if (criteria.maxDanceability !== undefined) {
      conditions.push(sql`${tracks.danceability} <= ${criteria.maxDanceability}`);
    }
    if (criteria.minValence !== undefined) {
      conditions.push(sql`${tracks.valence} >= ${criteria.minValence}`);
    }
    if (criteria.maxValence !== undefined) {
      conditions.push(sql`${tracks.valence} <= ${criteria.maxValence}`);
    }
    if (criteria.genres && criteria.genres.length > 0) {
      conditions.push(inArray(genres.name, criteria.genres));
    }
    
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    const result = await db
      .select({
        id: tracks.id,
        title: tracks.title,
        energy: tracks.energy,
        danceability: tracks.danceability,
        valence: tracks.valence,
        duration: tracks.duration,
        explicit: tracks.explicit,
        popularity: tracks.popularity,
        previewUrl: tracks.previewUrl,
        artist_names: sql<string[]>`array_agg(DISTINCT ${artists.name})`,
        genre_names: sql<string[]>`array_agg(DISTINCT ${genres.name})`
      })
      .from(tracks)
      .leftJoin(tracksToArtists, eq(tracks.id, tracksToArtists.trackId))
      .leftJoin(artists, eq(tracksToArtists.artistId, artists.id))
      .leftJoin(tracksToGenres, eq(tracks.id, tracksToGenres.trackId))
      .leftJoin(genres, eq(tracksToGenres.genreId, genres.id))
      .where(whereClause)
      .groupBy(tracks.id)
      .limit(limit);
    
    return result;
  } catch (error) {
    console.error("Error in criteria search:", error);
    return await getRandomTracks(limit);
  }
}

/**
 * Generate contextual fallback title and description based on prompt
 */
function generateContextualFallback(prompt: string): { title: string; description: string } {
  const lowerPrompt = prompt.toLowerCase();
  
  // Define contextual title patterns based on prompt content
  const titlePatterns = {
    // Mood-based patterns
    chill: ["Chill Vibes", "Relaxed Feels", "Mellow Mood"],
    energetic: ["High Energy", "Pump Up", "Power Hits"],
    sad: ["Emotional Vibes", "Deep Feels", "Soulful Sounds"],
    happy: ["Good Vibes", "Happy Hits", "Joyful Jams"],
    
    // Activity-based patterns
    workout: ["Workout Anthems", "Gym Vibes", "Fitness Hits"],
    party: ["Party Bangers", "Dance Hits", "Club Vibes"],
    study: ["Study Vibes", "Focus Flow", "Concentration Hits"],
    drive: ["Road Trip Hits", "Drive Vibes", "Highway Jams"],
    
    // Genre-based patterns
    pop: ["Pop Hits", "Pop Vibes", "Pop Anthems"],
    rock: ["Rock Hits", "Rock Vibes", "Rock Anthems"],
    hip: ["Hip-Hop Heat", "Rap Vibes", "Hip-Hop Hits"],
    indie: ["Indie Gold", "Indie Vibes", "Indie Hits"],
    electronic: ["Electronic Vibes", "EDM Hits", "Synth Sounds"],
    
    // Time-based patterns
    morning: ["Morning Vibes", "Wake Up Hits", "Start Your Day"],
    night: ["Late Night Vibes", "Night Feels", "Midnight Hits"],
    summer: ["Summer Vibes", "Summer Hits", "Summer Anthems"],
    winter: ["Winter Vibes", "Cozy Hits", "Winter Feels"],
    
    // Default patterns
    default: ["Curated Hits", "Music Vibes", "Playlist Gold"]
  };
  
  // Define contextual description patterns
  const descriptionPatterns = {
    chill: "Perfect for when you need to unwind and relax 🧘‍♀️ #ChillVibes #Relax",
    energetic: "Get ready to move and groove with these high-energy tracks 🔥 #HighEnergy #PumpUp",
    sad: "For those moments when you need to feel all the feels 💔 #EmotionalVibes #DeepFeels",
    happy: "Spread the joy with these uplifting and positive tracks ✨ #GoodVibes #HappyHits",
    workout: "Your ultimate workout companion - these tracks will keep you motivated 💪 #WorkoutVibes #Fitness",
    party: "Turn up the volume and get the party started 🎉 #PartyVibes #DanceHits",
    study: "Stay focused and productive with these concentration-friendly tracks 📚 #StudyVibes #Focus",
    drive: "Hit the road with these perfect driving companions 🚗 #RoadTrip #DriveVibes",
    pop: "The best of pop music that'll have you singing along 🎤 #PopHits #PopVibes",
    rock: "Rock out with these powerful and energetic tracks 🎸 #RockHits #RockVibes",
    hip: "Feel the rhythm and flow with these hip-hop essentials 🎧 #HipHop #RapVibes",
    indie: "Discover amazing indie tracks that deserve more recognition 🎵 #IndieVibes #IndieGold",
    electronic: "Dive into the electronic soundscape with these synth-heavy tracks 🎛️ #Electronic #EDM",
    morning: "Start your day right with these energizing morning tracks ☀️ #MorningVibes #WakeUp",
    night: "Perfect for those late-night listening sessions 🌙 #LateNight #NightVibes",
    summer: "Feel the summer vibes with these sunny and upbeat tracks ☀️ #SummerVibes #SummerHits",
    winter: "Cozy up with these warm and comforting winter tracks ❄️ #WinterVibes #Cozy",
    default: "A carefully curated collection of tracks that'll have you hitting repeat 🎵 #CuratedHits #MusicVibes"
  };
  
  // Determine the best match based on prompt content
  let selectedCategory = 'default';
  let selectedTitle = titlePatterns.default[0];
  let selectedDescription = descriptionPatterns.default;
  
  // Check for specific patterns in order of specificity
  for (const [category, patterns] of Object.entries(titlePatterns)) {
    if (category === 'default') continue;
    
    const keywords = category.split(/(?=[A-Z])/).map(word => word.toLowerCase());
    const hasMatch = keywords.some(keyword => lowerPrompt.includes(keyword));
    
    if (hasMatch) {
      selectedCategory = category;
      selectedTitle = patterns[Math.floor(Math.random() * patterns.length)];
      selectedDescription = descriptionPatterns[category];
      break;
    }
  }
  
  return {
    title: selectedTitle,
    description: selectedDescription + signature
  };
}

/**
 * Generate marketing-focused title and description for playlist
 */
async function generateMarketingTitleAndDescription(
  prompt: string, 
  tracks: any[], 
  analysis: any
): Promise<{ title: string; description: string }> {
  try {
    console.log("🎯 Generating marketing-focused title and description...");
    
    // Extract track info for context
    const trackInfo = tracks.slice(0, 5).map(track => {
      const artistName = track.artist_names && track.artist_names[0] ? track.artist_names[0] : 'Unknown Artist';
      return `"${track.title}" by ${artistName}`;
    }).join(', ');

    // Extract genres and popular artists for SEO
    const genres = [...new Set(tracks.map(track => track.genres || []).flat())].slice(0, 3);
    const popularArtists = tracks
      .map(track => track.artist_names?.[0])
      .filter(Boolean)
      .slice(0, 3);

    const systemPrompt = `You are a professional music marketing expert who creates viral, shareable playlist titles and descriptions optimized for social media, streaming platforms, and SEO.

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

Make both title and description feel like they belong on a trending playlist that everyone wants to discover and share.

Return as JSON: {"title": "trending title", "description": "shareable description with hashtags and emojis"}`;

    const userPrompt = `Original prompt: "${prompt}"
Selected tracks: ${trackInfo}
${genres.length > 0 ? `Genres: ${genres.join(', ')}` : ''}
${popularArtists.length > 0 ? `Featured artists: ${popularArtists.join(', ')}` : ''}
Strategy used: ${analysis.strategy}

Create a viral-worthy title and shareable description that will make people want to discover and share this playlist. Focus on trending music culture, social media appeal, and SEO optimization.`;

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
    console.error("Error generating marketing title and description:", error);
    // Return empty if API call fails
    return { title: "", description: "" };
  }
}
