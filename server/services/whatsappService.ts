import { Request, Response } from "express";
import crypto from "crypto";
import fetch from "node-fetch";
import { storage } from "../storage";
import * as openai from "../openai";
import { 
  WhatsAppWebhookMessage, 
  WhatsAppSendMessageRequest,
  InsertWhatsAppMessage,
  InsertWhatsAppSession
} from "../../shared/whatsapp-schema";

export class WhatsAppService {
  private accessToken: string;
  private verifyToken: string;
  private phoneNumberId: string;
  private baseUrl = "https://graph.facebook.com/v18.0";

  constructor(accessToken: string, verifyToken: string, phoneNumberId: string) {
    this.accessToken = accessToken;
    this.verifyToken = verifyToken;
    this.phoneNumberId = phoneNumberId;
  }

  /**
   * Verify webhook challenge from Meta
   */
  verifyWebhook(req: Request, res: Response): void {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === this.verifyToken) {
      console.log("WhatsApp webhook verified successfully");
      res.status(200).send(challenge);
    } else {
      console.log("WhatsApp webhook verification failed");
      res.status(403).send("Forbidden");
    }
  }

  /**
   * Handle incoming WhatsApp webhook messages
   */
  async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      const body: WhatsAppWebhookMessage = req.body;
      console.log("Received WhatsApp webhook:", JSON.stringify(body, null, 2));

      // Acknowledge receipt immediately
      res.status(200).send("OK");

      // Process message asynchronously
      await this.processIncomingMessage(body);
    } catch (error) {
      console.error("Error handling WhatsApp webhook:", error);
      res.status(500).send("Internal Server Error");
    }
  }

  /**
   * Process incoming WhatsApp message
   */
  private async processIncomingMessage(webhook: WhatsAppWebhookMessage): Promise<void> {
    for (const entry of webhook.entry) {
      for (const change of entry.changes) {
        const { value } = change;
        
        if (value.messages) {
          for (const message of value.messages) {
            await this.handleMessage(message, value);
          }
        }
      }
    }
  }

  /**
   * Handle individual message
   */
  private async handleMessage(message: any, value: any): Promise<void> {
    const fromNumber = message.from;
    const messageId = message.id;
    const timestamp = new Date(parseInt(message.timestamp) * 1000);
    const messageType = message.type;
    
    // Only handle text messages for playlist creation
    if (messageType !== "text") {
      await this.sendMessage(fromNumber, {
        messaging_product: "whatsapp",
        to: fromNumber,
        type: "text",
        text: {
          body: "I can only help create playlists from text messages. Please send me a description of the playlist you'd like to create!"
        }
      });
      return;
    }

    const messageContent = message.text?.body;
    if (!messageContent) return;

    // Store message in database
    const dbMessage: InsertWhatsAppMessage = {
      messageId,
      fromNumber,
      toNumber: value.metadata.phone_number_id,
      messageType,
      content: messageContent,
      timestamp,
      status: "received",
      sessionId: `whatsapp_${fromNumber}_${Date.now()}`,
      metadata: {
        profileName: value.contacts?.[0]?.profile?.name
      }
    };

    await storage.createWhatsAppMessage(dbMessage);

    // Get or create session
    let session = await storage.getWhatsAppSessionByPhone(fromNumber);
    if (!session || !session.isActive) {
      const sessionData: InsertWhatsAppSession = {
        sessionId: `whatsapp_${fromNumber}_${Date.now()}`,
        phoneNumber: fromNumber,
        currentStep: "initial",
        conversationData: {},
        isActive: true
      };
      session = await storage.createWhatsAppSession(sessionData);
    }

    // Process based on conversation state
    await this.processConversationFlow(session, messageContent, fromNumber);
  }

  /**
   * Process conversation flow based on current step
   */
  private async processConversationFlow(
    session: any, 
    messageContent: string, 
    phoneNumber: string
  ): Promise<void> {
    switch (session.currentStep) {
      case "initial":
        await this.handleInitialMessage(session, messageContent, phoneNumber);
        break;
      case "awaiting_prompt":
        await this.handlePlaylistCreation(session, messageContent, phoneNumber);
        break;
      default:
        await this.handleUnknownStep(session, phoneNumber);
        break;
    }
  }

  /**
   * Handle initial message - welcome and prompt for playlist request
   */
  private async handleInitialMessage(
    session: any, 
    messageContent: string, 
    phoneNumber: string
  ): Promise<void> {
    // Check if message looks like a playlist request
    const playlistKeywords = [
      "playlist", "music", "songs", "tracks", "create", "make", "generate",
      "mood", "genre", "artist", "album", "party", "workout", "chill", "relax"
    ];
    
    const isPlaylistRequest = playlistKeywords.some(keyword => 
      messageContent.toLowerCase().includes(keyword)
    );

    if (isPlaylistRequest) {
      // Direct playlist creation
      await this.handlePlaylistCreation(session, messageContent, phoneNumber);
    } else {
      // Welcome message
      await this.sendMessage(phoneNumber, {
        messaging_product: "whatsapp",
        to: phoneNumber,
        type: "text",
        text: {
          body: "🎵 Welcome to SongFuse!\n\nI can help you create personalized playlists! Just tell me:\n\n• What mood or genre you're looking for\n• Any specific artists you like\n• The occasion (workout, party, study, etc.)\n\nExample: \"Create a chill indie playlist for studying\""
        }
      });

      // Update session
      await storage.updateWhatsAppSession(session.id, {
        currentStep: "awaiting_prompt",
        conversationData: { ...session.conversationData }
      });
    }
  }

  /**
   * Handle playlist creation request
   */
  private async handlePlaylistCreation(
    session: any, 
    messageContent: string, 
    phoneNumber: string
  ): Promise<void> {
    try {
      // Send "creating playlist" message
      await this.sendMessage(phoneNumber, {
        messaging_product: "whatsapp",
        to: phoneNumber,
        type: "text",
        text: {
          body: "🎵 Creating your personalized playlist...\n\nThis might take a moment while I find the perfect tracks for you!"
        }
      });

      // Update session status
      await storage.updateWhatsAppSession(session.id, {
        currentStep: "creating_playlist",
        conversationData: {
          ...session.conversationData,
          prompt: messageContent
        }
      });

      // Create playlist using existing OpenAI service
      const songRecommendations = await openai.generateSongRecommendations(
        messageContent,
        [] // Empty genres array, let OpenAI determine appropriate genres
      );

      if (!songRecommendations.songs || songRecommendations.songs.length === 0) {
        throw new Error("No songs found for your request");
      }

      // Import the database module to find tracks
      const { findTracksByTitleArtist } = await import('../db');
      
      // Find tracks in database for the recommended songs
      const trackPromises = songRecommendations.songs.slice(0, 20).map(async (song) => {
        const tracks = await findTracksByTitleArtist(song.title, song.artist);
        return tracks.length > 0 ? tracks[0] : null;
      });

      const foundTracks = (await Promise.all(trackPromises)).filter(Boolean);
      
      if (foundTracks.length === 0) {
        throw new Error("No matching tracks found in our database");
      }

      // Generate playlist metadata using OpenAI
      const playlistIdeas = await openai.generatePlaylistIdeas(messageContent, foundTracks as any);
      
      const playlistData = {
        title: playlistIdeas.title,
        description: playlistIdeas.description,
        tracks: foundTracks
      };

      if (!playlistData || !playlistData.tracks || playlistData.tracks.length === 0) {
        throw new Error("No tracks found for your request");
      }

      // Create playlist in database (associate with WhatsApp user)
      const playlist = await storage.createPlaylist({
        userId: 1, // Default to system user, could be improved with WhatsApp user registration
        title: playlistData.title,
        description: playlistData.description,
        isPublic: true
      });

      // Create smart link for sharing
      const crypto = await import('crypto');
      const shareId = crypto.randomBytes(16).toString('hex');
      
      const smartLink = await storage.createSmartLink({
        playlistId: playlist.id,
        shareId: shareId,
        title: playlistData.title,
        description: playlistData.description,
        promotedTrackId: playlistData.tracks[0]?.id || 1, // Use first track or fallback
        customCoverImage: null
      });

      // Update session with playlist info
      await storage.updateWhatsAppSession(session.id, {
        currentStep: "completed",
        conversationData: {
          ...session.conversationData,
          playlistTitle: playlistData.title,
          playlistDescription: playlistData.description,
          trackCount: playlistData.tracks.length
        }
      });

      // Send success message with smart link
      const smartLinkUrl = `https://${process.env.REPLIT_DEV_DOMAIN || 'localhost:5000'}/smart/${smartLink.shareId}`;
      
      await this.sendMessage(phoneNumber, {
        messaging_product: "whatsapp",
        to: phoneNumber,
        type: "text",
        text: {
          body: `✅ Your playlist "${playlistData.title}" is ready!\n\n🎧 ${playlistData.tracks.length} tracks\n📝 ${playlistData.description}\n\n🔗 Share it: ${smartLinkUrl}\n\nSend me another message to create a new playlist!`,
          preview_url: true
        }
      });

      // Reset session for new requests
      await storage.updateWhatsAppSession(session.id, {
        currentStep: "initial",
        isActive: true
      });

    } catch (error) {
      console.error("Error creating playlist:", error);
      
      await this.sendMessage(phoneNumber, {
        messaging_product: "whatsapp",
        to: phoneNumber,
        type: "text",
        text: {
          body: "❌ Sorry, I couldn't create your playlist right now. Please try again with a different description!\n\nExample: \"Create an upbeat pop playlist for working out\""
        }
      });

      // Reset session
      await storage.updateWhatsAppSession(session.id, {
        currentStep: "initial",
        isActive: true
      });
    }
  }

  /**
   * Handle unknown conversation step
   */
  private async handleUnknownStep(session: any, phoneNumber: string): Promise<void> {
    await this.sendMessage(phoneNumber, {
      messaging_product: "whatsapp",
      to: phoneNumber,
      type: "text",
      text: {
        body: "🎵 Let's start fresh! Tell me what kind of playlist you'd like me to create.\n\nExample: \"Make a relaxing jazz playlist for dinner\""
      }
    });

    // Reset session
    await storage.updateWhatsAppSession(session.id, {
      currentStep: "initial",
      isActive: true
    });
  }

  /**
   * Send message via WhatsApp API
   */
  private async sendMessage(
    to: string, 
    message: WhatsAppSendMessageRequest
  ): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/${this.phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(message)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`WhatsApp API error: ${response.status} - ${error}`);
      }

      const result = await response.json();
      console.log("WhatsApp message sent successfully:", result);
    } catch (error) {
      console.error("Error sending WhatsApp message:", error);
      throw error;
    }
  }
}

// Environment variable validation
export function validateWhatsAppConfig(): {
  accessToken: string;
  verifyToken: string;
  phoneNumberId: string;
} {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!accessToken || !verifyToken || !phoneNumberId) {
    throw new Error(
      "Missing WhatsApp configuration. Required environment variables: " +
      "WHATSAPP_ACCESS_TOKEN, WHATSAPP_VERIFY_TOKEN, WHATSAPP_PHONE_NUMBER_ID"
    );
  }

  return { accessToken, verifyToken, phoneNumberId };
}