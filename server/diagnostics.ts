import { Router, Request, Response } from 'express';
import OpenAI from 'openai';
import * as openaiModule from './openai';

const router = Router();

// Simple test function for OpenAI connection
async function testOpenAIConnection(): Promise<{ success: boolean, error?: string, result?: string }> {
  try {
    // Create a new OpenAI instance for testing
    const openai = new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY || "",
      dangerouslyAllowBrowser: true
    });
    
    // Attempt a very simple, low-cost completion
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: "Say 'ok' for a test" }],
      max_tokens: 5
    });
    
    // If we get here, it worked
    return { 
      success: true,
      result: response.choices[0]?.message?.content || "No content returned"
    };
  } catch (error) {
    console.error("OpenAI test connection failed:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Add diagnostic endpoint for OpenAI API key
router.get("/api/diagnostics/openai", async (req: Request, res: Response) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY || "";
    const keyLength = apiKey.length;
    const keyPrefix = apiKey.substring(0, 7);
    const isProjectKey = apiKey.startsWith("sk-proj-");
    const environment = process.env.NODE_ENV || "development";
    
    // Try a simple OpenAI API call
    const testResult = await testOpenAIConnection();
    
    // Get the OpenAI package version by examining package
    let openaiSdkVersion = "unknown";
    try {
      const packageInfo = require('openai/package.json');
      openaiSdkVersion = packageInfo.version || "unknown";
    } catch (e) {
      console.error("Could not determine OpenAI SDK version:", e);
    }
    
    return res.json({
      environment,
      node_version: process.version,
      keyInfo: {
        length: keyLength,
        prefix: keyPrefix + "...", // Only show the prefix for security
        isProjectKey,
      },
      openaiSdkVersion,
      testResult,
      serverInfo: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        env: Object.keys(process.env).filter(key => !key.includes("KEY") && !key.includes("SECRET") && !key.includes("TOKEN"))
      }
    });
  } catch (error) {
    console.error("Diagnostics error:", error);
    return res.status(500).json({
      error: "Failed to run diagnostics",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;