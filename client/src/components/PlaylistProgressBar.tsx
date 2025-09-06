import { useEffect, useState } from 'react';
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Music4, Filter, Users, LibraryBig } from "lucide-react";

type ProgressStep = {
  step: 'prompt_analysis' | 'track_selection' | 'playlist_organization' | 'final_assembly';
  message: string;
  percentage: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  details?: string;
};

type ProgressUpdate = {
  id: string;
  sessionId: string;
  timestamp: number;
  step: ProgressStep;
  overallPercentage: number;
};

interface PlaylistProgressBarProps {
  sessionId: string;
  onComplete?: () => void;
}

const PlaylistProgressBar = ({ sessionId, onComplete }: PlaylistProgressBarProps) => {
  const [wsConnected, setWsConnected] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState<ProgressStep | null>(null);
  const [progressHistory, setProgressHistory] = useState<ProgressUpdate[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [socket, setSocket] = useState<WebSocket | null>(null);

  // Setup WebSocket connection
  useEffect(() => {
    if (!sessionId) return;
    
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/progress`;
    const ws = new WebSocket(wsUrl);
    
    // Set up artificial progress for visual feedback
    // Start it even before the connection is established
    const startArtificialProgress = () => {
      setArtificialProgress(5); // Initialize with a small value
      
      // Create a gradual increase function that runs every 500ms
      const progressInterval = setInterval(() => {
        setArtificialProgress(prev => {
          if (prev >= 15) return prev; // Cap at 15%
          return prev + (Math.random() * 0.8); // Random small increment
        });
      }, 500);
      
      return progressInterval;
    };
    
    // Start artificial progress immediately
    const progressInterval = startArtificialProgress();
    
    ws.onopen = () => {
      console.log("Progress WebSocket connected");
      setWsConnected(true);
      
      // Subscribe to the specific session
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'subscribe',
          sessionId
        }));
      }
    };
    
    ws.onclose = () => {
      console.log("Progress WebSocket disconnected");
      setWsConnected(false);
    };
    
    ws.onerror = (error) => {
      console.error("Progress WebSocket error:", error);
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("Received progress update:", data);
        
        if (data.type === 'update' && data.update) {
          const update = data.update as ProgressUpdate;
          
          // Log the actual percentage to help with debugging
          console.log(`Progress update: ${update.overallPercentage}%`);
          
          // Force the progress to be at least 5% for visual feedback even at the start
          const actualProgress = Math.max(update.overallPercentage, 5);
          setProgress(actualProgress);
          setCurrentStep(update.step);
          setProgressHistory(prev => [...prev, update]);
          
          // Check if generation is complete
          if (update.step.step === 'final_assembly' && update.step.status === 'completed') {
            setProgress(100); // Ensure we show 100% when complete
            setIsComplete(true);
            if (onComplete) onComplete();
          }
        } else if (data.type === 'history' && data.updates) {
          const updates = data.updates as ProgressUpdate[];
          if (updates.length > 0) {
            setProgressHistory(updates);
            const latestUpdate = updates[updates.length - 1];
            
            // Force the progress to be at least 5% for visual feedback
            const actualProgress = Math.max(latestUpdate.overallPercentage, 5);
            setProgress(actualProgress);
            setCurrentStep(latestUpdate.step);
            
            // Check if generation is already complete
            if (latestUpdate.step.step === 'final_assembly' && latestUpdate.step.status === 'completed') {
              setProgress(100); // Ensure we show 100% when complete
              setIsComplete(true);
              if (onComplete) onComplete();
            }
          }
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };
    
    setSocket(ws);
    
    return () => {
      // Clear the artificial progress interval
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      
      // Close the WebSocket connection
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [sessionId, onComplete]);

  // Helper functions for determining step status
  const getStepStatus = (stepName: string) => {
    if (!currentStep) return 'pending';
    
    const stepIndex = ['prompt_analysis', 'track_selection', 'playlist_organization', 'final_assembly']
      .indexOf(currentStep.step);
    const targetIndex = ['prompt_analysis', 'track_selection', 'playlist_organization', 'final_assembly']
      .indexOf(stepName);
    
    if (targetIndex < stepIndex) return 'completed';
    if (targetIndex > stepIndex) return 'pending';
    return currentStep.status;
  };

  // Icons for different steps
  const stepIcons = {
    prompt_analysis: Filter,
    track_selection: Music4,
    playlist_organization: LibraryBig,
    final_assembly: Users
  };

  // Human-friendly step names
  const stepNames = {
    prompt_analysis: "Analyzing",
    track_selection: "Selecting Tracks",
    playlist_organization: "Organizing",
    final_assembly: "Finalizing"
  };

  // Add a pulsing effect for active steps
  const pulseClass = "animate-pulse";
  
  // Add a subtle animation to the progress bar when connected but no updates yet
  const [progressBarClass, setProgressBarClass] = useState('');
  
  // Show the "fake" progress animation when connected but no real updates received
  useEffect(() => {
    if (wsConnected && progress === 0) {
      setProgressBarClass('progress-bar-animated');
    } else {
      setProgressBarClass('');
    }
  }, [wsConnected, progress]);
  
  // Create a small incremental progress when in the same step for a while
  const [artificialProgress, setArtificialProgress] = useState(0);
  
  // Combine real progress with artificial progress
  const displayProgress = progress > 0 ? progress : artificialProgress;

  return (
    <div className="w-full max-w-3xl mx-auto p-4 rounded-lg border bg-card text-card-foreground shadow-sm space-y-4 overflow-hidden">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          Creating playlist
        </h3>
        <Badge variant={isComplete ? "default" : "outline"} className={cn(
          "px-2 py-1",
          isComplete ? "bg-green-500 hover:bg-green-500/90 text-white" : "",
          !isComplete && wsConnected ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" : ""
        )}>
          {isComplete ? "Complete" : wsConnected ? "In Progress" : "Connecting..."}
        </Badge>
      </div>
      
      <div className="relative">
        <Progress 
          value={displayProgress} 
          className={cn("h-2 transition-all duration-500", progressBarClass)} 
        />
        
        {/* Add subtle shimmer effect for visual feedback during processing */}
        {wsConnected && !isComplete && (
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-200/20 to-transparent shimmer-animation pointer-events-none"></div>
        )}
      </div>
      
      <div className={cn(
        "text-sm text-muted-foreground", 
        // If we're connected but don't have progress yet, animate the message
        (wsConnected && progress === 0 && !isComplete) ? pulseClass : ""
      )}>
        {currentStep?.message || "Preparing your personalized playlist..."}
      </div>
      
      {/* Fix the grid to prevent horizontal overflow */}
      <div className="grid grid-cols-4 gap-1 mt-4 w-full mx-auto">
        {(['prompt_analysis', 'track_selection', 'playlist_organization', 'final_assembly'] as const).map((step) => {
          const status = getStepStatus(step);
          const Icon = stepIcons[step];
          
          return (
            <div key={step} className="flex flex-col items-center text-center">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center mb-1 transition-all duration-300",
                status === 'completed' ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" :
                status === 'in_progress' ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400" :
                status === 'failed' ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" :
                "bg-muted text-muted-foreground",
                // Add pulsing animation to the current step
                status === 'in_progress' ? pulseClass : ""
              )}>
                <Icon className="w-4 h-4" />
              </div>
              <span className={cn(
                "text-xs truncate w-full",
                status === 'in_progress' ? "font-medium text-blue-700 dark:text-blue-400" : ""
              )}>
                {stepNames[step]}
              </span>
            </div>
          );
        })}
      </div>
      
      {currentStep?.details && (
        <div className="text-xs italic text-muted-foreground mt-2 truncate">
          {currentStep.details}
        </div>
      )}
    </div>
  );
};

export default PlaylistProgressBar;
