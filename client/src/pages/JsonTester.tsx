import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

// Simple JSON test component to isolate and verify JSON response handling
export default function JsonTester() {
  const [isLoading, setIsLoading] = useState(false);
  const [requestData, setRequestData] = useState(JSON.stringify({ test: true, message: "Hello server" }, null, 2));
  const [responseData, setResponseData] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [useMock, setUseMock] = useState(false);

  // Mock response data for testing without server
  const mockJsonResponse = {
    success: true,
    message: "This is a mock response",
    timestamp: new Date().toISOString(),
    requestData: null
  };

  // Make a request to our guaranteed JSON endpoint
  const makeRequest = async () => {
    setIsLoading(true);
    setError(null);
    setResponseData("");
    
    try {
      // Parse the request data as JSON
      let parsedRequest;
      try {
        parsedRequest = JSON.parse(requestData);
      } catch (parseError) {
        throw new Error(`Invalid JSON in request: ${parseError.message}`);
      }
      
      // If mock mode is enabled, skip the actual network request
      if (useMock) {
        // Create a mock response with the request data included
        const mockResponse = {
          ...mockJsonResponse,
          requestData: parsedRequest
        };
        
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 500));
        
        setResponseData(JSON.stringify(mockResponse, null, 2));
        toast({
          title: "Success (Mocked)",
          description: "Successfully generated mock JSON response",
        });
        setIsLoading(false);
        return;
      }
      
      // Make the actual request
      const response = await fetch('/api/json-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(parsedRequest)
      });
      
      // Get response text first to handle both JSON and non-JSON responses
      const responseText = await response.text();
      
      // Check if the response is HTML (common error with Vite dev server)
      if (responseText.trim().startsWith('<!DOCTYPE html>') || 
          responseText.trim().startsWith('<html>')) {
        throw new Error('Received HTML instead of JSON. This is likely due to Vite dev server intercepting the request. Try using mock mode.');
      }
      
      try {
        // Try to parse as JSON
        const jsonData = JSON.parse(responseText);
        setResponseData(JSON.stringify(jsonData, null, 2));
        toast({
          title: "Success",
          description: "Successfully received JSON response",
        });
      } catch (jsonError) {
        // If parsing fails, show the raw text
        throw new Error(`Failed to parse response as JSON: ${responseText.substring(0, 100)}...`);
      }
    } catch (err) {
      console.error("Error in JSON test:", err);
      setError(err instanceof Error ? err.message : String(err));
      toast({
        variant: "destructive",
        title: "Error",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container py-8">
      <h1 className="text-3xl font-bold mb-6">JSON Endpoint Tester</h1>
      <p className="text-muted-foreground mb-6">
        This tool helps test and diagnose issues with JSON responses from the server.
      </p>
      
      <div className="flex items-center space-x-2 mb-6">
        <Switch 
          id="mock-mode" 
          checked={useMock} 
          onCheckedChange={setUseMock} 
        />
        <Label htmlFor="mock-mode">
          Mock Mode (Skip server request and generate client-side response)
        </Label>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Request</CardTitle>
            <CardDescription>
              Enter JSON data to send to the server
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={requestData}
              onChange={(e) => setRequestData(e.target.value)}
              rows={10}
              className="font-mono text-sm"
              placeholder="Enter JSON data"
            />
          </CardContent>
          <CardFooter>
            <Button 
              onClick={makeRequest} 
              disabled={isLoading}
              className="w-full"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {useMock ? "Generating Mock Response..." : "Sending Request..."}
                </>
              ) : useMock ? "Generate Mock Response" : "Send Request"}
            </Button>
          </CardFooter>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Response</CardTitle>
            <CardDescription>
              {useMock ? "Mock JSON response" : "JSON response from the server"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription className="whitespace-pre-wrap">
                  {error}
                </AlertDescription>
              </Alert>
            )}
            
            <Textarea
              value={responseData}
              readOnly
              rows={10}
              className="font-mono text-sm"
              placeholder="Response will appear here"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}