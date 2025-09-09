import { useState } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import MarketingLanding from "@/pages/MarketingLanding";
import Homepage from "@/pages/Homepage";
import CreatePlaylist from "@/pages/CreatePlaylist";
import MyPlaylists from "@/pages/MyPlaylists";
import Albums from "@/pages/Albums";
import PlaylistDetails from "@/pages/PlaylistDetails";
import TrackImport from "@/pages/TrackImport";
import TermsOfService from "@/pages/TermsOfService";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Discover from "@/pages/Discover";
import DiscoverPlaylistDetail from "@/pages/DiscoverPlaylistDetail";
import EmbeddingMonitor from "@/pages/EmbeddingMonitor";
import ReleaseCleanup from "@/pages/ReleaseCleanup";
import DirectAssistantTest from "@/pages/DirectAssistantTest";
import V2ApiTest from "@/pages/V2ApiTest";
import ExactMatchTest from "@/pages/ExactMatchTest";
import DirectMatchTest from "@/pages/DirectMatchTest";
import SongMatchTest from "@/pages/SongMatchTest";
import EnhancedPlaylistTest from "@/pages/EnhancedPlaylistTest";
import EnhancedDirectTest from "@/pages/EnhancedDirectTest";
import TrackDebugger from "@/pages/TrackDebugger";
import PlaylistTrackDebugger from "@/pages/PlaylistTrackDebugger";
import DirectTrackFinder from "@/pages/DirectTrackFinder";
import AssistantMatcherTest from "@/pages/AssistantMatcherTest";
import FreepikCoverTest from "@/pages/FreepikCoverTest";
import GptImageTest from "@/pages/GptImageTest";
import SmartLink from "@/pages/SmartLink";
import SmartLinks from "@/pages/SmartLinks";
import SmartLinkEditor from "@/pages/SmartLinkEditor";
import SmartLinkPublic from "@/pages/SmartLinkPublic";
import JsonTester from "@/pages/JsonTester";
import { useAuth, AuthProvider } from "./contexts/AuthContext";
import { PlaylistCreatorProvider } from "./contexts/PlaylistCreatorContext";
import { PlaylistUpdateProvider } from "./contexts/PlaylistUpdateContext";
import FloatingPlaylistCreator from "./components/FloatingPlaylistCreator";
import Header from "./components/Header";

function ProtectedRoute({ component: Component, ...rest }: { component: React.ComponentType<any>, [key: string]: any }) {
  const [isAuthLoaded, setIsAuthLoaded] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [, setLocation] = useLocation();
  
  // Safely access auth context
  let user: any = null;
  let isLoading: boolean = true;
  
  try {
    const auth = useAuth();
    user = auth.user;
    isLoading = auth.isLoading;
    
    // If we successfully got the auth context, set loaded
    if (!isAuthLoaded) setIsAuthLoaded(true);
  } catch (error) {
    // Auth context not available yet
    console.log("Auth context not yet available in ProtectedRoute");
    setAuthError(true);
    return <div className="flex items-center justify-center h-screen bg-[#121212] text-white">
      <p>Loading...</p>
    </div>;
  }
  
  if (!isAuthLoaded || isLoading) {
    return <div className="flex items-center justify-center h-screen bg-[#121212]">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#1DB954]"></div>
    </div>;
  }
  
  if (!user && !redirecting) {
    // Use router navigation instead of window.location.href to avoid full page reload
    // Add a small delay to prevent immediate redirect during auth loading
    setRedirecting(true);
    setTimeout(() => {
      setLocation("/login");
    }, 100);
    return <div className="flex items-center justify-center h-screen bg-[#121212]">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#1DB954]"></div>
    </div>;
  }
  
  if (redirecting) {
    return <div className="flex items-center justify-center h-screen bg-[#121212]">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#1DB954]"></div>
    </div>;
  }
  
  return <Component {...rest} />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={MarketingLanding} />
      <Route path="/old-home" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/homepage">
        {() => <ProtectedRoute component={Homepage} />}
      </Route>
      {/* Legacy route - redirect to /homepage for backward compatibility */}
      <Route path="/create">
        {() => {
          window.location.href = "/homepage";
          return null;
        }}
      </Route>
      <Route path="/playlists">
        {() => <ProtectedRoute component={MyPlaylists} />}
      </Route>
      <Route path="/smart-links">
        {() => <ProtectedRoute component={SmartLinks} />}
      </Route>
      <Route path="/smart-links/create/:playlistId">
        {(params) => <ProtectedRoute component={(props) => <SmartLinkEditor {...props} playlistId={params.playlistId} />} />}
      </Route>
      <Route path="/smart-links/edit/:shareId">
        {(params) => <ProtectedRoute component={(props) => <SmartLinkEditor {...props} shareId={params.shareId} />} />}
      </Route>
      <Route path="/albums" component={Albums} />
      {/* Existing path for compatibility */}
      <Route path="/playlist/:id">
        {(params) => <ProtectedRoute component={(props) => <PlaylistDetails {...props} id={params.id} />} />}
      </Route>
      
      {/* New SEO-friendly path */}
      <Route path="/playlist/:id/:slug">
        {(params) => <ProtectedRoute component={(props) => <PlaylistDetails {...props} id={params.id} slug={params.slug} />} />}
      </Route>
      <Route path="/track-import">
        {() => <ProtectedRoute component={TrackImport} />}
      </Route>
      <Route path="/embeddings">
        {() => <ProtectedRoute component={EmbeddingMonitor} />}
      </Route>
      <Route path="/release-cleanup">
        {() => <ProtectedRoute component={ReleaseCleanup} />}
      </Route>
      <Route path="/direct-assistant-test">
        {() => <DirectAssistantTest />}
      </Route>
      <Route path="/v2-api-test">
        {() => <ProtectedRoute component={V2ApiTest} />}
      </Route>
      <Route path="/exact-match-test">
        {() => <ProtectedRoute component={ExactMatchTest} />}
      </Route>
      <Route path="/direct-match-test">
        {() => <DirectMatchTest />}
      </Route>
      <Route path="/song-match-test">
        {() => <SongMatchTest />}
      </Route>
      <Route path="/enhanced-playlist-test">
        {() => <ProtectedRoute component={EnhancedPlaylistTest} />}
      </Route>
      <Route path="/enhanced-direct-test">
        {() => <ProtectedRoute component={EnhancedDirectTest} />}
      </Route>
      <Route path="/track-debugger">
        {() => <TrackDebugger />}
      </Route>
      <Route path="/playlist-tracks-debugger">
        {() => <PlaylistTrackDebugger />}
      </Route>
      <Route path="/direct-track-finder">
        {() => <DirectTrackFinder />}
      </Route>
      <Route path="/assistant-matcher-test">
        {() => <AssistantMatcherTest />}
      </Route>
      <Route path="/freepik-cover-test">
        {() => <FreepikCoverTest />}
      </Route>
      <Route path="/gpt-image-test">
        {() => <GptImageTest />}
      </Route>
      <Route path="/json-tester">
        {() => <JsonTester />}
      </Route>
      <Route path="/terms">
        <TermsOfService />
      </Route>
      <Route path="/discover">
        <Discover />
      </Route>
      {/* Public playlist route with ID only (for backward compatibility) */}
      <Route path="/discover/playlist/:id">
        {(params) => <DiscoverPlaylistDetail id={params.id} />}
      </Route>
      
      {/* New SEO-friendly public playlist route with slug */}
      <Route path="/discover/playlist/:id/:slug">
        {(params) => <DiscoverPlaylistDetail id={params.id} slug={params.slug} />}
      </Route>
      <Route path="/discover/:type/:query">
        <Discover />
      </Route>
      {/* Playlist Sharing Link sharing route - playlist-{id} format (most specific) */}
      <Route path="/share/playlist-:playlistId/:title">
        {(params) => <SmartLinkPublic playlistId={params.playlistId} title={params.title} />}
      </Route>
      {/* Playlist Sharing Link sharing route - new format (numeric ID with title) */}
      <Route path="/share/:playlistId/:title">
        {(params) => {
          console.log('Route matched /share/:playlistId/:title with params:', params);
          return <SmartLinkPublic playlistId={params.playlistId} title={params.title} />;
        }}
      </Route>
      {/* Playlist Sharing Link sharing route - legacy format for backward compatibility (least specific) */}
      <Route path="/share/:shareId">
        {(params) => {
          console.log('Route matched /share/:shareId with params:', params);
          return <SmartLinkPublic shareId={params.shareId} />;
        }}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PlaylistUpdateProvider>
          <PlaylistCreatorProvider>
            <TooltipProvider>
              <Toaster />
              <div className="min-h-screen flex flex-col bg-[#121212] text-white">
                <Router />
                <FloatingPlaylistCreator />
              </div>
            </TooltipProvider>
          </PlaylistCreatorProvider>
        </PlaylistUpdateProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;

