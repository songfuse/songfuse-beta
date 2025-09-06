import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface MigrationResult {
  success: boolean;
  message: string;
  migratedPlaylists: Array<{
    id: number;
    title: string;
    oldUrl: string;
    newUrl: string;
  }>;
  failedPlaylists: Array<{
    id: number;
    title: string;
    error: string;
  }>;
}

const ImageMigrationTool = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);
  const queryClient = useQueryClient();

  // Get all user's playlists
  const { data: playlists = [] } = useQuery({
    queryKey: ['/api/playlists', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const response = await apiRequest('GET', `/api/playlists?userId=${user.id}`);
      return response.json();
    },
    enabled: !!user
  });

  // Count playlists that need migration (those that don't start with /images/)
  const playlistsNeedingMigration = playlists.filter(
    (playlist: any) => playlist.coverImageUrl && !playlist.coverImageUrl.startsWith('/images/')
  );

  const runMigration = async () => {
    if (!user) return;
    
    setIsMigrating(true);
    try {
      const response = await apiRequest('POST', '/api/migrate-images', {
        userId: user.id
      });
      
      const result = await response.json();
      setMigrationResult(result);
      
      // Show success toast
      toast({
        title: "Migration Complete",
        description: result.message,
      });
      
      // Invalidate playlists cache to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/playlists'] });
      
    } catch (error) {
      console.error("Migration error:", error);
      toast({
        title: "Migration Failed",
        description: "There was an error during the image migration process. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsMigrating(false);
    }
  };

  if (!user) {
    return (
      <Alert>
        <AlertTitle>Authentication Required</AlertTitle>
        <AlertDescription>Please log in to use the image migration tool.</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Cover Image Migration Tool</CardTitle>
        <CardDescription>
          Fix broken cover images by migrating them to permanent storage.
          Found {playlistsNeedingMigration.length} playlist(s) that need migration.
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-4">
          {playlistsNeedingMigration.length === 0 ? (
            <Alert>
              <AlertTitle>All Images Are Current</AlertTitle>
              <AlertDescription>
                All of your playlist cover images are already using permanent storage. No migration needed.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <AlertTitle>Images Need Migration</AlertTitle>
              <AlertDescription>
                {playlistsNeedingMigration.length} playlist cover images are using temporary storage and may stop loading.
                Click the button below to migrate them to permanent storage.
              </AlertDescription>
            </Alert>
          )}
          
          {migrationResult && (
            <div className="mt-4 space-y-3">
              <h3 className="text-lg font-medium">Migration Results</h3>
              
              {migrationResult.migratedPlaylists.length > 0 && (
                <div>
                  <h4 className="text-md font-medium text-green-500 dark:text-green-400">
                    Successfully Migrated ({migrationResult.migratedPlaylists.length})
                  </h4>
                  <ul className="list-disc pl-5 mt-2 space-y-1">
                    {migrationResult.migratedPlaylists.map(playlist => (
                      <li key={playlist.id}>{playlist.title}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              {migrationResult.failedPlaylists.length > 0 && (
                <div>
                  <h4 className="text-md font-medium text-red-500 dark:text-red-400">
                    Failed to Migrate ({migrationResult.failedPlaylists.length})
                  </h4>
                  <ul className="list-disc pl-5 mt-2 space-y-1">
                    {migrationResult.failedPlaylists.map(playlist => (
                      <li key={playlist.id}>{playlist.title} - {playlist.error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
      
      <CardFooter>
        <Button
          onClick={runMigration}
          disabled={isMigrating || playlistsNeedingMigration.length === 0}
          className="w-full"
        >
          {isMigrating ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Migrating Images...
            </>
          ) : (
            'Migrate Cover Images'
          )}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default ImageMigrationTool;