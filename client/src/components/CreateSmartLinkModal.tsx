import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Share2, Star, Copy, ExternalLink, CheckCircle, Wand2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// Helper function to create URL-friendly slugs
const createSlug = (text: string): string => {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
};

interface Song {
  id: number;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
}

interface Playlist {
  id: number;
  title: string;
  description?: string;
  coverImageUrl?: string;
}

interface CreateSmartLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  playlist: Playlist;
  songs: Song[];
  existingSmartLink?: SmartLink;
  isEditing?: boolean;
}

interface SmartLink {
  id: number;
  shareId: string;
  playlistId: number;
  promotedTrackId: number;
  customCoverImage?: string;
  title: string;
  description?: string;
  views: number;
  createdAt: string;
}

export default function CreateSmartLinkModal({ isOpen, onClose, playlist, songs, existingSmartLink, isEditing = false }: CreateSmartLinkModalProps) {
  const [title, setTitle] = useState(existingSmartLink?.title || playlist.title || "");
  const [description, setDescription] = useState(existingSmartLink?.description || playlist.description || "");
  const [promotedTrackId, setPromotedTrackId] = useState<number | null>(existingSmartLink?.promotedTrackId || null);
  const [customCoverImage, setCustomCoverImage] = useState(existingSmartLink?.customCoverImage || "");
  const [createdLink, setCreatedLink] = useState<SmartLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const smartLinkMutation = useMutation({
    mutationFn: async (data: {
      playlistId: number;
      promotedTrackId: number;
      customCoverImage?: string;
      title: string;
      description?: string;
    }) => {
      const endpoint = isEditing ? `/api/v2/smart-links/${existingSmartLink?.id}` : "/api/v2/smart-links";
      const method = isEditing ? "PUT" : "POST";
      
      try {
        const response = await fetch(endpoint, {
          method,
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify(data),
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Playlist sharing link ${isEditing ? 'update' : 'creation'} failed:`, errorText);
          throw new Error(`Failed to ${isEditing ? 'update' : 'create'} playlist sharing link: ${response.status}`);
        }
        
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          // Try to parse anyway in case it's actually JSON despite the content-type
          const responseText = await response.text();
          try {
            return JSON.parse(responseText);
          } catch {
            console.error('Expected JSON but got:', contentType, responseText.substring(0, 200) + '...');
            throw new Error("Server returned non-JSON response");
          }
        }
        
        return response.json();
      } catch (error) {
        console.error('Playlist sharing link creation error:', error);
        // If the v2 endpoint fails, try the original endpoint as fallback
        try {
          const fallbackResponse = await fetch("/api/smart-links", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json",
            },
            body: JSON.stringify(data),
          });
          
          if (fallbackResponse.ok) {
            const fallbackContentType = fallbackResponse.headers.get("content-type");
            if (fallbackContentType && fallbackContentType.includes("application/json")) {
              return fallbackResponse.json();
            }
          }
        } catch (fallbackError) {
          console.error('Fallback also failed:', fallbackError);
        }
        
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log('Playlist sharing link created successfully:', data);
      setCreatedLink(data);
      toast({
        title: "Playlist Sharing Link Created!",
        description: "Your shareable playlist link is ready to use.",
      });
    },
    onError: (error) => {
      console.error('Playlist sharing link creation error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create playlist sharing link. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!promotedTrackId) {
      toast({
        title: "Featured Song Required",
        description: "Please select a song to feature in your playlist sharing link.",
        variant: "destructive",
      });
      return;
    }

    smartLinkMutation.mutate({
      playlistId: playlist.id,
      promotedTrackId,
      customCoverImage: customCoverImage || undefined,
      title,
      description: description || undefined,
    });
  };

  const copyToClipboard = async () => {
    if (!createdLink) return;
    
    const titleSlug = createSlug(title);
    const shareUrl = `${window.location.origin}/share/${playlist.id}/${titleSlug}`;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast({
      title: "Link Copied!",
      description: "The playlist sharing link has been copied to your clipboard.",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const openSmartLink = () => {
    if (!createdLink) return;
    const titleSlug = createSlug(title);
    const shareUrl = `${window.location.origin}/share/${playlist.id}/${titleSlug}`;
    window.open(shareUrl, '_blank');
  };

  const generateAIDescription = async () => {
    setIsGeneratingDescription(true);
    
    try {
      const response = await fetch('/api/smart-links/generate-description', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          playlistId: playlist.id,
          promotedTrackId: promotedTrackId,
          title: title || playlist.title
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate description');
      }

      const data = await response.json();
      setDescription(data.description);

      toast({
        title: "AI Description Generated!",
        description: "A fresh description has been created for your smart link"
      });
    } catch (error) {
      console.error('Error generating AI description:', error);
      toast({
        title: "Error",
        description: "Failed to generate AI description. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsGeneratingDescription(false);
    }
  };

  const handleClose = () => {
    setCreatedLink(null);
    setTitle(playlist.title || "");
    setDescription(playlist.description || "");
    setPromotedTrackId(null);
    setCustomCoverImage("");
    setCopied(false);
    onClose();
  };

  if (createdLink) {
    const titleSlug = createSlug(title);
    const shareUrl = `${window.location.origin}/share/${playlist.id}/${titleSlug}`;
    
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Playlist Sharing Link Created!
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <Card className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border-purple-200 dark:border-purple-700">
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">{createdLink.title}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Shareable playlist link</p>
                  </div>
                </div>
                
                <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                  <p className="text-sm font-mono text-gray-700 dark:text-gray-300 break-all">{shareUrl}</p>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Button
                onClick={copyToClipboard}
                className="flex-1"
                variant={copied ? "secondary" : "default"}
              >
                {copied ? (
                  <CheckCircle className="w-4 h-4 mr-2" />
                ) : (
                  <Copy className="w-4 h-4 mr-2" />
                )}
                {copied ? "Copied!" : "Copy Link"}
              </Button>
              
              <Button
                onClick={openSmartLink}
                variant="outline"
                className="flex-1"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Preview
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Playlist Sharing Link' : 'Create Playlist Sharing Link'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter a catchy title for your smart link"
              required
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="description">Description (Optional)</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={generateAIDescription}
                disabled={isGeneratingDescription}
                className="text-xs"
              >
                {isGeneratingDescription ? (
                  <>
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary mr-2"></div>
                    Generating...
                  </>
                ) : (
                  <>
                    <Wand2 className="h-3 w-3 mr-2" />
                    AI Generate
                  </>
                )}
              </Button>
            </div>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description to entice listeners... or use AI to generate a viral description!"
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Let AI create a trendy, marketing-savvy description based on your tracks and vibe
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="promoted-track">Featured Song</Label>
            <Select
              value={promotedTrackId?.toString() || ""}
              onValueChange={(value) => setPromotedTrackId(parseInt(value))}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a song to feature" />
              </SelectTrigger>
              <SelectContent>
                {songs.map((song) => (
                  <SelectItem key={song.id} value={song.id.toString()}>
                    <div className="flex items-center gap-2 w-full min-w-0">
                      <Star className="w-3 h-3 text-yellow-500 flex-shrink-0" />
                      <span className="truncate flex-1 min-w-0">{song.title} - {song.artist}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">
              This song will be highlighted at the top of your shared playlist
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="custom-cover">Custom Cover URL (Optional)</Label>
            <Input
              id="custom-cover"
              value={customCoverImage}
              onChange={(e) => setCustomCoverImage(e.target.value)}
              placeholder="https://example.com/your-custom-cover.jpg"
              type="url"
            />
            <p className="text-xs text-gray-500">
              Leave empty to use the playlist's current cover image
            </p>
          </div>



          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={smartLinkMutation.isPending}
              className="flex-1"
            >
              {smartLinkMutation.isPending ? (
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
              ) : (
                <Share2 className="w-4 h-4 mr-2" />
              )}
              {isEditing ? 'Save Changes' : 'Create Playlist Sharing Link'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}