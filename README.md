# SongFuse - AI-Powered Music Discovery Platform

## Overview
SongFuse is an AI-powered music playlist generator that enables users to create, modify, and save playlists through multiple interfaces. The application leverages OpenAI's GPT-4 and DALL-E for playlist generation and cover image creation, supports multiple music platforms, and includes advanced features like vector embeddings, WhatsApp integration, and Spotify playlist importing.

## Features
- **AI-Powered Playlist Generation**: Create playlists from natural language prompts using OpenAI GPT-4
- **AI-Generated Cover Images**: Automatic playlist cover generation using DALL-E
- **Multi-Platform Support**: Integration with Spotify, Apple Music, and other major music services
- **Vector Embeddings**: Advanced song matching and recommendation using pgvector
- **WhatsApp Integration**: Create playlists directly through WhatsApp messages
- **Spotify Playlist Import**: Import existing playlists from Spotify
- **Smart Links**: Social media optimized sharing with preview cards
- **Playlist Management**: Create, edit, delete, and organize playlists
- **Track Replacement**: AI-powered track replacement suggestions
- **Public Discovery**: Browse and discover public playlists
- **Responsive Design**: Modern UI with dark/light theme support

## Project Structure

### Backend
- **Framework**: Node.js with Express.js
- **Database**: PostgreSQL with pgvector extension for vector embeddings
- **ORM**: Drizzle ORM for database operations
- **AI Integration**: OpenAI GPT-4 (playlist generation), DALL-E (cover images), text embeddings
- **Authentication**: Spotify OAuth2 for user authentication
- **Storage**: Supabase for database and file storage
- **APIs**: WhatsApp Business API, Spotify Web API, Apple Music RSS

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and building
- **Styling**: Tailwind CSS with custom design system
- **UI Components**: shadcn/ui (Radix UI) with custom theming
- **State Management**: TanStack Query for server state
- **Forms**: React Hook Form with Zod validation

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL database with pgvector extension (or Supabase)
- OpenAI API key
- Spotify API credentials (optional for full functionality)
- WhatsApp Business API credentials (optional for WhatsApp integration)

### Installation
1. Clone the repository: `git clone https://github.com/yourusername/songfuse-beta.git`
2. Install dependencies: `npm install`
3. Set up environment variables (see below)
4. Run database migrations: `npm run db:migrate`
5. Start the development server: `npm run dev`

### Environment Variables
Create a `.env` file in the root directory with the following variables:

```env
# Database
DATABASE_URL=your_postgresql_connection_string

# OpenAI
OPENAI_API_KEY=your_openai_api_key

# Spotify (optional)
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=http://localhost:3000/api/auth/callback

# WhatsApp (optional)
WHATSAPP_ACCESS_TOKEN=your_whatsapp_access_token
WHATSAPP_VERIFY_TOKEN=your_verify_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id

# Supabase (if using Supabase)
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

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

## Key Features in Detail

### AI-Powered Playlist Generation
- Natural language processing for playlist requests
- Vector similarity search for track matching
- Contextual track selection based on mood, genre, and style
- Automatic playlist naming and description generation

### WhatsApp Integration
- Create playlists through WhatsApp messages
- Conversational playlist creation with context awareness
- Automatic smart link generation for sharing
- Session management for multi-step interactions

### Spotify Integration
- OAuth2 authentication for user accounts
- Playlist import from existing Spotify playlists
- Track metadata and audio features extraction
- Seamless integration with Spotify's music catalog

### Vector Embeddings System
- OpenAI text-embedding-ada-002 for track embeddings
- pgvector for efficient similarity searches
- Background processing for embedding generation
- Continuous improvement of recommendation accuracy

## Development

### Available Scripts
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run db:migrate` - Run database migrations
- `npm run db:generate` - Generate new migration files

### Project Structure
```
├── client/          # React frontend
├── server/          # Node.js backend
├── shared/          # Shared types and schemas
├── migrations/      # Database migrations
└── scripts/         # Utility scripts
```

## Documentation

- [Style Guide](STYLE-GUIDE.md) - Design system and UI guidelines
- [Spotify Setup](SPOTIFY-SERVICE-SETUP.md) - Spotify service account configuration
- [Spotify Import](SPOTIFY-IMPORT-GUIDE.md) - Playlist import feature documentation
- [WhatsApp Setup](WHATSAPP-SETUP-GUIDE.md) - WhatsApp Business API configuration

## Future Enhancements

- Enhanced vector embeddings coverage for all tracks
- Additional music platform integrations (Apple Music, Tidal, etc.)
- User preference learning based on listening history
- Collaborative playlist creation features
- Advanced AI-generated playlist descriptions with music theory insights
- Playlist themes and moods classification
- Real-time playlist collaboration
- Mobile app development
