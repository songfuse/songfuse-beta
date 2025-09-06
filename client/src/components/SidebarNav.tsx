import { useLocation, useRoute, useRouter } from "wouter";
import { cn, createSlug } from "@/lib/utils";
import useThemedLogo from "@/hooks/useThemedLogo";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import PlaylistCoverPlaceholder from "./PlaylistCoverPlaceholder";
import { useQuery } from "@tanstack/react-query";
import { Music, ChevronLeft, ChevronRight } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

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
  
  // Safely access auth context
  let user: any = null;
  try {
    const auth = useAuth();
    user = auth.user;
  } catch (error) {
    console.log("Auth context not yet available in SidebarNav");
  }
  
  const isLoggedIn = !!user;
  
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
  
  // Create nav items based on authentication status
  const navItems: NavItem[] = [
    // Homepage is only for logged-in users
    ...(isLoggedIn ? [{
      href: "/homepage",
      label: "Homepage",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h12a1 1 0 001-1V10" />
        </svg>
      )
    }] : []),
    
    // My Playlists is only for logged-in users
    ...(isLoggedIn ? [{
      href: "/playlists",
      label: "My Playlists",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
        </svg>
      )
    }] : []),
    
    // Playlist Sharing Links is only for logged-in users
    ...(isLoggedIn ? [{
      href: "/smart-links",
      label: "Playlist Sharing Links",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      )
    }] : []),
    
    // Top 25 Albums is for everyone
    {
      href: "/albums",
      label: "Top 25 Albums",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z M21 16c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z M9 10l12-3" />
        </svg>
      )
    },
    
    // Discover is for everyone
    {
      href: "/discover",
      label: "Discover",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      )
    },
    
    // Login option for non-authenticated users
    ...(isLoggedIn ? [] : [{
      href: "/login",
      label: "Login",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
        </svg>
      )
    }])
  ];

  return (
    <aside className="w-full h-full bg-card flex flex-col relative">
      {/* Mobile Logo */}
      <div className="flex items-center justify-center py-6 mb-2 lg:hidden">
        <img 
          src={logo} 
          alt="Songfuse Logo" 
          className="h-8 text-foreground" 
        />
      </div>
      
      {/* Scrollable Content Area */}
      <div className="overflow-y-auto flex-1" style={{ paddingBottom: "61px" }}>
        <nav className="p-4">
          {/* Nav Items */}
          <ul className="space-y-2">
            {/* Collapse/Expand Toggle Button - Desktop only */}
            <li className="hidden lg:block">
              <div
                className={cn(
                  "flex items-center rounded px-3 py-2 text-sm font-medium cursor-pointer text-muted-foreground hover:text-card-foreground",
                  collapsed ? "justify-center" : ""
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
            
            {navItems.map((item) => (
              <li key={item.href}>
                <div
                  className={cn(
                    "flex items-center rounded px-3 py-2 text-sm font-medium cursor-pointer",
                    collapsed ? "justify-center" : "",
                    location === item.href
                      ? "text-card-foreground bg-primary/10"
                      : "text-muted-foreground hover:text-card-foreground"
                  )}
                  onClick={() => {
                    if (onNavItemClick) onNavItemClick();
                    navigate(item.href);
                  }}
                  title={collapsed ? item.label : undefined}
                >
                  <span className={collapsed ? "" : "mr-2"}>{item.icon}</span>
                  {!collapsed && item.label}
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
                  <li className="text-muted-foreground text-sm py-2 px-3">
                    No playlists yet. <span className="text-primary hover:underline cursor-pointer" onClick={() => navigate('/homepage')}>Create one?</span>
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
      
      {/* User profile - Fixed at bottom */}
      {user && (
        <div className="absolute bottom-0 left-0 right-0 pt-2 pb-2 border-t border-border bg-card">
          <div className="flex items-center px-3 py-2">
            <Avatar className="h-9 w-9 mr-3">
              <AvatarImage src={user.profile?.imageUrl} alt={user.profile?.displayName || user.username} />
              <AvatarFallback>{(user.profile?.displayName || user.username || "User").charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium text-card-foreground truncate">
                {user.profile?.displayName || user.username}
              </p>
              <p className="text-xs text-muted-foreground truncate">Connected to Spotify</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

export default SidebarNav;
