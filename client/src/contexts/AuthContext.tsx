import React, { createContext, useContext, useState, useEffect } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";

interface User {
  id: number;
  username: string;
  spotifyId?: string;
  profile?: {
    displayName: string;
    email: string;
    imageUrl?: string;
  };
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Check if we have a userId in URL (from OAuth callback)
        const params = new URLSearchParams(window.location.search);
        const userId = params.get("userId");
        
        if (userId) {
          // Remove userId from URL
          window.history.replaceState({}, document.title, window.location.pathname);
          
          // Fetch user details
          const response = await fetch(`/api/user/${userId}`);
          
          if (response.ok) {
            const userData = await response.json();
            setUser(userData);
            localStorage.setItem("userId", userId);
          } else {
            throw new Error("Failed to get user data");
          }
        } else {
          // Check if we have a userId in localStorage
          const storedUserId = localStorage.getItem("userId");
          
          if (storedUserId) {
            try {
              const response = await fetch(`/api/user/${storedUserId}`);
              
              if (response.ok) {
                const userData = await response.json();
                setUser(userData);
              } else {
                // If we get a 401, clear the userId
                if (response.status === 401) {
                  localStorage.removeItem("userId");
                }
                throw new Error("Session expired");
              }
            } catch (err) {
              console.error("Auth check error:", err);
              localStorage.removeItem("userId");
              setError("Session expired. Please log in again.");
            }
          }
        }
      } catch (err) {
        console.error("Auth check error:", err);
        setError(err instanceof Error ? err.message : "Authentication error");
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async () => {
    try {
      console.log("AuthContext: Starting Spotify login process");
      setIsLoading(true);
      
      // First check debug info to verify configuration
      try {
        const debugResponse = await fetch("/api/auth/spotify/debug");
        if (debugResponse.ok) {
          const debugData = await debugResponse.json();
          console.log("AuthContext: Spotify configuration", debugData);
        }
      } catch (debugErr) {
        console.warn("AuthContext: Couldn't fetch debug info", debugErr);
      }
      
      // Proceed with authentication
      const response = await apiRequest("GET", "/api/auth/spotify");
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.url) {
        console.log("AuthContext: Received authorization URL, redirecting");
        // Add state param for extra security - allows us to verify the response matches our request
        const stateParam = Math.random().toString(36).substring(2, 15);
        localStorage.setItem('spotify_auth_state', stateParam);
        
        // Parse the URL and add our state parameter
        const authUrl = new URL(data.url);
        authUrl.searchParams.append('state', stateParam);
        
        // Redirect to the Spotify authorization page
        window.location.href = authUrl.toString();
      } else {
        console.error("AuthContext: Failed to get authorization URL", data);
        throw new Error("No authorization URL returned from server");
      }
    } catch (err) {
      console.error("AuthContext: Login error:", err);
      setError(err instanceof Error ? err.message : "Login failed");
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("userId");
    setLocation("/");
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
