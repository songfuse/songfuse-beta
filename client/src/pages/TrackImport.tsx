import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { 
  Loader2, Music, Tag, Database, ActivityIcon, RefreshCw, 
  Calendar, Clock, CheckCircle2, AlertCircle, CalendarDays,
  Share2, BarChart2, ExternalLink, PieChart
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { executeSqlQuery } from "@/lib/utils";

export default function TrackImport() {
  const [jsonInput, setJsonInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdatingGenres, setIsUpdatingGenres] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isRunningOdesli, setIsRunningOdesli] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [genreUpdateResult, setGenreUpdateResult] = useState<{ success: boolean; message: string } | null>(null);
  const [odesliResult, setOdesliResult] = useState<{ 
    success: boolean; 
    message: string; 
    taskId?: string;
    status?: string;
    progress?: {
      processed: number;
      total: number;
    };
    lastUpdate?: Date;
  } | null>(null);
  const [odesliPollingInterval, setOdesliPollingInterval] = useState<NodeJS.Timeout | null>(null);
  
  // Release date cleanup variables
  const [testRunning, setTestRunning] = useState(false);
  const [cleanupRunning, setCleanupRunning] = useState(false);
  const [batchSize, setBatchSize] = useState(500);
  const [isDryRun, setIsDryRun] = useState(true);
  
  // State for simplified track data
  const [simpleTracks, setSimpleTracks] = useState<Array<{
    id: number;
    title: string;
    artist: string;
    artists?: any[];
    spotifyId?: string;
    genres?: string[];
    releaseDate?: string | null;
  }> | null>(null);
  
  // State for database and platform statistics
  const [databaseStats, setDatabaseStats] = useState<{
    totalTracks: number;
    tracksWithSpotify: number;
    tracksWithAppleMusic: number;
    tracksWithYouTube: number;
    tracksWithAmazonMusic: number;
    tracksWithTidal: number;
    tracksWithDeezer: number;
    lastUpdated: string;
  } | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [isLoadingSimpleTracks, setIsLoadingSimpleTracks] = useState(false);
  const { toast } = useToast();
  
  // Function to fetch simplified track data
  const fetchSimpleTracks = async () => {
    try {
      setIsLoadingSimpleTracks(true);
      
      // Use our new simplified tracks endpoint
      const response = await fetch('/api/simplified-tracks');
      
      if (!response.ok) {
        // Get detailed error info if possible
        const errorText = await response.text();
        console.error("Error response text:", errorText);
        throw new Error(`Failed to fetch simplified track data: ${response.status}`);
      }
      
      const data = await response.json();
      setSimpleTracks(data);
      
      toast({
        title: "Tracks Loaded",
        description: `Successfully loaded ${data.length.toLocaleString()} simplified tracks from the database`,
      });
    } catch (error) {
      console.error("Error fetching simplified track data:", error);
      toast({
        title: "Error",
        description: "Failed to load simplified track data",
        variant: "destructive",
      });
    } finally {
      setIsLoadingSimpleTracks(false);
    }
  };

  // Function to fetch database statistics
  const fetchDatabaseStats = async () => {
    try {
      setIsLoadingStats(true);
      
      const response = await fetch('/api/admin/database-stats');
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Error response text:", errorText);
        throw new Error(`Failed to fetch database statistics: ${response.status}`);
      }
      
      const data = await response.json();
      setDatabaseStats(data);
      
      toast({
        title: "Statistics Loaded",
        description: `Successfully loaded database statistics for ${data.totalTracks.toLocaleString()} tracks`,
      });
    } catch (error) {
      console.error("Error fetching database statistics:", error);
      toast({
        title: "Error",
        description: "Failed to load database statistics",
        variant: "destructive",
      });
    } finally {
      setIsLoadingStats(false);
    }
  };

  // Fetch track data on initial load
  useEffect(() => {
    fetchSimpleTracks();
    fetchDatabaseStats();
    
    // Clean up any existing interval on unmount
    return () => {
      if (odesliPollingInterval) {
        clearInterval(odesliPollingInterval);
      }
    };
  }, []);

  // Function to clear any existing polling interval
  const clearOdesliPolling = () => {
    if (odesliPollingInterval) {
      clearInterval(odesliPollingInterval);
      setOdesliPollingInterval(null);
    }
  };

  // Flag to prevent duplicate stats refreshes
  const [statsRefreshed, setStatsRefreshed] = useState(false);
  
  // Function to poll the status of an Odesli platform resolution task
  const pollOdesliTaskStatus = async (taskId: string) => {
    try {
      const response = await fetch(`/api/admin/platform-tasks/${taskId}`);
      
      if (!response.ok) {
        console.error("Error polling task status:", response.status);
        return;
      }
      
      // Try to parse response as JSON
      let data;
      try {
        const responseText = await response.text();
        data = JSON.parse(responseText);
      } catch (error) {
        console.error("Error parsing task status response:", error);
        return;
      }
      
      if (data.success && data.task) {
        // Update the UI with the latest task status
        setOdesliResult(prev => {
          if (!prev) return {
            success: true,
            message: "Process is running",
            taskId,
            status: data.task.status,
            progress: {
              processed: data.task.processed || 0,
              total: data.task.total || 100
            },
            lastUpdate: data.task.lastUpdate || new Date().toISOString()
          };
          
          return {
            ...prev,
            status: data.task.status,
            progress: {
              processed: data.task.processed || 0,
              total: data.task.total || prev.progress?.total || 100
            },
            lastUpdate: data.task.lastUpdate
          };
        });
        
        // If the task is completed, failed, or stopped, end polling
        if (['completed', 'complete', 'failed', 'stopped'].includes(data.task.status)) {
          clearOdesliPolling();
          setIsRunningOdesli(false);
          
          // Only refresh stats once at the very end and only if we haven't already done it
          if (!statsRefreshed) {
            await fetchDatabaseStats();
            setStatsRefreshed(true);
          }
          
          // Show a toast notification based on the final status
          if (data.task.status === 'completed' || data.task.status === 'complete') {
            toast({
              title: "Process Complete",
              description: `Platform resolution process completed successfully. Processed ${data.task.processed} tracks.`
            });
          } else if (data.task.status === 'failed') {
            toast({
              title: "Process Failed",
              description: data.task.message || "Platform resolution process encountered an error.",
              variant: "destructive"
            });
          } else if (data.task.status === 'stopped') {
            toast({
              title: "Process Stopped",
              description: "Platform resolution process was manually stopped."
            });
          }
        }
      }
    } catch (error) {
      console.error("Error polling task status:", error);
      // Continue polling despite errors
    }
  };

  // Function to stop an Odesli platform resolution task
  const stopOdesliTask = async () => {
    if (!odesliResult?.taskId) return;
    
    try {
      const url = `${window.location.origin}/api/admin/platform-tasks/${odesliResult.taskId}/stop`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });
      
      if (!response.ok) {
        console.error("Error stopping task:", response.status);
        return;
      }
      
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Task Stopping",
          description: "The platform resolution task is being stopped. This may take a moment."
        });
        
        // Update the local state
        setOdesliResult(prev => ({
          ...prev!,
          status: 'stopping'
        }));
      }
    } catch (error) {
      console.error("Error stopping task:", error);
      toast({
        title: "Error",
        description: "Failed to stop the platform resolution task",
        variant: "destructive"
      });
    }
  };
  
  // Function to run the Odesli platform resolution script
  const runOdesliResolution = async () => {
    try {
      // Clean up any existing polling
      clearOdesliPolling();
      
      setIsRunningOdesli(true);
      setOdesliResult(null);
      
      console.log("Sending request to run Odesli platform resolution...");
      
      const response = await fetch('/api/admin/run-odesli', {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        }
      });
      
      // Always try to parse as JSON first
      let data;
      try {
        const responseText = await response.text();
        console.log(`Raw response (${response.status}):`, responseText);
        
        // Try to parse JSON response
        data = JSON.parse(responseText);
      } catch (e) {
        console.error("Failed to parse response as JSON:", e);
        
        // Create fallback data
        data = {
          success: response.ok,
          message: response.ok 
            ? "Started platform resolution process (checking for updates...)"
            : "Failed to start platform resolution process (invalid response format)"
        };
        
        // Refresh stats to show current state
        await fetchDatabaseStats();
      }
      
      if (response.ok) {
        // Check if we have task information in the response
        const hasTaskInfo = data.taskId && data.status;
        
        const resultState = {
          success: true,
          message: data.message || "Platform resolution process has been initiated",
          ...(hasTaskInfo ? {
            taskId: data.taskId,
            status: data.status,
            progress: data.progress || { processed: 0, total: data.progress?.total || 100 }
          } : {})
        };
        
        setOdesliResult(resultState);
        
        // If we have a task ID, start polling for updates
        if (hasTaskInfo) {
          // Start polling immediately
          const interval = setInterval(() => pollOdesliTaskStatus(data.taskId), 2000);
          setOdesliPollingInterval(interval);
          
          toast({
            title: "Process Started",
            description: `Platform resolution task has started. Real-time progress will be shown.`
          });
          
          // Poll once right away to get initial status
          setTimeout(() => pollOdesliTaskStatus(data.taskId), 500);
          
          // Keep the loading state active while polling
          return;
        } else {
          // No task ID, just show generic success and refresh stats
          toast({
            title: "Process Started",
            description: "Platform resolution process has been initiated in the background"
          });
          
          // Refresh stats after a short delay
          setTimeout(fetchDatabaseStats, 3000);
        }
      } else {
        // Handle error
        toast({
          title: "Error",
          description: data.message || "Failed to start platform resolution process",
          variant: "destructive"
        });
        
        setOdesliResult({
          success: false,
          message: data.message || "Failed to start platform resolution process"
        });
      }
    } catch (error) {
      console.error("Error starting platform resolution:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred while starting the process",
        variant: "destructive"
      });
      
      setOdesliResult({
        success: false,
        message: "An unexpected error occurred while starting the process"
      });
    } finally {
      if (!odesliPollingInterval) {
        setIsRunningOdesli(false);
      }
    }
  };
  
  // Test simple release date update setup
  const testCleanup = async () => {
    try {
      setTestRunning(true);
      
      // Test the cleanup script with a small batch
      const response = await fetch('/api/admin/test-date-cleanup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          batchSize: Math.min(batchSize, 100), // Limit to 100 for test
          isDryRun: true // Always dry run for test
        })
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Test Successful",
          description: `Test completed successfully. ${data.tracksProcessed} tracks would be processed.`
        });
      } else {
        toast({
          title: "Test Failed",
          description: data.message || "Test failed without specific error",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Error testing cleanup:", error);
      toast({
        title: "Error",
        description: "An error occurred during the test",
        variant: "destructive"
      });
    } finally {
      setTestRunning(false);
    }
  };
  
  // Run actual release date cleanup
  const runCleanup = async () => {
    try {
      setCleanupRunning(true);
      
      // Run the cleanup script with specified batch size
      const response = await fetch('/api/admin/run-date-cleanup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          batchSize,
          isDryRun
        })
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: isDryRun ? "Dry Run Complete" : "Cleanup Complete",
          description: `${data.tracksProcessed} tracks ${isDryRun ? "would be" : "were"} processed.`
        });
      } else {
        toast({
          title: "Cleanup Failed",
          description: data.message || "Cleanup failed without specific error",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Error running cleanup:", error);
      toast({
        title: "Error",
        description: "An error occurred during the cleanup process",
        variant: "destructive"
      });
    } finally {
      setCleanupRunning(false);
    }
  };
  
  // Function to update genre information
  const handleUpdateGenres = async () => {
    try {
      setIsUpdatingGenres(true);
      setGenreUpdateResult(null);
      
      const response = await fetch('/api/admin/update-genres', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
      
      const data = await response.json();
      
      setGenreUpdateResult({
        success: data.success,
        message: data.message
      });
      
      if (data.success) {
        toast({
          title: "Genre Update",
          description: data.message || "Genre information updated successfully"
        });
      } else {
        toast({
          title: "Genre Update Failed",
          description: data.message || "Failed to update genre information",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Error updating genres:", error);
      setGenreUpdateResult({
        success: false,
        message: "An unexpected error occurred"
      });
      
      toast({
        title: "Error",
        description: "An unexpected error occurred while updating genres",
        variant: "destructive"
      });
    } finally {
      setIsUpdatingGenres(false);
    }
  };
  
  // Function to handle track importing
  const handleImport = async () => {
    if (!jsonInput.trim()) {
      toast({
        title: "Empty input",
        description: "Please paste valid JSON data",
        variant: "destructive",
      });
      return;
    }

    // Parse the JSON to validate it
    let tracksData;
    try {
      tracksData = JSON.parse(jsonInput);
    } catch (e) {
      toast({
        title: "Invalid JSON",
        description: "Please check your JSON format and try again",
        variant: "destructive",
      });
      return;
    }

    // Convert to array if it's a single object
    const tracks = Array.isArray(tracksData) ? tracksData : [tracksData];

    // Validate track format
    if (!tracks.length) {
      toast({
        title: "No tracks found",
        description: "The JSON data must contain at least one track",
        variant: "destructive",
      });
      return;
    }

    // Check if tracks have the minimal required fields
    // Only title, artist name, and a Spotify ID are required now
    const invalidTracks = tracks.filter(
      (track) => 
        !track.title || 
        !Array.isArray(track.artists) || 
        track.artists.length === 0 || 
        !track.artists[0].name || 
        !track.platforms || 
        !track.platforms.spotify || 
        !track.platforms.spotify.id
    );

    if (invalidTracks.length > 0) {
      toast({
        title: "Invalid track data",
        description: `${invalidTracks.length} tracks are missing required fields`,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      // Add debugging info to console
      console.log("Attempting to import tracks:", tracks.length);
      
      // Use the correct API endpoint for track import
      const url = window.location.origin + '/api/tracks/import';
      console.log("Using track import endpoint:", url);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ tracks })
      });
      
      // Log raw response
      const responseText = await response.text();
      console.log("Response status:", response.status);
      console.log("Response text:", responseText);
      
      // Try to parse as JSON
      let data: { success?: boolean; message?: string } = {};
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        console.error("Error parsing response:", e);
        data = {
          success: true,
          message: `Started importing ${tracks.length} tracks (parsing error)`
        };
      }
    
      // Always show success message (we'll log any errors in the console)
      setResult({
        success: true,
        message: data.message || `Started importing ${tracks.length} tracks`,
      });
      toast({
        title: "Import started",
        description: `${tracks.length} tracks are being imported`,
      });
    } catch (error) {
      console.error("Error importing tracks:", error);
      setResult({
        success: false,
        message: "An unexpected error occurred",
      });
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto max-w-4xl p-4 sm:p-6 pb-24 lg:pb-6 h-full">
      <h1 className="text-3xl font-bold mb-6 bg-gradient-to-r from-teal-400 to-[#1DB954] text-transparent bg-clip-text">Track Management</h1>
      
      {/* Export button removed */}

      <Tabs defaultValue="import" className="mb-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="import">
            <Database className="w-4 h-4 mr-2" />
            Import Tracks
          </TabsTrigger>
          <TabsTrigger value="simplified">
            <Music className="w-4 h-4 mr-2" />
            Export Tracks
          </TabsTrigger>
          <TabsTrigger value="platforms">
            <PieChart className="w-4 h-4 mr-2" />
            Platform Stats
          </TabsTrigger>
          <TabsTrigger value="cleanup">
            <Calendar className="w-4 h-4 mr-2" />
            Cleanup Tools
          </TabsTrigger>
          <TabsTrigger value="help">
            <AlertCircle className="w-4 h-4 mr-2" />
            Help & Info
          </TabsTrigger>
        </TabsList>

        <TabsContent value="import">
          {/* Track Import Card */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Import Track JSON</CardTitle>
              <CardDescription>
                Add new tracks to the database by pasting JSON data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm dark:text-gray-400 text-gray-600 mb-4">
                <p className="mb-2">
                  Paste your track JSON data below. Each track must include at minimum: 
                  <span className="font-medium"> title, artist name, and Spotify ID</span>.
                </p>
                <p className="mb-2">
                  <span className="font-medium">Recommended fields:</span> We strongly encourage including these fields for complete track data:
                </p>
                <ul className="list-disc pl-5 mb-2 space-y-1">
                  <li><span className="font-mono text-xs font-semibold">duration_ms</span> - Track length in milliseconds (important for playlist timing)</li>
                  <li><span className="font-mono text-xs font-semibold">album</span> - Album information including name and cover image URL (improves display quality)</li>
                  <li><span className="font-mono text-xs">audio_features</span> - Audio characteristics like tempo, energy, danceability</li>
                  <li><span className="font-mono text-xs">platforms</span> - Links to the track on different music platforms</li>
                  <li><span className="font-mono text-xs">external_urls</span> - Direct URLs to the track</li>
                </ul>
                <p className="text-xs bg-amber-100 dark:bg-amber-950 p-2 rounded-md border border-amber-200 dark:border-amber-800 mt-2">
                  <span className="font-medium">Important:</span> Including duration and album information ensures proper track display and playlist functionality. See the complete example below.
                </p>
              </div>
              
              <Textarea
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                placeholder={`[
  {
    "title": "Lose Yourself",
    "duration_ms": 326466,
    "artists": [
      {
        "name": "Eminem",
        "id": "7dGJo4pcD2V6oG8kP0tJRR"
      }
    ],
    "album": {
      "name": "8 Mile",
      "id": "2bBDybnvM8S6HZHDjAjZqJ",
      "images": [
        {
          "url": "https://i.scdn.co/image/ab67616d0000b2731c20fbfbf2bc5ef2799c73f0",
          "height": 640,
          "width": 640
        }
      ]
    },
    "platforms": {
      "spotify": {
        "id": "5Z01UMMf7V1o0MzF86s6WJ",
        "url": "https://open.spotify.com/track/5Z01UMMf7V1o0MzF86s6WJ"
      },
      "apple": {
        "id": "1452538524",
        "url": "https://music.apple.com/us/album/lose-yourself/1452538389?i=1452538524"
      },
      "youtube": {
        "id": "7YuWwvbTO7U",
        "url": "https://www.youtube.com/watch?v=7YuWwvbTO7U"
      }
    },
    "external_urls": {
      "spotify": "https://open.spotify.com/track/5Z01UMMf7V1o0MzF86s6WJ"
    },
    "audio_features": {
      "tempo": 171.4,
      "energy": 0.9,
      "danceability": 0.75,
      "valence": 0.33,
      "acousticness": 0.01,
      "instrumentalness": 0,
      "liveness": 0.26,
      "speechiness": 0.22
    }
  },
  {
    "title": "Blinding Lights",
    "artists": [
      {
        "name": "The Weeknd"
      }
    ],
    "platforms": {
      "spotify": {
        "id": "0VjIjW4GlUZAMYd2vXMi3b"
      }
    }
  }
]`}
                className="font-mono h-80 mb-4"
              />
              
              <div className="flex justify-end">
                <Button 
                  onClick={handleImport} 
                  disabled={isLoading}
                  className="bg-[#d02b31] hover:bg-[#d02b31]/80 text-white"
                >
                  {isLoading ? "Importing..." : "Import Tracks"}
                </Button>
              </div>
            </CardContent>
          </Card>
          
          {result && (
            <Alert variant={result.success ? "default" : "destructive"}>
              <AlertTitle>{result.success ? "Import Processing" : "Import Failed"}</AlertTitle>
              <AlertDescription>
                {result.message}
                {result.success && (
                  <p className="mt-2 text-sm">
                    Track import is processing in the background. This may take a few minutes for large datasets.
                  </p>
                )}
              </AlertDescription>
            </Alert>
          )}


        </TabsContent>

        <TabsContent value="simplified">
          {/* Simplified Tracks Export Tab */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Share2 className="w-5 h-5 mr-2" />
                Simplified Tracks Export
              </CardTitle>
              <CardDescription>
                Export a minimal representation of track data with essential fields for reference
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-end space-x-2">
                  <Button 
                    onClick={fetchSimpleTracks}
                    variant="outline"
                    size="sm"
                    disabled={isLoadingSimpleTracks}
                    className="flex items-center"
                  >
                    {isLoadingSimpleTracks ? (
                      <>
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-1 h-4 w-4" />
                        Refresh Data
                      </>
                    )}
                  </Button>
                </div>

                {simpleTracks ? (
                  <div className="border rounded-md p-4 bg-muted/30">
                    <div className="flex justify-between items-center mb-4">
                      <p className="text-sm">
                        {simpleTracks.length.toLocaleString()} tracks loaded
                      </p>
                      <Button
                        onClick={() => {
                          // Create export data
                          const exportData = JSON.stringify(simpleTracks, null, 2);
                          // Create a blob and download link
                          const blob = new Blob([exportData], { type: 'application/json' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `songfuse-tracks-${new Date().toISOString().split('T')[0]}.json`;
                          document.body.appendChild(a);
                          a.click();
                          URL.revokeObjectURL(url);
                          document.body.removeChild(a);
                        }}
                        variant="outline"
                        size="sm"
                        className="flex items-center space-x-1"
                      >
                        <span>Export JSON</span>
                      </Button>
                    </div>
                    <div className="max-h-80 overflow-y-auto p-2 bg-background rounded border">
                      <pre className="text-xs font-mono whitespace-pre-wrap">
                        {JSON.stringify(simpleTracks.slice(0, 5), null, 2)}
                        {simpleTracks.length > 5 && '\n\n... (more tracks not shown)'}
                      </pre>
                    </div>
                  </div>
                ) : isLoadingSimpleTracks ? (
                  <div className="flex justify-center items-center h-40">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="text-center p-8 text-muted-foreground">
                    <Music className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No track data loaded yet.</p>
                    <p className="text-sm mt-2">
                      Click "Refresh Data" to load simplified track data from the database.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Platform Statistics Tab */}
        <TabsContent value="platforms">
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center">
                <BarChart2 className="w-5 h-5 mr-2" />
                Platform Availability Statistics
              </CardTitle>
              <CardDescription>
                View current statistics on platform coverage and run the Odesli process to improve it
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Database Statistics */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium flex items-center">
                    <PieChart className="w-4 h-4 mr-2" />
                    Database Statistics
                  </h3>
                  
                  {isLoadingStats ? (
                    <div className="flex items-center justify-center p-6">
                      <Loader2 className="h-6 w-6 animate-spin mr-2" />
                      <span>Loading statistics...</span>
                    </div>
                  ) : databaseStats ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="rounded-md border p-4">
                        <p className="font-medium mb-2">Tracks in Database</p>
                        <p className="text-2xl font-bold text-primary">{databaseStats.totalTracks.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground mt-2">
                          Last updated: {new Date(databaseStats.lastUpdated).toLocaleString()}
                        </p>
                      </div>

                      <div className="rounded-md border p-4">
                        <p className="font-medium mb-4">Platform Coverage</p>
                        <div className="space-y-3">
                          <div>
                            <div className="flex justify-between mb-1 text-sm">
                              <span>Spotify</span>
                              <span>{Math.round(databaseStats.tracksWithSpotify / databaseStats.totalTracks * 100)}%</span>
                            </div>
                            <Progress value={databaseStats.tracksWithSpotify / databaseStats.totalTracks * 100} className="h-2" />
                          </div>
                          <div>
                            <div className="flex justify-between mb-1 text-sm">
                              <span>Apple Music</span>
                              <span>{Math.round(databaseStats.tracksWithAppleMusic / databaseStats.totalTracks * 100)}%</span>
                            </div>
                            <Progress value={databaseStats.tracksWithAppleMusic / databaseStats.totalTracks * 100} className="h-2" />
                          </div>
                          <div>
                            <div className="flex justify-between mb-1 text-sm">
                              <span>YouTube</span>
                              <span>{Math.round(databaseStats.tracksWithYouTube / databaseStats.totalTracks * 100)}%</span>
                            </div>
                            <Progress value={databaseStats.tracksWithYouTube / databaseStats.totalTracks * 100} className="h-2" />
                          </div>
                          <div>
                            <div className="flex justify-between mb-1 text-sm">
                              <span>Amazon Music</span>
                              <span>{Math.round(databaseStats.tracksWithAmazonMusic / databaseStats.totalTracks * 100)}%</span>
                            </div>
                            <Progress value={databaseStats.tracksWithAmazonMusic / databaseStats.totalTracks * 100} className="h-2" />
                          </div>
                          <div>
                            <div className="flex justify-between mb-1 text-sm">
                              <span>Tidal</span>
                              <span>{Math.round(databaseStats.tracksWithTidal / databaseStats.totalTracks * 100)}%</span>
                            </div>
                            <Progress value={databaseStats.tracksWithTidal / databaseStats.totalTracks * 100} className="h-2" />
                          </div>
                          <div>
                            <div className="flex justify-between mb-1 text-sm">
                              <span>Deezer</span>
                              <span>{Math.round(databaseStats.tracksWithDeezer / databaseStats.totalTracks * 100)}%</span>
                            </div>
                            <Progress value={databaseStats.tracksWithDeezer / databaseStats.totalTracks * 100} className="h-2" />
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center p-6 border rounded-md">
                      <AlertCircle className="h-8 w-8 mx-auto mb-2 text-amber-500" />
                      <p>Failed to load database statistics</p>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-2"
                        onClick={fetchDatabaseStats}
                      >
                        Retry
                      </Button>
                    </div>
                  )}
                </div>
                
                <Separator />
                
                {/* Odesli Platform Resolution Section */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium flex items-center">
                    <Share2 className="w-4 h-4 mr-2" />
                    Odesli Platform Resolution
                  </h3>
                  
                  <div className="rounded-md border p-4">
                    <p className="mb-4">
                      The Odesli process finds track matches across music platforms to improve platform coverage in our database.
                      This is critical for providing users with links to their preferred streaming services.
                    </p>
                    
                    <div className="flex flex-wrap gap-3 items-center">
                      <Button
                        onClick={runOdesliResolution}
                        disabled={isRunningOdesli}
                        variant="default"
                      >
                        {isRunningOdesli ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Run Odesli Process
                          </>
                        )}
                      </Button>
                      
                      <Button
                        onClick={fetchDatabaseStats}
                        variant="outline"
                        disabled={isLoadingStats}
                      >
                        {isLoadingStats ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Refreshing...
                          </>
                        ) : (
                          <>
                            <BarChart2 className="mr-2 h-4 w-4" />
                            Refresh Stats
                          </>
                        )}
                      </Button>
                      
                      {odesliResult?.taskId && odesliResult.status && !['complete', 'failed', 'stopped'].includes(odesliResult.status) && (
                        <Button
                          onClick={stopOdesliTask}
                          size="sm"
                          variant="outline"
                          className="ml-auto text-destructive border-destructive hover:bg-destructive/10"
                        >
                          Stop Process
                        </Button>
                      )}
                    </div>
                    
                    {/* Status and progress display */}
                    {odesliResult && (
                      <div className="mt-4 p-4 rounded-md bg-muted">
                        <div className="flex justify-between mb-2">
                          <span className="font-medium">
                            Status: <span className={odesliResult.status === 'complete' ? 'text-green-500' : odesliResult.status === 'failed' ? 'text-red-500' : 'text-primary'}>{odesliResult.status || 'Running'}</span>
                          </span>
                          {odesliResult.lastUpdate && (
                            <span className="text-xs text-muted-foreground">
                              Last update: {new Date(odesliResult.lastUpdate).toLocaleString()}
                            </span>
                          )}
                        </div>
                        
                        {odesliResult.progress && (
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span>Progress: {odesliResult.progress.processed} / {odesliResult.progress.total} tracks</span>
                              <span>{Math.round((odesliResult.progress.processed / odesliResult.progress.total) * 100)}%</span>
                            </div>
                            <Progress value={(odesliResult.progress.processed / odesliResult.progress.total) * 100} className="h-2" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                
                <Alert className="bg-muted border">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Important Note</AlertTitle>
                  <AlertDescription>
                    The Odesli process may take several hours to complete for the entire database. You can leave this page and check back later as the process runs in the background.
                  </AlertDescription>
                </Alert>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="cleanup">
          {/* Release Date Cleanup Tools */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center">
                <CalendarDays className="w-5 h-5 mr-2" />
                Release Date Cleanup
              </CardTitle>
              <CardDescription>
                Fix missing or incorrect track release dates
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="batchSize">Batch Size</Label>
                      <Input
                        id="batchSize"
                        type="number"
                        value={batchSize}
                        onChange={(e) => setBatchSize(parseInt(e.target.value) || 100)}
                        min={1}
                        max={5000}
                      />
                      <p className="text-xs text-muted-foreground">
                        How many tracks to process in one batch (1-5000)
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="isDryRun">Dry Run Mode</Label>
                        <Switch
                          id="isDryRun"
                          checked={isDryRun}
                          onCheckedChange={setIsDryRun}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground pt-2">
                        When enabled, no actual database changes will be made
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex space-x-2 pt-2">
                    <Button
                      onClick={testCleanup}
                      variant="outline"
                      disabled={testRunning}
                    >
                      {testRunning ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Testing...
                        </>
                      ) : (
                        "Test Process"
                      )}
                    </Button>
                    <Button
                      onClick={runCleanup}
                      variant={isDryRun ? "outline" : "default"}
                      disabled={cleanupRunning}
                    >
                      {cleanupRunning ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Running...
                        </>
                      ) : (
                        isDryRun ? "Run Dry Run" : "Run Cleanup"
                      )}
                    </Button>
                  </div>
                </div>
                
                <Separator />
                
                {/* Odesli platform resolution section */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium flex items-center">
                    <Share2 className="w-4 h-4 mr-2" />
                    Multi-Platform Resolution
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Enhance track coverage by resolving Spotify links to other platforms (Apple Music, Amazon Music, etc)
                  </p>
                  
                  <div className="flex space-x-2">
                    <Button
                      onClick={runOdesliResolution}
                      disabled={isRunningOdesli}
                      variant="outline"
                    >
                      {isRunningOdesli ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Running...
                        </>
                      ) : (
                        "Run Platform Resolution"
                      )}
                    </Button>
                  </div>
                  
                  {odesliResult && (
                    <div className="mt-4 text-sm bg-muted/30 p-4 rounded-md">
                      <div className="flex items-center mb-2">
                        <span className="font-medium mr-2">Status:</span>
                        <span className={odesliResult.status === 'complete' ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}>
                          {odesliResult.status === 'processing' && 'Running'}
                          {odesliResult.status === 'queued' && 'Queued'}
                          {odesliResult.status === 'complete' && 'Complete'}
                          {odesliResult.status === 'failed' && 'Failed'}
                          {odesliResult.status === 'stopping' && 'Stopping'}
                          {odesliResult.status === 'stopped' && 'Stopped'}
                          {!odesliResult.status && 'Started'}
                        </span>
                        
                        {odesliResult.taskId && odesliResult.status === 'processing' && (
                          <Button
                            onClick={stopOdesliTask}
                            size="sm"
                            variant="outline"
                            className="ml-2 text-xs h-6 px-2"
                          >
                            Stop
                          </Button>
                        )}
                      </div>
                      
                      {odesliResult.progress && (
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs">
                            <span>Progress: {odesliResult.progress.processed} / {odesliResult.progress.total} tracks</span>
                            <span>{Math.round((odesliResult.progress.processed / odesliResult.progress.total) * 100)}%</span>
                          </div>
                          <Progress value={(odesliResult.progress.processed / odesliResult.progress.total) * 100} className="h-1" />
                        </div>
                      )}
                      
                      {odesliResult.lastUpdate && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Last updated: {new Date(odesliResult.lastUpdate).toLocaleTimeString()}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="help">
          <Card>
            <CardHeader>
              <CardTitle>Track Management Help</CardTitle>
              <CardDescription>
                How to use the track import and management tools
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Track Import Format</h3>
                <p className="text-sm">
                  Each track must be formatted as a JSON object with the following structure:
                </p>
                <pre className="text-xs p-4 bg-muted rounded-md overflow-x-auto">
{`{
  "title": "Forever (with Kid Cudi)",
  "artists": [
    { "name": "Dom Dolla" },
    { "name": "Kid Cudi" }
  ],
  "platforms": {
    "spotify": {
      "id": "0TryO56AxrMAMmGSng6z9C",
      "url": "https://open.spotify.com/track/0TryO56AxrMAMmGSng6z9C"
    }
  },
  "duration_ms": 252000,
  "album": {
    "name": "Forever (with Kid Cudi)",
    "images": [
      {
        "url": "https://i.scdn.co/image/ab67616d00001e02c1ea56d6ef74dc63a72223ac",
        "height": 640,
        "width": 640
      }
    ]
  }
}`}
                </pre>
                <p className="text-sm">
                  For bulk imports, provide an array of these objects. The Spotify ID is required for accurate track metadata, but adding duration and album information is strongly recommended for complete track data.
                </p>
              </div>
              
              <Separator />
              
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Platform Resolution</h3>
                <p className="text-sm">
                  The platform resolution tool uses the Odesli API to find matching tracks across multiple music platforms.
                  This helps ensure songs can be played on the user's preferred platform.
                </p>
                <p className="text-sm mt-2">
                  Running this process may take a significant amount of time for large track libraries. You can stop the process at any time
                  and resume it later.
                </p>
              </div>
              
              <Separator />
              
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Release Date Cleanup</h3>
                <p className="text-sm">
                  The release date cleanup tool uses OpenAI to intelligently infer missing release dates for tracks in the database.
                  This is important for proper sorting and categorization of songs by era.
                </p>
                <p className="text-sm mt-2">
                  Always start with a dry run to see what changes would be made before committing them to the database.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}