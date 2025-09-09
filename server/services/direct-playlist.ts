import { config } from 'dotenv';
import OpenAI from 'openai';
import { db } from "../db";
import { eq, like, and, or, sql, desc, asc, inArray } from "drizzle-orm";
import { tracks, tracksToArtists, artists, tracksToGenres, genres } from "@shared/schema";
import { dbTrackToSpotifyTrack } from "../db";

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

interface PlaylistAnalysis {
  strategy: 'text' | 'genre' | 'artist' | 'criteria' | 'random';
  params: any;
  reasoning: string;
}

interface PlaylistResult {
  success: boolean;
  songs?: string[];
  message?: string;
  error?: string;
  strategy?: string;
  reasoning?: string;
}

/**
 * Analyze the user's playlist request to determine the best search strategy
 */
async function analyzePlaylistRequest(prompt: string): Promise<PlaylistAnalysis> {
  console.log(`🎯 Analyzing playlist request: "${prompt}"`);
  
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{
      role: "user",
      content: `Analyze this playlist request and determine the best search strategy:

Request: "${prompt}"

Available strategies:
1. "text" - Use vector similarity search for mood/vibe descriptions
2. "genre" - Search by specific genres mentioned
3. "artist" - Search for songs by specific artists
4. "criteria" - Filter by audio features (energy, tempo, etc.)
5. "random" - Random selection for "surprise me" requests

Respond with ONLY this JSON format:
{
  "strategy": "text|genre|artist|criteria|random",
  "params": {
    // Strategy-specific parameters
  },
  "reasoning": "Brief explanation of why this strategy was chosen"
}

Examples:
- "happy summer music" → {"strategy": "text", "params": {"query": "happy summer music"}, "reasoning": "Mood-based request"}
- "rock playlist" → {"strategy": "genre", "params": {"genres": ["rock"]}, "reasoning": "Genre-specific request"}
- "songs by The Beatles" → {"strategy": "artist", "params": {"artists": ["The Beatles"]}, "reasoning": "Artist-specific request"}
- "high energy workout" → {"strategy": "criteria", "params": {"minEnergy": 0.7, "minDanceability": 0.6}, "reasoning": "Audio feature-based request"}
- "surprise me" → {"strategy": "random", "params": {"limit": 24}, "reasoning": "Random selection requested"}`
    }],
    temperature: 0.3,
    max_tokens: 500
  });

  try {
    const analysis = JSON.parse(response.choices[0].message.content || '{}');
    console.log(`✅ Analysis complete: ${analysis.strategy} - ${analysis.reasoning}`);
    return analysis;
  } catch (error) {
    console.error("Error parsing analysis response:", error);
    // Fallback to text search
    return {
      strategy: 'text',
      params: { query: prompt },
      reasoning: "Fallback to text search due to parsing error"
    };
  }
}

/**
 * Search tracks based on the analysis strategy
 */
async function searchTracksByStrategy(analysis: PlaylistAnalysis): Promise<any[]> {
  console.log(`🔍 Searching tracks using strategy: ${analysis.strategy}`);
  console.log(`🔍 Strategy params:`, analysis.params);
  
  let result: any[] = [];
  
  switch (analysis.strategy) {
    case 'text':
      console.log(`🔍 Executing text search for: "${analysis.params.query}"`);
      result = await searchTracksByText(analysis.params.query, 50);
      break;
    
    case 'genre':
      console.log(`🔍 Executing genre search for:`, analysis.params.genres);
      result = await searchTracksByGenres(analysis.params.genres, 50);
      break;
    
    case 'artist':
      console.log(`🔍 Executing artist search for:`, analysis.params.artists);
      result = await searchTracksByArtists(analysis.params.artists, 50);
      break;
    
    case 'criteria':
      console.log(`🔍 Executing criteria search for:`, analysis.params);
      result = await searchTracksByCriteria(analysis.params, 50);
      break;
    
    case 'random':
      console.log(`🔍 Executing random search with limit:`, analysis.params.limit || 24);
      result = await getRandomTracks(analysis.params.limit || 24);
      break;
    
    default:
      console.log(`🔍 Executing default text search for: "${analysis.params.query || 'music'}"`);
      result = await searchTracksByText(analysis.params.query || "music", 50);
  }
  
  console.log(`🔍 Strategy ${analysis.strategy} returned ${result.length} tracks`);
  return result;
}

/**
 * Use AI to rank and select the best tracks for the playlist
 */
async function rankTracksWithAI(candidateTracks: any[], prompt: string): Promise<string[]> {
  console.log(`🤖 AI ranking ${candidateTracks.length} candidate tracks`);
  
  if (candidateTracks.length <= 24) {
    // If we have 24 or fewer tracks, return them all
    return candidateTracks.map(track => track.id.toString());
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{
      role: "user",
      content: `Select the best 24 tracks for this playlist request: "${prompt}"

Available tracks (${candidateTracks.length} total):
${JSON.stringify(candidateTracks.slice(0, 100), null, 2)} ${candidateTracks.length > 100 ? '\n... (showing first 100)' : ''}

Selection criteria:
- Relevance to the request
- Variety (avoid too many songs from same artist)
- Good flow and pacing
- Quality and popularity
- Mix of different styles/genres

Return ONLY this JSON format:
{
  "songs": ["track_id_1", "track_id_2", ..., "track_id_24"]
}

Select exactly 24 tracks.`
    }],
    temperature: 0.4,
    max_tokens: 1000
  });

  try {
    const result = JSON.parse(response.choices[0].message.content || '{}');
    const selectedIds = result.songs || [];
    
    if (selectedIds.length === 24) {
      console.log(`✅ AI selected ${selectedIds.length} tracks`);
      return selectedIds;
    } else {
      console.log(`⚠️ AI selected ${selectedIds.length} tracks, falling back to first 24`);
      return candidateTracks.slice(0, 24).map(track => track.id.toString());
    }
  } catch (error) {
    console.error("Error parsing AI ranking response:", error);
    // Fallback to first 24 tracks
    return candidateTracks.slice(0, 24).map(track => track.id.toString());
  }
}

/**
 * Search tracks by text using simple LIKE queries
 */
async function searchTracksByText(query: string, limit: number = 24): Promise<any[]> {
  console.log(`🔍 Text search: "${query}" (limit: ${limit})`);
  
  try {
    // Use the fallback method directly for now
    return await searchTracksByTextFallback(query, limit);
  } catch (error) {
    console.error("Error in text search:", error);
    // If even the fallback fails, get random tracks
    return await getRandomTracks(limit);
  }
}

/**
 * Fallback text search using simple LIKE queries
 */
async function searchTracksByTextFallback(query: string, limit: number): Promise<any[]> {
  console.log(`🔄 Using fallback text search for: "${query}"`);
  
  try {
    const result = await db
      .select({
        id: tracks.id,
        title: tracks.title,
        energy: tracks.energy,
        danceability: tracks.danceability,
        valence: tracks.valence,
        artist_names: sql<string[]>`array_agg(DISTINCT ${artists.name})`,
        genre_names: sql<string[]>`array_agg(DISTINCT ${genres.name})`
      })
      .from(tracks)
      .leftJoin(tracksToArtists, eq(tracks.id, tracksToArtists.trackId))
      .leftJoin(artists, eq(tracksToArtists.artistId, artists.id))
      .leftJoin(tracksToGenres, eq(tracks.id, tracksToGenres.trackId))
      .leftJoin(genres, eq(tracksToGenres.genreId, genres.id))
      .where(
        or(
          like(tracks.title, `%${query}%`),
          like(artists.name, `%${query}%`)
        )
      )
      .groupBy(tracks.id)
      .limit(limit);
    
    console.log(`✅ Fallback found ${result.length} tracks`);
    return result;
  } catch (error) {
    console.error("Error in fallback text search:", error);
    // If even the fallback fails, try to get any tracks
    return await getAnyTracks(limit);
  }
}

/**
 * Get any tracks as a last resort
 */
async function getAnyTracks(limit: number): Promise<any[]> {
  console.log(`🆘 Getting any tracks as last resort (limit: ${limit})`);
  
  try {
    const result = await db
      .select({
        id: tracks.id,
        title: tracks.title,
        energy: tracks.energy,
        danceability: tracks.danceability,
        valence: tracks.valence
      })
      .from(tracks)
      .limit(limit);
    
    console.log(`✅ Found ${result.length} tracks as last resort`);
    return result.map(track => ({
      ...track,
      artist_names: [],
      genre_names: []
    }));
  } catch (error) {
    console.error("Error in last resort track fetch:", error);
    return [];
  }
}

/**
 * Search tracks by genres
 */
async function searchTracksByGenres(genreNames: string[], limit: number = 24): Promise<any[]> {
  console.log(`🎵 Genre search: ${genreNames.join(', ')} (limit: ${limit})`);
  
  try {
    const result = await db
      .select({
        id: tracks.id,
        title: tracks.title,
        energy: tracks.energy,
        danceability: tracks.danceability,
        valence: tracks.valence,
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
    
    console.log(`✅ Found ${result.length} tracks for genre search`);
    return result;
  } catch (error) {
    console.error("Error in genre search:", error);
    // Fallback to random tracks
    return await getRandomTracks(limit);
  }
}

/**
 * Search tracks by artists
 */
async function searchTracksByArtists(artistNames: string[], limit: number = 24): Promise<any[]> {
  console.log(`🎤 Artist search: ${artistNames.join(', ')} (limit: ${limit})`);
  
  try {
    const result = await db
      .select({
        id: tracks.id,
        title: tracks.title,
        energy: tracks.energy,
        danceability: tracks.danceability,
        valence: tracks.valence,
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
    
    console.log(`✅ Found ${result.length} tracks for artist search`);
    return result;
  } catch (error) {
    console.error("Error in artist search:", error);
    // Fallback to random tracks
    return await getRandomTracks(limit);
  }
}

/**
 * Search tracks by audio feature criteria
 */
async function searchTracksByCriteria(criteria: any, limit: number = 24): Promise<any[]> {
  console.log(`🎛️ Criteria search:`, criteria);
  
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
    
    console.log(`✅ Found ${result.length} tracks for criteria search`);
    return result;
  } catch (error) {
    console.error("Error in criteria search:", error);
    // Fallback to random tracks
    return await getRandomTracks(limit);
  }
}

/**
 * Get random tracks
 */
async function getRandomTracks(limit: number = 24): Promise<any[]> {
  console.log(`🎲 Random selection: ${limit} tracks`);
  
  try {
    // Use simpler query without joins first
    const result = await db
      .select({
        id: tracks.id,
        title: tracks.title,
        energy: tracks.energy,
        danceability: tracks.danceability,
        valence: tracks.valence
      })
      .from(tracks)
      .orderBy(sql`RANDOM()`)
      .limit(limit);
    
    console.log(`✅ Selected ${result.length} random tracks`);
    return result.map(track => ({
      ...track,
      artist_names: [],
      genre_names: []
    }));
  } catch (error) {
    console.error("Error in random selection:", error);
    // If even random selection fails, try the last resort
    return await getAnyTracks(limit);
  }
}

/**
 * Main function to generate playlist using Direct API approach
 */
export async function generatePlaylistDirect(request: PlaylistRequest): Promise<PlaylistResult> {
  const { prompt, userId, sessionId } = request;
  
  console.log(`🚀 DIRECT API: Starting playlist generation for: "${prompt}"`);
  console.time(`direct-playlist-${sessionId || 'unknown'}`);
  
  try {
    // Step 1: Analyze the request
    console.log("📝 Step 1: Analyzing request...");
    const analysis = await analyzePlaylistRequest(prompt);
    console.log("📝 Analysis result:", analysis);
    
    // Step 2: Search tracks based on analysis
    console.log("🔍 Step 2: Searching tracks...");
    const candidateTracks = await searchTracksByStrategy(analysis);
    console.log(`🔍 Found ${candidateTracks.length} candidate tracks`);
    
    if (candidateTracks.length === 0) {
      console.log("❌ No tracks found for the given criteria");
      return {
        success: false,
        error: "No tracks found matching your criteria",
        message: "Try a different search term or criteria"
      };
    }
    
    // Step 3: Use AI to rank and select best tracks
    console.log("🤖 Step 3: AI ranking and selection...");
    const selectedTrackIds = await rankTracksWithAI(candidateTracks, prompt);
    console.log(`🤖 Selected ${selectedTrackIds.length} tracks`);
    
    // Step 4: Generate title and description
    console.log("🎯 Step 4: Generating title and description...");
    const { title, description } = await generateMarketingTitleAndDescription(prompt, candidateTracks.slice(0, selectedTrackIds.length), analysis);
    
    console.timeEnd(`direct-playlist-${sessionId || 'unknown'}`);
    
    console.log(`✅ DIRECT API: Successfully generated playlist with ${selectedTrackIds.length} songs`);
    console.log(`📝 Generated title: "${title}"`);
    
    return {
      success: true,
      songs: selectedTrackIds,
      title: title,
      description: description,
      message: `Playlist generated using ${analysis.strategy} strategy`,
      strategy: analysis.strategy,
      reasoning: analysis.reasoning
    };
    
  } catch (error) {
    console.error("❌ DIRECT API: Error generating playlist:", error);
    console.timeEnd(`direct-playlist-${sessionId || 'unknown'}`);
    
    return {
      success: false,
      error: error.message,
      message: "Failed to generate playlist"
    };
  }
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

