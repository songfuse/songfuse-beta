import { useEffect, useState } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { SpotifyTrack } from "@shared/schema";
import MusicSpinner from "./MusicSpinner";

interface PlaylistImprovementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImprove: (improvementPrompt: string) => Promise<void>;
  title: string;
  description: string;
  tracks: SpotifyTrack[];
  isLoading: boolean;
}

const PlaylistImprovementModal = ({
  isOpen,
  onClose,
  onImprove,
  title,
  description,
  tracks,
  isLoading
}: PlaylistImprovementModalProps) => {
  const [improvementPrompt, setImprovementPrompt] = useState("");
  const [initialFocus, setInitialFocus] = useState(false);
  
  // Set focus to the textarea when the modal opens
  useEffect(() => {
    if (isOpen && !initialFocus) {
      setInitialFocus(true);
      // Add a suggestion as placeholder text
      setImprovementPrompt("");
    }
  }, [isOpen, initialFocus]);
  
  const handleSubmit = async () => {
    if (improvementPrompt.trim() === "") return;
    onClose(); // Close the modal immediately
    await onImprove(improvementPrompt);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter (without Shift)
    if (e.key === "Enter" && !e.shiftKey && !isLoading) {
      e.preventDefault();
      handleSubmit();
    }
  };
  
  // Suggestion examples
  const suggestions = [
    "Add 3 more upbeat dance tracks to this mix",
    "Replace some songs with more indie rock alternatives",
    "Add 5 tracks by Hans Zimmer or similar film composers",
    "Change the style to include more acoustic guitars and fewer electronic elements",
    "Replace a few tracks with songs that have female vocalists",
    "Add some recent chart-toppers to make this more current",
    "Replace the slower tracks with more energetic songs for a workout"
  ];
  
  // Randomly select a suggestion
  const randomSuggestion = suggestions[Math.floor(Math.random() * suggestions.length)];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md dark:bg-[#191414] bg-white">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-center dark:text-white text-gray-800">
            Improve "{title}"
          </DialogTitle>
        </DialogHeader>
        
        <div className="my-4">
          <div className="space-y-2 mb-3">
            <p className="text-sm dark:text-gray-400 text-gray-600">
              Describe how you'd like to improve this playlist:
            </p>
            <p className="text-xs dark:text-gray-500 text-gray-500 italic">
              Try including phrases like "add more songs", "replace some tracks", or "change the style to..." to modify the song selection.
            </p>
          </div>
          
          <Textarea
            value={improvementPrompt}
            onChange={(e) => setImprovementPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={randomSuggestion}
            className="w-full h-32 dark:bg-gray-800/50 bg-gray-100 dark:text-white text-gray-800 dark:border-gray-700 border-gray-300 focus:ring-2 focus:ring-[#d02b31]/50"
            disabled={isLoading}
          />
          
          <p className="text-xs dark:text-gray-500 text-gray-500 mt-2">
            Press Enter to submit, Shift+Enter for a new line
          </p>
        </div>
        
        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={isLoading}
            className="dark:text-white text-gray-800 dark:hover:bg-gray-800 hover:bg-gray-200"
          >
            Cancel
          </Button>
          
          <Button
            onClick={handleSubmit}
            disabled={improvementPrompt.trim() === "" || isLoading}
            className="bg-[#d02b31] hover:bg-[#d02b31]/80 text-white font-medium"
          >
            {isLoading ? (
              <span className="flex items-center">
                <MusicSpinner type="waveform" size="sm" color="white" className="mr-2" />
                Improving...
              </span>
            ) : "Improve Playlist"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PlaylistImprovementModal;