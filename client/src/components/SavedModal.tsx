import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FaShareAlt } from "react-icons/fa";
import ShareModal from "./ShareModal";
import { Loader2 } from "lucide-react";

interface SavedModalProps {
  onClose: () => void;
  spotifyUrl: string;
  playlistTitle: string;
  coverImageUrl?: string;
}

const SavedModal = ({ onClose, spotifyUrl, playlistTitle, coverImageUrl }: SavedModalProps) => {
  const [showShareModal, setShowShareModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(true);
  const [countdown, setCountdown] = useState(10); // Increased from 6 to 10 seconds to allow more time for Spotify processing
  
  useEffect(() => {
    // Add a delay to allow Spotify to fully process the playlist cover
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          setIsProcessing(false);
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);
  
  const handleShare = () => {
    setShowShareModal(true);
  };

  const handleOpenSpotify = () => {
    // If the cover processing is still in progress, prompt the user
    if (isProcessing) {
      const proceed = window.confirm(
        "Spotify is still processing your cover image. Opening now might show a default cover. Continue anyway?"
      );
      
      if (proceed) {
        window.open(spotifyUrl, "_blank");
      }
    } else {
      window.open(spotifyUrl, "_blank");
    }
  };
  
  // Function to refresh the page when closing the modal
  const handleClose = () => {
    // First call the original onClose function
    onClose();
    
    // Then refresh the page after a short delay to ensure the modal is closed first
    setTimeout(() => {
      window.location.reload();
    }, 100);
  };

  return (
    <>
      <Dialog open={true} onOpenChange={handleClose}>
        <DialogContent className="bg-[#191414] border border-gray-800 text-white sm:max-w-md">
          <DialogHeader>
            <div className="text-center mb-4">
              <div className="mx-auto h-16 w-16 rounded-full bg-[#1DB954] flex items-center justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <DialogTitle className="text-xl font-bold text-white font-sans mb-1">
                Playlist Saved to Spotify!
              </DialogTitle>
              <DialogDescription className="text-gray-400 text-sm">
                Your playlist "{playlistTitle}" has been successfully saved to your Spotify account.
                {isProcessing && (
                  <div className="mt-2 flex items-center justify-center gap-2 text-[#1DB954]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Processing cover image... {countdown}s</span>
                  </div>
                )}
              </DialogDescription>
            </div>
          </DialogHeader>
          
          <div className="flex justify-center mb-4">
            <Button
              variant="outline"
              onClick={handleShare}
              className="bg-transparent border border-gray-600 text-white hover:bg-white/10 flex items-center gap-2"
            >
              <FaShareAlt className="h-4 w-4" />
              Share Playlist
            </Button>
          </div>
          
          <DialogFooter className="flex sm:flex-row sm:justify-center gap-2 mt-2">
            <Button
              variant="outline"
              onClick={handleClose}
              className="flex-1 bg-transparent border border-white text-white hover:bg-white/10"
            >
              Close
            </Button>
            <Button
              onClick={handleOpenSpotify}
              className="flex-1 bg-[#1DB954] hover:bg-[#1DB954]/80 text-black"
              disabled={isProcessing}
            >
              {isProcessing ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
              ) : (
                "Open in Spotify"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {showShareModal && (
        <ShareModal
          open={showShareModal}
          onClose={() => setShowShareModal(false)}
          playlistTitle={playlistTitle}
          spotifyUrl={spotifyUrl}
          coverImageUrl={coverImageUrl}
          spotifyImageUrl={spotifyUrl ? `https://i.scdn.co/image/${spotifyUrl.split('/playlist/')[1].split('?')[0]}` : undefined}
        />
      )}
    </>
  );
};

export default SavedModal;
