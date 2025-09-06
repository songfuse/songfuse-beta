import { auth } from 'express-openid-connect';
import { Request, Response, NextFunction } from 'express';

// Auth0 configuration
const auth0Config = {
  authRequired: false,
  auth0Logout: true,
  secret: process.env.AUTH0_SECRET,
  baseURL: process.env.AUTH0_BASE_URL,
  issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
  clientID: process.env.AUTH0_CLIENT_ID,
  clientSecret: process.env.AUTH0_CLIENT_SECRET,
  routes: {
    login: '/api/auth/login',
    logout: '/api/auth/logout',
    callback: '/api/auth/callback',
    postLogoutRedirect: '/'
  },
  session: {
    rolling: true,
    rollingDuration: 24 * 60 * 60 * 1000, // 24 hours
  }
};

// Initialize Auth0
export const auth0 = auth(auth0Config);

// Middleware to check if user is authenticated
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (req.oidc?.isAuthenticated()) {
    next();
  } else {
    res.status(401).json({ 
      error: 'Authentication required',
      loginUrl: '/api/auth/login'
    });
  }
};

// Middleware to get user info
export const getUserInfo = (req: Request) => {
  if (req.oidc?.isAuthenticated()) {
    return {
      id: req.oidc.user?.sub,
      email: req.oidc.user?.email,
      name: req.oidc.user?.name,
      picture: req.oidc.user?.picture,
      email_verified: req.oidc.user?.email_verified
    };
  }
  return null;
};

// Helper function to check if user is authenticated
export const isAuthenticated = (req: Request): boolean => {
  return req.oidc?.isAuthenticated() || false;
};
