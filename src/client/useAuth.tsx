import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { User, SSOConfig } from '../types';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (provider: string) => Promise<void>;
  logout: () => Promise<void>;
  token: string | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  role: 'super_admin' | 'admin' | 'user' | null;
  loginError: string | null;
  clearLoginError: () => void;
  config: SSOConfig | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within a HeimdallProvider');
  }
  return context;
}

interface HeimdallProviderProps {
  children: ReactNode;
  apiUrl?: string;
  tokenStorage?: 'localStorage' | 'sessionStorage' | 'memory';
  onAuthStateChange?: (user: User | null) => void;
}

export function HeimdallProvider({
  children,
  apiUrl = '/auth',
  tokenStorage = 'localStorage',
  onAuthStateChange
}: HeimdallProviderProps) {
  const [token, setToken] = useState<string | null>(() => {
    if (tokenStorage === 'localStorage') {
      return localStorage.getItem('auth_token');
    } else if (tokenStorage === 'sessionStorage') {
      return sessionStorage.getItem('auth_token');
    }
    return null;
  });

  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [config, setConfig] = useState<SSOConfig | null>(null);

  // Load configuration
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch(`${apiUrl}/config`);
        if (response.ok) {
          const configData = await response.json();
          setConfig(configData);
        }
      } catch (error) {
        console.error('Failed to load SSO config:', error);
      }
    };

    loadConfig();
  }, [apiUrl]);

  // Verify token and get user
  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(`${apiUrl}/me`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
          onAuthStateChange?.(data.user);
        } else {
          // Clear invalid token
          handleTokenClear();
        }
      } catch (error) {
        console.error('Failed to verify token:', error);
        handleTokenClear();
      } finally {
        setIsLoading(false);
      }
    };

    verifyToken();
  }, [token, apiUrl]);

  const handleTokenClear = () => {
    setToken(null);
    setUser(null);
    if (tokenStorage === 'localStorage') {
      localStorage.removeItem('auth_token');
    } else if (tokenStorage === 'sessionStorage') {
      sessionStorage.removeItem('auth_token');
    }
    onAuthStateChange?.(null);
  };

  // Removed unused handleTokenSave function
  // Token saving would be handled after successful login response

  const login = async (provider: string) => {
    setLoginError(null);

    // For OAuth providers, redirect to the provider's auth page
    // This would typically be handled by your OAuth implementation
    // For example, with Microsoft OAuth:
    if (provider === 'microsoft' && config?.providers?.microsoft) {
      // This is a simplified example - you'd need to implement the full OAuth flow
      window.location.href = `/auth/oauth/${provider}`;
    } else {
      setLoginError(`Provider ${provider} is not configured`);
    }
  };

  const logout = async () => {
    try {
      await fetch(`${apiUrl}/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      handleTokenClear();
    }
  };

  const clearLoginError = () => setLoginError(null);

  const isAuthenticated = !!user && !!token;
  const role = user?.role || null;
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin' || false;
  const isSuperAdmin = user?.role === 'super_admin' || false;

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated,
    login,
    logout,
    token,
    isAdmin,
    isSuperAdmin,
    role,
    loginError,
    clearLoginError,
    config,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Protected route component
interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: 'user' | 'admin' | 'super_admin';
  fallback?: ReactNode;
}

export function ProtectedRoute({
  children,
  requiredRole = 'user',
  fallback = <div>Access denied</div>
}: ProtectedRouteProps) {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <>{fallback}</>;
  }

  // Check role hierarchy
  const roleHierarchy = {
    'user': 0,
    'admin': 1,
    'super_admin': 2,
  };

  const userRoleLevel = roleHierarchy[user?.role || 'user'];
  const requiredRoleLevel = roleHierarchy[requiredRole];

  if (userRoleLevel < requiredRoleLevel) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
