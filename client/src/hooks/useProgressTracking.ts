import { useState, useEffect } from 'react';

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

const useProgressTracking = (sessionId: string) => {
  const [wsConnected, setWsConnected] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState<ProgressStep | null>(null);
  const [progressHistory, setProgressHistory] = useState<ProgressUpdate[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [socketInstance, setSocketInstance] = useState<WebSocket | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    
    let socket: WebSocket | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    
    const connectWebSocket = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws/progress`;
      socket = new WebSocket(wsUrl);
      
      socket.onopen = () => {
        console.log("Progress WebSocket connected");
        setWsConnected(true);
        reconnectAttempts = 0;
        
        // Subscribe to the specific session
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: 'subscribe',
            sessionId
          }));
        }
      };
      
      socket.onclose = (event) => {
        console.log("Progress WebSocket disconnected", event.code, event.reason);
        setWsConnected(false);
        
        // Don't attempt to reconnect if we're unmounting, complete, or max attempts reached
        if (!isComplete && reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
          console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
          
          reconnectTimer = setTimeout(() => {
            connectWebSocket();
          }, delay);
        }
      };
      
      socket.onerror = (error) => {
        console.error("Progress WebSocket error:", error);
      };
      
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'update' && data.update) {
            const update = data.update as ProgressUpdate;
            setProgress(update.overallPercentage);
            setCurrentStep(update.step);
            setProgressHistory(prev => [...prev, update]);
            
            // Check if generation is complete
            if (update.step.step === 'final_assembly' && update.step.status === 'completed') {
              setIsComplete(true);
            }
          } else if (data.type === 'history' && data.updates) {
            const updates = data.updates as ProgressUpdate[];
            if (updates.length > 0) {
              setProgressHistory(updates);
              const latestUpdate = updates[updates.length - 1];
              setProgress(latestUpdate.overallPercentage);
              setCurrentStep(latestUpdate.step);
              
              // Check if generation is already complete
              if (latestUpdate.step.step === 'final_assembly' && latestUpdate.step.status === 'completed') {
                setIsComplete(true);
              }
            }
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };
      
      setSocketInstance(socket);
    };
    
    connectWebSocket();
    
    return () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      
      if (socket) {
        socket.close();
      }
    };
  }, [sessionId, isComplete]);

  return {
    wsConnected,
    progress,
    currentStep,
    progressHistory,
    isComplete,
    socket: socketInstance
  };
};

export default useProgressTracking;
