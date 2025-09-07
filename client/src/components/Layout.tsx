import { ReactNode, useState, useEffect } from 'react';
import Header from './Header';
import SidebarNav from './SidebarNav';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Home, Menu, Music, Plus, Search, LogIn, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocation } from 'wouter';
import { usePlaylistCreator } from '@/contexts/PlaylistCreatorContext';
import { useAuth } from '@/contexts/AuthContext';

interface LayoutProps {
  children: ReactNode;
  playlists?: Array<{
    id: string;
    title: string;
    coverImage?: string;
  }>;
  backgroundImage?: string; // Add support for dynamic background
}

const Layout = ({ children, playlists = [], backgroundImage }: LayoutProps) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Persist sidebar state in localStorage
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    return saved ? JSON.parse(saved) : false;
  });

  // Save sidebar state when it changes
  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', JSON.stringify(sidebarCollapsed));
  }, [sidebarCollapsed]);
  const [location, setLocation] = useLocation();
  const { openCreator } = usePlaylistCreator();
  const { user } = useAuth();
  const isLoggedIn = !!user;

  // Reset scroll position when location changes
  useEffect(() => {
    // Scroll to top when changing sections
    window.scrollTo(0, 0);
    
    // Also reset the main content area scroll
    const mainContent = document.querySelector('main');
    if (mainContent) {
      mainContent.scrollTop = 0;
    }
  }, [location]);
  
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Fixed header - only show for non-logged-in users */}
      {!isLoggedIn && (
        <div className="fixed top-0 left-0 right-0 z-40">
          <Header />
        </div>
      )}
      
      {/* Desktop "Create New" button removed */}

      {/* Main content with fixed sidebar and scrollable content */}
      <div className={`flex flex-1 ${!isLoggedIn ? 'pt-[64px]' : ''}`}> {/* pt-[64px] to account for fixed header height only for non-logged-in users */}
        {/* Fixed sidebar for desktop */}
        <div className={`fixed left-0 ${!isLoggedIn ? 'top-[64px]' : 'top-0'} bottom-0 z-30 hidden lg:flex flex-col transition-all duration-300 ${
          sidebarCollapsed ? 'w-16' : 'w-64'
        }`}>
          <SidebarNav 
            playlists={playlists} 
            useProvidedPlaylists={playlists.length > 0} 
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          />
        </div>

        
        {/* Mobile Navigation Bar - Bottom Tab Style */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background">
          <div className="flex items-center justify-around h-16">
            {isLoggedIn ? (
              <>
                {/* My Playlists (only for logged-in users) */}
                <button 
                  onClick={() => setLocation("/playlists")}
                  className="flex flex-col items-center justify-center w-1/3 h-full text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Music className="h-5 w-5 mb-1" />
                  <span className="text-xs">My Playlists</span>
                </button>
                
                {/* Create - Center button with accent - directly opens the playlist creator modal */}
                <button 
                  onClick={openCreator}
                  className="flex flex-col items-center justify-center w-1/3 h-full"
                >
                  <div className="flex items-center justify-center w-12 h-12 rounded-full -mt-6 mb-1 shadow-lg bg-primary">
                    <Plus className="h-6 w-6 text-primary-foreground" />
                  </div>
                  <span className="text-xs text-muted-foreground">Create</span>
                </button>
              </>
            ) : (
              <>
                {/* Discover (for guests) */}
                <button 
                  onClick={() => setLocation("/discover")}
                  className="flex flex-col items-center justify-center w-1/3 h-full text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Search className="h-5 w-5 mb-1" />
                  <span className="text-xs">Discover</span>
                </button>
                
                {/* Login button */}
                <button 
                  onClick={() => setLocation("/login")}
                  className="flex flex-col items-center justify-center w-1/3 h-full"
                >
                  <div className="flex items-center justify-center w-12 h-12 rounded-full -mt-6 mb-1 shadow-lg bg-primary">
                    <LogIn className="h-6 w-6 text-primary-foreground" />
                  </div>
                  <span className="text-xs text-muted-foreground">Login</span>
                </button>
              </>
            )}
            
            {/* Menu */}
            <button 
              onClick={() => setMobileMenuOpen(true)}
              className="flex flex-col items-center justify-center w-1/3 h-full text-muted-foreground hover:text-foreground transition-colors"
            >
              <Menu className="h-5 w-5 mb-1" />
              <span className="text-xs">Menu</span>
            </button>
          </div>
          
          {/* Mobile Menu Sheet */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetContent side="left" className="w-[280px] sm:w-[320px] p-0 flex flex-col">
              <div className="h-full flex-1">
                <SidebarNav playlists={playlists} useProvidedPlaylists={playlists.length > 0} onNavItemClick={() => setMobileMenuOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
        </div>
        
        {/* Main content area with padding for sidebar and bottom nav on mobile */}
        <div className={`w-full flex-1 overflow-y-auto transition-all duration-300 ${
          sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-64'
        }`}>
          <main className="p-4 sm:p-6 pb-24 lg:pb-6 h-full">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
};

export default Layout;