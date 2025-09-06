import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Track background processes
interface BackgroundTask {
  process: any;
  startTime: Date;
  type: string;
  status: 'running' | 'completed' | 'failed';
  pid: number;
  output: string[];
}

const backgroundTasks: Record<string, BackgroundTask> = {};
let taskCounter = 0;

/**
 * Launch the background embedding process
 * Returns a task ID that can be used to check status
 */
export function startBackgroundEmbeddingProcess(): string {
  try {
    // Generate a unique task ID
    const taskId = `embedding-${Date.now()}-${taskCounter++}`;
    
    // Create logs directory if it doesn't exist
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // Spawn the process using tsx directly
    const childProcess = spawn('tsx', ['server/background-embeddings.ts'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true, // Run in the background
      env: { ...process.env, NODE_ENV: 'production' }
    });
    
    // Ensure we have a valid PID
    const processPid = childProcess.pid || 0;
    console.log(`Started background embedding process with PID ${processPid}`);
    
    // Store task info
    backgroundTasks[taskId] = {
      process: childProcess,
      startTime: new Date(),
      type: 'embedding',
      status: 'running',
      pid: processPid,
      output: []
    };
    
    // Capture output for status reporting
    childProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`[Background Embedding] ${output}`);
      backgroundTasks[taskId].output.push(output);
      
      // Limit output buffer size
      if (backgroundTasks[taskId].output.length > 100) {
        backgroundTasks[taskId].output.shift();
      }
    });
    
    childProcess.stderr.on('data', (data) => {
      const output = data.toString();
      console.error(`[Background Embedding Error] ${output}`);
      backgroundTasks[taskId].output.push(`ERROR: ${output}`);
      
      // Limit output buffer size
      if (backgroundTasks[taskId].output.length > 100) {
        backgroundTasks[taskId].output.shift();
      }
    });
    
    // Handle process completion
    childProcess.on('close', (code) => {
      console.log(`Background embedding process exited with code ${code}`);
      backgroundTasks[taskId].status = code === 0 ? 'completed' : 'failed';
    });
    
    // Return the task ID for status checking
    return taskId;
  } catch (error) {
    console.error('Failed to start background embedding process:', error);
    throw new Error('Failed to start background process');
  }
}

/**
 * Get status of a background task
 */
export function getBackgroundTaskStatus(taskId: string): {
  found: boolean;
  status?: 'running' | 'completed' | 'failed';
  startTime?: Date;
  pid?: number;
  type?: string;
  recentOutput?: string[];
} {
  if (!backgroundTasks[taskId]) {
    return { found: false };
  }
  
  const task = backgroundTasks[taskId];
  return {
    found: true,
    status: task.status,
    startTime: task.startTime,
    pid: task.pid,
    type: task.type,
    recentOutput: task.output.slice(-20) // Get the last 20 lines
  };
}

/**
 * Get a list of all running background tasks
 */
export function getAllBackgroundTasks(): Array<{
  id: string;
  type: string;
  status: string;
  startTime: Date;
  runTime: string; // Human readable duration
}> {
  return Object.entries(backgroundTasks).map(([id, task]) => {
    const runTimeMs = Date.now() - task.startTime.getTime();
    const minutes = Math.floor(runTimeMs / 60000);
    const seconds = Math.floor((runTimeMs % 60000) / 1000);
    
    return {
      id,
      type: task.type,
      status: task.status,
      startTime: task.startTime,
      runTime: `${minutes}m ${seconds}s`
    };
  });
}

/**
 * Stop a background task by ID
 */
export function stopBackgroundTask(taskId: string): boolean {
  if (!backgroundTasks[taskId]) {
    return false;
  }
  
  try {
    const task = backgroundTasks[taskId];
    if (task.status === 'running' && task.process) {
      // First try a graceful termination
      task.process.kill('SIGTERM');
      
      // Update status
      task.status = 'completed';
      task.output.push('Task terminated by user');
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Error stopping background task ${taskId}:`, error);
    return false;
  }
}