/**
 * Progress Tracking Service
 * 
 * This service manages progress tracking for playlist generation and provides real-time
 * updates to clients via WebSockets.
 */

import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import { nanoid } from 'nanoid';

// Define progress step types
export type ProgressStep = {
  step: 'prompt_analysis' | 'track_selection' | 'playlist_organization' | 'cover_generation' | 'final_assembly';
  message: string;
  percentage: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  details?: string;
};

export type ProgressUpdate = {
  id: string;
  sessionId: string;
  timestamp: number;
  step: ProgressStep;
  overallPercentage: number;
};

type ProgressTracking = {
  [sessionId: string]: {
    updates: ProgressUpdate[];
    startTime: number;
    endTime?: number;
    currentStep?: string;
  }
};

// Global state for tracking progress
const progressTracking: ProgressTracking = {};

// WebSocket server instance
let wss: WebSocketServer | null = null;

/**
 * Initialize WebSocket server
 */
export function initProgressWebSocketServer(server: http.Server): WebSocketServer {
  if (wss) {
    return wss;
  }
  
  wss = new WebSocketServer({ server, path: '/ws/progress' });
  
  // Add a custom property to the WebSocket for tracking session ID
  interface SessionWebSocket extends WebSocket {
    sessionId?: string;
  }

  wss.on('connection', (ws: WebSocket) => {
    const sessionWs = ws as SessionWebSocket;
    console.log('Client connected to progress WebSocket server');
    
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        // Handle subscription to specific session
        if (data.type === 'subscribe' && data.sessionId) {
          sessionWs.sessionId = data.sessionId;
          console.log(`Client subscribed to session ${data.sessionId}`);
          
          // Send all existing updates for this session
          if (progressTracking[data.sessionId]) {
            const updates = progressTracking[data.sessionId].updates;
            ws.send(JSON.stringify({
              type: 'history',
              updates
            }));
          }
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });
    
    ws.on('close', () => {
      console.log('Client disconnected from progress WebSocket server');
    });
  });
  
  console.log('Progress WebSocket server initialized');
  return wss;
}

/**
 * Start tracking progress for a new session
 */
export function startProgressTracking(sessionId: string): void {
  progressTracking[sessionId] = {
    updates: [],
    startTime: Date.now(),
  };
  
  // Initial connecting step
  updateProgress(sessionId, {
    step: 'prompt_analysis',
    message: 'Starting up the Songfuse AI engine...',
    percentage: 0,
    status: 'pending'
  });
  
  // Schedule some immediate initial updates to improve perceived responsiveness
  setTimeout(() => {
    updateProgress(sessionId, {
      step: 'prompt_analysis',
      message: 'Connecting to music databases...',
      percentage: 10,
      status: 'in_progress'
    });
  }, 300);
  
  setTimeout(() => {
    updateProgress(sessionId, {
      step: 'prompt_analysis',
      message: 'Analyzing your musical preferences...',
      percentage: 25,
      status: 'in_progress'
    });
  }, 800);
}

/**
 * Update progress for a specific session
 */
export function updateProgress(sessionId: string, step: ProgressStep): ProgressUpdate {
  if (!progressTracking[sessionId]) {
    startProgressTracking(sessionId);
  }
  
  // Update the current step
  progressTracking[sessionId].currentStep = step.step;
  
  // Calculate overall percentage based on step weights
  // Different steps have different weights in the overall process
  type StepKey = 'prompt_analysis' | 'track_selection' | 'playlist_organization' | 'cover_generation' | 'final_assembly';
  
  const stepWeights: Record<StepKey, number> = {
    prompt_analysis: 0.1,       // 10%
    track_selection: 0.5,       // 50%
    playlist_organization: 0.2, // 20%
    cover_generation: 0.1,      // 10%
    final_assembly: 0.1,        // 10%
  };
  
  // Define step order
  const stepOrder: StepKey[] = [
    'prompt_analysis',
    'track_selection',
    'playlist_organization',
    'cover_generation',
    'final_assembly'
  ];
  
  // Calculate previous steps
  const completedSteps = stepOrder.slice(0, stepOrder.indexOf(step.step as StepKey));
  
  let overallPercentage = completedSteps.reduce((sum, s) => sum + stepWeights[s], 0) * 100;
  
  // Add current step contribution
  overallPercentage += stepWeights[step.step] * step.percentage / 100;
  
  // Create update object
  const update: ProgressUpdate = {
    id: nanoid(),
    sessionId,
    timestamp: Date.now(),
    step,
    overallPercentage
  };
  
  // Store update
  progressTracking[sessionId].updates.push(update);
  
  // Broadcast to all connected clients subscribed to this session
  if (wss) {
    wss.clients.forEach(client => {
      // Cast to our custom interface
      const sessionClient = client as unknown as WebSocket & { sessionId?: string };
      if (sessionClient.readyState === WebSocket.OPEN && sessionClient.sessionId === sessionId) {
        sessionClient.send(JSON.stringify({
          type: 'update',
          update
        }));
      }
    });
  }
  
  return update;
}

/**
 * Complete progress tracking for a session
 */
export function completeProgressTracking(sessionId: string): void {
  if (progressTracking[sessionId]) {
    progressTracking[sessionId].endTime = Date.now();
    
    // Calculate how long the process took
    const duration = (progressTracking[sessionId].endTime - progressTracking[sessionId].startTime) / 1000;
    const durationText = duration > 60 
      ? `${Math.floor(duration / 60)} min ${Math.round(duration % 60)} sec` 
      : `${Math.round(duration)} seconds`;
    
    // Final update with fun completion message
    const completionMessages = [
      `Playlist ready in ${durationText}! Enjoy your personalized musical journey.`,
      `Your playlist is ready to rock! Created in ${durationText}.`,
      `Playlist creation complete! From idea to playlist in just ${durationText}.`,
      `Your custom playlist is ready! Fine-tuned in ${durationText}.`,
      `Masterpiece complete! Your playlist was crafted in ${durationText}.`
    ];
    
    // Pick a random message
    const randomIndex = Math.floor(Math.random() * completionMessages.length);
    
    updateProgress(sessionId, {
      step: 'final_assembly',
      message: completionMessages[randomIndex],
      percentage: 100,
      status: 'completed'
    });
    
    // Clean up old sessions (keep data for at most 1 hour)
    setTimeout(() => {
      delete progressTracking[sessionId];
    }, 60 * 60 * 1000);
  }
}

/**
 * Get all progress updates for a session
 */
export function getSessionProgress(sessionId: string): ProgressUpdate[] {
  return progressTracking[sessionId]?.updates || [];
}

/**
 * Get the WebSocket connection for progress updates
 */
export function getConnection() {
  return {
    sendProgressUpdate: (sessionId: string, update: { 
      step: ProgressStep; 
      overallPercentage: number 
    }): ProgressUpdate => {
      return updateProgress(sessionId, update.step);
    }
  };
}

/**
 * Initialize a new progress tracking session
 */
export function initializeSession(sessionId: string) {
  if (!progressTracking[sessionId]) {
    startProgressTracking(sessionId);
  }
}
