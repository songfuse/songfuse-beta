/**
 * This script runs the genre update process from the command line
 */
import { updateTrackGenres } from "./scripts/update-track-genres";

console.log("Starting track genre update process...");
updateTrackGenres()
  .then(() => {
    console.log("Genre update process completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error in genre update process:", error);
    process.exit(1);
  });