import { Request, Response, Router } from "express";
import { WhatsAppService, validateWhatsAppConfig } from "../services/whatsappService";

const router = Router();

// Initialize WhatsApp service
let whatsappService: WhatsAppService | null = null;

try {
  const config = validateWhatsAppConfig();
  whatsappService = new WhatsAppService(
    config.accessToken,
    config.verifyToken,
    config.phoneNumberId
  );
  console.log("WhatsApp service initialized successfully");
} catch (error) {
  console.warn("WhatsApp service not initialized:", error.message);
}

/**
 * Webhook verification endpoint for Meta WhatsApp Business API
 * GET /api/whatsapp/webhook
 */
router.get("/webhook", (req: Request, res: Response) => {
  if (!whatsappService) {
    return res.status(503).json({ error: "WhatsApp service not configured" });
  }
  
  whatsappService.verifyWebhook(req, res);
});

/**
 * Webhook endpoint for receiving WhatsApp messages
 * POST /api/whatsapp/webhook
 */
router.post("/webhook", async (req: Request, res: Response) => {
  if (!whatsappService) {
    return res.status(503).json({ error: "WhatsApp service not configured" });
  }
  
  await whatsappService.handleWebhook(req, res);
});

/**
 * Test endpoint to send a message via WhatsApp
 * POST /api/whatsapp/test-message
 */
router.post("/test-message", async (req: Request, res: Response) => {
  if (!whatsappService) {
    return res.status(503).json({ error: "WhatsApp service not configured" });
  }

  try {
    const { phoneNumber, message } = req.body;
    
    if (!phoneNumber || !message) {
      return res.status(400).json({ error: "phoneNumber and message are required" });
    }

    await (whatsappService as any).sendMessage(phoneNumber, {
      messaging_product: "whatsapp",
      to: phoneNumber,
      type: "text",
      text: { body: message }
    });

    res.json({ success: true, message: "Test message sent successfully" });
  } catch (error) {
    console.error("Error sending test message:", error);
    res.status(500).json({ error: "Failed to send test message" });
  }
});

/**
 * Get WhatsApp configuration status
 * GET /api/whatsapp/status
 */
router.get("/status", (req: Request, res: Response) => {
  const isConfigured = whatsappService !== null;
  
  res.json({
    configured: isConfigured,
    status: isConfigured ? "active" : "not_configured",
    message: isConfigured 
      ? "WhatsApp integration is active and ready to receive messages"
      : "WhatsApp integration requires configuration. Set WHATSAPP_ACCESS_TOKEN, WHATSAPP_VERIFY_TOKEN, and WHATSAPP_PHONE_NUMBER_ID environment variables."
  });
});

export default router;