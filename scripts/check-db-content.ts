import { config } from 'dotenv';

// Load environment variables FIRST
config();

async function checkDatabaseContent() {
  console.log('🔍 Checking database content...\n');
  
  try {
    // Import after dotenv config
    const { db } = await import("../server/db");
    const { tracks, tracksToArtists, artists, tracksToGenres, genres } = await import("@shared/schema");
    const { count, sql, eq, like, or } = await import("drizzle-orm");
    
    console.log('✅ Database imported successfully');
    
    // Check genres
    console.log('\n🎼 Available genres:');
    const genreResult = await db
      .select({
        name: genres.name,
        count: sql`count(*)`
      })
      .from(genres)
      .leftJoin(tracksToGenres, eq(genres.id, tracksToGenres.genreId))
      .groupBy(genres.name)
      .orderBy(sql`count(*) DESC`)
      .limit(20);
    
    genreResult.forEach(genre => {
      console.log(`  - ${genre.name}: ${genre.count} tracks`);
    });
    
    // Check artists
    console.log('\n🎤 Available artists (top 20):');
    const artistResult = await db
      .select({
        name: artists.name,
        count: sql`count(*)`
      })
      .from(artists)
      .leftJoin(tracksToArtists, eq(artists.id, tracksToArtists.artistId))
      .groupBy(artists.name)
      .orderBy(sql`count(*) DESC`)
      .limit(20);
    
    artistResult.forEach(artist => {
      console.log(`  - ${artist.name}: ${artist.count} tracks`);
    });
    
    // Check if we have tracks with "rock" in title or artist
    console.log('\n🔍 Searching for "rock" in tracks:');
    const rockTracks = await db
      .select({
        id: tracks.id,
        title: tracks.title,
        artist_names: sql<string[]>`array_agg(DISTINCT ${artists.name})`
      })
      .from(tracks)
      .leftJoin(tracksToArtists, eq(tracks.id, tracksToArtists.trackId))
      .leftJoin(artists, eq(tracksToArtists.artistId, artists.id))
      .where(
        or(
          like(tracks.title, '%rock%'),
          like(artists.name, '%rock%')
        )
      )
      .groupBy(tracks.id)
      .limit(10);
    
    console.log(`Found ${rockTracks.length} tracks with "rock":`);
    rockTracks.forEach(track => {
      console.log(`  - ${track.title} by ${track.artist_names.join(', ')}`);
    });
    
  } catch (error) {
    console.error('❌ Database error:', error);
  }
}

checkDatabaseContent().catch(console.error);
