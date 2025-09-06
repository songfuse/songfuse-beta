import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import Header from "@/components/Header";
import useThemedLogo from "@/hooks/useThemedLogo";

const Login = () => {
  const [isAuthLoaded, setIsAuthLoaded] = useState(false);
  const [, setLocation] = useLocation();
  const logo = useThemedLogo();
  
  // Safely access auth context
  let user: any = null;
  let login: (() => void) | undefined;
  let isLoading: boolean = false;
  
  try {
    const auth = useAuth();
    user = auth.user;
    login = auth.login;
    isLoading = auth.isLoading;
    
    // If we successfully got the auth context, set loaded
    if (!isAuthLoaded) setIsAuthLoaded(true);
  } catch (error) {
    // Auth context not available yet, handle gracefully
    console.log("Auth context not yet available in Login");
  }
  
  // Improved login function with debugging
  const handleLogin = async () => {
    try {
      console.log("Login initiated");
      if (login) {
        // Use the context's login function if available
        console.log("Using auth context login function");
        login();
      } else {
        // Manual fallback login with detailed error handling
        console.log("Auth context not available, using fallback login");
        try {
          // First check if debug info is available
          const debugResponse = await fetch("/api/auth/spotify/debug");
          if (debugResponse.ok) {
            const debugData = await debugResponse.json();
            console.log("Auth debug info:", debugData);
          }
          
          // Actual login attempt
          const response = await fetch("/api/auth/spotify");
          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }
          
          const data = await response.json();
          
          if (data.url) {
            console.log("Received authorization URL, redirecting");
            
            // The state parameter is already included in the URL from the server
            // Do not modify or add an additional state parameter as it will cause conflicts
            
            // Store the state from the URL for reference
            const authUrl = new URL(data.url);
            const stateParam = authUrl.searchParams.get('state');
            if (stateParam) {
              localStorage.setItem('spotify_auth_state', stateParam);
              console.log("Using server-generated state parameter");
            }
            
            // Redirect to the Spotify authorization page with the original URL
            window.location.href = data.url;
          } else {
            console.error("Failed to get authorization URL", data);
            throw new Error("No authorization URL returned from server");
          }
        } catch (error) {
          console.error("Login error:", error);
          // Display error to user (would be nice to add a toast here)
          alert("Failed to connect to Spotify. Please try again later.");
        }
      }
    } catch (error) {
      console.error("Login handler error:", error);
    }
  };

  useEffect(() => {
    // Check for url parameters from auth callback
    const params = new URLSearchParams(window.location.search);
    const userId = params.get('userId');
    const username = params.get('username');
    
    // If we have userId and username from redirect, store them
    if (userId && username) {
      console.log("Login: Received user data from redirect", { userId, username });
      localStorage.setItem('userId', userId);
      window.location.href = '/homepage';
      return;
    }
    
    // If the user is already logged in, redirect to the homepage
    if (user) {
      setLocation("/homepage");
    }
  }, [user, setLocation]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 pb-24 lg:pb-6">
        <Card className="w-full max-w-md bg-card border-border">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-teal-400 to-[#1DB954] text-transparent bg-clip-text">Sign In</CardTitle>
            <CardDescription className="text-muted-foreground">
              Connect with your Spotify account to create AI playlists
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center space-y-4">
            <div className="text-center mb-4">
              <img src={logo} alt="Songfuse Logo" className="h-20 mx-auto mb-6" />
              <p className="text-card-foreground">
                Songfuse uses your Spotify account to generate custom playlists and save them directly to your Spotify library.
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-3">
            <Button 
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={handleLogin}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2" />
                  Connecting to Spotify...
                </>
              ) : (
                "Connect with Spotify"
              )}
            </Button>
            <div className="text-center text-sm text-muted-foreground">
              By continuing, you agree to the Songfuse{" "}
              <Link href="/terms" className="text-primary hover:underline">
                Terms of Service
              </Link>
            </div>
          </CardFooter>
        </Card>
      </main>
    </div>
  );
};

export default Login;
