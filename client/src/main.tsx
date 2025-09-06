import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import App from "./App";
import "./index.css";
import { resetPlaylistStorage } from "./lib/resetPlaylistStorage";

// Reset local storage for any previously saved playlists
// This ensures a clean state after database cleanup
resetPlaylistStorage();

createRoot(document.getElementById("root")!).render(
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
    <App />
  </ThemeProvider>
);
