import { useLocation, useRoute, useRouter } from "wouter";
import { cn, createSlug } from "@/lib/utils";
import useThemedLogo from "@/hooks/useThemedLogo";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import PlaylistCoverPlaceholder from "./PlaylistCoverPlaceholder";
import { useQuery } from "@tanstack/react-query";
import { Music, ChevronLeft, ChevronRight, Compass, Plus, Edit, Palette, Grid3X3, MessageCircle, ThumbsUp, User, HelpCircle, Bell, Sun, Moon, LogOut, LogIn, Home, Link } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import ThemeToggle from "./ThemeToggle";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

type PlaylistItem = {
  id: string;
  title: string;
  coverImage?: string;
  spotifyUrl?: string;
  spotifyId?: string;
  spotifyImageUrl?: string;
};

interface SidebarNavProps {
  playlists?: PlaylistItem[];
  onNavItemClick?: () => void;
  useProvidedPlaylists?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
}

const SidebarNav = ({ playlists: providedPlaylists = [], onNavItemClick, useProvidedPlaylists = false, collapsed = false, onToggle }: SidebarNavProps) => {
  const [location, navigate] = useLocation();
  const logo = useThemedLogo();
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  
  // Safely access auth context
  let user: any = null;
  let logout: (() => void) | undefined;
  try {
    const auth = useAuth();
    user = auth.user;
    logout = auth.logout;
  } catch (error) {
    console.log("Auth context not yet available in SidebarNav");
  }
  
  const isLoggedIn = !!user;
  
  // Initialize theme on component mount
  useEffect(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = localStorage.getItem('theme') as 'light' | 'dark' || (prefersDark ? 'dark' : 'light');
    setTheme(initialTheme);
  }, []);
  
  // Fetch playlists directly if not provided or if useProvidedPlaylists is false
  const { data: fetchedPlaylists = [], refetch: refetchPlaylists } = useQuery({
    queryKey: ['/api/playlists-with-counts', user?.id],
    queryFn: async () => {
      try {
        const response = await apiRequest('GET', `/api/playlists-with-counts?userId=${user?.id || 1}`);
        if (!response.ok) {
          throw new Error('Failed to fetch playlists');
        }
        return response.json();
      } catch (error) {
        console.error("Error fetching playlists for sidebar:", error);
        return [];
      }
    },
    enabled: !!user && !useProvidedPlaylists,
    refetchInterval: false, // Disable automatic refetch interval
    refetchOnWindowFocus: false,
    refetchOnMount: false, // Don't refetch on mount - use cached data
    staleTime: 5 * 60 * 1000, // 5 minutes - consider data fresh for longer
    gcTime: 10 * 60 * 1000, // 10 minutes - keep in cache longer
  });
  
  // Only force a refetch on initial mount when necessary and user first loads
  useEffect(() => {
    if (!useProvidedPlaylists && user && fetchedPlaylists.length === 0) {
      refetchPlaylists();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
  
  // Add event listener for sidebar-refresh-requested events
  useEffect(() => {
    const handlePlaylistCreated = () => {
      refetchPlaylists();
    };
    
    window.addEventListener('sidebar-refresh-requested', handlePlaylistCreated);
    window.addEventListener('playlist-created', handlePlaylistCreated);
    
    return () => {
      window.removeEventListener('sidebar-refresh-requested', handlePlaylistCreated);
      window.removeEventListener('playlist-created', handlePlaylistCreated);
    };
  }, [refetchPlaylists]);
  
  // Use either the provided playlists or the ones we fetched
  const playlists = useProvidedPlaylists ? providedPlaylists : fetchedPlaylists;
  
  // Fetch user credits
  const { data: creditsData } = useQuery({
    queryKey: [`/api/users/${user?.id}/credits`],
    enabled: !!user?.id,
  });
  
  const credits = (creditsData as any)?.credits ?? 0;
  
  // Create nav items - simplified to only show the 5 main sections
  const navItems: NavItem[] = [
    // Homepage - for logged-in users
    ...(isLoggedIn ? [{
      href: "/homepage",
      label: "Homepage",
      icon: <Home className="h-5 w-5" />
    }] : []),
    
    // Discover - for everyone
    {
      href: "/discover",
      label: "Discover",
      icon: <Compass className="h-5 w-5" />
    },
    
    // My Playlists - for logged-in users
    ...(isLoggedIn ? [{
      href: "/playlists",
      label: "My Playlists",
      icon: <Music className="h-5 w-5" />
    }] : []),
    
    // Smart Links - for logged-in users
    ...(isLoggedIn ? [{
      href: "/smart-links",
      label: "Smart Links",
      icon: <Link className="h-5 w-5" />
    }] : []),
    
    // Top Albums - for everyone
    {
      href: "/albums",
      label: "Top Albums",
      icon: <Grid3X3 className="h-5 w-5" />
    }
  ];

  return (
    <aside className="w-full h-full bg-background flex flex-col relative">
      {/* Title at top - Midjourney style */}
      <div className={cn(
        "pt-6",
        collapsed ? "px-2 flex justify-center" : "px-6"
      )}>
        <h1 className="text-xl font-semibold text-foreground">
          {collapsed ? "S" : "Songfuse"}
        </h1>
      </div>
      
      {/* Scrollable Content Area */}
      <div className="overflow-y-auto flex-1" style={{ paddingBottom: "200px" }}>
        <nav className={cn(
          "p-4",
          collapsed ? "px-2" : ""
        )}>
          {/* Main Navigation Items */}
          <ul className="space-y-1">
            {/* Collapse/Expand Toggle Button - Desktop only */}
            <li className="hidden lg:block mb-4">
              <div
                className={cn(
                  "flex items-center rounded py-2 text-sm font-medium cursor-pointer text-muted-foreground hover:text-foreground",
                  collapsed ? "justify-center px-2" : "px-3"
                )}
                onClick={() => {
                  if (onToggle) onToggle();
                }}
                title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                <span className={collapsed ? "" : "mr-2"}>
                  {collapsed ? (
                    <ChevronRight className="h-4 w-4" />
                  ) : (
                    <ChevronLeft className="h-4 w-4" />
                  )}
                </span>
                {!collapsed && "Collapse"}
              </div>
            </li>
            
            {navItems.map((item, index) => (
              <li key={item.href}>
                <div
                  className={cn(
                    "flex items-center rounded-lg py-3 text-sm font-medium cursor-pointer transition-colors",
                    collapsed ? "justify-center px-2" : "px-3",
                    location === item.href
                      ? "text-primary bg-primary/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                  onClick={() => {
                    if (onNavItemClick) onNavItemClick();
                    navigate(item.href);
                  }}
                  title={collapsed ? item.label : undefined}
                >
                  <span className={collapsed ? "" : "mr-3"}>
                    {item.icon}
                  </span>
                  {!collapsed && (
                    <div className="flex items-center">
                      <span>{item.label}</span>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
          
          {/* Playlists Section - Only shown if logged in */}
          {isLoggedIn && (
            <div className="mt-8">
              {!collapsed && (
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-3 mb-2">
                  Latest Playlists
                </h3>
              )}
              <ul className="space-y-1">
                {playlists && playlists.length > 0 ? playlists.slice(0, collapsed ? 6 : 12).map((playlist: PlaylistItem) => (
                  <li key={playlist.id} className="rounded-md transition-colors duration-150 hover:bg-muted/50">
                    <div 
                      className={cn(
                        "flex items-center text-sm text-muted-foreground hover:text-card-foreground cursor-pointer",
                        collapsed ? "px-2 py-2 justify-center" : "px-3 py-2"
                      )}
                      onClick={() => {
                        if (onNavItemClick) onNavItemClick();
                        navigate(`/playlist/${playlist.id}/${createSlug(playlist.title)}`);
                      }}
                      title={collapsed ? playlist.title : undefined}
                    >
                      <div className={cn(
                        "rounded overflow-hidden aspect-square flex-shrink-0",
                        collapsed ? "h-8 w-8" : "h-8 w-8 mr-2"
                      )}>
                        <PlaylistCoverPlaceholder 
                          size="xs" 
                          imageUrl={playlist.coverImage} 
                          spotifyImageUrl={playlist.spotifyImageUrl}
                          altText={playlist.title}
                        />
                      </div>
                      {!collapsed && <span className="truncate">{playlist.title}</span>}
                    </div>
                  </li>
                )) : (
                  <li className={cn(
                    "text-muted-foreground text-sm py-2",
                    collapsed ? "px-2 text-center" : "px-3"
                  )}>
                    {collapsed ? (
                      <div className="flex flex-col items-center space-y-1">
                        <span className="text-xs">No</span>
                        <span className="text-xs">playlists</span>
                        <span className="text-xs">yet</span>
                      </div>
                    ) : (
                      <>
                        No playlists yet.
                      </>
                    )}
                  </li>
                )}
              </ul>
              
              {/* Show total playlists count and link to see all - hidden when collapsed */}
              {playlists && playlists.length > 0 && !collapsed && (
                <div 
                  className="flex items-center justify-between mt-3 mx-3 p-2 text-sm rounded-md text-muted-foreground bg-muted/40 hover:bg-muted hover:text-card-foreground transition-colors cursor-pointer"
                  onClick={() => {
                    if (onNavItemClick) onNavItemClick();
                    navigate('/playlists');
                  }}
                >
                  <span className="font-medium">
                    {playlists.length} {playlists.length === 1 ? 'playlist' : 'playlists'} total
                  </span>
                  <span className="flex items-center text-xs">
                    See all
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </div>
              )}
            </div>
          )}
          
          {/* For non-authenticated users, show login prompt - hidden when collapsed */}
          {!isLoggedIn && !collapsed && (
            <div className="mt-8 mx-3">
              <div className="p-4 rounded-lg bg-card shadow-sm border border-border dark:bg-muted/40 dark:border-border/50">
                <h3 className="text-sm font-semibold mb-2 bg-gradient-to-r from-primary to-primary/80 text-transparent bg-clip-text">Create Your Own Playlists</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Log in to create custom playlists and access more features.
                </p>
                <button 
                  className="w-full py-2 px-3 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
                  onClick={() => {
                    if (onNavItemClick) onNavItemClick();
                    navigate('/login');
                  }}
                >
                  Log In
                </button>
              </div>
            </div>
          )}
        </nav>
      </div>
      
      {/* Utility Links and User Profile - Fixed at bottom - Midjourney style */}
      <div className="absolute bottom-0 left-0 right-0 border-t border-border bg-background">
        {/* Utility Links */}
        <div className="px-4 py-3 space-y-1">
          <div 
            className={cn(
              "flex items-center py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg cursor-pointer transition-colors",
              collapsed ? "justify-center px-2" : "px-3"
            )}
            onClick={() => navigate('/help')}
            title={collapsed ? "Help" : "Help"}
          >
            <HelpCircle className="h-4 w-4" />
            {!collapsed && <span className="ml-3">Help</span>}
          </div>
          
          
          <div 
            className={cn(
              "flex items-center py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors cursor-pointer",
              collapsed ? "justify-center px-2" : "px-3"
            )}
            onClick={() => {
              const newTheme = theme === 'dark' ? 'light' : 'dark';
              setTheme(newTheme);
              
              // Remove old theme class and add new theme class
              document.documentElement.classList.remove(theme);
              document.documentElement.classList.add(newTheme);
              
              // Store the theme preference
              localStorage.setItem('theme', newTheme);
            }}
            title={collapsed ? "Theme" : "Theme"}
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
            {!collapsed && <span className="ml-3">Theme</span>}
          </div>
          
          {/* Logout Button - Only for logged-in users */}
          {user && (
            <div 
              className={cn(
                "flex items-center py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg cursor-pointer transition-colors",
                collapsed ? "justify-center px-2" : "px-3"
              )}
              onClick={() => {
                if (logout) {
                  logout();
                }
              }}
              title={collapsed ? "Logout" : "Logout"}
            >
              <LogOut className="h-4 w-4" />
              {!collapsed && <span className="ml-3">Logout</span>}
            </div>
          )}
        </div>

        {/* User Profile */}
        {user ? (
          <div 
            className={cn(
              "flex items-center py-3 px-4 cursor-pointer hover:bg-muted/50 transition-colors",
              collapsed ? "justify-center" : ""
            )}
            onClick={() => navigate('/settings')}
            title={collapsed ? "Settings" : "Open Settings"}
          >
            <div className={cn(
              "relative flex shrink-0 overflow-hidden rounded-full h-8 w-8 bg-muted",
              collapsed ? "" : "mr-3"
            )}>
              <div className="flex h-full w-full items-center justify-center rounded-full text-muted-foreground font-medium text-sm">
                {user.name ? user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase() : 'U'}
              </div>
            </div>
            {!collapsed && (
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-medium text-foreground truncate">
                  {user.name || 'User'}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {credits} credit{credits !== 1 ? 's' : ''}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div 
            className={cn(
              "flex items-center py-3 px-4 cursor-pointer hover:bg-muted/50 transition-colors border-t border-border",
              collapsed ? "justify-center" : ""
            )}
            onClick={() => navigate('/login')}
            title={collapsed ? "Login" : "Sign In"}
          >
            <div className={cn(
              "relative flex shrink-0 overflow-hidden rounded-full h-8 w-8 bg-muted",
              collapsed ? "" : "mr-3"
            )}>
              <div className="flex h-full w-full items-center justify-center rounded-full text-muted-foreground">
                <LogIn className="h-4 w-4" />
              </div>
            </div>
            {!collapsed && (
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-medium text-foreground truncate">
                  Sign In
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};

export default SidebarNav;
