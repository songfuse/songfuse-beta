/**
 * Priority-Based Prompt Analysis System for Song Selection
 * 
 * This module analyzes user prompts for playlist generation with a hierarchical priority system:
 * 1. Explicit mentions (artists, genres, decades) are given highest priority
 * 2. Emoji-based indicators provide additional context for mood, genre, and energy
 * 3. Contextual/implied preferences are considered third
 * 4. Diversity mechanisms ensure varied, non-repetitive playlists
 */

import { openai } from './index';
import { db } from '../db';
import { artists as artistsTable, genres as genresTable } from '@shared/schema';
import { eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { analyzeEmojisInPrompt } from './emoji-analyzer';

// Types for the priority-based prompt analysis
export interface PromptAnalysisResult {
  // First priority level - explicit mentions
  explicitArtists: string[];
  explicitGenres: string[];
  explicitDecades: number[];
  
  // Second priority level - emoji indicators
  emojiMoods: {mood: string, confidence: number, source: string}[];
  emojiGenres: {genre: string, confidence: number, source: string}[];
  emojiEra: string | null;
  emojiOccasion: string | null;
  
  // Third priority level - implied characteristics
  impliedMoods: {mood: string, confidence: number}[];
  impliedOccasions: {occasion: string, confidence: number}[];
  energyLevel: number; // 0-100 scale
  
  // Diversity controls
  diversityPreference: number; // 0-100 scale
  obscurityPreference: number; // 0-100 scale (higher = more obscure tracks preferred)
  
  // Additional context
  narrativeElements: string[];
  queryEmbedding?: number[];
  avoidExplicit: boolean;
  hasEmojis: boolean;
}

export interface SongSelectionCriteria {
  // First-tier criteria (explicit mentions)
  explicitArtistIds: number[];
  explicitGenreIds: number[];
  yearRanges: {start: number, end: number}[];
  
  // Second-tier criteria (implied preferences)
  moodWeights: {[mood: string]: number};
  energyRange: {min: number, max: number};
  
  // Combination parameters
  vectorSimilarity?: number[];
  vectorSimilarityWeight: number;
  maxArtistRepetition: number;
  avoidExplicit: boolean;
}

/**
 * Central function to analyze a user prompt using the priority-based system
 */
export async function analyzeUserPrompt(prompt: string): Promise<PromptAnalysisResult> {
  console.log('Starting priority-based prompt analysis for:', prompt);
  
  // Initialize result with default values
  const result: PromptAnalysisResult = {
    explicitArtists: [],
    explicitGenres: [],
    explicitDecades: [],
    emojiMoods: [],
    emojiGenres: [],
    emojiEra: null,
    emojiOccasion: null,
    impliedMoods: [],
    impliedOccasions: [],
    energyLevel: 50,
    diversityPreference: 50, 
    obscurityPreference: 30,
    narrativeElements: [],
    avoidExplicit: isExplicitContentAvoidanceRequested(prompt),
    hasEmojis: false
  };

  // Step 1: Extract explicit mentions (fastest and highest priority)
  console.time('extractExplicitMentions');
  await Promise.all([
    extractExplicitArtists(prompt).then(artists => { result.explicitArtists = artists; }),
    extractExplicitGenres(prompt).then(genres => { result.explicitGenres = genres; }),
    extractExplicitDecades(prompt).then(decades => { result.explicitDecades = decades; })
  ]);
  console.timeEnd('extractExplicitMentions');

  // Step 2: Analyze emojis in the prompt (fast and adds context)
  console.time('emojiAnalysis');
  const emojiAnalysis = analyzeEmojisInPrompt(prompt);
  result.emojiMoods = emojiAnalysis.moodIndicators;
  result.emojiGenres = emojiAnalysis.genreIndicators;
  result.emojiEra = emojiAnalysis.era;
  result.emojiOccasion = emojiAnalysis.occasion;
  result.hasEmojis = emojiAnalysis.hasEmojis;
  
  // If emojis provided energy/diversity signals, use them
  if (result.hasEmojis) {
    // Use emoji energy level if available
    result.energyLevel = emojiAnalysis.energy;
    
    // Apply emoji-based diversity boost if there is one
    if (emojiAnalysis.diversityBoost !== 0) {
      result.diversityPreference = Math.min(100, Math.max(0, 
        result.diversityPreference + emojiAnalysis.diversityBoost
      ));
    }
    
    console.log(`Emoji analysis results - Found: ${result.hasEmojis},` +
      ` Moods: ${result.emojiMoods.length},` +
      ` Genres: ${result.emojiGenres.length},` +
      ` Era: ${result.emojiEra},` +
      ` Occasion: ${result.emojiOccasion},` +
      ` Energy: ${emojiAnalysis.energy},` + 
      ` Diversity boost: ${emojiAnalysis.diversityBoost}`);
  }
  console.timeEnd('emojiAnalysis');

  // Step 3: Only if no explicit mentions are found, perform deeper analysis
  if (
    result.explicitArtists.length === 0 && 
    result.explicitGenres.length === 0 && 
    result.explicitDecades.length === 0 &&
    result.emojiGenres.length === 0 // Don't do deep analysis if we have emoji genres
  ) {
    console.log('No explicit mentions or emoji genres found, performing deep semantic analysis');
    console.time('deepSemanticAnalysis');
    const deepAnalysis = await performDeepPromptAnalysis(prompt);
    
    // Use deep analysis results only if we don't have emoji indicators already
    if (result.emojiMoods.length === 0) {
      result.impliedMoods = deepAnalysis.moods;
    }
    
    if (!result.emojiOccasion) {
      result.impliedOccasions = deepAnalysis.occasions;
    }
    
    // Only use deep analysis energy if we don't have emoji energy
    if (!result.hasEmojis) {
      result.energyLevel = deepAnalysis.energy;
    }
    
    // For diversity, use maximum of emoji-based and deep analysis
    if (!result.hasEmojis || deepAnalysis.diversity > result.diversityPreference) {
      result.diversityPreference = deepAnalysis.diversity;
    }
    
    result.narrativeElements = deepAnalysis.narrative;
    console.log(`Deep analysis results - Energy: ${deepAnalysis.energy}, Diversity: ${deepAnalysis.diversity}`);
    console.timeEnd('deepSemanticAnalysis');
  } else {
    const skipReason = result.explicitArtists.length > 0 || 
                        result.explicitGenres.length > 0 || 
                        result.explicitDecades.length > 0 ? 'explicit mentions' : 'emoji indicators';
    
    console.log(`Skipping deep semantic analysis due to ${skipReason}:` +
      `${result.explicitArtists.length} artists, ${result.explicitGenres.length} genres, ` +
      `${result.explicitDecades.length} decades, ${result.emojiGenres.length} emoji genres`);
  }

  console.log('Completed priority-based prompt analysis');
  return result;
}

/**
 * Extract explicit artist mentions from the prompt by checking against the database
 */
async function extractExplicitArtists(prompt: string): Promise<string[]> {
  const normalizedPrompt = prompt.toLowerCase();
  const foundArtists: string[] = [];
  
  try {
    // Get artists from database
    const dbArtists = await db.select({
      id: artistsTable.id,
      name: artistsTable.name
    })
    .from(artistsTable)
    .orderBy(sql`LENGTH(${artistsTable.name}) DESC`); // Match longer names first to avoid substrings
    
    // Match artists mentioned in the prompt with word boundaries
    for (const artist of dbArtists) {
      const artistNameLower = artist.name.toLowerCase();
      
      // Create a regex to match the artist name with word boundaries
      // This avoids matching substrings of other words
      const regex = new RegExp(`\\b${escapeRegExp(artistNameLower)}\\b`, 'i');
      
      if (regex.test(normalizedPrompt)) {
        foundArtists.push(artist.name);
        continue;
      }
      
      // Check for possessive forms ("Taylor Swift's music")
      const possessiveRegex = new RegExp(`\\b${escapeRegExp(artistNameLower)}'s\\b`, 'i');
      if (possessiveRegex.test(normalizedPrompt)) {
        foundArtists.push(artist.name);
      }
    }
    
    // Limit to a reasonable number of artists
    return foundArtists.slice(0, 5);
  } catch (error) {
    console.error('Error extracting explicit artists:', error);
    return [];
  }
}

/**
 * Extract explicit genre mentions from the prompt by checking against the database
 */
async function extractExplicitGenres(prompt: string): Promise<string[]> {
  const normalizedPrompt = prompt.toLowerCase();
  const matchedGenres: string[] = [];
  
  try {
    // Get genres from database
    const dbGenres = await db.select({
      id: genresTable.id,
      name: genresTable.name
    })
    .from(genresTable)
    .orderBy(sql`LENGTH(${genresTable.name}) DESC`); // Match longer genres first
    
    // Create a map of genre aliases/variations with significantly enhanced K-pop detection
    const genreVariations: Record<string, string[]> = {
      'k-pop': ['kpop', 'k pop', 'korean pop', 'korean music', 'korean', 'k-pop', 'k-pop music'],
      'j-pop': ['jpop', 'j pop', 'japanese pop', 'japanese music'],
      'c-pop': ['cpop', 'c pop', 'chinese pop', 'chinese music', 'mandopop', 'cantopop'],
      'hip hop': ['hip-hop', 'hiphop', 'rap'],
      'r&b': ['rnb', 'r and b', 'rhythm and blues'],
      'electronic': ['edm', 'electronica', 'electronic dance'],
      'rock': ['rock and roll', 'rock n roll', 'rock n\'roll'],
      'indie': ['independent', 'indie rock', 'indie pop']
      // Add more variations as needed
    };
    
    // Reverse map for lookup
    const normalizedGenreMap: Record<string, string> = {};
    
    // Add original genres
    for (const genre of dbGenres) {
      normalizedGenreMap[genre.name.toLowerCase()] = genre.name;
    }
    
    // Add variations
    for (const [mainGenre, variations] of Object.entries(genreVariations)) {
      for (const variation of variations) {
        normalizedGenreMap[variation.toLowerCase()] = mainGenre;
      }
    }
    
    // Check for direct genre mentions with word boundaries
    for (const [variation, canonicalGenre] of Object.entries(normalizedGenreMap)) {
      const regex = new RegExp(`\\b${escapeRegExp(variation)}\\b`, 'i');
      if (regex.test(normalizedPrompt) && !matchedGenres.includes(canonicalGenre)) {
        matchedGenres.push(canonicalGenre);
      }
    }
    
    // Check for compound descriptors: "jazz-influenced", "rock-inspired"
    for (const [variation, canonicalGenre] of Object.entries(normalizedGenreMap)) {
      const compoundRegex = new RegExp(`\\b${escapeRegExp(variation)}[- ](inspired|influenced|like|style|based)\\b`, 'i');
      if (compoundRegex.test(normalizedPrompt) && !matchedGenres.includes(canonicalGenre)) {
        matchedGenres.push(canonicalGenre);
      }
    }
    
    // Limit to a reasonable number of genres
    return matchedGenres.slice(0, 5);
  } catch (error) {
    console.error('Error extracting explicit genres:', error);
    return [];
  }
}

/**
 * Extract explicit decade/era mentions from the prompt
 */
function extractExplicitDecades(prompt: string): Promise<number[]> {
  return new Promise(resolve => {
    const normalizedPrompt = prompt.toLowerCase();
    const decades: number[] = [];
    
    // 1. Direct decade mentions (70s, 80s, 90s, etc.)
    const decadeRegex = /\b(19\d0s|20\d0s|\d0s)\b/gi;
    const decadeMatches = normalizedPrompt.match(decadeRegex) || [];
    
    for (const match of decadeMatches) {
      // Standardize to full format (e.g., convert "80s" to 1980)
      let decadeValue: number | undefined;
      
      if (match.length === 3) { // "80s" format
        const prefix = match.charAt(0) === "9" ? "19" : "20";
        decadeValue = parseInt(prefix + match.substring(0, 1) + "0");
      } else if (match.length === 5) { // "1980s" or "2010s" format
        decadeValue = parseInt(match.substring(0, 4));
      }
      
      if (decadeValue && !decades.includes(decadeValue)) {
        decades.push(decadeValue);
      }
    }
    
    // 2. Era descriptions
    const eraMap: {[key: string]: number} = {
      "early 2000s": 2000,
      "mid 2000s": 2000,
      "late 2000s": 2000,
      "early nineties": 1990,
      "mid nineties": 1990,
      "late nineties": 1990,
      "early eighties": 1980,
      "mid eighties": 1980,
      "late eighties": 1980,
      "early seventies": 1970,
      "mid seventies": 1970,
      "late seventies": 1970,
      "early sixties": 1960,
      "mid sixties": 1960,
      "late sixties": 1960,
      "disco era": 1970,
      "grunge era": 1990,
      "new wave era": 1980,
      "britpop era": 1990,
      "classic rock era": 1970,
      "hair metal era": 1980,
      "hip hop golden age": 1990,
      "motown era": 1960,
      "punk era": 1970,
      "y2k": 2000,
      "millennium": 2000
    };
    
    for (const [era, decadeValue] of Object.entries(eraMap)) {
      if (normalizedPrompt.includes(era) && !decades.includes(decadeValue)) {
        decades.push(decadeValue);
      }
    }
    
    // 3. Year ranges - using a simpler approach to avoid [...matchAll] issues
    const yearRangeRegex = /\b(19\d\d|20\d\d)\s*(?:-|to|through|until|and)\s*(19\d\d|20\d\d)\b/gi;
    let rangeMatch;
    const yearRanges: Array<[string, string]> = [];
    
    // Collect all matches
    while ((rangeMatch = yearRangeRegex.exec(normalizedPrompt)) !== null) {
      yearRanges.push([rangeMatch[1], rangeMatch[2]]);
    }
    
    // Process the matches
    for (const [startYearStr, endYearStr] of yearRanges) {
      const startYear = parseInt(startYearStr);
      const endYear = parseInt(endYearStr);
      
      // Convert years to decades
      const startDecade = Math.floor(startYear / 10) * 10;
      const endDecade = Math.floor(endYear / 10) * 10;
      
      // Add all decades in the range
      for (let decadeValue = startDecade; decadeValue <= endDecade; decadeValue += 10) {
        if (!decades.includes(decadeValue)) {
          decades.push(decadeValue);
        }
      }
    }
    
    // 4. Specific year mentions
    const yearRegex = /\b(19\d\d|20\d\d)\b/g;
    const yearMatches = normalizedPrompt.match(yearRegex) || [];
    
    for (const yearStr of yearMatches) {
      const year = parseInt(yearStr);
      const decadeValue = Math.floor(year / 10) * 10;
      
      if (!decades.includes(decadeValue)) {
        decades.push(decadeValue);
      }
    }
    
    resolve(decades);
  });
}

/**
 * Check if the prompt indicates a preference for avoiding explicit content
 */
function isExplicitContentAvoidanceRequested(prompt: string): boolean {
  const normalizedPrompt = prompt.toLowerCase();
  const explicitAvoidanceTerms = [
    'clean', 
    'no explicit', 
    'non explicit',
    'not explicit',
    'family friendly', 
    'kid friendly',
    'child friendly',
    'pg rated',
    'g rated',
    'appropriate for children',
    'appropriate for kids',
    'no swearing',
    'no profanity',
    'safe for work',
    'sfw'
  ];
  
  return explicitAvoidanceTerms.some(term => normalizedPrompt.includes(term));
}

/**
 * Deep semantic analysis when explicit mentions are missing
 */
async function performDeepPromptAnalysis(prompt: string): Promise<{
  moods: {mood: string, confidence: number}[];
  occasions: {occasion: string, confidence: number}[];
  energy: number;
  narrative: string[];
  diversity: number; // New property for diversity preference
}> {
  try {
    const systemPrompt = `
      Analyze the following music playlist request and extract key characteristics.
      Respond in JSON format with the following structure:
      {
        "moods": [{"mood": string, "confidence": number}], // 0-1 confidence
        "occasions": [{"occasion": string, "confidence": number}], // 0-1 confidence
        "energy": number, // 0-100 scale (0=calm, 100=energetic)
        "diversity": number, // 0-100 scale (0=highly focused on one style, 100=maximum variety)
        "narrative": [string] // Key narrative elements or themes
      }
      
      Common moods include: energetic, mellow, happy, sad, angry, romantic, nostalgic, dark, uplifting, relaxed, anxious
      Common occasions include: workout, party, study, driving, dinner, morning, night, wedding, roadtrip, meditation
      
      For diversity assessment:
      - Low (0-30): When the request implies focus on a specific sound, artist similarity, or consistent style
      - Medium (31-70): Default level - balanced variety while maintaining coherence
      - High (71-100): When the request explicitly asks for eclectic mixes, variety, or diverse exploration
      
      Be specific and detailed. Prioritize musical characteristics over generic descriptions.
    `;
    
    const response = await openai.chat.completions.create({
      model: "gpt-4", // Using gpt-4 since it's what the system is set up for
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      temperature: 0.3 // Lower temperature for more consistent results
    });
    
    try {
      const content = response.choices[0].message.content || '{}';
      const result = JSON.parse(content);
      
      return {
        moods: Array.isArray(result.moods) ? result.moods : [],
        occasions: Array.isArray(result.occasions) ? result.occasions : [],
        energy: typeof result.energy === 'number' ? result.energy : 50,
        diversity: typeof result.diversity === 'number' ? result.diversity : 50,
        narrative: Array.isArray(result.narrative) ? result.narrative : []
      };
    } catch (parseError) {
      console.error('Error parsing deep analysis response:', parseError);
      // Return default values if parsing fails
      return {
        moods: [],
        occasions: [],
        energy: 50,
        diversity: 50,
        narrative: []
      };
    }
  } catch (error) {
    console.error('Error in deep prompt analysis:', error);
    // Return fallback values if OpenAI call fails
    return {
      moods: [],
      occasions: [],
      energy: 50,
      diversity: 50,
      narrative: []
    };
  }
}

/**
 * Convert analysis results to song selection criteria for database queries
 */
export async function buildSongSelectionCriteria(analysis: PromptAnalysisResult): Promise<SongSelectionCriteria> {
  const criteria: SongSelectionCriteria = {
    explicitArtistIds: [],
    explicitGenreIds: [],
    yearRanges: [],
    moodWeights: {},
    energyRange: {min: 0, max: 100},
    vectorSimilarityWeight: 0.5,
    maxArtistRepetition: 3,
    avoidExplicit: analysis.avoidExplicit
  };
  
  // Convert artist names to database IDs
  if (analysis.explicitArtists.length > 0) {
    criteria.explicitArtistIds = await getArtistIdsFromNames(analysis.explicitArtists);
    // Adjust vector similarity weight down when explicit artists present
    criteria.vectorSimilarityWeight = 0.3;
  }
  
  // Collect all genres (explicit text mentions and emoji-based)
  let genresToLookup: string[] = [...analysis.explicitGenres];
  
  // Add emoji-based genres if available (with confidence threshold)
  if (analysis.emojiGenres.length > 0) {
    const emojiGenreNames = analysis.emojiGenres
      .filter(item => item.confidence >= 0.7) // Only use high-confidence emoji genres
      .map(item => item.genre);
    
    if (emojiGenreNames.length > 0) {
      console.log(`Adding emoji-based genres: ${emojiGenreNames.join(', ')}`);
      genresToLookup.push(...emojiGenreNames);
      
      // If we have emoji genres but no explicit text genres, still reduce vector similarity weight
      if (analysis.explicitGenres.length === 0) {
        criteria.vectorSimilarityWeight = 0.35; // Slightly less reduction than explicit text mentions
      }
    }
  }
  
  // Convert all unique genres to database IDs
  if (genresToLookup.length > 0) {
    // Use a different approach to remove duplicates that's compatible with ES2015
    const uniqueGenres: string[] = [];
    genresToLookup.forEach(genre => {
      if (!uniqueGenres.includes(genre)) {
        uniqueGenres.push(genre);
      }
    });
    
    criteria.explicitGenreIds = await getGenreIdsFromNames(uniqueGenres);
    console.log(`Looking up genres: ${uniqueGenres.join(', ')}`);
    
    // Adjust vector similarity weight down when genres present (if not already done)
    if (analysis.explicitArtists.length === 0 && analysis.explicitGenres.length > 0) {
      criteria.vectorSimilarityWeight = 0.3;
    }
  }
  
  // Convert decades to year ranges
  if (analysis.explicitDecades.length > 0) {
    criteria.yearRanges = analysis.explicitDecades.map(decade => ({
      start: decade,
      end: decade + 9
    }));
    // Adjust vector similarity weight down when explicit decades present
    criteria.vectorSimilarityWeight = 0.3;
  }
  
  // Add emoji-based era if specified (convert to decade)
  if (analysis.emojiEra) {
    console.log(`Processing emoji era: ${analysis.emojiEra}`);
    
    switch (analysis.emojiEra) {
      case 'retro':
        criteria.yearRanges.push({ start: 1980, end: 1999 });
        console.log("Added retro era (80s-90s) from emoji");
        break;
      case 'classic':
        criteria.yearRanges.push({ start: 1960, end: 1979 });
        console.log("Added classic era (60s-70s) from emoji");
        break;
      case 'classical':
        criteria.yearRanges.push({ start: 1900, end: 1959 });
        console.log("Added classical era (pre-60s) from emoji");
        break;
      case 'modern':
        criteria.yearRanges.push({ start: 2010, end: 2025 });
        console.log("Added modern era (2010+) from emoji");
        break;
    }
    
    // Adjust vector similarity weight down when era emoji present (if not already done)
    if (analysis.explicitDecades.length === 0 && criteria.vectorSimilarityWeight > 0.35) {
      criteria.vectorSimilarityWeight = 0.35;
    }
  }
  
  // Adjust artist repetition limits based on diversity preference and explicit criteria
  if (analysis.diversityPreference > 70) {
    // High diversity requested, enforce strict artist repetition limits
    criteria.maxArtistRepetition = 1; // Only 1 song per artist
    console.log("High diversity requested, setting strict artist limit of 1 song per artist");
  } else if (analysis.diversityPreference < 30) {
    // Low diversity requested, allow more repetition
    criteria.maxArtistRepetition = 4; // Up to 4 songs per artist
    console.log("Low diversity requested, allowing up to 4 songs per artist");
  } else if (
    analysis.explicitArtists.length > 0 || 
    analysis.explicitGenres.length > 0 || 
    analysis.explicitDecades.length > 0 ||
    analysis.emojiGenres.length > 0 || 
    analysis.emojiEra !== null
  ) {
    // Default behavior when any explicit criteria present (including emoji-based)
    criteria.maxArtistRepetition = 2;
    console.log("Explicit criteria present, setting artist limit of 2 songs per artist");
  }
  
  // Process mood information from both implied and emoji moods
  // Start with implied moods
  if (analysis.impliedMoods.length > 0) {
    for (const moodData of analysis.impliedMoods) {
      criteria.moodWeights[moodData.mood] = moodData.confidence;
    }
  }
  
  // Add emoji moods (giving preference to emoji moods if there's overlap)
  if (analysis.emojiMoods.length > 0) {
    console.log(`Adding emoji moods: ${analysis.emojiMoods.map(m => m.mood).join(', ')}`);
    for (const moodData of analysis.emojiMoods) {
      // If the emoji has higher confidence, it overwrites the implied mood
      // Otherwise, keep the higher confidence value
      if (!criteria.moodWeights[moodData.mood] || moodData.confidence > criteria.moodWeights[moodData.mood]) {
        criteria.moodWeights[moodData.mood] = moodData.confidence;
      }
    }
  }
  
  // Set energy range based on analysis (which may have come from emoji or deep analysis)
  if (analysis.energyLevel !== 50) { // If not default
    const range = 25; // +/- range
    criteria.energyRange = {
      min: Math.max(0, analysis.energyLevel - range),
      max: Math.min(100, analysis.energyLevel + range)
    };
    console.log(`Setting energy range: ${criteria.energyRange.min}-${criteria.energyRange.max} based on level ${analysis.energyLevel}`);
  }
  
  // If we have an emoji-based occasion, adjust the energy and mood weights accordingly
  if (analysis.emojiOccasion) {
    console.log(`Adjusting for emoji occasion: ${analysis.emojiOccasion}`);
    
    switch (analysis.emojiOccasion) {
      case 'workout':
        // Workout playlists should have high energy
        criteria.energyRange.min = Math.max(criteria.energyRange.min, 70);
        criteria.moodWeights['energetic'] = 0.9;
        criteria.moodWeights['motivational'] = 0.8;
        break;
      case 'party':
        // Party playlists should be upbeat and danceable
        criteria.energyRange.min = Math.max(criteria.energyRange.min, 65);
        criteria.moodWeights['happy'] = 0.8;
        criteria.moodWeights['celebratory'] = 0.9;
        break;
      case 'study':
      case 'focus':
        // Study/focus music should be calmer
        criteria.energyRange.max = Math.min(criteria.energyRange.max, 40);
        criteria.moodWeights['calm'] = 0.8;
        criteria.moodWeights['peaceful'] = 0.7;
        break;
      case 'sleep':
      case 'meditation':
        // Sleep/meditation music should be very calm
        criteria.energyRange.max = Math.min(criteria.energyRange.max, 30);
        criteria.moodWeights['calm'] = 0.9;
        criteria.moodWeights['peaceful'] = 0.9;
        break;
      case 'romantic':
        // Romantic music
        criteria.moodWeights['romantic'] = 0.9;
        criteria.moodWeights['emotional'] = 0.7;
        break;
    }
  }
  
  return criteria;
}

/**
 * Generate a system prompt for OpenAI based on the analysis
 * This creates instructions that prioritize explicit mentions
 */
export function generateSystemPromptFromAnalysis(analysis: PromptAnalysisResult): string {
  let priorityInstructions = "";
  
  // Explicit artists
  if (analysis.explicitArtists.length > 0) {
    priorityInstructions += `HIGHEST PRIORITY: Include songs from these specific artists: ${analysis.explicitArtists.join(", ")}. Limit to 2-3 songs per artist maximum.\n\n`;
  }
  
  // Explicit genres
  if (analysis.explicitGenres.length > 0) {
    priorityInstructions += `HIGH PRIORITY: At least 60% of songs should be from these genres: ${analysis.explicitGenres.join(", ")}.\n\n`;
  }
  
  // Explicit decades
  if (analysis.explicitDecades.length > 0) {
    const decadeStrings = analysis.explicitDecades.map(d => `${d}s`);
    priorityInstructions += `HIGH PRIORITY: At least 80% of songs should be from these decades: ${decadeStrings.join(", ")}.\n\n`;
  }
  
  // Check for emoji-based indicators first
  let emojiMoodStr = "";
  let emojiGenreStr = "";
  let emojiEraStr = "";
  let emojiOccasionStr = "";
  
  // Add emoji-based genre information
  if (analysis.emojiGenres.length > 0) {
    const topEmojiGenres = analysis.emojiGenres
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3)
      .map(g => g.genre);
    emojiGenreStr = `Include music from these genres specified by emojis: ${topEmojiGenres.join(", ")}.\n`;
  }
  
  // Add emoji-based mood information
  if (analysis.emojiMoods.length > 0) {
    const topEmojiMoods = analysis.emojiMoods
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3)
      .map(m => m.mood);
    emojiMoodStr = `Match these moods from emojis: ${topEmojiMoods.join(", ")}.\n`;
  }
  
  // Add emoji-based era information
  if (analysis.emojiEra) {
    let eraDescription = "";
    switch (analysis.emojiEra) {
      case 'retro':
        eraDescription = "80s and 90s";
        break;
      case 'classic':
        eraDescription = "60s and 70s";
        break;
      case 'classical':
        eraDescription = "pre-60s";
        break;
      case 'modern':
        eraDescription = "modern/contemporary (2010+)";
        break;
    }
    emojiEraStr = `Focus on the ${eraDescription} era.\n`;
  }
  
  // Add emoji-based occasion information
  if (analysis.emojiOccasion) {
    emojiOccasionStr = `Select music appropriate for: ${analysis.emojiOccasion}.\n`;
  }
  
  // Add emoji instructions if we have any
  if (analysis.hasEmojis && (emojiGenreStr || emojiMoodStr || emojiEraStr || emojiOccasionStr)) {
    priorityInstructions += `EMOJI SIGNALS: ${emojiGenreStr}${emojiMoodStr}${emojiEraStr}${emojiOccasionStr}\n\n`;
  }
  
  // If no explicit criteria or emoji genres, add instructions for implied characteristics
  if (
    analysis.explicitArtists.length === 0 && 
    analysis.explicitGenres.length === 0 && 
    analysis.explicitDecades.length === 0 &&
    analysis.emojiGenres.length === 0 &&
    !analysis.emojiEra
  ) {
    let impliedMoodStr = "";
    if (analysis.impliedMoods.length > 0 && analysis.emojiMoods.length === 0) {
      const topMoods = analysis.impliedMoods
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 3)
        .map(m => m.mood);
      impliedMoodStr = `Match these moods: ${topMoods.join(", ")}.\n`;
    }
    
    let impliedOccasionStr = "";
    if (analysis.impliedOccasions.length > 0 && !analysis.emojiOccasion) {
      const topOccasions = analysis.impliedOccasions
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 2)
        .map(o => o.occasion);
      impliedOccasionStr = `Select songs appropriate for: ${topOccasions.join(", ")}.\n`;
    }
    
    let energyStr = "";
    if (analysis.energyLevel !== 50) {
      const energyDescription = analysis.energyLevel > 70 ? "high-energy" : 
                               analysis.energyLevel < 30 ? "low-energy/chill" : "moderate energy";
      energyStr = `Aim for ${energyDescription} songs.\n`;
    }
    
    if (impliedMoodStr || impliedOccasionStr || energyStr) {
      priorityInstructions += `PRIORITY: ${impliedMoodStr}${impliedOccasionStr}${energyStr}\n\n`;
    }
  }
  
  // Add diversity instructions based on diversity preference
  let diversityStr = "";
  if (analysis.diversityPreference > 70) {
    // High diversity requested
    diversityStr = `IMPORTANT: Ensure MAXIMUM diversity by:\n- Minimizing artist repetition\n- Including contrasting genres and styles\n- Maximizing variety in tempo, mood, and production styles\n- Including unexpected elements and eclectic combinations\n\n`;
  } else if (analysis.diversityPreference < 30) {
    // Low diversity requested (focused sound)
    diversityStr = `IMPORTANT: Maintain a cohesive, focused sound by:\n- Selecting tracks with similar production qualities\n- Staying within related genre families\n- Maintaining consistent mood and energy\n- Selecting artists with similar styles\n\n`;
  } else {
    // Medium diversity (default)
    diversityStr = `IMPORTANT: Ensure balanced diversity by:\n- Limiting repetition of artists\n- Varying tempo and energy levels while maintaining coherence\n- Including both popular and lesser-known tracks that match criteria\n\n`;
  }
  
  priorityInstructions += diversityStr;
  
  // Add explicit content instructions if needed
  if (analysis.avoidExplicit) {
    priorityInstructions += `CRITICAL: Exclude all explicit content. Only include family-friendly songs suitable for all audiences.\n\n`;
  }
  
  const finalSystemPrompt = `
You are a music curator tasked with selecting the best 24 songs for a playlist based on the user's request.

${priorityInstructions}

SELECTION PROCESS:
1. First prioritize explicit requests (artists, genres, decades)
2. Then consider thematic elements and mood
3. Ensure cohesiveness while maintaining variety
4. Verify each selection truly matches the request's intent

FINAL CHECK: Before finalizing, review each track and confirm it truly matches the user's request. The playlist should tell a cohesive musical story while offering variety.
  `;
  
  return finalSystemPrompt;
}

/**
 * Helper to get artist IDs from names
 */
async function getArtistIdsFromNames(artistNames: string[]): Promise<number[]> {
  if (!artistNames.length) return [];
  
  try {
    const rows = await db.select({
      id: artistsTable.id
    })
    .from(artistsTable)
    .where(
      inArray(
        sql`LOWER(${artistsTable.name})`, 
        artistNames.map(name => name.toLowerCase())
      )
    );
    
    return rows.map(row => row.id);
  } catch (error) {
    console.error('Error getting artist IDs from names:', error);
    return [];
  }
}

/**
 * Helper to get genre IDs from names
 */
async function getGenreIdsFromNames(genreNames: string[]): Promise<number[]> {
  if (!genreNames.length) return [];
  
  try {
    const rows = await db.select({
      id: genresTable.id
    })
    .from(genresTable)
    .where(
      inArray(
        sql`LOWER(${genresTable.name})`, 
        genreNames.map(name => name.toLowerCase())
      )
    );
    
    return rows.map(row => row.id);
  } catch (error) {
    console.error('Error getting genre IDs from names:', error);
    return [];
  }
}

/**
 * Helper function to escape special characters in regex
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}