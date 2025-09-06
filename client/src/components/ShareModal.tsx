import { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { FaTwitter, FaFacebook, FaWhatsapp, FaTelegramPlane, FaLink } from 'react-icons/fa';
import { SiX } from "react-icons/si";
import PlaylistCoverPlaceholder from "./PlaylistCoverPlaceholder";

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  playlistTitle: string;
  spotifyUrl: string;
  coverImageUrl?: string;
  spotifyImageUrl?: string;
}

const ShareModal = ({ open, onClose, playlistTitle, spotifyUrl, coverImageUrl, spotifyImageUrl }: ShareModalProps) => {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [imageError, setImageError] = useState(false);
  
  // Auto-dismiss modal after action is taken
  useEffect(() => {
    const autoDismissTimer = setTimeout(() => {
      if (copied) {
        onClose();
      }
    }, 2000);
    
    return () => clearTimeout(autoDismissTimer);
  }, [copied, onClose]);
  
  const handleImageError = () => {
    setImageError(true);
  };

  // Encoded text for sharing
  const encodedText = encodeURIComponent(`Check out my "${playlistTitle}" playlist created with Songfuse! 🎵`);
  const encodedUrl = encodeURIComponent(spotifyUrl);
  
  // Share URLs for different platforms
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`;
  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodedText} ${encodedUrl}`;
  const telegramUrl = `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`;

  // Handle native Web Share API
  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({
          title: `${playlistTitle} - Songfuse Playlist`,
          text: `Check out my "${playlistTitle}" playlist created with Songfuse! 🎵`,
          url: spotifyUrl,
        });
        toast({
          title: "Shared successfully!",
          description: "Your playlist has been shared.",
        });
        
        // Auto-dismiss after successful share
        setTimeout(() => {
          onClose();
        }, 1000);
      } catch (error) {
        console.error("Error sharing:", error);
      }
    } else {
      handleCopyLink();
    }
  };

  // Copy link to clipboard
  const handleCopyLink = () => {
    if (typeof navigator !== 'undefined' && 'clipboard' in navigator) {
      navigator.clipboard.writeText(spotifyUrl).then(() => {
        setCopied(true);
        toast({
          title: "Link copied!",
          description: "Playlist link copied to clipboard",
        });
        setTimeout(() => setCopied(false), 2000);
      }).catch(err => {
        console.error("Failed to copy link:", err);
        toast({
          title: "Failed to copy",
          description: "Could not copy the link to clipboard",
          variant: "destructive",
        });
      });
    } else {
      // Fallback for browsers without clipboard API
      toast({
        title: "Manual copy required",
        description: "Please select and copy the link manually",
      });
    }
  };

  // Open a platform share dialog
  const openShareWindow = (url: string) => {
    window.open(url, '_blank', 'width=600,height=400');
    
    // Dismiss modal after short delay when sharing to social media
    setTimeout(() => {
      onClose();
    }, 1000);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Share Playlist</DialogTitle>
          <DialogDescription>
            Share your "{playlistTitle}" playlist to social media or with friends
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col space-y-4 my-4">
          {/* Cover image preview */}
          {coverImageUrl ? (
            <div className="w-24 h-24 mx-auto rounded-lg overflow-hidden shadow-lg">
              <PlaylistCoverPlaceholder 
                size="sm" 
                imageUrl={imageError ? undefined : coverImageUrl}
                spotifyImageUrl={spotifyImageUrl}
                altText={playlistTitle}
                className="h-full w-full"
              />
            </div>
          ) : null}

          {/* Link input with copy button */}
          <div className="flex space-x-2">
            <Input 
              value={spotifyUrl} 
              readOnly 
              className="flex-1 bg-muted/50 text-sm" 
            />
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleCopyLink}
              className="min-w-[80px]"
            >
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>

          {/* Social share buttons */}
          <div className="flex justify-center gap-3 mt-2">
            <Button
              variant="outline"
              size="icon"
              className="rounded-full w-10 h-10 bg-[#1DA1F2] text-white hover:bg-[#1DA1F2]/80"
              onClick={() => openShareWindow(twitterUrl)}
              title="Share on Twitter"
            >
              <SiX className="h-5 w-5" />
            </Button>
            
            <Button
              variant="outline"
              size="icon"
              className="rounded-full w-10 h-10 bg-[#4267B2] text-white hover:bg-[#4267B2]/80"
              onClick={() => openShareWindow(facebookUrl)}
              title="Share on Facebook"
            >
              <FaFacebook className="h-5 w-5" />
            </Button>
            
            <Button
              variant="outline"
              size="icon"
              className="rounded-full w-10 h-10 bg-[#25D366] text-white hover:bg-[#25D366]/80"
              onClick={() => openShareWindow(whatsappUrl)}
              title="Share on WhatsApp"
            >
              <FaWhatsapp className="h-5 w-5" />
            </Button>
            
            <Button
              variant="outline"
              size="icon"
              className="rounded-full w-10 h-10 bg-[#0088cc] text-white hover:bg-[#0088cc]/80"
              onClick={() => openShareWindow(telegramUrl)}
              title="Share on Telegram"
            >
              <FaTelegramPlane className="h-5 w-5" />
            </Button>
            
            <Button
              variant="outline"
              size="icon"
              className="rounded-full w-10 h-10"
              onClick={handleCopyLink}
              title="Copy Link"
            >
              <FaLink className="h-5 w-5" />
            </Button>
          </div>
        </div>


      </DialogContent>
    </Dialog>
  );
};

export default ShareModal;