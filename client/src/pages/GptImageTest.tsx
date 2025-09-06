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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Loader2, 
  Image as ImageIcon, 
  Info, 
  RefreshCw, 
  Download
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

// Define response type for our API endpoint
interface GptImageResponse {
  success: boolean;
  imageUrl: string;
  imageUrlWithTimestamp: string;
  model?: string;
  prompt?: string;
  negative_prompt?: string;
  method?: string;
  error?: string;
  message?: string;
}

export default function GptImageTest() {
  const [loading, setLoading] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [imageDetails, setImageDetails] = useState<{
    model?: string;
    prompt?: string;
    negative_prompt?: string;
    method?: string;
  }>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const [prompt, setPrompt] = useState(
    "Minimalist music album cover with geometric shapes and vibrant colors"
  );
  const [negativePrompt, setNegativePrompt] = useState(
    "text, watermark, signature, blurry, distorted, low quality"
  );
  const [model, setModel] = useState<'gpt-image-1' | 'dall-e-3'>('gpt-image-1');
  const [useDirectAPI, setUseDirectAPI] = useState(false);
  const [useTestMode, setUseTestMode] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

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
    setErrorMessage(null);
    
    try {
      // Always add music-related words to ensure OpenAI accepts the prompt
      const processedPrompt = prompt.toLowerCase().includes('music') || 
                              prompt.toLowerCase().includes('album') || 
                              prompt.toLowerCase().includes('cover')
                              ? prompt
                              : `Music album cover: ${prompt}`;
      
      const requestMode = useTestMode ? 'test' : (useDirectAPI ? 'direct' : 'service');
      console.log(`Using ${requestMode} API approach with model: ${model}`);
      
      // Use different endpoints based on mode
      // Use guaranteed JSON endpoint when available
      const endpoint = useTestMode ? "/api/test-mode-image" : "/api/json-gpt-image";
      
      // Make request
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          prompt: processedPrompt,
          negative_prompt: negativePrompt,
          model,
          directAPI: useDirectAPI,
          testMode: useTestMode
        })
      });
      
      // Check status first, and use appropriate method to get response
      let data: GptImageResponse;
      
      if (!response.ok) {
        // Try to get error details as JSON, fallback to text
        try {
          const errorData = await response.json();
          throw new Error(`Server error (${response.status}): ${errorData.error || errorData.message || 'Unknown error'}`);
        } catch (jsonError) {
          // If we couldn't parse JSON, try to get text
          try {
            const errorText = await response.text();
            throw new Error(`Server error (${response.status}): ${errorText || 'Unknown error'}`);
          } catch (textError) {
            // Last resort fallback
            throw new Error(`Server error (${response.status}): Could not read response data`);
          }
        }
      }
      
      // If we get here, the response was successful, so parse as JSON
      try {
        data = await response.json() as GptImageResponse;
      } catch (jsonError) {
        throw new Error(`Failed to parse successful response as JSON: ${jsonError.message}`);
      }

      if (data.success && data.imageUrlWithTimestamp) {
        setGeneratedImageUrl(data.imageUrlWithTimestamp);
        setImageDetails({
          model: data.model,
          prompt: data.prompt,
          negative_prompt: data.negative_prompt,
          method: data.method
        });
        
        toast({
          title: "Success",
          description: `Image generated successfully using ${data.model}!`,
        });
      } else {
        throw new Error(data.error || data.message || "Failed to generate image");
      }
    } catch (error: any) {
      console.error("Error generating image:", error);
      setErrorMessage(error.message || "Failed to generate image");
      
      toast({
        title: "Error",
        description: error.message || "Failed to generate image",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };
  
  const retryGeneration = () => {
    setRetryCount(prev => prev + 1);
    generateImage();
  };

  return (
    <div className="container py-8">
      <h1 className="text-3xl font-bold mb-6">GPT-Image-1 Test</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Generate Image</CardTitle>
              <CardDescription>
                Test OpenAI's GPT-Image-1 model for generating album covers
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="model">Model</Label>
                <Select
                  value={model}
                  onValueChange={(value) => setModel(value as 'gpt-image-1' | 'dall-e-3')}
                >
                  <SelectTrigger id="model">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpt-image-1">gpt-image-1 (Latest)</SelectItem>
                    <SelectItem value="dall-e-3">dall-e-3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="test-mode">Test Mode</Label>
                    <Switch 
                      id="test-mode" 
                      checked={useTestMode}
                      onCheckedChange={setUseTestMode}
                    />
                  </div>
                  {useTestMode && (
                    <Alert className="bg-green-50 text-green-800 border-green-200">
                      <Info className="h-4 w-4" />
                      <AlertTitle>Test Mode Enabled</AlertTitle>
                      <AlertDescription className="text-xs">
                        Using mock responses to avoid API calls
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
                
                {!useTestMode && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="direct-api">Use Direct API</Label>
                      <Switch 
                        id="direct-api" 
                        checked={useDirectAPI}
                        onCheckedChange={setUseDirectAPI}
                        disabled={useTestMode}
                      />
                    </div>
                    {useDirectAPI && (
                      <Alert className="bg-amber-50 text-amber-800 border-amber-200">
                        <Info className="h-4 w-4" />
                        <AlertTitle>Direct API Mode</AlertTitle>
                        <AlertDescription className="text-xs">
                          Using direct OpenAI API calls for debugging purposes
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="prompt">Prompt</Label>
                <Textarea
                  id="prompt"
                  placeholder="Describe the image you want to generate"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  Note: Your prompt should include words like "music", "album", or "cover" to ensure compatibility with OpenAI's restrictions.
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="negative-prompt">Negative Prompt (what not to include)</Label>
                <Textarea
                  id="negative-prompt"
                  placeholder="Elements to avoid in the image"
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  rows={3}
                />
              </div>
              
              {errorMessage && (
                <Alert variant="destructive">
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription className="text-sm">
                    {errorMessage}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
            <CardFooter className="flex gap-2">
              <Button
                onClick={generateImage}
                disabled={loading}
                className="flex-1"
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
              
              {generatedImageUrl && (
                <Button
                  variant="outline"
                  onClick={retryGeneration}
                  disabled={loading}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              )}
            </CardFooter>
          </Card>
        </div>
        
        <div>
          <Card>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>Generated Image</CardTitle>
                  <CardDescription>
                    The image created based on your prompt
                  </CardDescription>
                </div>
                {imageDetails?.model && (
                  <Badge variant="outline" className={cn(
                    "px-2 py-1",
                    imageDetails.model === 'gpt-image-1' ? "bg-blue-50 text-blue-700 border-blue-200" : 
                    "bg-purple-50 text-purple-700 border-purple-200"
                  )}>
                    {imageDetails.model}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-center items-center min-h-[300px] bg-gray-50 rounded-md p-4">
                {generatedImageUrl ? (
                  <img
                    src={generatedImageUrl}
                    alt="Generated cover"
                    className="max-w-full max-h-[300px] object-contain rounded-md shadow-md"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-gray-400">
                    <ImageIcon size={64} />
                    <p className="mt-4">No image generated yet</p>
                  </div>
                )}
              </div>
              
              {generatedImageUrl && imageDetails && (
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="grid grid-cols-[auto_1fr] gap-2">
                    <div className="font-medium">Method:</div>
                    <div>{imageDetails.method || 'service'}</div>
                    
                    <div className="font-medium">Prompt:</div>
                    <div className="truncate">{imageDetails.prompt || prompt}</div>
                    
                    <div className="font-medium">Negative:</div>
                    <div className="truncate">{imageDetails.negative_prompt || negativePrompt}</div>
                  </div>
                </div>
              )}
            </CardContent>
            
            {generatedImageUrl && (
              <CardFooter>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => window.open(generatedImageUrl, '_blank')}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Open Image in New Tab
                </Button>
              </CardFooter>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}