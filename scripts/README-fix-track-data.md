# Fix Missing Track Data Script

This script finds tracks in the database with missing artist or album information and retrieves the missing data from Spotify API.

## What it does

The script identifies tracks that have:
- No artists associated (missing entries in `tracks_to_artists` table)
- No album information (`album_id` is null or album has no title)
- Missing track metadata (duration, popularity, etc.)

It then:
1. Fetches complete track data from Spotify API
2. Creates or updates artist records with names and images
3. Creates or updates album records with titles, cover images, and release dates
4. Links tracks to their artists and albums
5. Updates track metadata (duration, popularity, explicit flag, etc.)

## Prerequisites

1. **Environment Variables**: Make sure these are set in your `.env` file:
   ```
   DATABASE_URL=your_database_connection_string
   SPOTIFY_CLIENT_ID=your_spotify_client_id
   SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
   ```

2. **Spotify API Access**: The script uses Spotify's Client Credentials flow, so you need:
   - A Spotify Developer account
   - A registered app with Client ID and Client Secret
   - The app should have access to the Spotify Web API

## Usage

### Run the script:
```bash
npm run fix-track-data
```

### Or run directly with tsx:
```bash
tsx scripts/fix-missing-track-data.ts
```

## Features

- **Batch Processing**: Processes tracks in batches of 10 to avoid rate limiting
- **Rate Limiting**: Respects Spotify API rate limits with automatic retry
- **Error Handling**: Continues processing even if individual tracks fail
- **Progress Reporting**: Shows detailed progress and summary statistics
- **Upsert Logic**: Creates new records or updates existing ones as needed
- **Platform ID Management**: Properly manages Spotify platform IDs for tracks, artists, and albums

## Output

The script provides detailed console output including:
- Number of tracks found with missing data
- Progress through batches
- Individual track processing status
- Final summary with success/error counts

Example output:
```
🚀 Starting track data fix script...

🔑 Getting Spotify access token...
✅ Successfully obtained Spotify access token

🔍 Finding tracks with missing data...
📊 Found 25 tracks with missing data

📦 Processing batch 1/3 (10 tracks)

🎵 Processing track: "Song Title" (ID: 123)
👥 Adding 2 artist(s) to track
💿 Adding album "Album Name" to track
✅ Successfully updated track "Song Title"

📊 Summary:
   Total tracks processed: 25
   Tracks updated: 23
   Errors: 2
   Success rate: 92.0%

✅ Script completed!
```

## Database Changes

The script will:
- Insert new artists into the `artists` table
- Insert new albums into the `albums` table
- Create relationships in `tracks_to_artists` and `albums_to_artists` tables
- Update track metadata in the `tracks` table
- Add platform IDs to `artist_platform_ids`, `album_platform_ids`, and `track_platform_ids` tables

## Troubleshooting

### Common Issues:

1. **"No Spotify ID for track"**: Some tracks don't have Spotify IDs and can't be updated
2. **"Track not found on Spotify"**: The Spotify ID exists but the track is no longer available
3. **Rate limiting**: The script handles this automatically with delays
4. **Database connection errors**: Check your `DATABASE_URL` environment variable

### Rate Limiting:
The script includes built-in rate limiting protection:
- 100ms delay between individual track requests
- 2 second delay between batches
- Automatic retry with exponential backoff for 429 errors

## Safety

- The script only adds/updates data, it doesn't delete anything
- Uses `onConflictDoNothing()` and `onConflictDoUpdate()` to handle duplicates safely
- Processes tracks in batches to avoid overwhelming the database
- Includes comprehensive error handling and logging
