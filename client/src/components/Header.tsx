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
        <button 
          onClick={() => setLocation("/")}
          className="hover:opacity-80 transition-opacity"
        >
          <img 
            src={logo} 
            alt="Songfuse Logo" 
            className="h-7 sm:h-9 text-foreground" 
          />
        </button>
      </div>
      
      <div className="flex items-center">
        {user && <CreditDisplay userId={user.id} />}
        
        <ThemeToggle />
        
        <div className="ml-2 sm:ml-4 flex items-center space-x-2">
          {user ? (
            <>
              <div className="flex items-center space-x-2">
                {user.picture ? (
                  <img
                    src={user.picture}
                    alt={user.name}
                    className="w-8 h-8 rounded-full"
                  />
                ) : (
                  <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                    <User className="w-4 h-4 text-gray-600" />
                  </div>
                )}
                <span className="text-sm font-medium">{user.name}</span>
              </div>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={logout}
                className="text-xs sm:text-sm text-muted-foreground hover:text-foreground font-work-sans px-2 sm:px-3"
              >
                Logout
              </Button>
            </>
          ) : (
            <>
              <Button 
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/login")}
                className="text-xs sm:text-sm text-muted-foreground hover:text-foreground font-work-sans px-2 sm:px-3"
              >
                Sign In
              </Button>
              <Button 
                variant="default"
                size="sm"
                onClick={() => setLocation("/register")}
                className="bg-gradient-to-r from-teal-500 to-primary text-primary-foreground hover:opacity-90 font-medium text-xs sm:text-sm px-4 py-2 rounded-md shadow-sm"
              >
                Sign Up
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
