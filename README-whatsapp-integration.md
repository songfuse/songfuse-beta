# WhatsApp Integration for SongFuse

SongFuse now supports creating playlists directly from WhatsApp messages! Users can send natural language requests to your WhatsApp Business number and receive custom playlists with smart links.

## Features

- **Natural Language Processing**: Users can describe their mood, genre preferences, or specific requests
- **Intelligent Track Matching**: AI finds the best matching tracks from your database
- **Automatic Playlist Creation**: Generates playlists with titles, descriptions, and cover images
- **Smart Link Generation**: Creates shareable links with social media previews
- **Conversation Flow**: Guided interaction for better playlist customization

## Setup Requirements

### 1. WhatsApp Business API Setup

You'll need:
- A Meta Business Account
- WhatsApp Business API access
- A phone number verified with WhatsApp Business

### 2. Environment Variables

Add these to your `.env` file:

```env
# WhatsApp Business API Configuration
WHATSAPP_ACCESS_TOKEN=your_whatsapp_access_token
WHATSAPP_VERIFY_TOKEN=your_custom_verify_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id

# OpenAI API for playlist generation
OPENAI_API_KEY=your_openai_api_key
```

### 3. Webhook Configuration

Configure your webhook URL in the Meta Developer Console:

**Webhook URL**: `https://your-domain.com/api/whatsapp/webhook`
**Verify Token**: Use the same value as `WHATSAPP_VERIFY_TOKEN`

Subscribe to these webhook fields:
- `messages`
- `message_deliveries`
- `message_reads`

## How It Works

### User Flow

1. **User sends message**: "Create a playlist for studying with chill electronic music"
2. **AI processes request**: Analyzes the request and generates song recommendations
3. **Track matching**: Finds matching tracks in the SongFuse database
4. **Playlist creation**: Creates a playlist with title, description, and cover image
5. **Smart link sharing**: Sends back a shareable link with preview

### Example Conversations

**User**: "I need a workout playlist with high energy rock songs"
**SongFuse**: "🎵 Great! I'm creating your high-energy rock workout playlist. Give me a moment to find the perfect tracks..."
**SongFuse**: "✅ Your playlist 'Power Rock Workout' is ready! 🏋️‍♂️ Check it out: https://songfuse.app/share/abc123"

**User**: "Make me a sad playlist for rainy days"
**SongFuse**: "🎵 Creating a melancholic playlist perfect for rainy day vibes..."
**SongFuse**: "✅ Your playlist 'Rainy Day Reflections' is ready! ☔ Listen here: https://songfuse.app/share/def456"

## API Endpoints

### WhatsApp Webhook Endpoints

- `GET /api/whatsapp/webhook` - Webhook verification
- `POST /api/whatsapp/webhook` - Receive WhatsApp messages
- `GET /api/whatsapp/status` - Check integration status
- `POST /api/whatsapp/test-message` - Send test messages

### Testing the Integration

1. **Check Status**:
   ```bash
   curl http://localhost:3000/api/whatsapp/status
   ```

2. **Send Test Message**:
   ```bash
   curl -X POST http://localhost:3000/api/whatsapp/test-message \
     -H "Content-Type: application/json" \
     -d '{"phoneNumber": "+1234567890", "message": "Test message"}'
   ```

## Database Schema

The integration adds three new tables:

### whatsapp_messages
Stores all incoming and outgoing messages:
- `message_id` - Unique WhatsApp message ID
- `from_number` - Sender's phone number
- `to_number` - Recipient's phone number
- `content` - Message content
- `timestamp` - When message was sent
- `playlist_id` - Associated playlist (if created)

### whatsapp_sessions
Tracks conversation state:
- `session_id` - Unique session identifier
- `phone_number` - User's phone number
- `current_step` - Current conversation state
- `conversation_data` - JSON data for context
- `last_interaction` - Last activity timestamp

### whatsapp_config
Stores WhatsApp Business API configuration:
- `business_phone_number_id` - WhatsApp Business phone number ID
- `access_token` - API access token
- `webhook_verify_token` - Webhook verification token

## Troubleshooting

### Common Issues

1. **Webhook not receiving messages**
   - Verify webhook URL is publicly accessible
   - Check that verify token matches
   - Ensure HTTPS is enabled

2. **Authentication errors**
   - Verify WhatsApp access token is valid
   - Check phone number ID is correct
   - Ensure proper permissions in Meta Business Account

3. **Playlist creation fails**
   - Verify OpenAI API key is set
   - Check database has tracks for matching
   - Review server logs for specific errors

### Logs and Monitoring

Monitor WhatsApp integration through:
- Server console logs
- Database `whatsapp_messages` table
- `/api/whatsapp/status` endpoint

## Security Considerations

- Store access tokens securely as environment variables
- Validate all incoming webhook requests
- Implement rate limiting for message processing
- Monitor for unusual activity patterns

## Development and Testing

For development, you can use ngrok to expose your local server:

```bash
ngrok http 3000
```

Then use the ngrok URL for your webhook configuration.

## Support

For WhatsApp Business API support:
- [Meta for Developers Documentation](https://developers.facebook.com/docs/whatsapp)
- [WhatsApp Business API Guide](https://developers.facebook.com/docs/whatsapp/getting-started)

For SongFuse integration support, check the server logs and database records for debugging information.