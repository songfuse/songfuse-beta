/**
 * Utility function to reset all playlist storage
 * This ensures a consistent approach to clearing playlist state
 */
export const resetPlaylistStorage = () => {
  if (typeof window !== 'undefined') {
    // Clear all playlist-related storage
    localStorage.removeItem('songfuse-current-playlist');
    localStorage.removeItem('songfuse-generated-playlist');
    localStorage.removeItem('songfuse-playlist-id');
    localStorage.removeItem('songfuse-editing-playlist');
    localStorage.removeItem('songfuse_playlist_creator_state');
    console.log("Successfully reset all playlist storage.");
    
    return true;
  }
  return false;
};