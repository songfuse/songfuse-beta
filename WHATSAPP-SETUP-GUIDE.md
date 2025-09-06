# WhatsApp Business API Setup Guide

## Step 1: Meta Developer Setup

### Create Meta App
1. Go to https://developers.facebook.com/
2. Click "Create App" → Choose "Business"
3. Fill in app details:
   - App name: "SongFuse Playlist Bot"
   - Contact email: your email
   - Business account: select your business

### Add WhatsApp to Your App
1. In your app dashboard, click "Add Product"
2. Find "WhatsApp" and click "Set Up"
3. You'll get access to WhatsApp Business API

## Step 2: Get Your Credentials

### Phone Number ID
1. In WhatsApp → Getting Started
2. Copy the "Phone number ID" (looks like: 1234567890123456)

### Access Token
1. In WhatsApp → Getting Started
2. Copy the "Temporary access token"
3. For production, you'll need to generate a permanent token

### Create Verify Token
1. Create a random string (e.g., "songfuse_webhook_2024")
2. This is your custom verification token

## Step 3: Configure Your Environment

Add these to your `.env` file:

```env
WHATSAPP_ACCESS_TOKEN=your_temporary_access_token_here
WHATSAPP_VERIFY_TOKEN=songfuse_webhook_2024
WHATSAPP_PHONE_NUMBER_ID=1234567890123456
OPENAI_API_KEY=your_openai_key_here
```

## Step 4: Set Up Webhook

### Configure Webhook URL
1. In WhatsApp → Configuration
2. Set Webhook URL: `https://your-domain.com/api/whatsapp/webhook`
3. Set Verify Token: `songfuse_webhook_2024` (same as in .env)
4. Click "Verify and Save"

### Subscribe to Webhook Fields
Check these boxes:
- ✅ messages
- ✅ message_deliveries  
- ✅ message_reads

## Step 5: Test the Integration

### Send Test Message via API
```bash
curl -X POST "https://graph.facebook.com/v18.0/YOUR_PHONE_NUMBER_ID/messages" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "YOUR_TEST_NUMBER",
    "type": "text",
    "text": {"body": "Hello! SongFuse playlist bot is now active 🎵"}
  }'
```

### Test User Experience
1. Save your WhatsApp Business number in contacts
2. Send message: "Create a chill playlist for studying"
3. Bot should respond with playlist creation process

## Step 6: Production Setup

### Get Permanent Access Token
1. In App Dashboard → App Settings → Basic
2. Note your App ID and App Secret
3. Generate long-lived access token:

```bash
curl -X GET "https://graph.facebook.com/v18.0/oauth/access_token?grant_type=client_credentials&client_id=YOUR_APP_ID&client_secret=YOUR_APP_SECRET"
```

### Verify Your Business
1. Complete Meta Business Verification
2. Submit for WhatsApp Business API review
3. Provide business documentation

### Add Your Phone Number
1. In WhatsApp → Phone Numbers
2. Click "Add Phone Number"
3. Follow verification process for your business number

## Common Issues & Solutions

### Webhook Not Working
- Check webhook URL is publicly accessible (use ngrok for testing)
- Verify SSL certificate is valid
- Ensure verify token matches exactly

### Messages Not Sending
- Check access token hasn't expired
- Verify phone number ID is correct
- User must message you first (WhatsApp policy)

### Rate Limiting
- Free tier: 1,000 conversations/month
- Each user conversation = 24-hour window
- Upgrade to paid tier for higher limits

## Testing Commands

### Check Integration Status
```bash
curl http://your-domain.com/api/whatsapp/status
```

### Send Test Message
```bash
curl -X POST http://your-domain.com/api/whatsapp/test-message \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+1234567890", "message": "Test playlist creation"}'
```

## User Instructions

Share this with your users:

**How to Create Playlists via WhatsApp:**

1. Save this number: +1-XXX-XXX-XXXX
2. Send a message describing your playlist:
   - "Create a workout playlist"
   - "I want sad songs for rainy days"
   - "Make me a party playlist with 90s hits"
3. Wait for your custom playlist link!

**Example Requests:**
- "Create energetic music for running"
- "I need focus music for work"
- "Make a romantic dinner playlist"
- "Generate 80s rock songs"