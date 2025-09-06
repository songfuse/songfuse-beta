/**
 * Emoji-Based Music Recommendation Enhancement
 * 
 * This module analyzes emojis in user prompts and translates them into
 * musical characteristics for more personalized playlist generation.
 */

// Types
export interface EmojiAnalysisResult {
  // Mood and emotion indicators
  moodIndicators: {
    mood: string;
    confidence: number;
    source: string; // The emoji that triggered this mood
  }[];
  
  // Genre indicators
  genreIndicators: {
    genre: string;
    confidence: number;
    source: string; // The emoji that triggered this genre
  }[];
  
  // Musical qualities
  energy: number; // 0-100 scale
  danceability: number; // 0-100 scale
  
  // Contextual factors
  era: string | null; // "modern", "retro", "classical", etc.
  occasion: string | null; // "workout", "party", "relax", "focus", etc.
  
  // Preference signals
  diversityBoost: number; // -20 to +20 adjustment to diversity
  hasEmojis: boolean; // Whether any relevant emojis were found
}

/**
 * Emoji-to-mood mapping with confidence levels
 */
const emojiMoodMap: Record<string, { mood: string; confidence: number }> = {
  // Happy/Positive
  "😊": { mood: "happy", confidence: 0.9 },
  "😄": { mood: "happy", confidence: 0.9 },
  "😃": { mood: "happy", confidence: 0.9 },
  "😀": { mood: "happy", confidence: 0.9 },
  "🙂": { mood: "pleasant", confidence: 0.7 },
  "😁": { mood: "happy", confidence: 0.8 },
  "😆": { mood: "cheerful", confidence: 0.8 },
  
  // Love
  "❤️": { mood: "romantic", confidence: 0.9 },
  "💕": { mood: "romantic", confidence: 0.9 },
  "😍": { mood: "romantic", confidence: 0.8 },
  "🥰": { mood: "romantic", confidence: 0.9 },
  
  // Sad/Melancholy
  "😢": { mood: "sad", confidence: 0.9 },
  "😭": { mood: "sad", confidence: 0.9 },
  "😞": { mood: "melancholy", confidence: 0.8 },
  "😔": { mood: "melancholy", confidence: 0.8 },
  "☹️": { mood: "sad", confidence: 0.7 },
  
  // Thoughtful/Reflective
  "🤔": { mood: "reflective", confidence: 0.7 },
  "😌": { mood: "peaceful", confidence: 0.8 },
  "😴": { mood: "calm", confidence: 0.8 },
  
  // Energetic/Excited
  "🔥": { mood: "energetic", confidence: 0.9 },
  "⚡": { mood: "energetic", confidence: 0.8 },
  "💪": { mood: "motivational", confidence: 0.8 },
  "🏃": { mood: "energetic", confidence: 0.8 },
  "🤩": { mood: "excited", confidence: 0.9 },
  "🎉": { mood: "celebratory", confidence: 0.9 },
  "🎊": { mood: "celebratory", confidence: 0.9 },
  
  // Angry/Intense
  "😠": { mood: "angry", confidence: 0.8 },
  "😡": { mood: "angry", confidence: 0.9 },
  "👊": { mood: "intense", confidence: 0.7 },
  
  // Cool/Chill
  "😎": { mood: "cool", confidence: 0.8 },
  "🆒": { mood: "cool", confidence: 0.7 },
  "❄️": { mood: "chill", confidence: 0.7 },
  
  // Misc feelings
  "😱": { mood: "dramatic", confidence: 0.7 },
  "😵": { mood: "chaotic", confidence: 0.7 },
  "🥺": { mood: "emotional", confidence: 0.8 },
  "😳": { mood: "emotional", confidence: 0.7 },
};

/**
 * Emoji-to-genre mapping with confidence levels
 */
const emojiGenreMap: Record<string, { genre: string; confidence: number }> = {
  // Popular genres
  "🎸": { genre: "rock", confidence: 0.9 },
  "🤘": { genre: "rock", confidence: 0.8 },
  "🎧": { genre: "electronic", confidence: 0.7 },
  "🎤": { genre: "pop", confidence: 0.7 },
  "🎵": { genre: "pop", confidence: 0.6 },
  "🎼": { genre: "classical", confidence: 0.7 },
  "🎷": { genre: "jazz", confidence: 0.8 },
  "🎺": { genre: "jazz", confidence: 0.7 },
  "🎻": { genre: "classical", confidence: 0.8 },
  "🎹": { genre: "piano", confidence: 0.8 },
  "🪕": { genre: "folk", confidence: 0.8 },
  
  // Hip hop and urban
  "🔊": { genre: "hip-hop", confidence: 0.7 },
  "👊": { genre: "hip-hop", confidence: 0.6 },
  "🎙️": { genre: "hip-hop", confidence: 0.6 },
  
  // Country and Folk
  "🤠": { genre: "country", confidence: 0.9 },
  "🐴": { genre: "country", confidence: 0.7 },
  "🌾": { genre: "country", confidence: 0.6 },
  "🌿": { genre: "folk", confidence: 0.6 },
  
  // Electronic and Dance
  "🎛️": { genre: "electronic", confidence: 0.8 },
  "🕺": { genre: "dance", confidence: 0.8 },
  "💃": { genre: "dance", confidence: 0.8 },
  "🔊": { genre: "bass", confidence: 0.7 },
  "🎚️": { genre: "electronic", confidence: 0.7 },
  
  // Latin
  "🌮": { genre: "latin", confidence: 0.6 },
  
  // Reggae/Caribbean
  "🏝️": { genre: "reggae", confidence: 0.7 },
  "🌴": { genre: "reggae", confidence: 0.6 },
  "🌊": { genre: "reggae", confidence: 0.5 },
  
  // Metal and Hard Rock
  "🤘": { genre: "metal", confidence: 0.8 },
  "⚔️": { genre: "metal", confidence: 0.6 },
  "💀": { genre: "metal", confidence: 0.7 },
  
  // Indie/Alternative
  "🎭": { genre: "indie", confidence: 0.6 },
  "🕶️": { genre: "indie", confidence: 0.5 },
};

/**
 * Emoji-to-occasion mapping
 */
const emojiOccasionMap: Record<string, string> = {
  "🏋️": "workout",
  "🏃": "workout",
  "💪": "workout",
  "⛹️": "workout",
  "🚴": "workout",
  "🧘": "meditation",
  "📚": "study",
  "💻": "work",
  "🎓": "study",
  "🧠": "focus",
  "🎉": "party",
  "🎊": "party",
  "🥂": "party",
  "🍾": "party",
  "🍻": "party",
  "🍸": "dinner",
  "🍽️": "dinner",
  "🍲": "dinner",
  "🍷": "dinner",
  "🚗": "driving",
  "🚙": "driving",
  "🛣️": "roadtrip",
  "🧳": "travel",
  "✈️": "travel",
  "🏖️": "beach",
  "⛱️": "beach",
  "🌅": "morning",
  "☀️": "morning",
  "🌙": "night",
  "🌃": "night",
  "🌆": "night",
  "💤": "sleep",
  "🛌": "sleep",
  "💍": "romantic",
  "👰": "wedding",
  "🤵": "wedding",
  "💑": "romantic",
  "❤️": "romantic"
};

/**
 * Emoji-to-era mapping
 */
const emojiEraMap: Record<string, string> = {
  "📻": "retro",
  "📼": "retro",
  "💽": "retro",
  "💾": "retro",
  "🕰️": "classic",
  "⏱️": "classic",
  "🦖": "classic",
  "🏛️": "classical",
  "🚀": "modern",
  "👾": "retro", // 80s/90s gaming
  "🎮": "modern",
  "📱": "modern"
};

/**
 * Calculate energy level from emojis
 */
function calculateEnergyFromEmojis(emojis: string[]): number {
  const energyMap: Record<string, number> = {
    // High energy (80-100)
    "🔥": 90,
    "💥": 95,
    "💪": 85,
    "🏃": 90,
    "🏋️": 90,
    "⛹️": 85,
    "🎉": 85,
    "🎊": 85,
    "😆": 80,
    "🤩": 85,
    "😱": 80,
    
    // Medium energy (50-79)
    "💃": 75,
    "🕺": 75,
    "😄": 70,
    "😁": 70,
    "😀": 65,
    "🎵": 65,
    "🎸": 70,
    "🎷": 65,
    "🎺": 70,
    "🎤": 65,
    "🎧": 60,
    "👊": 70,
    "🤘": 75,
    "😊": 55,
    "🙂": 50,
    
    // Low energy (0-49)
    "🧘": 20,
    "😌": 30,
    "🥺": 40,
    "😢": 35,
    "😭": 30,
    "😞": 25,
    "😔": 25,
    "☹️": 30,
    "🎻": 40,
    "🎹": 45,
    "😴": 10,
    "💤": 5,
    "🛌": 10,
    "🌙": 25,
    "🌃": 30
  };
  
  if (emojis.length === 0) {
    return 50; // Default mid-point
  }
  
  let totalEnergy = 0;
  let emojiCount = 0;
  
  for (const emoji of emojis) {
    if (emoji in energyMap) {
      totalEnergy += energyMap[emoji];
      emojiCount++;
    }
  }
  
  return emojiCount > 0 ? totalEnergy / emojiCount : 50;
}

/**
 * Calculate danceability from emojis
 */
function calculateDanceabilityFromEmojis(emojis: string[]): number {
  const danceabilityMap: Record<string, number> = {
    // High danceability (80-100)
    "💃": 95,
    "🕺": 95,
    "🎊": 90,
    "🎉": 85,
    "🔥": 85,
    "💥": 80,
    "🎧": 80,
    "🎤": 80,
    "🎵": 75,
    
    // Medium danceability (50-79)
    "😊": 65,
    "😄": 70,
    "😃": 70,
    "😀": 65,
    "🎸": 65,
    "🎷": 75,
    "🎺": 70,
    "👊": 60,
    "🤘": 60,
    
    // Low danceability (0-49)
    "😢": 20,
    "😭": 15,
    "😞": 20,
    "😔": 25,
    "☹️": 20,
    "🎻": 30,
    "🎹": 40,
    "😴": 10,
    "🧘": 15,
    "📚": 20,
    "🧠": 25
  };
  
  if (emojis.length === 0) {
    return 50; // Default mid-point
  }
  
  let totalDanceability = 0;
  let emojiCount = 0;
  
  for (const emoji of emojis) {
    if (emoji in danceabilityMap) {
      totalDanceability += danceabilityMap[emoji];
      emojiCount++;
    }
  }
  
  return emojiCount > 0 ? totalDanceability / emojiCount : 50;
}

/**
 * Calculate diversity boost from emojis
 * Some emoji combinations indicate a desire for more mixed playlists
 */
function calculateDiversityBoostFromEmojis(emojis: string[]): number {
  // Count genre indicators
  const genreCount = emojis.filter(emoji => emoji in emojiGenreMap).length;
  
  // Multiple genre emojis suggest diversity
  if (genreCount >= 3) {
    return 20; // Strong diversity boost
  } else if (genreCount === 2) {
    return 10; // Moderate diversity boost
  }
  
  // Specific diversity-indicating emojis
  const diversityEmojis = ["🌈", "🔄", "🌎", "🌍", "🌏", "🌐", "🗺️", "🧩"];
  if (emojis.some(emoji => diversityEmojis.includes(emoji))) {
    return 15; // Specific diversity indicator
  }
  
  // Default - no adjustment
  return 0;
}

/**
 * Extract all emojis from a string
 */
function extractEmojis(text: string): string[] {
  // Simpler emoji regex that works with ES2015
  const emojiRegex = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g;
  return (text.match(emojiRegex) || []).filter(Boolean);
}

/**
 * Main function: Analyze emoji content in a prompt
 */
export function analyzeEmojisInPrompt(prompt: string): EmojiAnalysisResult {
  // Default result
  const result: EmojiAnalysisResult = {
    moodIndicators: [],
    genreIndicators: [],
    energy: 50,
    danceability: 50,
    era: null,
    occasion: null,
    diversityBoost: 0,
    hasEmojis: false
  };
  
  // Extract all emojis from the prompt
  const emojis = extractEmojis(prompt);
  
  if (emojis.length === 0) {
    return result;
  }
  
  result.hasEmojis = true;
  
  // Process each emoji
  for (const emoji of emojis) {
    // Check for mood indicators
    if (emoji in emojiMoodMap) {
      const { mood, confidence } = emojiMoodMap[emoji];
      result.moodIndicators.push({
        mood,
        confidence,
        source: emoji
      });
    }
    
    // Check for genre indicators
    if (emoji in emojiGenreMap) {
      const { genre, confidence } = emojiGenreMap[emoji];
      result.genreIndicators.push({
        genre,
        confidence,
        source: emoji
      });
    }
    
    // Check for occasions
    if (emoji in emojiOccasionMap && !result.occasion) {
      result.occasion = emojiOccasionMap[emoji];
    }
    
    // Check for era indicators
    if (emoji in emojiEraMap && !result.era) {
      result.era = emojiEraMap[emoji];
    }
  }
  
  // Calculate energy level
  result.energy = calculateEnergyFromEmojis(emojis);
  
  // Calculate danceability
  result.danceability = calculateDanceabilityFromEmojis(emojis);
  
  // Calculate diversity boost
  result.diversityBoost = calculateDiversityBoostFromEmojis(emojis);
  
  return result;
}