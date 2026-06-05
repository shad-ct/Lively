import React, { createContext, useContext, useEffect, useState } from 'react';
import { type User as FirebaseUser, onAuthStateChanged } from 'firebase/auth';
import { 
  auth, 
  googleProvider, 
  signInWithPopup, 
  signOut,
  initializeFirebase
} from '../config/firebase';
import axios from 'axios';

interface UserProfile {
  name: string;
  email: string;
  picture: string;
  role: string;
  needsProfileSetup?: boolean;
}

interface AuthContextType {
  user: UserProfile | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  completeProfileSetup: (name: string, picture: string) => Promise<void>;
  logOut: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [firebaseInitialized, setFirebaseInitialized] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Helper to read client-readable cookie
  const getCookie = (name: string): string | null => {
    const nameLenPlus = name.length + 1;
    return document.cookie
      .split(';')
      .map(c => c.trim())
      .filter(cookie => {
        return cookie.substring(0, nameLenPlus) === `${name}=`;
      })
      .map(cookie => {
        return decodeURIComponent(cookie.substring(nameLenPlus));
      })[0] || null;
  };

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const fetchConfigAndInit = async () => {
      try {
        const backendUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';
        const response = await axios.get(`${backendUrl}/api/auth/config`);
        
        // Initialize Firebase dynamically with fetched configuration parameters
        const activeAuth = initializeFirebase(response.data);

        unsubscribe = onAuthStateChanged(activeAuth, async (currentFirebaseUser) => {
          setLoading(true);
          setError(null);
          if (currentFirebaseUser) {
            try {
              setFirebaseUser(currentFirebaseUser);
              const idToken = await currentFirebaseUser.getIdToken(true);
              const backendUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';

              const handshakeRes = await axios.post(`${backendUrl}/api/auth/firebase`, { idToken }, {
                headers: {
                  'Content-Type': 'application/json',
                },
                withCredentials: true,
              });

              if (handshakeRes.data && handshakeRes.data.success && handshakeRes.data.user) {
                setUser(handshakeRes.data.user);
              } else {
                throw new Error('Authentication handshake failed.');
              }
            } catch (err: any) {
              console.error('Firebase Auth handshake error:', err);
              setError(err.response?.data?.error || err.message || 'Token verification failed.');
              setUser(null);
              setFirebaseUser(null);
            } finally {
              setLoading(false);
            }
          } else {
            // No Firebase user, clear everything and check user cookie fallback
            setFirebaseUser(null);
            const userCookie = getCookie('user');
            if (userCookie) {
              try {
                setUser(JSON.parse(userCookie));
              } catch (e) {
                console.error('Failed to parse user cookie fallback:', e);
                setUser(null);
              }
            } else {
              setUser(null);
            }
            setLoading(false);
          }
        });

        setFirebaseInitialized(true);
      } catch (err: any) {
        console.error('Failed to fetch Firebase config or initialize:', err);
        setError('Failed to fetch authentication configurations.');
        setLoading(false);
      }
    };

    fetchConfigAndInit();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    if (!auth) {
      setError('Authentication client is not initialized.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error('Google Sign-In Popup Error:', err);
      setError(err.message || 'Google authentication failed.');
      setLoading(false);
    }
  };

  const completeProfileSetup = async (name: string, picture: string) => {
    setLoading(true);
    setError(null);
    try {
      const backendUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';
      const response = await axios.post(`${backendUrl}/api/auth/complete-setup`, { name, picture }, {
        headers: {
          'Content-Type': 'application/json',
        },
        withCredentials: true,
      });

      if (response.data && response.data.success && response.data.user) {
        setUser(response.data.user);
      } else {
        throw new Error('Failed to complete profile setup.');
      }
    } catch (err: any) {
      console.error('Complete profile setup error:', err);
      setError(err.response?.data?.error || err.message || 'Profile setup failed.');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logOut = async () => {
    if (!auth) {
      setError('Authentication client is not initialized.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const backendUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';
      await axios.post(`${backendUrl}/api/auth/logout`, {}, { withCredentials: true });
      await signOut(auth);
      setUser(null);
      setFirebaseUser(null);
      // Clean cookie locally as fallback
      document.cookie = 'user=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    } catch (err: any) {
      console.error('Logout error:', err);
      setError(err.message || 'Failed to logout session.');
    } finally {
      setLoading(false);
    }
  };

  const clearError = () => {
    setError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        loading: loading || !firebaseInitialized,
        error,
        signInWithGoogle,
        completeProfileSetup,
        logOut,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
