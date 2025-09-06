import { Router, Request, Response } from 'express';
import { requireAuth, getUserInfo, isAuthenticated } from './auth0';

const router = Router();

// Get current user info
router.get('/me', requireAuth, (req: Request, res: Response) => {
  const userInfo = getUserInfo(req);
  res.json({
    success: true,
    user: userInfo
  });
});

// Check authentication status
router.get('/status', (req: Request, res: Response) => {
  const authenticated = isAuthenticated(req);
  const userInfo = authenticated ? getUserInfo(req) : null;
  
  res.json({
    authenticated,
    user: userInfo
  });
});

// Login endpoint (redirects to Auth0)
router.get('/login', (req: Request, res: Response) => {
  res.redirect('/api/auth/login');
});

// Logout endpoint
router.get('/logout', (req: Request, res: Response) => {
  res.redirect('/api/auth/logout');
});

// Protected route example
router.get('/protected', requireAuth, (req: Request, res: Response) => {
  const userInfo = getUserInfo(req);
  res.json({
    message: 'This is a protected route',
    user: userInfo
  });
});

export default router;
