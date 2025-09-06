import React, { useState, FormEvent } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCaption, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

interface TrackResult {
  id: string;
  dbId?: number;
  title: string;
  artist?: string;
  spotifyId: string;
}

export default function AssistantMatcherTest() {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<TrackResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<Array<{title: string, artist: string, found: boolean}>>([]);

  const handleTitleSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!title) {
      toast({
        title: "Input required",
        description: "Please enter a track title",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    setResult(null);
    setErrorMessage(null);
    
    try {
      const response = await fetch("/api/test/assistant-track-matcher", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          title,
          artist: artist || undefined 
        }),
      });
      
      const data = await response.json();
      
      if (data.success && data.track) {
        setResult(data.track);
        setRecentSearches(prev => [
          { title, artist, found: true }, 
          ...prev.slice(0, 9)
        ]);
      } else {
        setErrorMessage(data.message || "No track found");
        setRecentSearches(prev => [
          { title, artist, found: false }, 
          ...prev.slice(0, 9)
        ]);
      }
    } catch (err) {
      console.error("Error searching for track:", err);
      setErrorMessage("Error searching for track");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Assistant Track Matcher Test</h1>
      <p className="text-gray-500 mb-6">
        Test the assistant track matching algorithm with exact title matching to verify track identification consistency.
      </p>
      
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Find Track by Title</CardTitle>
            <CardDescription>
              Enter the exact title of a track to test the matcher
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleTitleSearch}>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="title">Track Title</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter exact track title"
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="artist">Artist (optional)</Label>
                  <Input
                    id="artist"
                    value={artist}
                    onChange={(e) => setArtist(e.target.value)}
                    placeholder="Enter artist name (optional)"
                  />
                </div>
              </div>
              
              <Button type="submit" className="mt-4 w-full" disabled={isLoading}>
                {isLoading ? "Searching..." : "Search"}
              </Button>
            </form>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
            <CardDescription>
              Track match results using the assistant track matcher
            </CardDescription>
          </CardHeader>
          <CardContent>
            {errorMessage && (
              <div className="p-4 mb-4 bg-red-50 text-red-700 rounded-md">
                {errorMessage}
              </div>
            )}
            
            {result && (
              <div className="border rounded-md p-4 bg-green-50">
                <h3 className="font-bold text-lg mb-2">Track Found</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="font-semibold">Title:</div>
                  <div>{result.title}</div>
                  
                  <div className="font-semibold">Artist:</div>
                  <div>{result.artist || "Unknown"}</div>
                  
                  <div className="font-semibold">Database ID:</div>
                  <div>{result.dbId}</div>
                  
                  <div className="font-semibold">Spotify ID:</div>
                  <div className="truncate">{result.spotifyId}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      <div className="mt-8">
        <h2 className="text-xl font-bold mb-4">Recent Searches</h2>
        <Table>
          <TableCaption>Recent track search history</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Track Title</TableHead>
              <TableHead>Artist</TableHead>
              <TableHead className="text-right">Result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recentSearches.map((search, index) => (
              <TableRow key={index}>
                <TableCell className="font-medium">{search.title}</TableCell>
                <TableCell>{search.artist || "-"}</TableCell>
                <TableCell className="text-right">
                  {search.found ? (
                    <span className="text-green-600 font-medium">Found</span>
                  ) : (
                    <span className="text-red-600 font-medium">Not Found</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {recentSearches.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-gray-500">
                  No recent searches
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}