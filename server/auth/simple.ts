import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { loadSessions, saveSessions, cleanupAndSaveSessions } from './sessionStorage';

// User interface matching database schema
interface User {
  id: number;
  username: string;
  email?: string;
  name?: string;
  picture?: string;
}

// Persistent session storage
const sessions = loadSessions();

// Generate a simple session ID
const generateSessionId = (): string => {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
};

// Clean up expired sessions
const cleanupExpiredSessions = () => {
  cleanupAndSaveSessions(sessions);
};

// Run cleanup every hour
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);

// Simple authentication middleware
export const simpleAuth = (req: Request, res: Response, next: NextFunction) => {
  // Check for session cookie
  const sessionId = req.cookies?.sessionId;
  console.log("Auth middleware - sessionId:", sessionId);
  console.log("Auth middleware - sessions map size:", sessions.size);
  
  if (sessionId && sessions.has(sessionId)) {
    const sessionData = sessions.get(sessionId);
    const now = Date.now();
    
    console.log("Session data found:", sessionData);
    console.log("Session expires at:", sessionData?.expiresAt, "Current time:", now);
    
    // Check if session is still valid
    if (sessionData && sessionData.expiresAt > now) {
      console.log("Session is valid, setting user:", sessionData.user);
      (req as any).user = sessionData.user;
    } else {
      console.log("Session expired, removing it");
      // Session expired, remove it
      sessions.delete(sessionId);
      saveSessions(sessions);
    }
  } else {
    console.log("No valid session found");
  }
  
  next();
};

// Register route
export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;
    
    // Simple validation
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    
    // Check if user already exists in database
    const existingUsers = await db
      .select()
      .from(users)
      .where(eq(users.username, email)); // Using email as username for now
    
    if (existingUsers.length > 0) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }
    
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create new user in database
    const [newUser] = await db
      .insert(users)
      .values({
        username: email, // Using email as username
        password: hashedPassword,
        name: name, // Save the user's full name
        credits: 5 // Start with 5 credits
      })
      .returning();
    
    res.json({
      success: true,
      message: 'Registration successful',
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.username, // Same as username for now
        name: newUser.name || name, // Use the saved name from DB, fallback to input
        picture: `https://via.placeholder.com/40x40/4F46E5/FFFFFF?text=${(newUser.name || name).charAt(0).toUpperCase()}`
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
};

// Login route
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    
    // Simple validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    // Find user in database
    const dbUsers = await db
      .select()
      .from(users)
      .where(eq(users.username, email)); // Using email as username
    
    if (dbUsers.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const dbUser = dbUsers[0];
    
    // Verify password
    const isValidPassword = await bcrypt.compare(password, dbUser.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Create user object for session
    const user: User = {
      id: dbUser.id,
      username: dbUser.username,
      email: dbUser.username, // Same as username for now
      name: dbUser.username.split('@')[0], // Extract name from email
      picture: `https://via.placeholder.com/40x40/4F46E5/FFFFFF?text=${dbUser.username.charAt(0).toUpperCase()}`
    };
    
    const sessionId = generateSessionId();
    const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours from now
    sessions.set(sessionId, { user, expiresAt });
    saveSessions(sessions);
    
    res.cookie('sessionId', sessionId, {
      httpOnly: true,
      secure: false, // Set to true in production with HTTPS
      sameSite: 'lax', // Allow cookies to be sent with same-site requests
      path: '/', // Make cookie available for all paths
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });
    
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
};

// Logout route
export const logout = (req: Request, res: Response) => {
  const sessionId = req.cookies?.sessionId;
  
  if (sessionId) {
    sessions.delete(sessionId);
    saveSessions(sessions);
    res.clearCookie('sessionId');
  }
  
  res.json({ success: true });
};

// Get current user
export const getCurrentUser = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    console.log("getCurrentUser - user from request:", user);
    
    if (user) {
      console.log("User found, fetching fresh data from database for user ID:", user.id);
      // Get fresh user data from database
      const dbUsers = await db
        .select()
        .from(users)
        .where(eq(users.id, user.id));
      
      console.log("Database query result:", dbUsers);
      
      if (dbUsers.length > 0) {
        const dbUser = dbUsers[0];
        const responseData = {
          authenticated: true,
          user: {
            id: dbUser.id,
            email: dbUser.username, // Same as username for now
            name: dbUser.username.split('@')[0], // Extract name from email
            picture: `https://via.placeholder.com/40x40/4F46E5/FFFFFF?text=${dbUser.username.charAt(0).toUpperCase()}`,
            credits: dbUser.credits
          }
        };
        console.log("Sending authenticated response:", responseData);
        res.json(responseData);
      } else {
        console.log("User not found in database, sending unauthenticated response");
        res.json({
          authenticated: false,
          user: null
        });
      }
    } else {
      console.log("No user in request, sending unauthenticated response");
      res.json({
        authenticated: false,
        user: null
      });
    }
  } catch (error) {
    console.error('Get current user error:', error);
    res.json({
      authenticated: false,
      user: null
    });
  }
};

// Middleware to require authentication
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  
  if (user) {
    next();
  } else {
    res.status(401).json({ 
      error: 'Authentication required',
      loginUrl: '/api/auth/login'
    });
  }
};
