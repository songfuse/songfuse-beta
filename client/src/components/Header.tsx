import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useLocation } from "wouter";
import ThemeToggle from "@/components/ThemeToggle";
import useThemedLogo from "@/hooks/useThemedLogo";
import { CreditDisplay } from "@/components/ui/CreditDisplay";

const Header = () => {
  const [location, setLocation] = useLocation();
  const [isAuthLoaded, setIsAuthLoaded] = useState(false);
  const logo = useThemedLogo();
  
  // Safely access auth context
  let user: any = null;
  let logout: (() => void) | undefined;
  try {
    const auth = useAuth();
    user = auth.user;
    logout = auth.logout;
    
    // If we successfully got the auth context, set loaded
    if (!isAuthLoaded) setIsAuthLoaded(true);
  } catch (error) {
    // Auth context not available yet, handle gracefully
    console.log("Auth context not yet available in Header");
  }

  return (
    <header className="bg-background py-3 sm:py-4 px-3 sm:px-6 flex items-center justify-between border-b border-border">
      <div className="flex items-center">
        <img 
          src={logo} 
          alt="Songfuse Logo" 
          className="h-7 sm:h-9 text-foreground" 
        />
      </div>
      
      <div className="flex items-center">
        {user && <CreditDisplay userId={user.id} />}
        
        <ThemeToggle />
        
        <div className="ml-2 sm:ml-4 flex items-center">
          {user ? (
            <>
              <div className="flex items-center">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={logout}
                  className="text-xs sm:text-sm text-muted-foreground hover:text-foreground font-work-sans px-2 sm:px-3"
                >
                  Logout
                </Button>
              </div>
            </>
          ) : (
            <Button 
              variant="default"
              size="sm"
              onClick={() => setLocation("/login")}
              className="bg-gradient-to-r from-teal-500 to-primary text-primary-foreground hover:opacity-90 font-medium text-xs sm:text-sm px-4 py-2 rounded-md shadow-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="white" className="mr-1.5">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
              </svg>
              Connect with Spotify
            </Button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
