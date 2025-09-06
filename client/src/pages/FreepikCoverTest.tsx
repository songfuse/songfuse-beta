import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Loader2, Image as ImageIcon } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// Define response type for our API endpoint
interface FreepikImageResponse {
  success: boolean;
  imageUrl: string;
  imageUrlWithTimestamp: string;
  error?: string;
}

export default function FreepikCoverTest() {
  const [loading, setLoading] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState(
    "A vibrant music album cover with abstract shapes and musical instruments in a modern style"
  );
  const [negativePrompt, setNegativePrompt] = useState(
    "text, watermark, signature, blurry, distorted, low quality"
  );

  const generateImage = async () => {
    if (!prompt.trim()) {
      toast({
        title: "Error",
        description: "Please enter a prompt for the image",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Fix parameter order (method first, then URL, then data)
      const response = await apiRequest(
        "POST", 
        "/api/test-freepik-cover", 
        {
          prompt,
          negative_prompt: negativePrompt,
          width: 1024,
          height: 1024,
          style: "photographic",
        }
      );
      
      // Parse the JSON response
      const data = await response.json() as FreepikImageResponse;

      if (data.success && data.imageUrlWithTimestamp) {
        setGeneratedImageUrl(data.imageUrlWithTimestamp);
        toast({
          title: "Success",
          description: "Cover image generated successfully!",
        });
      } else {
        throw new Error(data.error || "Failed to generate image");
      }
    } catch (error: any) {
      console.error("Error generating image:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to generate image",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container py-8">
      <h1 className="text-3xl font-bold mb-6">Freepik Cover Image Test</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Generate Cover Image</CardTitle>
            <CardDescription>
              Test the Freepik Mystic API for generating playlist cover images
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="prompt">Image Prompt</Label>
              <Textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the image you want to generate..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="negative-prompt">Negative Prompt</Label>
              <Textarea
                id="negative-prompt"
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder="Elements to exclude from the image..."
                rows={2}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button 
              onClick={generateImage} 
              disabled={loading || !prompt.trim()}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <ImageIcon className="mr-2 h-4 w-4" />
                  Generate Image
                </>
              )}
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Generated Cover</CardTitle>
            <CardDescription>
              Preview of the generated cover image
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            {loading ? (
              <div className="w-64 h-64 flex items-center justify-center border rounded-md bg-muted">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
              </div>
            ) : generatedImageUrl ? (
              <div className="relative">
                <img
                  src={generatedImageUrl}
                  alt="Generated cover"
                  className="w-64 h-64 object-cover rounded-md shadow-md"
                />
                <div className="absolute bottom-2 right-2 bg-background/80 text-xs px-2 py-1 rounded-md">
                  By Freepik Mystic
                </div>
              </div>
            ) : (
              <div className="w-64 h-64 flex flex-col items-center justify-center border rounded-md bg-muted">
                <ImageIcon className="h-10 w-10 mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground text-center px-4">
                  Generated image will appear here
                </p>
              </div>
            )}
          </CardContent>
          <CardFooter className="justify-center">
            {generatedImageUrl && (
              <Button
                variant="outline"
                onClick={() => window.open(generatedImageUrl, '_blank')}
              >
                View Full Size
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}