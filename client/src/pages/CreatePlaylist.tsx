import React, { useEffect } from "react";
import Layout from "../components/Layout";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { usePlaylistCreator } from "@/contexts/PlaylistCreatorContext";
import { Button } from "@/components/ui/button";
import { Music, Plus } from "lucide-react";
import MusicNewsFeed from "@/components/MusicNewsFeed";

const CreatePlaylist = () => {
  const { user } = useAuth();
  const { isOpen, openCreator } = usePlaylistCreator();
  
  // Fetch user's playlists for the sidebar
  const { data: playlists = [] } = useQuery({
    queryKey: ['/api/v2/playlists', user?.id],
    queryFn: async () => {
      // Try v2 endpoint first, fall back to original if needed
      try {
        console.log("Making GET request to /api/v2/playlists?userId=" + user?.id + " with headers:", {
          "Accept": "application/json"
        });
        const response = await apiRequest('GET', `/api/v2/playlists?userId=${user?.id}`, {
          headers: {
            "Accept": "application/json"
          }
        });
        return response.json();
      } catch (v2Error) {
        console.warn("Error with v2 endpoint, falling back to original:", v2Error);
        const response = await apiRequest('GET', `/api/playlists?userId=${user?.id}`);
        return response.json();
      }
    },
    enabled: !!user,
  });

  // Auto-open the creator when navigating to this page, but only if it's not already open
  useEffect(() => {
    // Check if the creator is already open from localStorage state
    if (!isOpen) {
      console.log("Opening playlist creator from CreatePlaylist page");
      openCreator();
    } else {
      console.log("Playlist creator already open, not reopening");
    }
  }, [isOpen, openCreator]);

  return (
    <Layout playlists={playlists}>
      <div className="container px-2 py-4 max-w-6xl">
        <div className="flex flex-col items-center justify-center h-full">
          <div className="max-w-2xl w-full text-center">
            
            {/* Empty page for now */}
            <div className="text-center py-12">
              <h1 className="font-bold mb-2 bg-gradient-to-r from-teal-400 to-[#1DB954] text-transparent bg-clip-text text-[40px]">
                Create Your Playlist
              </h1>
              <p className="text-foreground/70 text-lg mb-8">
                Ready to discover your next favorite playlist? Use the floating creator button to get started.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default CreatePlaylist;
