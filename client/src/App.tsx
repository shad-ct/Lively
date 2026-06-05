import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { LandingPage } from './components/LandingPage';
import { HostDashboard } from './components/HostDashboard';
import { AttendeeView } from './components/AttendeeView';
import { AuthProvider, useAuth, BACKEND_URL } from './context/AuthContext';
import { Chrome } from 'lucide-react';

const SOCKET_SERVER_URL = import.meta.env.VITE_SOCKET_URL || BACKEND_URL;

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

function LoadingScreen() {
  const [showColdStartMessage, setShowColdStartMessage] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowColdStartMessage(true);
    }, 4500); // Show after 4.5 seconds of loading
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center select-none text-zinc-100">
      <div className="space-y-6 max-w-sm animate-fade-in">
        <div className="relative inline-block">
          <div className="h-12 w-12 rounded-full border-t-2 border-r-2 border-violet-500 animate-spin mx-auto"></div>
        </div>
        <div className="space-y-3">
          <h2 className="text-xl font-bold text-white tracking-tight">PresentSync Authentication</h2>
          <p className="text-zinc-500 text-xs font-semibold uppercase tracking-widest animate-pulse">
            Securing session handshake keys...
          </p>
          {showColdStartMessage && (
            <div className="text-amber-400/90 text-xs mt-2 bg-amber-950/20 border border-amber-950/50 rounded-xl p-3.5 animate-fade-in space-y-1">
              <div className="font-bold">⚠️ Server is waking up</div>
              <div className="text-zinc-400">
                The free-tier hosting server takes around 50 seconds to boot up on the first load. Thank you for your patience!
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AppContent() {
  // Routing states
  const [route, setRoute] = useState<'landing' | 'host' | 'attendee'>('landing');
  const [roomCode, setRoomCode] = useState('');
  const [attendeeName, setAttendeeName] = useState('');

  // Authentication context
  const {
    user: authenticatedUser,
    loading: authLoading,
    error: authError,
    signInWithGoogle,
    logOut: handleLogout,
    clearError
  } = useAuth();

  // Local Form state for login wall
  const [localError, setLocalError] = useState('');

  // Socket state
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connectionError, setConnectionError] = useState('');

  // Cache state from join success
  const [attendeeState, setAttendeeState] = useState<{
    isFrozen: boolean;
    activePoll: { question: string; options: string[] } | null;
    activeQuiz: {
      questionIndex: number;
      questionText: string;
      options: string[];
      timeLimit: number;
      timeLeft: number;
      hasVoted: boolean;
    } | null;
    quizQuestionsCount: number;
  }>({ isFrozen: false, activePoll: null, activeQuiz: null, quizQuestionsCount: 0 });

  const socketRef = useRef<Socket | null>(null);

  // Parse path on initial load & popstate changes
  useEffect(() => {
    const handleLocationChange = () => {
      const path = window.location.pathname;
      const roomMatch = path.match(/^\/room\/([A-Za-z0-9]{6})$/);

      if (path === '/host') {
        if (roomCode) {
          setRoute('host');
        } else {
          // If trying to access /host without active session, redirect to home
          window.history.pushState({}, '', '/');
          setRoute('landing');
        }
      } else if (roomMatch) {
        const code = roomMatch[1].toUpperCase();
        setRoomCode(code);
        if (attendeeName) {
          setRoute('attendee');
        } else {
          setRoute('landing');
        }
      } else {
        setRoute('landing');
      }
    };

    handleLocationChange();
    window.addEventListener('popstate', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, [roomCode, attendeeName]);

  // Cleanup socket on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const connectSocket = (): Socket => {
    if (socketRef.current && socketRef.current.connected) {
      return socketRef.current;
    }

    const newSocket = io(SOCKET_SERVER_URL, {
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    newSocket.on('connect_error', () => {
      setConnectionError('Unable to connect to the realtime server.');
    });

    newSocket.on('connect', () => {
      setConnectionError('');
    });

    socketRef.current = newSocket;
    setSocket(newSocket);
    return newSocket;
  };

  // Host Action: Create session
  const handleCreateRoom = () => {
    setConnectionError('');
    const s = connectSocket();

    s.emit('create_room', (res: { success: boolean; code: string; hostToken: string; error?: string }) => {
      if (res.success) {
        setRoomCode(res.code);
        // Save token to session storage in case of refresh (optional enhancement)
        sessionStorage.setItem(`host_token_${res.code}`, res.hostToken);

        // Push state & update route
        window.history.pushState({}, '', '/host');
        setRoute('host');
      } else {
        setConnectionError(res.error || 'Failed to create room.');
      }
    });
  };

  // Attendee Action: Join session
  const handleJoinRoom = (name: string, code: string) => {
    setConnectionError('');
    const s = connectSocket();
    const upperCode = code.toUpperCase();

    s.emit('join_room', { code: upperCode, name }, (res: {
      success: boolean;
      attendeeId?: string;
      isFrozen?: boolean;
      activePoll?: { question: string; options: string[] } | null;
      activeQuiz?: any;
      quizQuestionsCount?: number;
      error?: string;
    }) => {
      if (res.success) {
        setAttendeeName(name);
        setRoomCode(upperCode);
        setAttendeeState({
          isFrozen: !!res.isFrozen,
          activePoll: res.activePoll || null,
          activeQuiz: res.activeQuiz || null,
          quizQuestionsCount: res.quizQuestionsCount || 0,
        });

        // Push state & update route
        window.history.pushState({}, '', `/room/${upperCode}`);
        setRoute('attendee');
      } else {
        setConnectionError(res.error || 'Failed to join room.');
        // Disconnect socket if join failed to keep active connections clean
        s.disconnect();
        socketRef.current = null;
        setSocket(null);
      }
    });
  };

  // Terminate connection & reset states on leave/disconnect
  const handleLeaveOrClose = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setSocket(null);
    }
    setRoomCode('');
    setAttendeeName('');
    setRoute('landing');
    window.history.pushState({}, '', '/');
  };

  const handleEndSession = () => {
    if (socketRef.current) {
      socketRef.current.emit('end_session', (res: any) => {
        if (res && res.success) {
          handleLeaveOrClose();
        }
      });
    }
  };

  const handleGoogleSignIn = async () => {
    setLocalError('');
    clearError();
    await signInWithGoogle();
  };

  if (authLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="bg-zinc-950 min-h-screen text-zinc-100 font-sans selection:bg-zinc-800">
      {connectionError && (
        <div className="bg-rose-950/80 border-b border-rose-900 px-4 py-2 text-center text-xs font-bold text-rose-300 flex items-center justify-center gap-2 animate-fade-in sticky top-0 z-50">
          <span className="h-2 w-2 bg-rose-500 rounded-full animate-ping"></span>
          <span>{connectionError}</span>
        </div>
      )}

      {route === 'landing' && (
        !authenticatedUser ? (
          <div className="min-h-screen bg-zinc-950 flex flex-col justify-between p-6 text-zinc-100 selection:bg-zinc-800 selection:text-white">
            {/* Header */}
            <header className="w-full max-w-4xl mx-auto flex items-center justify-between py-4 border-b border-zinc-900">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 bg-zinc-100 rounded-lg flex items-center justify-center text-zinc-950 font-bold text-lg shadow-lg shadow-zinc-100/10">
                  P
                </div>
                <span className="font-bold text-xl tracking-tight text-white">PresentSync</span>
              </div>
            </header>

            {/* Login Wall */}
            <main className="w-full max-w-md mx-auto my-auto py-12 flex flex-col gap-8">
              <div className="text-center space-y-2">
                <h1 className="text-4xl font-extrabold tracking-tight text-white">
                  PresentSync Command Center
                </h1>
                <p className="text-zinc-400 text-sm">
                  Real-time synchronization for presenter-led interactive rooms.
                </p>
              </div>

              <div className="bg-zinc-900/40 border border-zinc-900 rounded-2xl p-8 shadow-2xl backdrop-blur-md space-y-6 animate-fade-in">
                <div className="space-y-1 text-center">
                  <h2 className="text-xl font-bold text-white">
                    Sign In Required
                  </h2>
                  <p className="text-zinc-400 text-xs">
                    Sign in with Google to access presenter tools & join live rooms
                  </p>
                </div>

                {(localError || authError) && (
                  <div className="text-xs font-semibold text-rose-550 bg-rose-950/20 border border-rose-950/50 rounded-lg p-3 relative flex items-center justify-between">
                    <span>{localError || authError}</span>
                    <button
                      onClick={() => { setLocalError(''); clearError(); }}
                      className="text-rose-400 hover:text-rose-200 cursor-pointer font-bold text-sm ml-2"
                    >
                      ×
                    </button>
                  </div>
                )}

                <button
                  onClick={handleGoogleSignIn}
                  type="button"
                  className="w-full bg-zinc-100 hover:bg-white text-zinc-950 font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-3 transition-all duration-200 cursor-pointer shadow-lg hover:scale-[1.01] active:scale-[0.99]"
                >
                  <Chrome className="h-5 w-5 text-violet-650" />
                  <span>Continue with Google</span>
                </button>
              </div>
            </main>

            {/* Footer */}
            <footer className="w-full max-w-4xl mx-auto py-4 text-center text-xs text-zinc-650 border-t border-zinc-900">
              © 2026 PresentSync Inc. All rights reserved. Real-time sub-second sync active.
            </footer>
          </div>
        ) : (
          <LandingPage
            onCreateRoom={handleCreateRoom}
            onJoinRoom={handleJoinRoom}
            initialRoomCode={roomCode}
            initialName={authenticatedUser.name}
            initialPicture={authenticatedUser.picture}
            onLogout={handleLogout}
          />
        )
      )}

      {route === 'host' && socket && (
        <HostDashboard
          roomCode={roomCode}
          socket={socket}
          onEndSession={handleEndSession}
        />
      )}

      {route === 'attendee' && socket && (
        <AttendeeView
          roomCode={roomCode}
          attendeeName={attendeeName}
          socket={socket}
          onLeave={handleLeaveOrClose}
          initialState={attendeeState}
        />
      )}
    </div>
  );
}

export default App;;
