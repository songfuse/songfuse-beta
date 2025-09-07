import { useEffect, useState, useRef } from "react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import useThemedLogo from "@/hooks/useThemedLogo";
import Layout from "@/components/Layout";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import useScrollAnimation from "@/hooks/useScrollAnimation";
import PlaylistCoverPlaceholder from "@/components/PlaylistCoverPlaceholder";
import MusicNewsFeed from "@/components/MusicNewsFeed";
import { usePlaylistCreator } from "@/contexts/PlaylistCreatorContext";
import MetaTags from "@/components/MetaTags";

// Define the Playlist type
interface Playlist {
  id: number;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  spotifyId: string | null;
  spotifyUrl: string | null;
  spotifyImageUrl: string | null;
  creatorName?: string;
  songCount?: number;
  isPublic?: boolean;
  coverImage?: string; // For backward compatibility
}

const Home = () => {
  const [isAuthLoaded, setIsAuthLoaded] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [, setLocation] = useLocation();
  const logo = useThemedLogo();
  const [randomPlaylist, setRandomPlaylist] = useState<Playlist | null>(null);
  
  // Refs for scroll animations
  const heroRef = useRef<HTMLDivElement>(null);
  const howItWorksRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  
  // Fetch playlists from the Discover API
  const { data: publicPlaylists } = useQuery<Playlist[]>({
    queryKey: ['/api/discover/playlists'],
    queryFn: async () => {
      const response = await fetch('/api/discover/playlists?isPublic=true');
      if (!response.ok) {
        throw new Error('Failed to fetch public playlists');
      }
      return response.json();
    },
  });
  
  // Select random playlists with covers and Spotify links
  useEffect(() => {
    if (publicPlaylists) {
      // Filter playlists that have both coverImageUrl and spotifyId
      const eligiblePlaylists = publicPlaylists.filter(
        playlist => (
          (playlist.coverImageUrl || playlist.coverImage) && 
          playlist.spotifyId
        )
      );
      
      if (eligiblePlaylists.length > 0) {
        // Select a random playlist
        const randomIndex = Math.floor(Math.random() * eligiblePlaylists.length);
        setRandomPlaylist(eligiblePlaylists[randomIndex]);
      }
    }
  }, [publicPlaylists]);
  
  // Scroll animation hooks
  const heroInView = useScrollAnimation(heroRef, 0.1);
  const howItWorksInView = useScrollAnimation(howItWorksRef, 0.1);
  const featuresInView = useScrollAnimation(featuresRef, 0.1);
  const ctaInView = useScrollAnimation(ctaRef, 0.1);
  
  // Animation variants
  const fadeInUp = {
    hidden: { opacity: 0, y: 60 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
  };
  
  const fadeIn = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.5, ease: "easeOut" } }
  };
  
  const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.1
      }
    }
  };
  
  // Sample cover images for the slideshow
  const coverImages = [
    "/images/covers/cover-1747395708850.jpg",
    "/images/covers/cover-1747397048944.jpg",
    "/images/covers/cover-1747344801259-df65d3f5b6eaaa54.png",
    "/images/covers/cover-1747396440537.jpg",
    "/images/covers/cover-1747348816134-1a24d5616b4a8b25.png"
  ];

  // Safely access auth context
  let user: any = null;
  let login: (() => void) | undefined;
  try {
    const auth = useAuth();
    user = auth.user;
    login = auth.login;

    // If we successfully got the auth context, set loaded
    if (!isAuthLoaded) setIsAuthLoaded(true);
  } catch (error) {
    // Auth context not available yet, handle gracefully
    console.log("Auth context not yet available");
  }

  const isLoggedIn = !!user;
  
  // Access playlist creator context
  const { openCreator, setGeneratedPlaylist } = usePlaylistCreator();

  // Fetch playlists for the sidebar (only if logged in) - using same query key as sidebar
  const { data: playlists } = useQuery({
    queryKey: ['/api/playlists-with-counts', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const response = await fetch(`/api/playlists-with-counts?userId=${user.id}`);
      if (!response.ok) throw new Error("Failed to fetch playlists");
      return response.json();
    },
    enabled: isLoggedIn,
    refetchOnWindowFocus: false,
    refetchOnMount: false, // Use cached data from other pages
    staleTime: 5 * 60 * 1000, // 5 minutes - same as sidebar
  });
  
  // Handler to create a playlist from news
  const handleCreatePlaylistFromNews = (prompt: string, articleData?: {title: string, link: string}) => {
    // Open the playlist creator with the article data
    openCreator(prompt, articleData);
  };

  // Fallback login function in case auth context isn't available
  const handleLogin = async () => {
    console.log("Login button clicked");
    if (login) {
      // Use the context's login function if available
      console.log("Using auth context login function");
      login();
    } else {
      // Manual fallback login
      console.log("Using fallback login method");
      try {
        console.log("Fetching Spotify auth URL");
        const response = await fetch("/api/auth/spotify");
        const data = await response.json();
        console.log("Received auth data:", data);

        if (data.url) {
          console.log("Redirecting to:", data.url);
          window.location.href = data.url;
        } else {
          console.error("Failed to get authorization URL");
        }
      } catch (error) {
        console.error("Login error:", error);
      }
    }
  };

  useEffect(() => {
    // If the user is logged in, redirect to the homepage
    if (isAuthLoaded && user) {
      setLocation("/homepage");
    }
  }, [isAuthLoaded, user, setLocation]);
  
  // Automatic slideshow effect for the cover images
  useEffect(() => {
    const slideInterval = setInterval(() => {
      setCurrentSlide((current) => (current + 1) % coverImages.length);
    }, 3000); // Change slide every 3 seconds
    
    return () => clearInterval(slideInterval);
  }, [coverImages.length]);

  return (
    <Layout playlists={isLoggedIn ? playlists : []}>
      <MetaTags
        title="SongFuse | AI-Powered Music Playlist Generator"
        description="Create perfect playlists in seconds with the power of AI. Just describe your mood, occasion, or musical preference — SongFuse does the rest."
        imageUrl={typeof window !== 'undefined' ? `${window.location.origin}/images/covers/cover-1747487037971.jpg` : '/images/covers/cover-1747487037971.jpg'}
        type="website"
        siteName="SongFuse"
        url={typeof window !== 'undefined' ? window.location.origin : ''}
      />
      {/* Hero Section */}
      <motion.div 
        ref={heroRef} 
        initial="hidden" 
        animate={heroInView ? "visible" : "hidden"} 
        variants={fadeIn}
        className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-xl mb-12 overflow-hidden"
      >
        <div className="container mx-auto px-4 py-12 max-w-6xl">
          <div className="flex flex-col md:flex-row items-center">
            {/* Left side with content */}
            <motion.div 
              className="md:w-1/2 text-left mb-8 md:mb-0 md:pr-8"
              variants={staggerContainer}
            >
              <motion.div className="mb-6" variants={fadeInUp}>
                <motion.img 
                  src={logo} 
                  alt="Songfuse Logo" 
                  className="h-16 mb-4" 
                  variants={fadeInUp}
                  whileHover={{ scale: 1.05 }}
                />
                <motion.h1 
                  className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-primary/80 text-transparent bg-clip-text"
                  variants={fadeInUp}
                >
                  Your AI Music Curator
                </motion.h1>
                <motion.p 
                  className="text-xl text-foreground/80 mb-6 font-work-sans font-light leading-relaxed"
                  variants={fadeInUp}
                >
                  Create perfect playlists in seconds with the power of AI. 
                  Just describe your mood, occasion, or musical preference — SongFuse does the rest.
                </motion.p>
              </motion.div>

              <motion.div 
                className="flex flex-col sm:flex-row gap-4"
                variants={fadeInUp}
              >
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
                  <Button 
                    onClick={() => setLocation("/discover")}
                    variant="outline"
                    className="border-primary/30 text-primary hover:text-primary hover:bg-primary/5 px-8 py-6 rounded-full text-lg font-medium transition-all duration-300"
                  >
                    Browse Public Playlists
                  </Button>
                </motion.div>

              </motion.div>
            </motion.div>

            {/* Right side with preview */}
            <motion.div 
              className="md:w-1/2 relative"
              variants={fadeInUp}
              initial={{ opacity: 0, x: 100 }}
              animate={heroInView ? { opacity: 1, x: 0 } : { opacity: 0, x: 100 }}
              transition={{ duration: 0.7, delay: 0.2 }}
            >
              <motion.div 
                className="relative bg-background rounded-xl shadow-xl p-4 md:p-6 transform rotate-1 hover:rotate-0 transition-transform duration-300"
                whileHover={{ scale: 1.03, rotate: 0 }}
                transition={{ duration: 0.3 }}
                onClick={() => randomPlaylist && setLocation(`/discover/playlist/${randomPlaylist.id}`)}
                style={{ cursor: randomPlaylist ? 'pointer' : 'default' }}
              >
                <div className="absolute -top-3 -right-3 bg-primary text-primary-foreground text-xs px-3 py-1 rounded-full font-semibold">
                  AI-Generated
                </div>
                <div className="aspect-square bg-primary/10 rounded-lg overflow-hidden mb-3">
                  {randomPlaylist ? (
                    <PlaylistCoverPlaceholder 
                      size="md" 
                      imageUrl={randomPlaylist.coverImageUrl || randomPlaylist.coverImage || undefined}
                      spotifyImageUrl={randomPlaylist.spotifyImageUrl || undefined}
                      altText={randomPlaylist.title}
                    />
                  ) : (
                    <img 
                      src="/images/covers/cover-1747487037971.jpg" 
                      alt="Sample Playlist Cover" 
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <h3 className="text-lg font-semibold mb-1 text-foreground">
                  {randomPlaylist ? randomPlaylist.title : "Chill Vibes: Trap, Lo-Fi & Ambient"}
                </h3>
                <p className="text-sm text-foreground/70 mb-2">
                  {randomPlaylist && randomPlaylist.songCount 
                    ? `${randomPlaylist.songCount} tracks` 
                    : "24 tracks"} • Generated with AI
                </p>
                <div className="flex items-center justify-between text-xs text-foreground/50">
                  <div className="flex flex-wrap gap-1">
                    <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full">AI Cover</span>
                    <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full">Spotify</span>
                  </div>
                  {randomPlaylist && (
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="text-xs h-6 px-2 border-primary/30 text-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLocation(`/discover/playlist/${randomPlaylist.id}`);
                      }}
                    >
                      View
                    </Button>
                  )}
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* How It Works Section */}
      <motion.div 
        ref={howItWorksRef}
        initial="hidden"
        animate={howItWorksInView ? "visible" : "hidden"}
        variants={staggerContainer}
        className="container px-2 py-4 max-w-6xl"
      >
        <motion.div 
          className="text-center mb-10"
          variants={fadeInUp}
        >
          <h2 className="text-3xl font-bold mb-2 bg-gradient-to-r from-primary to-primary/80 text-transparent bg-clip-text inline-block">
            How SongFuse Works
          </h2>
          <p className="text-foreground/70 max-w-2xl mx-auto">
            Transform your music experience with our AI-powered playlist generation process
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          {/* Step 1 */}
          <motion.div 
            className="relative"
            variants={fadeInUp}
            whileHover={{ y: -5 }}
            transition={{ duration: 0.3 }}
          >
            <div className="absolute -top-4 -left-4 h-12 w-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xl font-bold shadow-lg z-10">
              1
            </div>
            <div className="bg-card p-8 rounded-xl border border-border shadow-sm h-full flex flex-col">
              <div className="h-14 w-14 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold font-work-sans mb-3 text-foreground">Describe Your Vision</h3>
              <p className="text-muted-foreground font-work-sans flex-grow">
                Tell our AI what kind of playlist you want. Specify moods, genres, occasions, eras, or even lyrical themes.
              </p>
              <div className="mt-4 p-3 bg-muted rounded-lg text-sm italic text-foreground/70">
                "I want a playlist of upbeat indie songs perfect for a sunset road trip along the coast."
              </div>
            </div>
          </motion.div>

          {/* Step 2 */}
          <motion.div 
            className="relative"
            variants={fadeInUp}
            whileHover={{ y: -5 }}
            transition={{ duration: 0.3 }}
          >
            <div className="absolute -top-4 -left-4 h-12 w-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xl font-bold shadow-lg z-10">
              2
            </div>
            <div className="bg-card p-8 rounded-xl border border-border shadow-sm h-full flex flex-col">
              <div className="h-14 w-14 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold font-work-sans mb-3 text-foreground">AI Creates Your Playlist</h3>
              <p className="text-muted-foreground font-work-sans flex-grow">
                Our AI analyzes your request and curates 24 perfectly matched songs from our diverse music database spanning multiple platforms.
              </p>
              <motion.div 
                className="mt-4 grid grid-cols-3 gap-2"
                whileHover={{ scale: 1.03 }}
              >
                <div className="bg-muted rounded-md p-1">
                  <div className="aspect-square bg-primary/10 rounded-sm"></div>
                  <div className="mt-1 h-2 bg-primary/20 rounded-full"></div>
                  <div className="mt-1 h-2 w-2/3 bg-primary/20 rounded-full"></div>
                </div>
                <div className="bg-muted rounded-md p-1">
                  <div className="aspect-square bg-primary/10 rounded-sm"></div>
                  <div className="mt-1 h-2 bg-primary/20 rounded-full"></div>
                  <div className="mt-1 h-2 w-2/3 bg-primary/20 rounded-full"></div>
                </div>
                <div className="bg-muted rounded-md p-1">
                  <div className="aspect-square bg-primary/10 rounded-sm"></div>
                  <div className="mt-1 h-2 bg-primary/20 rounded-full"></div>
                  <div className="mt-1 h-2 w-2/3 bg-primary/20 rounded-full"></div>
                </div>
              </motion.div>
            </div>
          </motion.div>

          {/* Step 3 */}
          <motion.div 
            className="relative"
            variants={fadeInUp}
            whileHover={{ y: -5 }}
            transition={{ duration: 0.3 }}
          >
            <div className="absolute -top-4 -left-4 h-12 w-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xl font-bold shadow-lg z-10">
              3
            </div>
            <div className="bg-card p-8 rounded-xl border border-border shadow-sm h-full flex flex-col">
              <div className="h-14 w-14 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold font-work-sans mb-3 text-foreground">Enjoy Your Music</h3>
              <p className="text-muted-foreground font-work-sans flex-grow">
                Export your playlist to Spotify, Apple Music, YouTube, or other platforms. Share with friends or keep it as your personal soundtrack.
              </p>
              <motion.div 
                className="mt-4 flex gap-2"
                whileHover={{ scale: 1.05 }}
              >
                <div className="h-6 w-6 bg-zinc-900 rounded flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-green-500">
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                  </svg>
                </div>
                <div className="h-6 w-6 bg-zinc-900 rounded flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-red-500">
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.6 0 12 0zm5.76 16.2c-.36.48-2.64 1.68-5.76 1.68-3.96 0-5.76-1.44-5.76-1.68-.36-.48-.36-2.16 0-2.76.36-.48 1.56-.96 1.56-1.56v-1.2c0-.6.6-1.56 1.2-1.56h.36V6.96c0-.6.6-1.2 1.2-1.2h2.76c.6 0 1.2.6 1.2 1.2v2.16h.36c.6 0 1.2.96 1.2 1.56v1.2c0 .6 1.2 1.08 1.56 1.56.48.6.48 2.28.12 2.76z" />
                  </svg>
                </div>
                <div className="h-6 w-6 bg-blue-600 rounded flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-white">
                    <path d="M17.9,10.9C14.7,9,9.35,8.8,6.3,9.75c-0.5,0.15-1-0.15-1.15-0.6c-0.15-0.5,0.15-1,0.6-1.15c3.55-1.05,9.4-0.85,13.1,1.35c0.45,0.25,0.6,0.85,0.35,1.3C19.08,11,18.5,11.15,17.9,10.9z M17.8,13.7c-0.25,0.35-0.7,0.5-1.05,0.25c-2.7-1.65-6.8-2.15-9.95-1.15c-0.4,0.1-0.85-0.1-0.95-0.5c-0.1-0.4,0.1-0.85,0.5-0.95c3.65-1.1,8.15-0.6,11.25,1.35C17.9,12.9,18.05,13.35,17.8,13.7z M16.6,16.45c-0.2,0.3-0.6,0.35-0.9,0.15c-2.35-1.45-5.3-1.75-8.8-0.95c-0.35,0.05-0.65-0.15-0.75-0.45c-0.1-0.35,0.15-0.65,0.45-0.75c3.8-0.85,7.1-0.5,9.7,1.1C16.75,15.75,16.8,16.15,16.6,16.45z M12,2C6.5,2,2,6.5,2,12s4.5,10,10,10c5.5,0,10-4.5,10-10S17.5,2,12,2z" />
                  </svg>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* Features Section with Examples */}
      <motion.div 
        ref={featuresRef}
        initial="hidden"
        animate={featuresInView ? "visible" : "hidden"}
        variants={staggerContainer}
        className="mb-16"
      >
        <motion.div 
          className="text-center mb-10"
          variants={fadeInUp}
        >
          <h2 className="text-3xl font-bold mb-2 bg-gradient-to-r from-primary to-primary/80 text-transparent bg-clip-text inline-block">
            Key Features
          </h2>
          <p className="text-foreground/70 max-w-2xl mx-auto">
            Discover what makes SongFuse the ultimate AI playlist generator
          </p>
        </motion.div>

        <motion.div 
          className="grid grid-cols-1 md:grid-cols-2 gap-12"
          variants={staggerContainer}
        >
          {/* Feature 1 - AI Playlist Creation */}
          <motion.div 
            className="flex flex-col md:flex-row gap-6 items-start"
            variants={fadeInUp}
            whileHover={{ y: -5 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div 
              className="shrink-0 h-14 w-14 bg-primary/10 text-primary rounded-full flex items-center justify-center"
              whileHover={{ scale: 1.1, rotate: 5 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </motion.div>
            <div>
              <h3 className="text-xl font-semibold mb-2 bg-gradient-to-r from-primary to-primary/80 text-transparent bg-clip-text">AI Playlist Creation</h3>
              <p className="text-muted-foreground mb-4">
                Our advanced AI understands complex music preferences and creates perfectly balanced playlists with genre diversity, mood consistency, and artist variety.
              </p>
              <motion.div 
                className="p-3 bg-muted rounded-lg text-sm"
                whileHover={{ scale: 1.02 }}
              >
                <span className="font-semibold text-foreground">Example prompt:</span>
                <p className="italic text-foreground/70 mt-1">
                  "A playlist of dreamy shoegaze and post-punk for late night coding sessions"
                </p>
              </motion.div>
            </div>
          </motion.div>

          {/* Feature 2 - Custom AI Covers */}
          <motion.div 
            className="flex flex-col md:flex-row gap-6 items-start"
            variants={fadeInUp}
            whileHover={{ y: -5 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div 
              className="shrink-0 h-14 w-14 bg-primary/10 text-primary rounded-full flex items-center justify-center"
              whileHover={{ scale: 1.1, rotate: 5 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </motion.div>
            <div>
              <h3 className="text-xl font-semibold mb-2 bg-gradient-to-r from-primary to-primary/80 text-transparent bg-clip-text">Custom AI Covers</h3>
              <p className="text-muted-foreground mb-4">
                Generate stunning, unique cover images that visually represent the mood and theme of your playlist, making them stand out in your music library.
              </p>
              <motion.div 
                className="relative h-64 bg-primary/10 rounded-md overflow-hidden shadow-lg"
                whileHover={{ scale: 1.03 }}
                transition={{ duration: 0.3 }}
              >
                {/* Main slideshow container */}
                <div className="relative w-full h-full">
                  {coverImages.map((imgSrc, index) => (
                    <motion.div 
                      key={index} 
                      className={`absolute top-0 left-0 w-full h-full transition-opacity duration-1000 ease-in-out ${
                        index === currentSlide ? 'opacity-100 z-10' : 'opacity-0 z-0'
                      }`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: index === currentSlide ? 1 : 0 }}
                      transition={{ duration: 1 }}
                    >
                      <img 
                        src={imgSrc} 
                        className="w-full h-full object-cover" 
                        alt={`AI-generated playlist cover ${index + 1}`} 
                      />
                    </motion.div>
                  ))}
                </div>
                
                {/* Slide indicators */}
                <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2 z-20">
                  {coverImages.map((_, index) => (
                    <motion.button
                      key={index}
                      onClick={() => setCurrentSlide(index)}
                      className={`h-2 rounded-full transition-all ${
                        index === currentSlide 
                          ? 'w-6 bg-primary' 
                          : 'w-2 bg-primary/40 hover:bg-primary/60'
                      }`}
                      whileHover={{ scale: 1.2 }}
                      whileTap={{ scale: 0.9 }}
                      aria-label={`Go to slide ${index + 1}`}
                    />
                  ))}
                </div>
                
                {/* AI-Generated badge */}
                <motion.div 
                  className="absolute top-3 right-3 bg-primary text-primary-foreground text-xs px-3 py-1 rounded-full font-semibold z-20 shadow-sm"
                  initial={{ y: -20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3, duration: 0.5 }}
                >
                  AI-Generated Cover
                </motion.div>
              </motion.div>
            </div>
          </motion.div>

          {/* Feature 3 - Multi-Platform Support */}
          <motion.div 
            className="flex flex-col md:flex-row gap-6 items-start"
            variants={fadeInUp}
            whileHover={{ y: -5 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div 
              className="shrink-0 h-14 w-14 bg-primary/10 text-primary rounded-full flex items-center justify-center"
              whileHover={{ scale: 1.1, rotate: 5 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
            </motion.div>
            <div>
              <h3 className="text-xl font-semibold mb-2 bg-gradient-to-r from-primary to-primary/80 text-transparent bg-clip-text">Multi-Platform Support</h3>
              <p className="text-muted-foreground mb-4">
                Access our extensive music database with songs from Spotify, Apple Music, Deezer, Tidal, YouTube Music, and Amazon Music.
              </p>
              <motion.div 
                className="flex flex-wrap gap-2"
                variants={staggerContainer}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.8 }}
              >
                <motion.div 
                  className="bg-primary/10 px-3 py-1.5 rounded-full text-xs font-medium text-primary border border-primary/20 shadow-sm"
                  variants={fadeInUp}
                  whileHover={{ scale: 1.05 }}
                >
                  Spotify
                </motion.div>
                <motion.div 
                  className="bg-primary/10 px-3 py-1.5 rounded-full text-xs font-medium text-primary border border-primary/20 shadow-sm"
                  variants={fadeInUp}
                  whileHover={{ scale: 1.05 }}
                >
                  Apple Music
                </motion.div>
                <motion.div 
                  className="bg-primary/10 px-3 py-1.5 rounded-full text-xs font-medium text-primary border border-primary/20 shadow-sm"
                  variants={fadeInUp}
                  whileHover={{ scale: 1.05 }}
                >
                  YouTube Music
                </motion.div>
                <motion.div 
                  className="bg-primary/10 px-3 py-1.5 rounded-full text-xs font-medium text-primary border border-primary/20 shadow-sm"
                  variants={fadeInUp}
                  whileHover={{ scale: 1.05 }}
                >
                  Tidal
                </motion.div>
                <motion.div 
                  className="bg-primary/10 px-3 py-1.5 rounded-full text-xs font-medium text-primary border border-primary/20 shadow-sm"
                  variants={fadeInUp}
                  whileHover={{ scale: 1.05 }}
                >
                  Deezer
                </motion.div>
                <motion.div 
                  className="bg-primary/10 px-3 py-1.5 rounded-full text-xs font-medium text-primary border border-primary/20 shadow-sm"
                  variants={fadeInUp}
                  whileHover={{ scale: 1.05 }}
                >
                  Amazon Music
                </motion.div>
              </motion.div>
            </div>
          </motion.div>

          {/* Feature 4 - Intelligent Recommendations */}
          <motion.div 
            className="flex flex-col md:flex-row gap-6 items-start"
            variants={fadeInUp}
            whileHover={{ y: -5 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div 
              className="shrink-0 h-14 w-14 bg-primary/10 text-primary rounded-full flex items-center justify-center"
              whileHover={{ scale: 1.1, rotate: 5 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </motion.div>
            <div>
              <h3 className="text-xl font-semibold mb-2 bg-gradient-to-r from-primary to-primary/80 text-transparent bg-clip-text">Intelligent Recommendations</h3>
              <p className="text-muted-foreground mb-4">
                Powered by song vector embeddings and advanced machine learning, our system understands the nuances of your music taste and delivers spot-on recommendations.
              </p>
              <motion.div 
                className="p-3 bg-muted rounded-lg"
                variants={staggerContainer}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.8 }}
              >
                <motion.div 
                  className="flex items-center justify-between mb-2"
                  variants={fadeInUp}
                >
                  <span className="text-xs font-medium text-foreground">Song Analysis</span>
                  <div className="h-2 w-24 bg-primary/30 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-primary rounded-full"
                      initial={{ width: 0 }}
                      whileInView={{ width: '75%' }}
                      transition={{ duration: 1, delay: 0.2 }}
                    ></motion.div>
                  </div>
                </motion.div>
                <motion.div 
                  className="flex items-center justify-between mb-2"
                  variants={fadeInUp}
                >
                  <span className="text-xs font-medium text-foreground">Mood Matching</span>
                  <div className="h-2 w-24 bg-primary/30 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-primary rounded-full"
                      initial={{ width: 0 }}
                      whileInView={{ width: '80%' }}
                      transition={{ duration: 1, delay: 0.4 }}
                    ></motion.div>
                  </div>
                </motion.div>
                <motion.div 
                  className="flex items-center justify-between"
                  variants={fadeInUp}
                >
                  <span className="text-xs font-medium text-foreground">Genre Diversity</span>
                  <div className="h-2 w-24 bg-primary/30 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-primary rounded-full"
                      initial={{ width: 0 }}
                      whileInView={{ width: '66.7%' }}
                      transition={{ duration: 1, delay: 0.6 }}
                    ></motion.div>
                  </div>
                </motion.div>
              </motion.div>
            </div>
          </motion.div>

          {/* Feature 5 - Playlist Sharing Links */}
          <motion.div 
            className="flex flex-col md:flex-row gap-6 items-start"
            variants={fadeInUp}
            whileHover={{ y: -5 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div 
              className="shrink-0 h-14 w-14 bg-primary/10 text-primary rounded-full flex items-center justify-center"
              whileHover={{ scale: 1.1, rotate: 5 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
              </svg>
            </motion.div>
            <div>
              <h3 className="text-xl font-semibold mb-2 bg-gradient-to-r from-primary to-primary/80 text-transparent bg-clip-text">Smart Sharing Links</h3>
              <p className="text-muted-foreground mb-4">
                Create beautiful, shareable playlist links with optimized thumbnails for social media. Perfect for sharing your AI-curated playlists across platforms.
              </p>
              <motion.div 
                className="space-y-3"
                variants={staggerContainer}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.8 }}
              >
                <motion.div 
                  className="p-3 bg-muted rounded-lg border-l-4 border-primary"
                  variants={fadeInUp}
                  whileHover={{ scale: 1.02 }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="h-2 w-2 bg-primary rounded-full"></div>
                    <span className="text-sm font-medium text-foreground">Clean URLs</span>
                  </div>
                  <p className="text-xs text-foreground/70">songfuse.app/share/493/summer-vibes</p>
                </motion.div>
                <motion.div 
                  className="p-3 bg-muted rounded-lg border-l-4 border-primary"
                  variants={fadeInUp}
                  whileHover={{ scale: 1.02 }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="h-2 w-2 bg-primary rounded-full"></div>
                    <span className="text-sm font-medium text-foreground">Social Media Ready</span>
                  </div>
                  <p className="text-xs text-foreground/70">Optimized thumbnails for Twitter, Facebook, Discord</p>
                </motion.div>
                <motion.div 
                  className="p-3 bg-muted rounded-lg border-l-4 border-primary"
                  variants={fadeInUp}
                  whileHover={{ scale: 1.02 }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="h-2 w-2 bg-primary rounded-full"></div>
                    <span className="text-sm font-medium text-foreground">Cross-Platform Access</span>
                  </div>
                  <p className="text-xs text-foreground/70">Works on all devices and music platforms</p>
                </motion.div>
              </motion.div>
            </div>
          </motion.div>

          {/* Feature 6 - Music Discovery */}
          <motion.div 
            className="flex flex-col md:flex-row gap-6 items-start"
            variants={fadeInUp}
            whileHover={{ y: -5 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div 
              className="shrink-0 h-14 w-14 bg-primary/10 text-primary rounded-full flex items-center justify-center"
              whileHover={{ scale: 1.1, rotate: 5 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </motion.div>
            <div>
              <h3 className="text-xl font-semibold mb-2 bg-gradient-to-r from-primary to-primary/80 text-transparent bg-clip-text">Music Discovery Hub</h3>
              <p className="text-muted-foreground mb-4">
                Explore curated public playlists, discover new artists, and get inspired by AI-generated music collections from our community.
              </p>
              <motion.div 
                className="flex flex-wrap gap-2"
                variants={staggerContainer}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.8 }}
              >
                <motion.div 
                  className="bg-primary/10 px-3 py-1.5 rounded-full text-xs font-medium text-primary border border-primary/20 shadow-sm"
                  variants={fadeInUp}
                  whileHover={{ scale: 1.05 }}
                >
                  Trending Playlists
                </motion.div>
                <motion.div 
                  className="bg-primary/10 px-3 py-1.5 rounded-full text-xs font-medium text-primary border border-primary/20 shadow-sm"
                  variants={fadeInUp}
                  whileHover={{ scale: 1.05 }}
                >
                  Genre Exploration
                </motion.div>
                <motion.div 
                  className="bg-primary/10 px-3 py-1.5 rounded-full text-xs font-medium text-primary border border-primary/20 shadow-sm"
                  variants={fadeInUp}
                  whileHover={{ scale: 1.05 }}
                >
                  Artist Discovery
                </motion.div>
                <motion.div 
                  className="bg-primary/10 px-3 py-1.5 rounded-full text-xs font-medium text-primary border border-primary/20 shadow-sm"
                  variants={fadeInUp}
                  whileHover={{ scale: 1.05 }}
                >
                  Community Curation
                </motion.div>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      </motion.div>

      {/* CTA Section */}
      <motion.div 
        ref={ctaRef}
        initial="hidden"
        animate={ctaInView ? "visible" : "hidden"}
        variants={staggerContainer}
        className="relative overflow-hidden rounded-xl p-8 md:p-12 text-center mb-8 shadow-xl border border-primary/30"
        style={{
          background: `
            linear-gradient(125deg, rgba(var(--primary), 0.3) 0%, rgba(var(--primary), 0.08) 100%),
            radial-gradient(circle at 20% 30%, rgba(var(--primary), 0.4) 0%, transparent 30%),
            radial-gradient(circle at 80% 70%, rgba(var(--primary), 0.35) 0%, transparent 35%)
          `
        }}
      >
        {/* Musical note decorations */}
        <div className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none">
          <div className="absolute top-[15%] left-[10%] text-primary text-6xl">♪</div>
          <div className="absolute top-[60%] left-[25%] text-primary text-5xl rotate-12">♫</div>
          <div className="absolute top-[25%] right-[15%] text-primary text-5xl -rotate-12">♩</div>
          <div className="absolute bottom-[20%] right-[20%] text-primary text-6xl">♪</div>
        </div>
        <motion.h2 
          className="text-3xl md:text-4xl font-bold mb-4 bg-gradient-to-r from-primary to-primary/80 text-transparent bg-clip-text"
          variants={fadeInUp}
        >
          Ready to Transform Your Music Experience?
        </motion.h2>
        <motion.p 
          className="text-xl text-foreground mb-8 max-w-2xl mx-auto font-work-sans font-light"
          variants={fadeInUp}
        >
          Connect with Spotify now and start creating AI-powered playlists tailored to your unique music taste.
        </motion.p>
        <motion.div
          variants={fadeInUp}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
        >
          <Button 
            onClick={handleLogin}
            className="bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80 text-primary-foreground px-10 py-6 rounded-full text-lg font-medium shadow-lg transition-all duration-300 hover:shadow-xl text-white"
          >
            Get Started with Spotify
          </Button>
        </motion.div>



        <motion.div 
          className="text-sm text-foreground/50 mt-6"
          variants={fadeInUp}
        >
          By using SongFuse, you agree to our{" "}
          <Link href="/terms" className="text-primary hover:underline">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </Link>
        </motion.div>
      </motion.div>
    </Layout>
  );
};

export default Home;