import { motion } from "framer-motion";
import Layout from "@/components/Layout";
import MetricsDashboard from "@/components/MetricsDashboard";
import MetaTags from "@/components/MetaTags";

export default function Homepage() {
  return (
    <Layout>
      <MetaTags 
        title="Homepage - SongFuse"
        description="Your personalized SongFuse dashboard with analytics and insights"
      />
      
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <h1 className="font-bold mb-4 bg-gradient-to-r from-teal-400 to-[#1DB954] text-transparent bg-clip-text text-2xl md:text-3xl lg:text-[40px] leading-normal py-1">
            Welcome to SongFuse
          </h1>
          <p className="text-foreground/70 text-lg max-w-2xl">
            Your AI-powered music discovery platform. Explore analytics, track performance, and dive into the world of personalized playlists.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <MetricsDashboard />
        </motion.div>
      </div>
    </Layout>
  );
}