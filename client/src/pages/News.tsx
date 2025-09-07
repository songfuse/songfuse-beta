import React from "react";
import Layout from "../components/Layout";
import { useQuery } from "@tanstack/react-query";
import { usePlaylistCreator } from "@/contexts/PlaylistCreatorContext";
import MusicNewsFeed from "@/components/MusicNewsFeed";

const News = () => {
  const { openCreator } = usePlaylistCreator();
  
  // Fetch playlists for the layout
  const { data: playlists = [] } = useQuery<Array<{id: string; title: string; coverImage?: string}>>({
    queryKey: ['/api/playlists-with-counts'],
  });

  const handleCreatePlaylistFromNews = (prompt: string, articleData?: {title: string, link: string}) => {
    openCreator(prompt, articleData);
  };

  return (
    <Layout playlists={playlists}>
      <div className="container px-2 py-4 max-w-6xl">
        <div className="mb-8">
          <h1 className="font-bold mb-2 bg-gradient-to-r from-teal-400 to-[#1DB954] text-transparent bg-clip-text text-[40px]">
            Latest News
          </h1>
          <p className="text-foreground/70 text-lg">
            Stay updated with the latest music news and create playlists inspired by them
          </p>
        </div>
        
        <div className="w-full">
          <MusicNewsFeed onCreatePlaylist={handleCreatePlaylistFromNews} />
        </div>
      </div>
    </Layout>
  );
};

export default News;