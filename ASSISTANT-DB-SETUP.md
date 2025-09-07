# Database-Enabled AI Assistant Setup

This document explains how to set up and use the new database-enabled AI assistant that provides direct access to your Songfuse database instead of relying on static JSON files.

## Overview

The new system replaces the static Knowledge JSON files with direct database access through OpenAI Function Calling. This provides:

- **Real-time data access** - Always up-to-date with your database
- **Advanced search capabilities** - Vector similarity, genre filtering, audio features
- **Better performance** - No need to maintain static JSON files
- **More accurate results** - Direct access to all track metadata

## Architecture

```
User Request → API Endpoint → OpenAI Assistant → Database Functions → PostgreSQL
     ↓              ↓              ↓                    ↓
  Prompt      /db-assistant    Function Calls    Track Results
```

## Setup Instructions

### 1. Create the Assistant

Run the setup script to create a new OpenAI Assistant with database access:

```bash
npm run setup-db-assistant
```

This will output an Assistant ID that you need to add to your environment variables.

### 2. Set Environment Variable

Add the Assistant ID to your environment variables:

```bash
export OPENAI_ASSISTANT_ID_DB=asst_xxxxxxxxxxxxxxxxxxxxx
```

Or add it to your `.env` file:
```
OPENAI_ASSISTANT_ID_DB=asst_xxxxxxxxxxxxxxxxxxxxx
```

### 3. Test the Assistant

Test the new assistant with various prompts:

```bash
npm run test-db-assistant
```

## API Usage

### New Endpoint

Use the new database-enabled endpoint:

```bash
POST /_songfuse_api/playlist/db-assistant
```

**Request Body:**
```json
{
  "prompt": "Create a happy summer playlist with upbeat songs",
  "userId": 123,
  "sessionId": "optional-session-id"
}
```

**Response:**
```json
{
  "success": true,
  "songs": ["id1", "id2", "id3", ...],
  "message": "Playlist generated successfully using database access",
  "sessionId": "generated-session-id"
}
```

### Direct Function Usage

You can also use the assistant directly in your code:

```typescript
import { generatePlaylistWithDBAssistant } from './server/services/assistant-with-db';

const result = await generatePlaylistWithDBAssistant({
  prompt: "Create a rock playlist from the 2000s",
  assistantId: process.env.OPENAI_ASSISTANT_ID_DB
});

if (result.success) {
  console.log('Generated songs:', result.songs);
}
```

## Available Database Functions

The assistant has access to these database functions:

### 1. `searchTracksByText(query, limit, avoidExplicit)`
- **Purpose**: Search tracks using text queries with vector similarity
- **Example**: "happy summer dance music"
- **Returns**: Array of tracks matching the semantic meaning

### 2. `searchTracksByCriteria(params)`
- **Purpose**: Search tracks by specific criteria
- **Parameters**:
  - `genre`: Genre name
  - `artist`: Artist name
  - `minTempo`/`maxTempo`: BPM range
  - `minEnergy`/`maxEnergy`: Energy level (0-100)
  - `minValence`/`maxValence`: Positivity level (0-100)
  - `minDanceability`/`maxDanceability`: Danceability (0-100)
  - `yearFrom`/`yearTo`: Release year range
  - `avoidExplicit`: Filter explicit content

### 3. `searchTracksByGenre(genreName, limit)`
- **Purpose**: Search tracks by specific genre
- **Example**: "rock", "electronic", "jazz"

### 4. `searchTracksByArtist(artistName, limit)`
- **Purpose**: Search tracks by specific artist
- **Example**: "The Beatles", "Daft Punk"

### 5. `getAllGenres()`
- **Purpose**: Get all available genres in the database
- **Returns**: Array of genre names

### 6. `getAllArtists()`
- **Purpose**: Get all available artists in the database
- **Returns**: Array of artist names

### 7. `getRandomTracks(limit, avoidExplicit)`
- **Purpose**: Get random tracks for playlist generation
- **Use case**: Fallback when specific searches don't yield enough results

### 8. `getTrackStatistics()`
- **Purpose**: Get database statistics
- **Returns**: Total tracks, artists, genres, and audio feature averages

## Migration from Static JSON

### Before (Static JSON)
```typescript
// Old approach - limited to static data
const assistant = new OpenAI.Assistant({
  instructions: "Use only songs from the Knowledge JSON files...",
  // Limited to pre-generated static data
});
```

### After (Database Access)
```typescript
// New approach - real-time database access
const assistant = new OpenAI.Assistant({
  instructions: "Use songs from the Songfuse database via function calls...",
  tools: [
    { type: "function", function: searchTracksByText },
    { type: "function", function: searchTracksByCriteria },
    // ... more database functions
  ]
});
```

## Benefits

### 1. **Real-time Data**
- Always uses the latest tracks in your database
- No need to regenerate JSON files when adding new music
- Automatic updates when database changes

### 2. **Advanced Search**
- Vector similarity search for semantic matching
- Audio feature filtering (tempo, energy, valence, etc.)
- Genre and artist-specific searches
- Year range filtering

### 3. **Better Performance**
- No large JSON files to load
- Efficient database queries
- Cached embeddings for fast similarity search

### 4. **More Accurate Results**
- Access to all track metadata
- Audio features for better matching
- Popularity scores for ranking
- Release date information

## Troubleshooting

### Common Issues

1. **Assistant ID not set**
   ```
   Error: No assistant ID provided and OPENAI_ASSISTANT_ID_DB environment variable is not set
   ```
   **Solution**: Run `npm run setup-db-assistant` and set the environment variable

2. **Database connection errors**
   ```
   Error: Database connection failed
   ```
   **Solution**: Check your database configuration and ensure the server is running

3. **Function call errors**
   ```
   Error: Unknown function: functionName
   ```
   **Solution**: Ensure all database functions are properly exported and accessible

### Debug Mode

Enable debug logging by setting:
```bash
export DEBUG=assistant-db:*
```

## Performance Considerations

- **Database queries** are optimized with proper indexing
- **Vector similarity** uses cached embeddings
- **Function calls** are batched for efficiency
- **Results** are limited to prevent memory issues

## Security

- Database access is restricted to read-only operations
- No sensitive data is exposed through function calls
- All queries are parameterized to prevent SQL injection
- API keys are properly managed through environment variables

## Next Steps

1. **Set up the assistant** using the provided scripts
2. **Test with various prompts** to ensure it works correctly
3. **Update your frontend** to use the new `/db-assistant` endpoint
4. **Monitor performance** and adjust as needed
5. **Consider adding more specialized functions** for specific use cases

## Support

If you encounter any issues:

1. Check the logs for error messages
2. Verify environment variables are set correctly
3. Test database connectivity
4. Review the function call parameters
5. Check OpenAI API key permissions

The new system provides much more flexibility and accuracy than the static JSON approach while maintaining the same simple API interface.
