import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { 
  ExternalLink, 
  Eye, 
  Copy, 
  Trash2, 
  Calendar,
  TrendingUp,
  Share2,
  Edit
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import Layout from '@/components/Layout';
import { getThumbnailUrl } from '@/lib/imageOptimizer';

interface SmartLink {
  id: number;
  shareId: string;
  playlistId: number;
  promotedTrackId: number;
  customCoverImage?: string;
  title: string;
  description: string;
  views: number;
  createdAt: string;
  updatedAt: string;
}

const SmartLinks = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [smartLinkToDelete, setSmartLinkToDelete] = useState<SmartLink | null>(null);

  // Fetch user's smart links
  const { data: smartLinks = [], isLoading, refetch } = useQuery<SmartLink[]>({
    queryKey: ['/api/v2/users', user?.id, 'smart-links'],
    queryFn: () => fetch(`/api/v2/users/${user?.id}/smart-links`).then(res => res.json()),
    enabled: !!user,
  });

  // Delete smart link mutation
  const deleteSmartLinkMutation = useMutation({
    mutationFn: async (smartLinkId: number) => {
      const response = await fetch(`/api/v2/smart-links/${smartLinkId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete smart link');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/v2/users', user?.id, 'smart-links'] });
      refetch(); // Force immediate refetch
      toast({
        title: "Smart link deleted",
        description: "The smart link has been successfully removed",
      });
    },
    onError: () => {
      toast({
        title: "Delete failed",
        description: "Could not delete the smart link. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Utility function to create URL-friendly slugs
  const createSlug = (title: string): string => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  // Generate smart link URL using playlist ID format
  const generateSmartLinkUrl = (playlistId: number, title: string): string => {
    const slug = createSlug(title);
    return `${window.location.origin}/share/${playlistId}/${slug}`;
  };

  const copyShareUrl = async (link: SmartLink) => {
    const url = generateSmartLinkUrl(link.playlistId, link.title);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(link.shareId);
      setTimeout(() => setCopiedId(null), 2000);
      toast({
        title: "Link copied!",
        description: `Smart link for "${link.title}" copied to clipboard`,
      });
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Could not copy link to clipboard",
        variant: "destructive",
      });
    }
  };

  const viewSmartLink = (link: SmartLink) => {
    const url = generateSmartLinkUrl(link.playlistId, link.title);
    window.open(url, '_blank');
  };

  const handleDeleteSmartLink = (smartLink: SmartLink) => {
    setSmartLinkToDelete(smartLink);
  };

  const confirmDelete = () => {
    if (smartLinkToDelete) {
      deleteSmartLinkMutation.mutate(smartLinkToDelete.id);
      setSmartLinkToDelete(null);
    }
  };

  // Fetch playlists to get cover images and track counts
  const { data: playlists = [] } = useQuery({
    queryKey: ['/api/playlists-with-counts', `userId=${user?.id}`],
    queryFn: () => fetch(`/api/playlists-with-counts?userId=${user?.id}`).then(res => res.json()),
    enabled: !!user,
  });

  // Create a lookup map for playlist data
  const playlistMap = new Map(Array.isArray(playlists) ? playlists.map((p: any) => [p.id, p]) : []);

  if (!user) {
    return (
      <Layout>
        <div className="container px-2 py-4 max-w-6xl">
          <div className="text-center">
            <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-teal-400 to-green-500 bg-clip-text text-transparent">
              Playlist Sharing Links
            </h1>
            <p className="text-muted-foreground">Please log in to view your smart links.</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="container px-2 py-4 max-w-6xl">
          <h1 className="text-4xl font-bold mb-8 bg-gradient-to-r from-teal-400 to-green-500 bg-clip-text text-transparent">
            Playlist Sharing Links
          </h1>
          <div className="grid gap-4">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-muted rounded w-1/2"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  const totalViews = smartLinks.reduce((sum: number, link: SmartLink) => sum + link.views, 0);
  const mostViewedLink = smartLinks.reduce((max: SmartLink | null, link: SmartLink) => 
    !max || link.views > max.views ? link : max, null);

  return (
    <Layout>
      <div className="container px-2 py-4 max-w-6xl">
        <div className="mb-8">
          <h1 className="font-bold mb-4 bg-gradient-to-r from-teal-400 to-[#1DB954] text-transparent bg-clip-text text-2xl md:text-3xl lg:text-[40px] leading-normal py-1">
            Playlist Sharing Links
          </h1>
        </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card className="h-32 rounded-xl">
          <CardContent className="p-6 flex items-center justify-between h-full">
            <div>
              <p className="text-sm text-muted-foreground">Total Links</p>
              <p className="text-2xl font-bold">{smartLinks.length}</p>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </CardContent>
        </Card>

        <Card className="h-32 rounded-xl">
          <CardContent className="p-6 flex items-center justify-between h-full">
            <div>
              <p className="text-sm text-muted-foreground">Total Views</p>
              <p className="text-2xl font-bold">{totalViews}</p>
            </div>
            <Eye className="h-8 w-8 text-green-500" />
          </CardContent>
        </Card>

        <Card className="h-32 rounded-xl">
          <CardContent className="p-6 flex items-center justify-between h-full">
            <div>
              <p className="text-sm text-muted-foreground">Most Popular</p>
              <p className="text-lg font-semibold truncate">
                {mostViewedLink ? `${mostViewedLink.views} views` : 'No views yet'}
              </p>
            </div>
            <TrendingUp className="h-8 w-8 text-purple-500" />
          </CardContent>
        </Card>
      </div>

      {/* Playlist Sharing Links List */}
      {smartLinks.length === 0 ? (
        <div className="text-center py-16 max-w-md mx-auto">
          <h2 className="text-2xl font-bold mb-3 bg-gradient-to-r from-teal-400 to-[#1DB954] text-transparent bg-clip-text">No playlist sharing links yet</h2>
          <p className="text-muted-foreground mb-6">Create your first AI-powered playlist and it will appear here</p>
          <button 
            onClick={() => window.location.href = '/playlists'}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 h-10 px-4 py-2 bg-[#1DB954] hover:bg-[#1ed760] text-white"
          >
            Create New Playlist
          </button>
        </div>
      ) : (
        <div className="space-y-4 mb-16">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-teal-400 to-green-500 bg-clip-text text-transparent mb-4">Your Playlist Sharing Links</h2>
          {smartLinks.map((link: SmartLink) => {
            const playlist = playlistMap.get(link.playlistId) as any;
            // Debug: Check if playlist exists and log the data
            if (!playlist) {
              console.log(`No playlist found for playlistId: ${link.playlistId}`);
              console.log('Available playlist IDs:', Array.from(playlistMap.keys()));
              console.log('Link data:', link);
            }
            return (
            <Card key={link.id} className="overflow-hidden hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  {/* Playlist Cover */}
                  <div className="flex-shrink-0">
                    {(link.customCoverImage || playlist?.coverImage) ? (
                      <img
                        src={link.customCoverImage || playlist?.coverImage}
                        alt={link.title}
                        className="w-16 h-16 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                        <span className="text-white font-bold text-lg">
                          {link.title.charAt(0)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Header with title and actions */}
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        {/* Clickable title with copy icon */}
                        <div className="flex items-center gap-2 mb-1">
                          <button
                            onClick={() => viewSmartLink(link)}
                            className="font-semibold text-lg hover:text-primary transition-colors cursor-pointer truncate text-left"
                          >
                            {link.title}
                          </button>
                          <button
                            onClick={() => copyShareUrl(link)}
                            className="p-1 hover:bg-muted rounded transition-colors"
                            title="Copy link"
                          >
                            {copiedId === link.shareId ? (
                              <div className="text-green-600 text-xs font-medium">Copied!</div>
                            ) : (
                              <Copy className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                            )}
                          </button>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          From playlist: {playlist?.title || 'Unknown'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground ml-4">
                        <Eye className="h-4 w-4" />
                        <span>{link.views}</span>
                      </div>
                    </div>

                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                      {link.description}
                    </p>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>{formatDistanceToNow(new Date(link.createdAt))} ago</span>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {playlist?.trackCount || '?'} tracks
                        </Badge>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.location.href = `/smart-links/edit/${link.shareId}`}
                          className="text-xs"
                        >
                          <Edit className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={deleteSmartLinkMutation.isPending}
                              className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-3 w-3 mr-1" />
                              {deleteSmartLinkMutation.isPending ? 'Deleting...' : 'Delete'}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Playlist Sharing Link</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete the smart link "{link.title}"? 
                                This action cannot be undone and will permanently remove the link.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteSmartLinkMutation.mutate(link.id)}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}
      </div>
    </Layout>
  );
};

export default SmartLinks;