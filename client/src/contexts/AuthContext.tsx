import React, { createContext, useContext, useState, useEffect } from "react";
import { useLocation } from "wouter";

interface User {
  id: number;
  email: string;
  name: string;
  picture?: string;
  credits?: number;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
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
        console.log("Starting authentication check...");
        // First check localStorage for cached user data
        const cachedUser = localStorage.getItem('user');
        const cachedTimestamp = localStorage.getItem('userTimestamp');
        const now = Date.now();
        const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
        
        console.log("Cached user data:", { cachedUser: !!cachedUser, cachedTimestamp });
        
        // If we have cached user data and it's not expired, use it immediately
        if (cachedUser && cachedTimestamp) {
          const cacheAge = now - parseInt(cachedTimestamp);
          console.log("Cache age:", cacheAge, "ms (max:", CACHE_DURATION, "ms)");
          
          if (cacheAge < CACHE_DURATION) {
            try {
              const userData = JSON.parse(cachedUser);
              console.log("Using cached user data:", userData);
              setUser(userData);
              setIsLoading(false);
              
              // Verify with server in background
              verifyWithServer();
              return;
            } catch (parseError) {
              console.error("Error parsing cached user data:", parseError);
              // Clear invalid cache
              localStorage.removeItem('user');
              localStorage.removeItem('userTimestamp');
            }
          } else {
            console.log("Cache expired, clearing it");
            // Cache expired, clear it
            localStorage.removeItem('user');
            localStorage.removeItem('userTimestamp');
          }
        }
        
        console.log("No valid cache, checking with server...");
        // No valid cache, check with server
        await verifyWithServer();
      } catch (err) {
        console.error("Auth check error:", err);
        setError(err instanceof Error ? err.message : "Authentication error");
        setUser(null);
        setIsLoading(false);
      }
    };

    const verifyWithServer = async () => {
      try {
        console.log("Verifying authentication with server...");
        const response = await fetch('/api/auth/status', {
          method: 'GET',
          credentials: 'include', // Include cookies for session validation
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        console.log("Server response status:", response.status);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log("Server response data:", data);
        
        if (data.authenticated && data.user) {
          console.log("User authenticated, setting user data");
          setUser(data.user);
          // Cache the user data
          localStorage.setItem('user', JSON.stringify(data.user));
          localStorage.setItem('userTimestamp', Date.now().toString());
        } else {
          console.log("User not authenticated, clearing user data");
          setUser(null);
          // Clear any cached data
          localStorage.removeItem('user');
          localStorage.removeItem('userTimestamp');
        }
      } catch (err) {
        console.error("Server verification error:", err);
        
        // If server is unreachable but we have cached data, keep using it
        const cachedUser = localStorage.getItem('user');
        const cachedTimestamp = localStorage.getItem('userTimestamp');
        
        if (cachedUser && cachedTimestamp) {
          try {
            const userData = JSON.parse(cachedUser);
            const cacheAge = Date.now() - parseInt(cachedTimestamp);
            const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
            
            // Only use cached data if it's not too old
            if (cacheAge < CACHE_DURATION) {
              console.log("Using cached user data due to server unavailability");
              setUser(userData);
            } else {
              console.log("Cached data expired, clearing user data");
              setUser(null);
              localStorage.removeItem('user');
              localStorage.removeItem('userTimestamp');
            }
          } catch (parseError) {
            console.error("Error parsing cached user data:", parseError);
            setUser(null);
            localStorage.removeItem('user');
            localStorage.removeItem('userTimestamp');
          }
        } else {
          console.log("No cached data available, setting user to null");
          setUser(null);
        }
      } finally {
        console.log("Auth verification complete, setting isLoading to false");
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include', // Include cookies for session management
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });
      
      const data = await response.json();
      
      if (data.success && data.user) {
        setUser(data.user);
        // Cache the user data
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.setItem('userTimestamp', Date.now().toString());
        setLocation('/'); // Redirect to home after successful login
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (err) {
      console.error("Login error:", err);
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (name: string, email: string, password: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        credentials: 'include', // Include cookies for session management
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, email, password }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        // After successful registration, automatically log in
        await login(email, password);
      } else {
        setError(data.error || 'Registration failed');
      }
    } catch (err) {
      console.error("Registration error:", err);
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include', // Include cookies for session management
        headers: {
          'Content-Type': 'application/json',
        },
      });
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      setUser(null);
      // Clear cached user data
      localStorage.removeItem('user');
      localStorage.removeItem('userTimestamp');
      setLocation("/");
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, error, login, register, logout }}>
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
