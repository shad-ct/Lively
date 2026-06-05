import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { LandingPage } from './components/LandingPage';
import { HostDashboard } from './components/HostDashboard';
import { AttendeeView } from './components/AttendeeView';
import { JoinSession } from './components/JoinSession';

const getBackendUrl = () => {
  if (typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.startsWith('192.168.'))) {
    return `http://${window.location.hostname}:5000`;
  }
  return import.meta.env.VITE_SERVER_URL || import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
};

export const BACKEND_URL = getBackendUrl();
const SOCKET_SERVER_URL = import.meta.env.VITE_SOCKET_URL || BACKEND_URL;

function App() {
  return <AppContent />;
}

function AppContent() {
  // Routing states
  const [route, setRoute] = useState<'landing' | 'host' | 'attendee' | 'join'>('landing');
  const [roomCode, setRoomCode] = useState('');
  const [attendeeName, setAttendeeName] = useState(() => localStorage.getItem('name') || '');

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
        
        const storedName = localStorage.getItem('name');
        const storedGuestId = localStorage.getItem('guestId');

        if (storedName && storedGuestId) {
          setAttendeeName(storedName);
          setRoute('attendee');
        } else {
          setRoute('join');
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
  }, [roomCode]);

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
  const handleJoinRoom = (name: string, code: string, guestId?: string) => {
    setConnectionError('');
    const s = connectSocket();
    const upperCode = code.toUpperCase();

    // 1. Get or generate permanent guestId if not supplied
    let activeGuestId = guestId;
    if (!activeGuestId) {
      activeGuestId = localStorage.getItem('guestId') || '';
      if (!activeGuestId) {
        activeGuestId = typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('guestId', activeGuestId);
      }
    }
    
    // Save details to localStorage
    localStorage.setItem('name', name);

    // 2. Emit join_room with guestId
    s.emit('join_room', { code: upperCode, name, guestId: activeGuestId }, (res: {
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

  return (
    <div className="bg-zinc-950 min-h-screen text-zinc-100 font-sans selection:bg-zinc-800">
      {connectionError && (
        <div className="bg-rose-950/80 border-b border-rose-900 px-4 py-2 text-center text-xs font-bold text-rose-300 flex items-center justify-center gap-2 animate-fade-in sticky top-0 z-50">
          <span className="h-2 w-2 bg-rose-500 rounded-full animate-ping"></span>
          <span>{connectionError}</span>
        </div>
      )}

      {route === 'landing' && (
        <LandingPage
          onCreateRoom={handleCreateRoom}
          onJoinRoom={(name, code) => handleJoinRoom(name, code)}
          initialRoomCode={roomCode}
          initialName={attendeeName}
        />
      )}

      {route === 'join' && (
        <JoinSession
          roomCode={roomCode}
          onJoin={(name, guestId) => handleJoinRoom(name, roomCode, guestId)}
          onCancel={() => {
            window.history.pushState({}, '', '/');
            setRoute('landing');
          }}
        />
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

export default App;
