# SongFuse - AI-Powered Music Discovery Platform

## Overview
SongFuse is an AI-powered music playlist generator that creates personalized playlists from natural language prompts. It uses AI for music curation and generates AI-powered cover images. The platform supports multi-platform music service integration, leverages vector embeddings for enhanced song matching, and includes social sharing capabilities and WhatsApp integration for conversational playlist creation.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Backend
- **Framework**: Node.js with Express.js
- **Database**: PostgreSQL with pgvector (for vector embeddings)
- **ORM**: Drizzle ORM
- **AI Integration**: OpenAI GPT-4 (playlist generation), DALL-E (cover images)
- **Music Platform Integration**: Spotify API (OAuth2)
- **Database Pool**: Supabase PostgreSQL with pgvector extensions

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS, shadcn/ui (Radix UI)
- **State Management**: TanStack Query
- **Forms**: React Hook Form with Zod validation

### Data Storage
- **Primary Database**: PostgreSQL (similarity searches)
- **File Storage**: Supabase (for generated cover images)
- **Session Management**: In-memory for playlist generation
- **Caching**: Query-level via TanStack Query

### Core Features
- **Playlist Generation**: AI-powered track selection using OpenAI embeddings and Spotify search.
- **Cover Images**: AI-generated using DALL-E, with background processing.
- **Smart Links**: Social media optimized sharing.
- **Track Data Pipeline**: Automated import, vector embedding generation, and multi-platform track resolution.
- **WhatsApp Integration**: Meta WhatsApp Business API for conversational playlist creation, including stateful conversation tracking.
- **Authentication**: Spotify OAuth for user authentication and persistent user sessions; supports anonymous usage.

### Data Flow
- **Playlist Creation**: User prompt -> OpenAI Assistant API -> Local database vector search -> Spotify API fallback -> Playlist creation -> Background cover image generation -> Smart link generation.
- **Track Data Processing**: Raw track import -> OpenAI text-embedding-ada-002 vector embeddings -> Metadata normalization and storage -> Artist/album relationships -> Audio feature extraction.
- **WhatsApp Bot**: Message reception -> Session management -> NLP for intent -> Playlist generation -> Formatted response for WhatsApp.

### Deployment & Maintenance
- **Development**: Vite hot reload, direct Neon DB connection, TSX.
- **Production**: Vite build optimization, ESBuild server compilation, static asset serving.
- **Migrations**: TypeScript migration scripts, automated data transformation.
- **Monitoring**: Automated database cleanup, continuous embedding generation, performance monitoring.

## External Dependencies

### AI Services
- **OpenAI API**: GPT-4 (text processing), DALL-E (image generation), text embeddings, Assistant API (structured playlist generation).

### Music Services
- **Spotify Web API**: Track search, metadata retrieval, OAuth authentication.
- **Apple Music RSS**: For Top 25 Albums integration.

### Communication
- **Meta WhatsApp Business API**: Webhook-based messaging integration.

### Infrastructure
- **Supabase Database**: Managed PostgreSQL with pgvector extensions and connection pooling.
- **Supabase Storage**: Cloud storage for generated assets (cover images, thumbnails).