import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

interface SessionData {
  user: {
    id: number;
    username: string;
    email?: string;
    name?: string;
    picture?: string;
  };
  expiresAt: number;
}

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SESSIONS_FILE = path.join(__dirname, '../../sessions.json');

// Load sessions from file
export const loadSessions = (): Map<string, SessionData> => {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const data = fs.readFileSync(SESSIONS_FILE, 'utf8');
      const sessionsObj = JSON.parse(data);
      return new Map(Object.entries(sessionsObj));
    }
  } catch (error) {
    console.error('Error loading sessions:', error);
  }
  return new Map();
};

// Save sessions to file
export const saveSessions = (sessions: Map<string, SessionData>) => {
  try {
    const sessionsObj = Object.fromEntries(sessions);
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessionsObj, null, 2));
  } catch (error) {
    console.error('Error saving sessions:', error);
  }
};

// Clean up expired sessions and save
export const cleanupAndSaveSessions = (sessions: Map<string, SessionData>) => {
  const now = Date.now();
  const expiredSessions: string[] = [];
  
  sessions.forEach((sessionData, sessionId) => {
    if (sessionData.expiresAt < now) {
      expiredSessions.push(sessionId);
    }
  });
  
  expiredSessions.forEach(sessionId => {
    sessions.delete(sessionId);
  });
  
  // Save the cleaned sessions
  saveSessions(sessions);
};
