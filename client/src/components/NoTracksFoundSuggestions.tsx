import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

interface NoTracksFoundSuggestionsProps {
  suggestions: string[];
  onSuggestionClick: (suggestion: string) => void;
  title?: string;
}

const NoTracksFoundSuggestions = ({ 
  suggestions, 
  onSuggestionClick,
  title = "No tracks found matching your criteria" 
}: NoTracksFoundSuggestionsProps) => {
  return (
    <div className="w-full flex flex-col items-center justify-center py-8 px-4">
      <div className="max-w-md mx-auto text-center space-y-6">
        {/* Icon */}
        <div className="mx-auto w-16 h-16 flex items-center justify-center rounded-full bg-muted/30 mb-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        
        {/* Title */}
        <h3 className="text-xl font-bold text-foreground">{title}</h3>
        
        {/* Description */}
        <p className="text-muted-foreground mb-4">
          Try one of these suggestions based on available tracks in our database:
        </p>
        
        {/* Suggestions */}
        <div className="flex flex-wrap gap-3 justify-center">
          {suggestions.map((suggestion) => (
            <Button
              key={suggestion}
              variant="outline"
              size="sm"
              className="dark:bg-gray-700/20 bg-gray-200/70 hover:bg-[#d02b31]/10 hover:border-[#d02b31]/50 hover:text-[#d02b31] rounded-full text-sm dark:text-white text-gray-700 transition-all duration-300 dark:border-gray-700/50 border-gray-300 animate-fade-in shadow-sm"
              style={{ 
                animationDelay: `${Math.random() * 0.5}s`,
                transform: "scale(1.0)",
              }}
              onClick={() => onSuggestionClick(suggestion)}
            >
              {suggestion}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default NoTracksFoundSuggestions;
