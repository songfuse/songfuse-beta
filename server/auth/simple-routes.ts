import { Router } from 'express';
import { login, register, logout, getCurrentUser, requireAuth } from './simple';

const router = Router();

// Register endpoint
router.post('/register', register);

// Login endpoint
router.post('/login', login);

// Logout endpoint
router.post('/logout', logout);

// Get current user
router.get('/me', getCurrentUser);

// Check authentication status
router.get('/status', getCurrentUser);

// Protected route example
router.get('/protected', requireAuth, (req, res) => {
  res.json({
    message: 'This is a protected route',
    user: (req as any).user
  });
});

export default router;
