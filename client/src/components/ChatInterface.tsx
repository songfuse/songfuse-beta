import { useState, useEffect, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useSpotify } from "@/hooks/useSpotify";
import { usePlaylistCreator } from "@/contexts/PlaylistCreatorContext";
import { SpotifyTrack, GeneratedPlaylist } from "@shared/schema";
import { nanoid } from "nanoid";
import PromptSuggestions from "./PromptSuggestions";
import NoTracksFoundSuggestions from "./NoTracksFoundSuggestions";
import MusicSpinner from "./MusicSpinner";
import PlaylistProgressBar from "./PlaylistProgressBar";
import { useToast } from "@/hooks/use-toast";
import { Toggle } from "@/components/ui/toggle";
import { Bot } from "lucide-react";

interface ChatMessage {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
}

interface ChatInterfaceProps {
  onPlaylistGenerated: (playlist: GeneratedPlaylist, originalPrompt: string, sessionId: string) => void;
}

const ChatInterface = ({ onPlaylistGenerated }: ChatInterfaceProps) => {
  const { user } = useAuth();
  const { generatePlaylist, generatePlaylistWithDirectAssistant, isLoading } = useSpotify();
  const { initialPrompt, setInitialPrompt, setIsLoading, articleData } = usePlaylistCreator();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPromptState] = useState<string>("");
  const [sessionId, setSessionId] = useState("");
  
  // Safe prompt setter that ensures string type
  const setPrompt = (value: any) => {
    setPromptState(String(value || ""));
  };
  const [trackSuggestions, setTrackSuggestions] = useState<string[]>([]);
  const [showProgressBar, setShowProgressBar] = useState(false);
  const [playlistGenerationComplete, setPlaylistGenerationComplete] = useState(false);
  // Always use Direct Assistant API by default
  const [useDirectAssistant, setUseDirectAssistant] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialPromptProcessedRef = useRef(false);

  useEffect(() => {
    // Generate a unique session ID for this chat
    setSessionId(nanoid());
    
    // Initial welcome message
    setMessages([
      {
        id: nanoid(),
        content: "Hi! I'll help you create the perfect playlist. Tell me what kind of music you're looking for, or give me a theme, mood, or occasion.",
        isUser: false,
        timestamp: new Date()
      }
    ]);
  }, []);
  
  // Process initial prompt from news article if available
  useEffect(() => {
    // Only process if we have an initial prompt and it hasn't been processed yet
    if (initialPrompt && !initialPromptProcessedRef.current && !isLoading) {
      console.log("Auto-submitting news article prompt:", initialPrompt);
      
      // Set the prompt in the input field
      setPrompt(initialPrompt);
      
      // Use setTimeout to allow the UI to update before submitting
      setTimeout(() => {
        // Create a synthetic form event
        const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
        
        // Submit the prompt
        handleSubmit(fakeEvent, initialPrompt);
        
        // Mark as processed and clear from context
        initialPromptProcessedRef.current = true;
        setInitialPrompt(null);
      }, 500);
    }
  }, [initialPrompt, isLoading]);

  useEffect(() => {
    // Scroll to bottom whenever messages change
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent, externalPrompt?: string) => {
    e.preventDefault();
    
    // Use either the external prompt or the current prompt state
    const promptText = externalPrompt || prompt;
    
    if (!promptText || typeof promptText !== 'string' || !promptText.trim() || isLoading) return;
    
    // Reset previous suggestions and states
    setTrackSuggestions([]);
    setPlaylistGenerationComplete(false);
    
    // Show progress bar when user submits a prompt
    setShowProgressBar(true);
    setIsLoading(true);
    
    // Add user message
    const userMessage: ChatMessage = {
      id: nanoid(),
      content: promptText,
      isUser: true,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    
    // Only clear the input field if we're not using an external prompt
    if (!externalPrompt) {
      setPrompt("");
    }
    
    // Generate playlist from AI - always using direct Assistant API by default
    const result = useDirectAssistant 
      ? await generatePlaylistWithDirectAssistant(promptText, sessionId, articleData)
      : await generatePlaylist(promptText, sessionId, articleData);
    
    if (result) {
      // Add AI response
      const aiMessage: ChatMessage = {
        id: nanoid(),
        content: result.message,
        isUser: false,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, aiMessage]);
      
      // Check if we received suggestions instead of a playlist
      if (result.suggestions && result.suggestions.length > 0) {
        // Store the suggestions for display
        setTrackSuggestions(result.suggestions);
        // Hide progress bar when we receive suggestions instead of a playlist
        setShowProgressBar(false);
      } else if (result.playlist) {
        // Mark playlist generation as complete
        setPlaylistGenerationComplete(true);
        
        // Pass the generated playlist, original prompt, and session ID up to parent
        onPlaylistGenerated(result.playlist, prompt, sessionId);
      }
    } else {
      // Hide progress bar on error
      setShowProgressBar(false);
    }
    
    // Always reset loading state when request completes
    setIsLoading(false);
  };
  
  // Handle completion of progress tracking
  const handleProgressComplete = () => {
    // You can add any additional logic you want to execute when the progress is complete
    console.log("Progress tracking complete");
  };

  const handleSuggestionClick = (suggestion: string) => {
    setPrompt(suggestion);
  };

  return (
    <div className="flex flex-col h-full justify-between">
      <div className="flex-1 overflow-auto p-4 space-y-4">
        
        {/* Messages */}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex items-start ${message.isUser ? "justify-end" : ""}`}
          >
            {!message.isUser && (
              <div className="flex-shrink-0 w-8 h-8 dark:bg-gradient-to-br from-blue-500 to-purple-600 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center mr-3">
                <Bot className="w-5 h-5 text-white" />
              </div>
            )}
            
            <div 
              className={`rounded-lg p-3 text-sm max-w-[85%] ${
                message.isUser 
                  ? "dark:bg-[#d02b31]/20 bg-[#d02b31]/10 dark:text-white text-gray-800 ml-3" 
                  : "dark:bg-gray-700/30 bg-gray-200/70 dark:text-white text-gray-800"
              }`}
            >
              <p className="whitespace-pre-wrap">{message.content}</p>
            </div>
            
            {message.isUser && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full ml-3 overflow-hidden">
                <Avatar>
                  <AvatarImage src={user?.profile?.imageUrl} alt={user?.username} />
                  <AvatarFallback>{user?.username?.charAt(0) || "U"}</AvatarFallback>
                </Avatar>
              </div>
            )}
          </div>
        ))}
        
        {/* No tracks found suggestions */}
        {!isLoading && trackSuggestions.length > 0 && (
          <NoTracksFoundSuggestions 
            suggestions={trackSuggestions} 
            onSuggestionClick={handleSuggestionClick} 
          />
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      <div className="sticky bottom-0 p-4 mt-auto bg-background border-t dark:border-gray-800 border-gray-200">
        {/* Show progress bar during generation if enabled */}
        {showProgressBar && (
          <div className="mb-4">
            <PlaylistProgressBar 
              sessionId={sessionId} 
              onComplete={handleProgressComplete} 
            />
          </div>
        )}
        
        {/* Only show regular prompt suggestions if we don't have specific track suggestions */}
        {trackSuggestions.length === 0 && !showProgressBar && (
          <PromptSuggestions onSuggestionClick={handleSuggestionClick} />
        )}
        
        {/* Direct Assistant API is now the default with no toggle needed */}
        
        <form onSubmit={handleSubmit} className="relative mt-2">
          <Textarea
            value={prompt}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPrompt(e.target.value)}
            placeholder="Ask for specific artists, genres, moods, or eras..."
            className="w-full dark:bg-gray-700/20 bg-gray-100 dark:border-gray-700 border-gray-300 rounded-lg py-3 px-4 pr-12 dark:text-white text-gray-800 dark:placeholder-gray-500 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#d02b31]/50 min-h-[70px] resize-none"
            disabled={isLoading}
            onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          <Button
            type="submit"
            className="absolute right-2 bottom-2 w-10 h-10 bg-gradient-to-r from-[#d02b31] to-[#f5494e] hover:from-[#b02229] hover:to-[#e13f43] rounded-full p-0 flex items-center justify-center shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-105"
            disabled={isLoading || !prompt || !prompt.trim()}
          >
            {isLoading ? (
              <MusicSpinner type="waveform" size="sm" color="white" />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default ChatInterface;
