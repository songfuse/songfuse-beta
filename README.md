# SongFuse - AI-Powered Music Discovery Platform

## Overview
SongFuse is an AI-powered music playlist generator that enables users to create, modify, and save playlists. The application leverages OpenAI's GPT-4 to generate playlist suggestions based on natural language prompts, and supports multiple music platforms including Spotify, Deezer, Amazon Music, Apple Music, Tidal, and YouTube through a custom multi-platform tracks database.

## Features
- AI-generated playlists based on natural language prompts
- AI-generated cover images for playlists
- Multi-platform support for popular music services
- Vector embeddings for improved song matching and recommendation
- Song playback preview
- Playlist management (create, edit, delete)
- Track replacement suggestions
- Social sharing capabilities
- Public playlist discovery

## Project Structure

### Backend
- Node.js Express server
- PostgreSQL database with pgvector extension for vector embeddings
- OpenAI integration for AI-powered features
- Spotify OAuth authentication

### Frontend
- React with TypeScript
- Tailwind CSS for styling
- shadcn/ui component library

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL database with pgvector extension
- OpenAI API key
- Spotify API credentials

### Installation
1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables (see below)
4. Start the development server: `npm run dev`

### Environment Variables
- `OPENAI_API_KEY`: Your OpenAI API key
- `SPOTIFY_CLIENT_ID`: Your Spotify client ID
- `SPOTIFY_CLIENT_SECRET`: Your Spotify client secret
- `SPOTIFY_REDIRECT_URI`: The redirect URI for Spotify OAuth
- `DATABASE_URL`: PostgreSQL connection string

## Background Embedding Process

SongFuse uses vector embeddings to improve playlist recommendations. To generate these embeddings, a background process is provided that can run continuously to process tracks in batches.

### Starting the Process

To start the background embedding process, you can either:

1. Use the API endpoint:
   ```
   POST /api/embeddings/start
   ```
   This will return a task ID that can be used to check the status.

2. Run the script directly:
   ```
   ./run-background-embeddings.sh
   ```

### Checking Status

To check the status of a running embedding process:

```
GET /api/embeddings/status/:taskId
```

To get a list of all background tasks:

```
GET /api/embeddings/tasks
```

### Stopping the Process

To stop a running embedding process:

```
POST /api/embeddings/stop/:taskId
```

## Making API Requests

### Generate a Playlist

```
POST /api/chat/generate
Content-Type: application/json

{
  "userId": 1,
  "sessionId": "session-123",
  "message": "Create a playlist of upbeat 80s rock songs"
}
```

### Save a Playlist

```
POST /api/playlist/save
Content-Type: application/json

{
  "userId": 1,
  "title": "My 80s Rock Playlist",
  "description": "A collection of upbeat 80s rock tracks",
  "tracks": [...],
  "coverImageUrl": "..."
}
```

## Future Enhancements

- Improve vector embeddings coverage for all tracks
- Add more music platforms integration
- Implement user preferences learning based on listening history
- Add collaborative playlist creation features
- Enhance AI-generated playlist descriptions with music theory insights
- Implement playlist themes and moods classification
