import { pgTable, text, serial, integer, json, timestamp, boolean, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// WhatsApp webhook events and message tracking
export const whatsappMessages = pgTable("whatsapp_messages", {
  id: serial("id").primaryKey(),
  messageId: text("message_id").notNull().unique(), // WhatsApp message ID
  fromNumber: text("from_number").notNull(), // Phone number that sent the message
  toNumber: text("to_number").notNull(), // Business phone number
  messageType: text("message_type").notNull(), // text, image, audio, etc.
  content: text("content"), // Message text content
  timestamp: timestamp("timestamp").notNull(), // Message timestamp from WhatsApp
  processedAt: timestamp("processed_at").defaultNow(),
  status: text("status").default("received"), // received, processing, completed, error
  userId: integer("user_id"), // Link to user if they exist in our system
  playlistId: integer("playlist_id"), // Link to created playlist if applicable
  sessionId: text("session_id"), // For conversation tracking
  metadata: json("metadata").$type<{
    profileName?: string;
    contactName?: string;
    context?: any;
  }>(),
});

export const insertWhatsAppMessageSchema = createInsertSchema(whatsappMessages).pick({
  messageId: true,
  fromNumber: true,
  toNumber: true,
  messageType: true,
  content: true,
  timestamp: true,
  status: true,
  userId: true,
  playlistId: true,
  sessionId: true,
  metadata: true,
});

// WhatsApp user sessions for conversation flow
export const whatsappSessions = pgTable("whatsapp_sessions", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().unique(),
  phoneNumber: text("phone_number").notNull(),
  userId: integer("user_id"), // Link to registered user if they exist
  currentStep: text("current_step").default("initial"), // initial, awaiting_prompt, creating_playlist, completed
  conversationData: json("conversation_data").$type<{
    prompt?: string;
    playlistTitle?: string;
    playlistDescription?: string;
    trackCount?: number;
    preferences?: {
      explicit?: boolean;
      genres?: string[];
    };
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
  lastInteraction: timestamp("last_interaction").defaultNow(),
  isActive: boolean("is_active").default(true),
});

export const insertWhatsAppSessionSchema = createInsertSchema(whatsappSessions).pick({
  sessionId: true,
  phoneNumber: true,
  userId: true,
  currentStep: true,
  conversationData: true,
  isActive: true,
});

// WhatsApp business configuration
export const whatsappConfig = pgTable("whatsapp_config", {
  id: serial("id").primaryKey(),
  businessPhoneNumberId: text("business_phone_number_id").notNull(),
  accessToken: text("access_token").notNull(),
  webhookVerifyToken: text("webhook_verify_token").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertWhatsAppConfigSchema = createInsertSchema(whatsappConfig).pick({
  businessPhoneNumberId: true,
  accessToken: true,
  webhookVerifyToken: true,
  isActive: true,
});

// Types
export type WhatsAppMessage = typeof whatsappMessages.$inferSelect;
export type InsertWhatsAppMessage = z.infer<typeof insertWhatsAppMessageSchema>;

export type WhatsAppSession = typeof whatsappSessions.$inferSelect;
export type InsertWhatsAppSession = z.infer<typeof insertWhatsAppSessionSchema>;

export type WhatsAppConfig = typeof whatsappConfig.$inferSelect;
export type InsertWhatsAppConfig = z.infer<typeof insertWhatsAppConfigSchema>;

// WhatsApp API response types
export interface WhatsAppWebhookMessage {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: {
            name: string;
          };
          wa_id: string;
        }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          text?: {
            body: string;
          };
          type: string;
          context?: {
            from: string;
            id: string;
          };
        }>;
        statuses?: Array<{
          id: string;
          status: string;
          timestamp: string;
          recipient_id: string;
        }>;
      };
      field: string;
    }>;
  }>;
}

export interface WhatsAppSendMessageRequest {
  messaging_product: "whatsapp";
  to: string;
  type: "text" | "template" | "interactive";
  text?: {
    body: string;
    preview_url?: boolean;
  };
  template?: {
    name: string;
    language: {
      code: string;
    };
    components?: Array<{
      type: string;
      parameters: Array<{
        type: string;
        text: string;
      }>;
    }>;
  };
  interactive?: {
    type: "button" | "list";
    body: {
      text: string;
    };
    action: {
      buttons?: Array<{
        type: "reply";
        reply: {
          id: string;
          title: string;
        };
      }>;
      button?: string;
      sections?: Array<{
        title: string;
        rows: Array<{
          id: string;
          title: string;
          description?: string;
        }>;
      }>;
    };
  };
}