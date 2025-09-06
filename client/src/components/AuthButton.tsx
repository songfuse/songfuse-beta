import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { User, LogOut, LogIn } from 'lucide-react';

interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

interface AuthStatus {
  authenticated: boolean;
  user: User | null;
}

const AuthButton: React.FC = () => {
  const [authStatus, setAuthStatus] = useState<AuthStatus>({ authenticated: false, user: null });
  const [loading, setLoading] = useState(true);
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const response = await fetch('/api/auth/status');
      const data = await response.json();
      setAuthStatus(data);
    } catch (error) {
      console.error('Error checking auth status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setAuthStatus({ authenticated: true, user: data.user });
        setShowLoginForm(false);
        setEmail('');
        setPassword('');
      } else {
        alert('Login failed');
      }
    } catch (error) {
      console.error('Login error:', error);
      alert('Login failed');
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setAuthStatus({ authenticated: false, user: null });
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (loading) {
    return (
      <Button variant="outline" disabled>
        <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mr-2" />
        Loading...
      </Button>
    );
  }

  if (authStatus.authenticated && authStatus.user) {
    return (
      <div className="flex items-center space-x-2">
        <div className="flex items-center space-x-2">
          {authStatus.user.picture ? (
            <img
              src={authStatus.user.picture}
              alt={authStatus.user.name}
              className="w-8 h-8 rounded-full"
            />
          ) : (
            <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
              <User className="w-4 h-4 text-gray-600" />
            </div>
          )}
          <span className="text-sm font-medium">{authStatus.user.name}</span>
        </div>
        <Button variant="outline" size="sm" onClick={handleLogout}>
          <LogOut className="w-4 h-4 mr-1" />
          Logout
        </Button>
      </div>
    );
  }

  if (showLoginForm) {
    return (
      <div className="flex flex-col space-y-2">
        <form onSubmit={handleLogin} className="flex flex-col space-y-2">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="px-3 py-1 border rounded text-sm"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="px-3 py-1 border rounded text-sm"
            required
          />
          <div className="flex space-x-2">
            <Button type="submit" size="sm">
              Login
            </Button>
            <Button 
              type="button" 
              variant="outline" 
              size="sm"
              onClick={() => setShowLoginForm(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <Button onClick={() => setShowLoginForm(true)}>
      <LogIn className="w-4 h-4 mr-1" />
      Login
    </Button>
  );
};

export default AuthButton;
