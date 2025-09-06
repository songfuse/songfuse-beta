import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

interface PromptSuggestionsProps {
  onSuggestionClick: (suggestion: string) => void;
}

// Define the shortened prompt data structure
interface PromptData {
  title: string;
  description: string;
  fullPrompt: string;
}

const PromptSuggestions = ({ onSuggestionClick }: PromptSuggestionsProps) => {
  // Database-informed creative prompt suggestions based on actual genres and artists
  const allSuggestions: PromptData[] = [
    // Rock and Alternative (Pink Floyd, Radiohead, Ramones, blink-182, Incubus)
    {
      title: "Psychedelic Space Journey",
      description: "Pink Floyd vibes, cosmic rock",
      fullPrompt: "Psychedelic Space Journey – Pink Floyd-inspired cosmic rock with trippy guitars and atmospheric sounds."
    },
    {
      title: "Alternative 90s Revival",
      description: "Radiohead, grunge, experimental rock",
      fullPrompt: "Alternative 90s Revival – Radiohead-style experimental rock mixed with grunge and indie alternative."
    },
    {
      title: "Punk Energy Sessions",
      description: "Ramones-style fast punk, garage rock",
      fullPrompt: "Punk Energy Sessions – Fast, raw punk rock in the style of Ramones and garage rock legends."
    },
    {
      title: "Pop Punk Nostalgia",
      description: "blink-182 energy, catchy hooks",
      fullPrompt: "Pop Punk Nostalgia – High-energy pop punk with blink-182 vibes and irresistible hooks."
    },
    
    // Hip-Hop and Rap (Snoop Dogg, Eric B. & Rakim)
    {
      title: "West Coast Classics",
      description: "Snoop Dogg, laid-back hip-hop",
      fullPrompt: "West Coast Classics – Smooth, laid-back hip-hop featuring Snoop Dogg and West Coast legends."
    },
    {
      title: "Golden Age Hip-Hop",
      description: "Eric B. & Rakim, classic rap",
      fullPrompt: "Golden Age Hip-Hop – Classic rap from Eric B. & Rakim era with lyrical mastery and raw beats."
    },
    {
      title: "Underground Hip-Hop Gems",
      description: "Raw beats, conscious lyrics",
      fullPrompt: "Underground Hip-Hop Gems – Raw, authentic rap with conscious lyrics and underground vibes."
    },
    
    // Electronic and Dance (RÜFÜS DU SOL, Gigi D'Agostino)
    {
      title: "Australian Electronic Vibes",
      description: "RÜFÜS DU SOL, melodic house",
      fullPrompt: "Australian Electronic Vibes – RÜFÜS DU SOL-style melodic house and atmospheric electronic music."
    },
    {
      title: "Euro Dance Throwback",
      description: "Gigi D'Agostino, 90s dance hits",
      fullPrompt: "Euro Dance Throwback – Gigi D'Agostino and classic 90s European dance floor anthems."
    },
    {
      title: "Chill Electronic Journey",
      description: "Ambient electronic, downtempo",
      fullPrompt: "Chill Electronic Journey – Ambient electronic and downtempo beats for late-night vibes."
    },
    
    // Jazz and Instrumental
    {
      title: "Smooth Jazz Sessions",
      description: "Classic jazz, saxophone solos",
      fullPrompt: "Smooth Jazz Sessions – Classic jazz with saxophone solos and smooth instrumental grooves."
    },
    {
      title: "Jazz-Hip Hop Fusion",
      description: "Jazz samples meet modern beats",
      fullPrompt: "Jazz-Hip Hop Fusion – Classic jazz samples mixed with modern hip-hop production."
    },
    
    // Latin and World Music (Based on Latin artists in database)
    {
      title: "Latin Fire Playlist",
      description: "Reggaeton, Latin pop, Spanish hits",
      fullPrompt: "Latin Fire Playlist – Hot reggaeton, Latin pop, and Spanish-language hits that make you move."
    },
    {
      title: "Latin Chill Vibes",
      description: "Bossa nova, soft Latin rhythms",
      fullPrompt: "Latin Chill Vibes – Smooth bossa nova and soft Latin rhythms for relaxing moments."
    },
    
    // Alternative and Indie (Based on indie artists in database)
    {
      title: "Indie Bedroom Pop",
      description: "Lo-fi indie, dreamy vocals",
      fullPrompt: "Indie Bedroom Pop – Lo-fi indie with dreamy vocals and introspective bedroom recording vibes."
    },
    {
      title: "Art Rock Experiments",
      description: "Experimental rock, avant-garde",
      fullPrompt: "Art Rock Experiments – Experimental and avant-garde rock that pushes musical boundaries."
    },
    
    // Pop and Mainstream
    {
      title: "Pop Perfection Mix",
      description: "Catchy hooks, radio-ready hits",
      fullPrompt: "Pop Perfection Mix – Irresistible pop songs with perfect hooks and radio-ready production."
    },
    {
      title: "Acoustic Confessions",
      description: "Singer-songwriter, intimate vocals",
      fullPrompt: "Acoustic Confessions – Raw singer-songwriter tracks with intimate vocals and acoustic guitars."
    },
    
    // Mood-based prompts using database genres
    {
      title: "Late Night Driving Mix",
      description: "Moody rock, electronic, chill vibes",
      fullPrompt: "Late Night Driving Mix – Perfect blend of moody rock, electronic beats, and chill vibes for nighttime drives."
    },
    {
      title: "Workout Energy Boost",
      description: "High-energy rock, electronic, rap",
      fullPrompt: "Workout Energy Boost – High-energy rock, electronic bangers, and motivational rap to power your workout."
    }
  ];
  
  // State to hold the randomly selected suggestions
  const [displayedSuggestions, setDisplayedSuggestions] = useState<PromptData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Number of suggestions to display
  const numToShow = 4;
  
  // Function to get random suggestions
  const getRandomSuggestions = () => {
    const shuffled = [...allSuggestions].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, numToShow);
  };
  
  // Randomize suggestions on mount
  useEffect(() => {
    setDisplayedSuggestions(getRandomSuggestions());
  }, []);
  
  // Function to refresh suggestions with animation
  const refreshSuggestions = () => {
    setIsRefreshing(true);
    
    // Small delay for animation effect
    setTimeout(() => {
      setDisplayedSuggestions(getRandomSuggestions());
      setIsRefreshing(false);
    }, 300);
  };

  return (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold text-foreground pl-1 flex items-center gap-2">
          <span className="w-1 h-4 bg-[#d02b31] rounded-full"></span>
          Try one of these creative prompts:
        </h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 rounded-full"
          onClick={refreshSuggestions}
          disabled={isRefreshing}
        >
          <RefreshCw 
            className={`h-4 w-4 text-muted-foreground ${isRefreshing ? 'animate-spin' : 'hover:text-[#d02b31]'}`} 
          />
          <span className="sr-only">Refresh prompts</span>
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {displayedSuggestions.map((suggestion, index) => (
          <div
            key={suggestion.title}
            className={`group relative overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800/40 dark:to-gray-900/40 hover:from-teal-50 hover:to-emerald-50 dark:hover:from-teal-900/20 dark:hover:to-emerald-900/20 border border-gray-200 dark:border-gray-700 hover:border-teal-300 dark:hover:border-teal-600 rounded-xl text-xs dark:text-white text-gray-700 transition-all duration-300 animate-fade-in shadow-sm hover:shadow-md py-3 px-4 cursor-pointer ${isRefreshing ? 'opacity-0' : 'opacity-100'}`}
            style={{ 
              animationDelay: `${index * 0.1}s`,
              transform: "scale(1.0)",
              transition: "all 0.3s ease-in-out"
            }}
            onClick={() => onSuggestionClick(suggestion.fullPrompt)}
            title={suggestion.fullPrompt}
          >
            {/* Subtle gradient overlay on hover */}
            <div className="absolute inset-0 bg-gradient-to-r from-teal-500/5 to-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            
            <h4 className="relative font-semibold mb-2 text-gray-800 dark:text-gray-200 group-hover:text-teal-700 dark:group-hover:text-teal-300 transition-colors duration-200 leading-tight">
              {suggestion.title}
            </h4>
            <p className="relative text-gray-500 dark:text-gray-400 text-[11px] leading-relaxed group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors duration-200">
              {suggestion.description}
            </p>
            
            {/* Small accent dot */}
            <div className="absolute top-3 right-3 w-1.5 h-1.5 bg-gradient-to-r from-teal-400 to-emerald-400 rounded-full opacity-60 group-hover:opacity-100 transition-opacity duration-200" />
          </div>
        ))}
      </div>
    </div>
  );
};

export default PromptSuggestions;
