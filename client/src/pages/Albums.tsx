import React from "react";
import Layout from "../components/Layout";
import { useQuery } from "@tanstack/react-query";
import { usePlaylistCreator } from "@/contexts/PlaylistCreatorContext";
import Top25Albums from "@/components/Top25Albums";

const Albums = () => {
  const { openCreator } = usePlaylistCreator();
  
  // Fetch playlists for the layout
  const { data: playlists = [] } = useQuery<Array<{id: string; title: string; coverImage?: string}>>({
    queryKey: ['/api/playlists-with-counts'],
  });

  const handleCreatePlaylistFromAlbum = (prompt: string, albumData?: {title: string, artist: string, genre: string}) => {
    openCreator(prompt, undefined, albumData);
  };

  return (
    <Layout playlists={playlists}>
      <div className="container px-2 py-4 max-w-6xl">
        <div className="mb-4">
          <h1 className="font-bold mb-2 bg-gradient-to-r from-teal-400 to-[#1DB954] text-transparent bg-clip-text text-[40px]">
            Top 25 Albums
          </h1>
          <p className="text-foreground/70 text-lg">
            Discover trending albums and create playlists inspired by them
          </p>
        </div>
        
        <div className="w-full">
          <Top25Albums onCreatePlaylist={handleCreatePlaylistFromAlbum} />
        </div>
      </div>
    </Layout>
  );
};

export default Albums;