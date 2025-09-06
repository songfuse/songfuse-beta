import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";

const V2ApiTest = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const [spotifyId, setSpotifyId] = useState<string>("");
  const [title, setTitle] = useState<string>("V2 Test Playlist " + new Date().toISOString().substring(0, 10));
  const [tracks, setTracks] = useState<string[]>([
    "1RKUoGiLEbcXN4GY4spQDx", // Clint Eastwood
    "0d28khcov6AiegSCpG5TuT", // Feel Good Inc.
    "5BIMPccDwShpXq784RJlJp", // Should exist in system
    "7KXjTSCq5nL1LoYtL7XAwS"  // Should exist in system
  ]);

  const runDirectTest = async () => {
    if (!user) {
      toast({
        title: "Not logged in",
        description: "Please log in to test the API",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      console.log("Starting direct test with userId:", user.id);
      
      // Use regular fetch instead of apiRequest to have more control
      const response = await fetch("/api/v2/direct-test", {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ 
          userId: user.id 
        })
      });
      
      console.log("Response status:", response.status);
      
      // Get the raw text first for debugging
      const responseText = await response.text();
      console.log("Raw response text:", responseText);
      
      // Try to parse as JSON if possible
      let data;
      try {
        data = JSON.parse(responseText);
        console.log("Successfully parsed response as JSON:", data);
      } catch (parseError) {
        console.error("Failed to parse response as JSON:", parseError);
        throw new Error(`Server responded with non-JSON data: ${responseText.substring(0, 100)}...`);
      }
      
      setResponse(data);
      
      toast({
        title: "Test successful",
        description: "V2 direct test completed successfully",
        variant: "default"
      });
    } catch (error) {
      console.error("Error in V2 direct test:", error);
      setResponse({ error: error instanceof Error ? error.message : "Unknown error" });
      
      toast({
        title: "Test failed",
        description: "V2 direct test failed. See console for details.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const savePlaylist = async () => {
    if (!user) {
      toast({
        title: "Not logged in",
        description: "Please log in to test the API",
        variant: "destructive"
      });
      return;
    }

    if (!title.trim()) {
      toast({
        title: "Missing title",
        description: "Please provide a title for the playlist",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      console.log("Starting playlist save with userId:", user.id);
      
      // Create a basic playlist description
      const description = `Test playlist "${title}" created with simplified schema`;
      
      // Prepare track objects from Spotify IDs
      const trackObjects = tracks.map((id, index) => ({
        id,
        name: `Track ${index + 1}`,
        artists: [{ name: "Artist" }],
        album: { name: "Album", images: [] },
        duration_ms: 0
      }));
      
      console.log("Prepared track objects:", trackObjects);
      
      // Use regular fetch instead of apiRequest for more control
      const response = await fetch("/api/v2/playlist/save", {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          userId: user.id,
          title,
          description,
          coverImageUrl: "", // No cover for test
          tracks: trackObjects,
          isPublic: true,
          skipSpotify: true // Don't try to save to Spotify
        })
      });
      
      console.log("Response status:", response.status);
      
      // Get the raw text first for debugging
      const responseText = await response.text();
      console.log("Raw response text:", responseText);
      
      // Try to parse as JSON if possible
      let data;
      try {
        data = JSON.parse(responseText);
        console.log("Successfully parsed response as JSON:", data);
      } catch (parseError) {
        console.error("Failed to parse response as JSON:", parseError);
        throw new Error(`Server responded with non-JSON data: ${responseText.substring(0, 100)}...`);
      }
      
      setResponse(data);
      
      toast({
        title: "Playlist saved",
        description: `Playlist "${title}" saved with ID ${data.id}`,
        variant: "default"
      });
    } catch (error) {
      console.error("Error saving playlist:", error);
      setResponse({ error: error instanceof Error ? error.message : "Unknown error" });
      
      toast({
        title: "Save failed",
        description: "Failed to save playlist. See console for details.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getPlaylistDetails = async () => {
    if (!user) {
      toast({
        title: "Not logged in",
        description: "Please log in to test the API",
        variant: "destructive"
      });
      return;
    }

    if (!spotifyId.trim()) {
      toast({
        title: "Missing ID",
        description: "Please provide a playlist ID or Spotify ID",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      console.log(`Getting playlist details for ID: ${spotifyId}`);
      
      const response = await fetch(`/api/v2/playlist/${spotifyId}?userId=${user.id}`, {
        headers: {
          "Accept": "application/json",
        }
      });
      
      console.log("Response status:", response.status);
      
      // Get the raw text first for debugging
      const responseText = await response.text();
      console.log("Raw response text:", responseText);
      
      // Try to parse as JSON if possible
      let data;
      try {
        data = JSON.parse(responseText);
        console.log("Successfully parsed response as JSON:", data);
      } catch (parseError) {
        console.error("Failed to parse response as JSON:", parseError);
        throw new Error(`Server responded with non-JSON data: ${responseText.substring(0, 100)}...`);
      }
      
      setResponse(data);
      
      toast({
        title: "Details retrieved",
        description: `Retrieved details for playlist "${data.title || 'Unnamed'}"`,
        variant: "default"
      });
    } catch (error) {
      console.error("Error getting playlist details:", error);
      setResponse({ error: error instanceof Error ? error.message : "Unknown error" });
      
      toast({
        title: "Fetch failed",
        description: "Failed to get playlist details. See console for details.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container py-8">
      <h1 className="text-3xl font-bold mb-6">V2 API Test</h1>
      
      <Tabs defaultValue="direct-test" className="w-full">
        <TabsList className="grid grid-cols-3 mb-4">
          <TabsTrigger value="direct-test">Direct Test</TabsTrigger>
          <TabsTrigger value="save-playlist">Save Playlist</TabsTrigger>
          <TabsTrigger value="get-details">Get Details</TabsTrigger>
        </TabsList>
        
        <TabsContent value="direct-test">
          <Card>
            <CardHeader>
              <CardTitle>Direct Test</CardTitle>
              <CardDescription>Run a direct test of the V2 API implementation</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="mb-4">
                This test will create a playlist with the simplified schema and add tracks to it.
                It will use the batch track ID lookup function to efficiently retrieve track IDs.
              </p>
              <Button 
                onClick={runDirectTest} 
                disabled={isLoading} 
                className="w-full"
              >
                {isLoading ? "Testing..." : "Run Direct Test"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="save-playlist">
          <Card>
            <CardHeader>
              <CardTitle>Save Playlist</CardTitle>
              <CardDescription>Test the V2 save playlist endpoint</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Playlist Title</Label>
                <Input
                  id="title"
                  placeholder="Enter playlist title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tracks">Spotify Track IDs (comma-separated)</Label>
                <Input
                  id="tracks"
                  placeholder="Enter Spotify track IDs"
                  value={tracks.join(", ")}
                  onChange={(e) => setTracks(e.target.value.split(",").map(id => id.trim()))}
                />
              </div>
              <Button 
                onClick={savePlaylist} 
                disabled={isLoading} 
                className="w-full"
              >
                {isLoading ? "Saving..." : "Save Playlist"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="get-details">
          <Card>
            <CardHeader>
              <CardTitle>Get Playlist Details</CardTitle>
              <CardDescription>Test the V2 get playlist details endpoint</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="spotifyId">Playlist ID or Spotify ID</Label>
                <Input
                  id="spotifyId"
                  placeholder="Enter playlist ID or Spotify ID"
                  value={spotifyId}
                  onChange={(e) => setSpotifyId(e.target.value)}
                />
              </div>
              <Button 
                onClick={getPlaylistDetails} 
                disabled={isLoading} 
                className="w-full"
              >
                {isLoading ? "Fetching..." : "Get Details"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {response && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Response</CardTitle>
            <CardDescription>API response data</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] rounded-md border p-4">
              <pre className="text-sm">
                {JSON.stringify(response, null, 2)}
              </pre>
            </ScrollArea>
          </CardContent>
          <CardFooter>
            <Button 
              variant="outline" 
              onClick={() => setResponse(null)}
              className="ml-auto"
            >
              Clear
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
};

export default V2ApiTest;