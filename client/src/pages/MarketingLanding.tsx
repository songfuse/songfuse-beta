import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { 
  Music, 
  Sparkles, 
  ArrowRight, 
  Play, 
  Share2, 
  Zap,
  Users,
  Heart,
  Star,
  CheckCircle,
  Palette,
  Search,
  Download
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import MetaTags from "@/components/MetaTags";
import songfuseBrandDark from "@/assets/songfuse-brand-dark.svg";
import songfuseIcon from "@assets/songfuse_ico.png";
import { useAuth } from "@/contexts/AuthContext";

interface Playlist {
  id: number;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  spotifyId: string | null;
  songCount?: number;
  coverImage?: string;
}

const MarketingLanding = () => {
  const [, setLocation] = useLocation();
  const [currentTestimonial, setCurrentTestimonial] = useState(0);
  const { user } = useAuth();

  // Redirect logged-in users to homepage
  useEffect(() => {
    if (user) {
      setLocation("/homepage");
    }
  }, [user, setLocation]);

  // Fetch public playlists for showcase
  const { data: publicPlaylists } = useQuery<Playlist[]>({
    queryKey: ['/api/discover/playlists'],
    queryFn: async () => {
      const response = await fetch('/api/discover/playlists?isPublic=true&limit=6');
      if (!response.ok) throw new Error('Failed to fetch public playlists');
      return response.json();
    },
  });

  const handleLogin = async () => {
    try {
      const response = await fetch("/api/auth/spotify");
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Login error:", error);
    }
  };

  // Animation variants
  const fadeInUp = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
  };

  const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.2 }
    }
  };

  const testimonials = [
    {
      text: "SongFuse created the perfect workout playlist for me in seconds. The AI understood exactly what I needed!",
      author: "Sarah M.",
      role: "Fitness Enthusiast"
    },
    {
      text: "I discovered so many new artists through SongFuse's AI recommendations. It's like having a personal music curator.",
      author: "Mike R.",
      role: "Music Lover"
    },
    {
      text: "The playlist covers are stunning! Perfect for sharing on social media.",
      author: "Emma L.",
      role: "Content Creator"
    }
  ];

  const features = [
    {
      icon: <Sparkles className="h-6 w-6" />,
      title: "AI-Powered Curation",
      description: "Our advanced AI understands your mood, genre preferences, and creates perfect playlists instantly"
    },
    {
      icon: <Palette className="h-6 w-6" />,
      title: "AI-Generated Covers",
      description: "Every playlist gets a unique, beautiful cover image created by AI to match your music vibe"
    },
    {
      icon: <Share2 className="h-6 w-6" />,
      title: "Social Sharing",
      description: "Share your playlists with smart links optimized for social media with rich previews"
    },
    {
      icon: <Search className="h-6 w-6" />,
      title: "Smart Discovery",
      description: "Discover new music through our intelligent recommendation system and community playlists"
    },
    {
      icon: <Download className="h-6 w-6" />,
      title: "Spotify Integration",
      description: "Export your AI-generated playlists directly to Spotify with one click"
    },
    {
      icon: <Users className="h-6 w-6" />,
      title: "Community",
      description: "Explore playlists created by other users and discover new musical tastes"
    }
  ];

  // Auto-rotate testimonials
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTestimonial((prev) => (prev + 1) % testimonials.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [testimonials.length]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black">
      <MetaTags
        title="SongFuse | AI-Powered Music Playlist Generator"
        description="Create perfect playlists in seconds with AI. Transform your musical ideas into curated playlists with beautiful covers and smart social sharing."
        imageUrl="/og-image-simple.svg"
        type="website"
        siteName="SongFuse"
      />

      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-black/30 backdrop-blur-md border-b border-red-500/20">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <img 
                src={songfuseBrandDark} 
                alt="SongFuse" 
                className="h-8"
              />
            </div>
            <div className="flex items-center space-x-4">
              <Button 
                variant="ghost" 
                className="text-white hover:text-red-400"
                onClick={() => setLocation("/discover")}
              >
                Discover
              </Button>
              <Button 
                onClick={handleLogin}
                className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white px-6 py-2 rounded-full font-medium transition-all duration-300 shadow-lg hover:shadow-xl"
              >
                Get Started Free
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="container mx-auto max-w-6xl">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="text-center"
          >
            <motion.div variants={fadeInUp} className="mb-6">
              <Badge className="bg-red-500/20 text-red-300 border-red-500/30 px-4 py-2 text-sm font-medium">
                ✨ Powered by Advanced AI
              </Badge>
            </motion.div>
            
            <motion.h1 
              variants={fadeInUp}
              className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight"
            >
              Your Music,
              <br />
              <span className="bg-gradient-to-r from-red-400 via-red-500 to-red-600 bg-clip-text text-transparent">
                Perfected by AI
              </span>
            </motion.h1>
            
            <motion.p 
              variants={fadeInUp}
              className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto leading-relaxed"
            >
              Transform your musical ideas into curated playlists in seconds. 
              Our AI understands your vibe and creates playlists with stunning covers ready to share.
            </motion.p>
            
            <motion.div 
              variants={fadeInUp}
              className="flex flex-col sm:flex-row gap-4 justify-center items-center"
            >
              <Button 
                onClick={handleLogin}
                size="lg"
                className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white px-8 py-4 rounded-full text-lg font-medium transition-all duration-300 shadow-xl hover:shadow-2xl transform hover:scale-105"
              >
                <Sparkles className="mr-2 h-5 w-5" />
                Create Your First Playlist
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              
              <Button 
                variant="outline"
                size="lg"
                onClick={() => setLocation("/discover")}
                className="border-red-500/30 text-white hover:bg-red-500/10 hover:border-red-400 px-8 py-4 rounded-full text-lg font-medium transition-all duration-300"
              >
                <Play className="mr-2 h-5 w-5" />
                Explore Examples
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Live Playlist Showcase */}
      {publicPlaylists && publicPlaylists.length > 0 && (
        <section className="py-16 px-6">
          <div className="container mx-auto max-w-6xl">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center mb-12"
            >
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                AI-Generated Playlists
              </h2>
              <p className="text-gray-400 text-lg">
                Real playlists created by our community using AI
              </p>
            </motion.div>
            
            <motion.div 
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              initial="hidden"
              whileInView="visible"
              variants={staggerContainer}
            >
              {publicPlaylists.slice(0, 6).map((playlist, index) => (
                <motion.div
                  key={playlist.id}
                  variants={fadeInUp}
                  className="group bg-white/5 backdrop-blur-sm rounded-xl p-4 hover:bg-white/10 transition-all duration-300 cursor-pointer transform hover:scale-105"
                  onClick={() => setLocation(`/discover/playlist/${playlist.id}`)}
                >
                  <div className="aspect-square bg-gradient-to-br from-red-500/20 to-red-600/20 rounded-lg mb-3 overflow-hidden">
                    {playlist.coverImageUrl || playlist.coverImage ? (
                      <img 
                        src={playlist.coverImageUrl || playlist.coverImage || ''} 
                        alt={playlist.title}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Music className="h-12 w-12 text-red-400" />
                      </div>
                    )}
                  </div>
                  <h3 className="text-white font-semibold mb-1 line-clamp-2">
                    {playlist.title}
                  </h3>
                  <p className="text-gray-400 text-sm">
                    {playlist.songCount || 0} tracks • AI Generated
                  </p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>
      )}

      {/* Features Section */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Everything You Need for Perfect Playlists
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              From AI curation to social sharing, we've got every aspect of playlist creation covered
            </p>
          </motion.div>
          
          <motion.div 
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
            initial="hidden"
            whileInView="visible"
            variants={staggerContainer}
          >
            {features.map((feature, index) => (
              <motion.div
                key={index}
                variants={fadeInUp}
                className="group bg-white/5 backdrop-blur-sm rounded-xl p-6 hover:bg-white/10 transition-all duration-300 border border-red-500/10 hover:border-red-500/20"
              >
                <div className="bg-gradient-to-r from-red-500 to-red-600 w-12 h-12 rounded-lg flex items-center justify-center mb-4 text-white group-hover:scale-110 transition-transform duration-300">
                  {feature.icon}
                </div>
                <h3 className="text-white font-semibold text-lg mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-400">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-6 bg-black/20">
        <div className="container mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Create Playlists in 3 Simple Steps
            </h2>
          </motion.div>
          
          <motion.div 
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
            initial="hidden"
            whileInView="visible"
            variants={staggerContainer}
          >
            {[
              {
                step: "1",
                title: "Describe Your Vision",
                description: "Tell our AI what kind of playlist you want. Any mood, genre, or occasion.",
                example: "Upbeat indie songs for a road trip"
              },
              {
                step: "2", 
                title: "AI Creates Magic",
                description: "Our AI curates the perfect tracks and generates a stunning cover image.",
                example: "Analyzing 9,500+ tracks for matches"
              },
              {
                step: "3",
                title: "Share & Enjoy",
                description: "Export to Spotify, share on social media, or discover more playlists.",
                example: "One-click Spotify export"
              }
            ].map((item, index) => (
              <motion.div
                key={index}
                variants={fadeInUp}
                className="text-center relative"
              >
                <div className="bg-gradient-to-r from-red-500 to-red-600 w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-6 shadow-lg">
                  {item.step}
                </div>
                <h3 className="text-white font-semibold text-xl mb-3">
                  {item.title}
                </h3>
                <p className="text-gray-400 mb-4">
                  {item.description}
                </p>
                <div className="bg-white/5 rounded-lg p-3 text-sm text-red-300 italic border border-red-500/20">
                  "{item.example}"
                </div>
                
                {index < 2 && (
                  <div className="hidden md:block absolute top-8 -right-4 text-red-400">
                    <ArrowRight className="h-6 w-6" />
                  </div>
                )}
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Loved by Music Enthusiasts
            </h2>
          </motion.div>
          
          <motion.div
            key={currentTestimonial}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.5 }}
            className="bg-white/5 backdrop-blur-sm rounded-xl p-8"
          >
            <div className="flex justify-center mb-4">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="h-5 w-5 text-yellow-400 fill-current" />
              ))}
            </div>
            <blockquote className="text-xl text-gray-300 mb-6 italic">
              "{testimonials[currentTestimonial].text}"
            </blockquote>
            <div className="text-white font-semibold">
              {testimonials[currentTestimonial].author}
            </div>
            <div className="text-red-300 text-sm">
              {testimonials[currentTestimonial].role}
            </div>
          </motion.div>
          
          <div className="flex justify-center mt-6 space-x-2">
            {testimonials.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentTestimonial(index)}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  index === currentTestimonial ? 'bg-red-400 w-8' : 'bg-white/30'
                }`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 px-6 bg-black/20">
        <div className="container mx-auto max-w-6xl">
          <motion.div 
            className="grid grid-cols-1 md:grid-cols-4 gap-8 text-center"
            initial="hidden"
            whileInView="visible"
            variants={staggerContainer}
          >
            {[
              { number: "9,500+", label: "Tracks in Database" },
              { number: "100%", label: "AI-Generated Covers" },
              { number: "Spotify", label: "Direct Integration" },
              { number: "Instant", label: "Playlist Creation" }
            ].map((stat, index) => (
              <motion.div key={index} variants={fadeInUp}>
                <div className="text-3xl md:text-4xl font-bold text-white mb-2">
                  {stat.number}
                </div>
                <div className="text-gray-400">
                  {stat.label}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
              Ready to Transform Your
              <span className="bg-gradient-to-r from-red-400 to-red-600 bg-clip-text text-transparent">
                {" "}Music Experience?
              </span>
            </h2>
            <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
              Join thousands of music lovers who are already creating amazing playlists with AI
            </p>
            
            <Button 
              onClick={handleLogin}
              size="lg"
              className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white px-12 py-6 rounded-full text-xl font-medium transition-all duration-300 shadow-xl hover:shadow-2xl transform hover:scale-105"
            >
              <Zap className="mr-3 h-6 w-6" />
              Start Creating for Free
              <ArrowRight className="ml-3 h-6 w-6" />
            </Button>
            
            <div className="flex items-center justify-center mt-6 text-gray-400 text-sm">
              <CheckCircle className="h-4 w-4 mr-2 text-green-400" />
              No credit card required • Connect with Spotify in seconds
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-red-500/20 py-8 px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <div className="flex items-center space-x-3 mb-4 md:mb-0">
              <img 
                src={songfuseBrandDark} 
                alt="SongFuse" 
                className="h-6"
              />
            </div>
            <div className="flex items-center space-x-6">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setLocation("/terms")}
                className="text-gray-400 hover:text-white"
              >
                Terms of Service
              </Button>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setLocation("/discover")}
                className="text-gray-400 hover:text-white"
              >
                Discover
              </Button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default MarketingLanding;