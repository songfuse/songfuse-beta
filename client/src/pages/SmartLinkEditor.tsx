import React, { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Share2, Sparkles, Eye, ExternalLink, Music, Users, Upload, Check, Copy, Globe, MessageCircle, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import Layout from "@/components/Layout";
import { useAuth } from "@/contexts/AuthContext";

interface Playlist {
  id: number;
  title: string;
  description?: string;
  coverImageUrl?: string;
  tracks?: Track[];
}

interface Track {
  id: number;
  title: string;
  artist: string;
  album?: string;
  albumCover?: string;
  duration?: number;
}

interface SmartLink {
  id: number;
  shareId: string;
  title: string;
  description?: string;
  customCoverImage?: string;
  promotedTrackId: number;
  playlistId: number;
  views: number;
  createdAt: string;
}

interface SmartLinkEditorProps {
  playlistId?: string;
  shareId?: string;
}

export default function SmartLinkEditor({ playlistId: propPlaylistId, shareId: propShareId }: SmartLinkEditorProps = {}) {
  const [location, setLocation] = useLocation();
  
  // Use props or fallback to query parameters for backward compatibility
  const shareId = propShareId;
  const playlistId = propPlaylistId;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    customCoverImage: '',
    promotedTrackId: null as number | null
  });

  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
  
  // External song functionality
  const [externalSongUrl, setExternalSongUrl] = useState("");
  const [isAddingExternalSong, setIsAddingExternalSong] = useState(false);

  const isEditing = !!shareId;

  // Fetch existing smart link data first if editing
  const { data: existingSmartLink, isLoading: smartLinkLoading, error: smartLinkError } = useQuery({
    queryKey: ['/api/smart-links', shareId],
    queryFn: async () => {
      console.log('Fetching smart link for shareId:', shareId);
      const response = await fetch(`/api/smart-links/${shareId}`);
      console.log('Smart link response status:', response.status);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log('Smart link data received:', data);
      return data;
    },
    enabled: !!shareId && isEditing,
  });

  // Determine which playlist ID to use - get from smart link if editing, otherwise from props
  const effectivePlaylistId = isEditing 
    ? (existingSmartLink as any)?.playlist?.id || (existingSmartLink as any)?.playlistId
    : playlistId;

  // Fetch playlist data
  const { data: playlist, isLoading: playlistLoading, error: playlistError } = useQuery({
    queryKey: ['/api/playlist', effectivePlaylistId],
    queryFn: async () => {
      console.log('Fetching playlist for ID:', effectivePlaylistId);
      const response = await fetch(`/api/playlist/${effectivePlaylistId}`);
      console.log('Playlist response status:', response.status);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log('Playlist data received:', data);
      return data;
    },
    enabled: !!effectivePlaylistId,
  });

  // Initialize form data when editing
  useEffect(() => {
    if (existingSmartLink && isEditing) {
      console.log('Initializing form data for editing:', existingSmartLink);
      console.log('Playlist data available:', playlist);
      
      setFormData({
        title: (existingSmartLink as any).title || '',
        description: (existingSmartLink as any).description || '',
        customCoverImage: (existingSmartLink as any).customCoverImage || '',
        promotedTrackId: (existingSmartLink as any).promotedTrackId || null
      });

      // Find and set the selected track
      if (playlist && (playlist as any).tracks) {
        const promotedTrackId = (existingSmartLink as any).promotedTrackId;
        console.log('Looking for promoted track ID:', promotedTrackId);
        console.log('Available tracks:', (playlist as any).tracks.map((t: any) => ({ id: t.id, title: t.title })));
        
        const track = (playlist as any).tracks.find((t: Track) => 
          t.id === promotedTrackId || (t as any).dbId === promotedTrackId
        );
        console.log('Found promoted track:', track);
        
        if (track) {
          setSelectedTrack(track);
        }
      }
    }
  }, [existingSmartLink, playlist, isEditing]);

  // Pre-populate form data with playlist info when creating new smart link
  useEffect(() => {
    if (playlist && !isEditing && formData.title === '' && formData.description === '') {
      console.log('Pre-populating form with playlist data:', playlist);
      
      setFormData(prev => ({
        ...prev,
        title: (playlist as any).title || '',
        description: (playlist as any).description || ''
      }));
    }
  }, [playlist, isEditing, formData.title, formData.description]);

  // Smart link creation/update mutation
  const smartLinkMutation = useMutation({
    mutationFn: async (data: any) => {
      // First check if a smart link already exists for this playlist
      const checkResponse = await fetch(`/api/playlists/${effectivePlaylistId}/smart-link`);
      const { exists, smartLink } = checkResponse.ok ? await checkResponse.json() : { exists: false };
      
      let url, method;
      if (exists && smartLink) {
        // Update existing smart link
        url = `/api/v2/smart-links/${smartLink.shareId}`;
        method = 'PUT';
      } else {
        // Create new smart link
        url = '/api/v2/smart-links';
        method = 'POST';
      }
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return response.json();
    },
    onSuccess: (response: any) => {
      // Generate direct URL to the smart link using the clean format
      const playlistTitle = encodeURIComponent(formData.title.replace(/\s+/g, '-').toLowerCase());
      // Always use clean playlist ID format: /share/{id}/{title}
      const playlistId = response.playlistId || effectivePlaylistId;
      const shareUrl = `${window.location.origin}/share/${playlistId}/${playlistTitle}`;
      setGeneratedLink(shareUrl);
      
      // Scroll to top to show success message
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
      toast({
        title: isEditing ? "Playlist Sharing Link Updated!" : "Playlist Sharing Link Created!",
        description: "Your smart link is ready to share."
      });
      queryClient.invalidateQueries({ queryKey: ['/api/users', '1', 'smart-links'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to ${isEditing ? 'update' : 'create'} smart link`,
        variant: "destructive"
      });
    }
  });

  const handleTrackSelect = (track: Track) => {
    setSelectedTrack(track);
    // Use dbId if available, otherwise fall back to track.id
    const trackId = (track as any).dbId || track.id;
    setFormData(prev => ({ ...prev, promotedTrackId: trackId }));
  };

  // Add external Spotify song as featured track
  const handleAddExternalSong = async () => {
    if (!externalSongUrl.trim()) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid Spotify track URL",
        variant: "destructive"
      });
      return;
    }

    // Validate Spotify URL format
    const spotifyTrackRegex = /^https:\/\/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/;
    if (!spotifyTrackRegex.test(externalSongUrl)) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid Spotify track URL (e.g., https://open.spotify.com/track/...)",
        variant: "destructive"
      });
      return;
    }

    setIsAddingExternalSong(true);

    try {
      // Get user ID from context
      const userId = user?.id || 1;

      // Call the API to add external song to playlist first
      const response = await fetch(`/api/playlist/${effectivePlaylistId}/add-external-song`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          spotifyUrl: externalSongUrl,
          userId: userId
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to add external song');
      }

      const result = await response.json();

      // Create a track object for the external song
      const externalTrack: Track = {
        id: result.track.spotifyId,
        title: result.track.title || 'Unknown Title',
        artist: result.track.artist || 'Unknown Artist',
        album: result.track.album || 'Unknown Album',
        duration: result.track.duration || 0,
        albumCover: result.track.albumCoverImage || undefined,
        dbId: result.track.id,
        // Add duration_ms for UI compatibility
        duration_ms: result.track.duration || 0
      } as any;

      // Set this as the selected track
      setSelectedTrack(externalTrack);
      setFormData(prev => ({ ...prev, promotedTrackId: result.track.id }));
      setExternalSongUrl("");

      toast({
        title: "External Song Added!",
        description: `"${result.track.title}" is now featured in your smart link`,
        variant: "default"
      });

    } catch (error) {
      console.error("Error adding external song:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add external song",
        variant: "destructive"
      });
    } finally {
      setIsAddingExternalSong(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.promotedTrackId || !formData.title) {
      toast({
        title: "Missing Information",
        description: "Please select a featured track and enter a title.",
        variant: "destructive"
      });
      return;
    }

    smartLinkMutation.mutate({
      playlistId: parseInt(playlistId!),
      promotedTrackId: formData.promotedTrackId,
      title: formData.title,
      description: formData.description,
      customCoverImage: formData.customCoverImage
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: "Link copied to clipboard"
    });
  };

  const generateAIDescription = async () => {
    if (!playlist || !effectivePlaylistId) {
      toast({
        title: "Error",
        description: "Playlist data not available",
        variant: "destructive"
      });
      return;
    }

    setIsGeneratingDescription(true);
    
    try {
      const response = await fetch('/api/smart-links/generate-description', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          playlistId: effectivePlaylistId,
          promotedTrackId: formData.promotedTrackId,
          title: formData.title || (playlist as any).title
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate description');
      }

      const data = await response.json();
      
      setFormData(prev => ({
        ...prev,
        description: data.description
      }));

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

  // Add debugging for state
  console.log('SmartLinkEditor render state:', {
    isEditing,
    shareId,
    playlistId,
    smartLinkLoading,
    smartLinkError,
    existingSmartLink,
    effectivePlaylistId,
    playlistLoading,
    playlist
  });

  if (playlistLoading || (isEditing && smartLinkLoading)) {
    return (
      <Layout>
        <div className="container px-2 py-4 max-w-6xl">
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            <p className="ml-4">Loading {isEditing ? 'smart link data' : 'playlist data'}...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (smartLinkError) {
    return (
      <Layout>
        <div className="container px-2 py-4 max-w-6xl">
          <div className="text-center py-20">
            <h2 className="text-2xl font-bold mb-4 text-red-600">Error Loading Playlist Sharing Link</h2>
            <p className="mb-4 text-gray-600">{smartLinkError.message}</p>
            <Button onClick={() => setLocation('/smart-links')}>
              Back to Playlist Sharing Links
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  if (isEditing && !existingSmartLink) {
    return (
      <Layout>
        <div className="container px-2 py-4 max-w-6xl">
          <div className="text-center py-20">
            <h2 className="text-2xl font-bold mb-4">Playlist Sharing Link Not Found</h2>
            <p className="mb-4 text-gray-600">The playlist sharing link you're trying to edit could not be found.</p>
            <Button onClick={() => setLocation('/smart-links')}>
              Back to Playlist Sharing Links
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  if (!playlist) {
    return (
      <Layout>
        <div className="container px-2 py-4 max-w-6xl">
          <div className="text-center py-20">
            <h2 className="text-2xl font-bold mb-4">Playlist Not Found</h2>
            <p className="mb-4 text-gray-600">Effective playlist ID: {effectivePlaylistId}</p>
            <Button onClick={() => setLocation('/smart-links')}>
              Back to Playlist Sharing Links
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container px-2 py-4 max-w-6xl">
        {/* Page Header */}
        <div className="mb-2">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-teal-400 to-green-500 bg-clip-text text-transparent">
            {isEditing ? 'Edit Playlist Sharing Link' : 'Create Playlist Sharing Link'}
          </h1>
        </div>

        {/* Success State - Generated Link */}
        {generatedLink && (
          <Card className="mb-8 border-gradient-to-r from-green-200 to-emerald-200 bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 dark:border-green-800 dark:bg-gradient-to-br dark:from-green-950 dark:via-emerald-950 dark:to-teal-950 shadow-lg">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center space-x-3 text-green-800 dark:text-green-200">
                <div className="p-2 bg-green-100 dark:bg-green-900 rounded-full">
                  <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <span className="text-xl font-bold">Playlist Sharing Link Created Successfully!</span>
                  <p className="text-sm text-green-600 dark:text-green-400 font-normal mt-1">
                    Your playlist is now ready to share with the world
                  </p>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="relative">
                  <div className="flex items-center space-x-3 p-4 bg-white dark:bg-gray-900 rounded-xl border-2 border-green-200 dark:border-green-700 shadow-sm">
                    <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                      <Globe className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Your Playlist Sharing Link URL</p>
                      <code className="text-sm font-mono text-gray-800 dark:text-gray-200 break-all">{generatedLink}</code>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => generatedLink && copyToClipboard(generatedLink)}
                      disabled={!generatedLink}
                      className="shrink-0 border-green-300 text-green-700 hover:bg-green-100 dark:border-green-600 dark:text-green-300 dark:hover:bg-green-900"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <div className="flex justify-center">
                  <Button
                    onClick={() => generatedLink && window.open(generatedLink, '_blank')}
                    disabled={!generatedLink}
                    className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-8 py-3 text-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-200"
                    size="lg"
                  >
                    <ExternalLink className="h-5 w-5 mr-3" />
                    Preview Your Playlist Sharing Link
                  </Button>
                </div>
                
                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-green-200 dark:border-green-700">
                  <div className="text-center">
                    <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-2">
                      <MessageCircle className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Messaging Apps</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">WhatsApp, Telegram</p>
                  </div>
                  <div className="text-center">
                    <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center mx-auto mb-2">
                      <Globe className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Social Media</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Facebook, Twitter</p>
                  </div>
                  <div className="text-center">
                    <div className="w-12 h-12 bg-pink-100 dark:bg-pink-900 rounded-full flex items-center justify-center mx-auto mb-2">
                      <Eye className="h-6 w-6 text-pink-600 dark:text-pink-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Analytics</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Track engagement</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Form */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>
                  Playlist Sharing Link Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium mb-2">Link Title</label>
                    <Input
                      value={formData.title}
                      onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="Enter a catchy title for your smart link"
                      required
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium">Description</label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={generateAIDescription}
                        disabled={isGeneratingDescription || !playlist}
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
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Describe what makes this playlist special... or use AI to generate a viral description!"
                      rows={4}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Let AI create a trendy, marketing-savvy description based on your tracks and vibe
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Custom Cover Image URL (Optional)</label>
                    <Input
                      value={formData.customCoverImage}
                      onChange={(e) => setFormData(prev => ({ ...prev, customCoverImage: e.target.value }))}
                      placeholder="https://example.com/custom-image.jpg"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Leave empty to use playlist cover</p>
                  </div>

                  <Separator />

                  <div>
                    <label className="block text-sm font-medium mb-3">Featured Track</label>
                    <p className="text-sm text-muted-foreground mb-4">
                      Choose which track to highlight in your smart link preview
                    </p>
                    
                    {selectedTrack && (
                      <div className="mb-4 p-4 bg-gradient-to-r from-primary/5 to-primary/10 rounded-xl border border-primary/20">
                        <div className="flex items-center space-x-4">
                          <div className="relative">
                            {(selectedTrack as any).album_cover_image ? (
                              <img 
                                src={(selectedTrack as any).album_cover_image} 
                                alt={(selectedTrack as any).album_name || 'Album cover'}
                                className="w-16 h-16 rounded-lg object-cover shadow-md"
                              />
                            ) : (
                              <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
                                <Music className="h-6 w-6 text-muted-foreground" />
                              </div>
                            )}
                            <div className="absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full p-1">
                              <Check className="h-3 w-3" />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-lg truncate">{selectedTrack.title}</p>
                            <p className="text-sm text-muted-foreground truncate">{selectedTrack.artist}</p>
                            {(selectedTrack as any).album_name && (
                              <p className="text-xs text-muted-foreground truncate mt-1">
                                from "{(selectedTrack as any).album_name}"
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-muted-foreground">Duration</div>
                            <div className="font-mono text-sm">
                              {(selectedTrack as any).duration_ms ? 
                                `${Math.floor((selectedTrack as any).duration_ms / 60000)}:${String(Math.floor(((selectedTrack as any).duration_ms % 60000) / 1000)).padStart(2, '0')}` 
                                : '0:00'
                              }
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 text-xs text-primary/80 font-medium">
                          ✨ This track will be featured in your smart link preview
                        </div>
                      </div>
                    )}

                    {/* Add External Song Section */}
                    <div className="mb-4 p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl border border-green-200 dark:border-green-700">
                      <div className="space-y-3">
                        <div className="flex items-center space-x-2">
                          <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          <h4 className="font-medium text-gray-900 dark:text-white">Feature External Song</h4>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Add any song from Spotify to feature in your smart link. We'll automatically resolve all platform links.
                        </p>
                        <div className="flex space-x-2">
                          <Input
                            placeholder="https://open.spotify.com/track/..."
                            value={externalSongUrl}
                            onChange={(e) => setExternalSongUrl(e.target.value)}
                            className="flex-1"
                          />
                          <Button
                            onClick={handleAddExternalSong}
                            disabled={!externalSongUrl || isAddingExternalSong}
                            size="sm"
                          >
                            {isAddingExternalSong ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            ) : (
                              <>
                                <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                                </svg>
                                Add Song
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                    
                    <div className="max-h-64 overflow-y-auto space-y-2 border rounded-lg p-2">
                      {(playlist as any)?.tracks?.map((track: Track) => (
                        <div
                          key={track.id}
                          onClick={() => handleTrackSelect(track)}
                          className={`p-3 rounded-lg cursor-pointer transition-all border ${
                            selectedTrack?.id === track.id
                              ? 'bg-primary/10 border-primary'
                              : 'hover:bg-muted'
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            <div className="relative flex-shrink-0">
                              {(track as any).album_cover_image ? (
                                <img 
                                  src={(track as any).album_cover_image} 
                                  alt={(track as any).album_name || 'Album cover'}
                                  className="w-12 h-12 rounded-lg object-cover"
                                />
                              ) : (
                                <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                                  <Music className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{track.title}</p>
                              <p className="text-sm text-muted-foreground truncate">{track.artist}</p>
                              {(track as any).album_name && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {(track as any).album_name}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center space-x-2 flex-shrink-0">
                              <div className="text-right">
                                <div className="text-xs font-mono text-muted-foreground">
                                  {(track as any).duration_ms ? 
                                    `${Math.floor((track as any).duration_ms / 60000)}:${String(Math.floor(((track as any).duration_ms % 60000) / 1000)).padStart(2, '0')}` 
                                    : '0:00'
                                  }
                                </div>
                              </div>
                              {selectedTrack?.id === track.id && (
                                <Check className="h-4 w-4 text-primary" />
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={smartLinkMutation.isPending || !formData.promotedTrackId}
                    className="w-full"
                  >
                    {smartLinkMutation.isPending ? (
                      <div className="flex items-center space-x-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>{isEditing ? 'Updating...' : 'Creating...'}</span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <Sparkles className="h-4 w-4" />
                        <span>{isEditing ? 'Update Playlist Sharing Link' : 'Create Playlist Sharing Link'}</span>
                      </div>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Preview & Info */}
          <div className="space-y-6">
            {/* Playlist Sharing Link Preview */}
            <Card>
              <CardHeader>
                <CardTitle>
                  Playlist Sharing Link Preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="bg-muted/50 dark:bg-muted/30 rounded-lg p-4 border border-border">
                    <div className="space-y-3">
                      {/* Optimized thumbnail for smart link - large and on top */}
                      {(formData.customCoverImage || (playlist as any)?.coverImage) && (
                        <div className="flex justify-center">
                          <img 
                            src={`/api/thumbnail?url=${encodeURIComponent(formData.customCoverImage || (playlist as any)?.coverImage)}&size=256`}
                            alt="Smart link preview"
                            className="w-32 h-32 rounded-xl object-cover border border-border shadow-md"
                          />
                        </div>
                      )}
                      
                      <div className="text-center space-y-2">
                        <h5 className="font-medium text-base text-foreground">
                          {formData.title || (playlist as any)?.title}
                        </h5>
                        <p className="text-sm text-muted-foreground line-clamp-3">
                          {formData.description || (playlist as any)?.description || `Discover amazing music with ${(playlist as any)?.tracks?.length || 0} tracks`}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  
                </div>
              </CardContent>
            </Card>

            {/* Benefits Card */}
            <Card>
              <CardHeader>
                <CardTitle>
                  Playlist Sharing Link Benefits
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-start space-x-3">
                    <MessageCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium">Optimized for Messaging</p>
                      <p className="text-sm text-muted-foreground">
                        Sub-100KB images load perfectly in WhatsApp, Telegram, and other messaging apps
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-3">
                    <Globe className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium">Social Media Ready</p>
                      <p className="text-sm text-muted-foreground">
                        Optimized Open Graph images for Facebook, Twitter, and LinkedIn
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-3">
                    <Eye className="h-5 w-5 text-purple-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium">Analytics Tracking</p>
                      <p className="text-sm text-muted-foreground">
                        Track views and engagement on your shared playlists
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-3">
                    <Music className="h-5 w-5 text-pink-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium">Featured Track Highlight</p>
                      <p className="text-sm text-muted-foreground">
                        Showcase your best track with rich preview cards
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}