# Spotify Playlist Import Feature

This feature allows users to import playlists from Spotify directly into Songfuse, automatically adding track, artist, and album information to the database.

## How It Works

### Backend Implementation

1. **SpotifyPlaylistImporter Service** (`server/services/spotifyPlaylistImporter.ts`)
   - Extracts playlist ID from various URL formats
   - Fetches playlist data from Spotify API
   - Creates or finds tracks, artists, and albums in the database
   - Links everything together with proper relationships

2. **API Endpoint** (`/api/spotify/import-playlist`)
   - Validates user authentication and Spotify connection
   - Handles token refresh if needed
   - Imports the playlist and returns success/error response

### Frontend Implementation

1. **SpotifyPlaylistImporter Component** (`client/src/components/SpotifyPlaylistImporter.tsx`)
   - Clean UI for entering Spotify playlist URLs
   - Validates URL formats
   - Shows import progress and results
   - Handles success/error states

2. **Integration Points**
   - Added to MyPlaylists page with toggle button
   - Added to FloatingPlaylistCreator as import mode
   - Triggers playlist list refresh after successful import

## Supported URL Formats

- `https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M`
- `spotify:playlist:37i9dQZF1DXcBWIGoYBM5M`
- `37i9dQZF1DXcBWIGoYBM5M` (playlist ID only)

## Database Schema

The feature uses the existing comprehensive database schema:

- **tracks**: Stores track information with audio features
- **artists**: Stores artist information
- **albums**: Stores album information with cover images
- **playlist_tracks**: Links playlists to tracks with position
- **track_platform_ids**: Links tracks to Spotify IDs
- **artist_platform_ids**: Links artists to Spotify IDs
- **album_platform_ids**: Links albums to Spotify IDs
- **tracks_to_artists**: Many-to-many relationship between tracks and artists
- **albums_to_artists**: Many-to-many relationship between albums and artists

## Features

- **Duplicate Prevention**: Checks if playlist already exists before importing
- **Smart Matching**: Finds existing tracks/artists/albums by name or Spotify ID
- **Relationship Management**: Properly links tracks to artists and albums
- **Error Handling**: Graceful handling of API errors and invalid URLs
- **Token Management**: Automatic token refresh when needed
- **Progress Feedback**: Real-time feedback during import process

## Usage

1. **From MyPlaylists Page**:
   - Click "Import from Spotify" button
   - Paste Spotify playlist URL
   - Click "Import Playlist"

2. **From Floating Creator**:
   - Click "Import" button in the creator header
   - Paste Spotify playlist URL
   - Click "Import Playlist"

## Error Handling

- Invalid URL format
- User not connected to Spotify
- Expired Spotify token (auto-refresh)
- Playlist already imported
- Network/API errors
- Invalid playlist ID

## Security

- Validates user ownership before importing
- Uses existing Spotify OAuth tokens
- No direct API key exposure
- Proper error messages without sensitive data

## Future Enhancements

- Batch import multiple playlists
- Import progress tracking for large playlists
- Preview playlist before importing
- Selective track import
- Playlist metadata editing during import
