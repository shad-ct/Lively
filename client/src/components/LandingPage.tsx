import React, { useState, useEffect } from 'react';
import { Presentation, User, Hash, ArrowRight } from 'lucide-react';
import { ProfileModal } from './ProfileModal';

interface LandingPageProps {
  onCreateRoom: () => void;
  onJoinRoom: (name: string, code: string) => void;
  initialRoomCode?: string;
  initialName?: string;
  initialPicture?: string;
  onLogout?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onCreateRoom,
  onJoinRoom,
  initialRoomCode = '',
  initialName = '',
  initialPicture = '',
  onLogout,
}) => {
  const [name, setName] = useState(initialName);
  const [code, setCode] = useState(initialRoomCode.toUpperCase());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // Sync attendee name with profile changes
  useEffect(() => {
    setName(initialName);
  }, [initialName]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Please enter your name.');
      return;
    }
    if (!code.trim() || code.length !== 6) {
      setError('Room code must be exactly 6 characters.');
      return;
    }

    setLoading(true);
    onJoinRoom(name.trim(), code.trim().toUpperCase());
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col justify-between p-6 text-zinc-100 selection:bg-zinc-800 selection:text-white">
      {/* Header */}
      <header className="w-full max-w-4xl mx-auto flex items-center justify-between py-4 border-b border-zinc-900">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 bg-zinc-100 rounded-lg flex items-center justify-center text-zinc-950 font-bold text-lg shadow-lg shadow-zinc-100/10">
            L
          </div>
          <span className="font-bold text-xl tracking-tight text-white">Lively</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          {initialName && (
            <button 
              onClick={() => setIsProfileModalOpen(true)}
              className="flex items-center gap-2 hover:opacity-85 transition cursor-pointer text-left focus:outline-none"
              title="Edit Profile"
            >
              {initialPicture ? (
                <img 
                  src={initialPicture} 
                  alt="Avatar" 
                  className="h-8 w-8 rounded-full border border-zinc-805 bg-zinc-900 shadow-sm shadow-violet-500/10"
                />
              ) : (
                <div className="h-8 w-8 rounded-full border border-zinc-800 bg-zinc-900 flex items-center justify-center">
                  <User className="h-4 w-4 text-zinc-550" />
                </div>
              )}
              <span className="text-zinc-400 font-medium hidden sm:inline">Hello, <strong className="text-zinc-200">{initialName}</strong></span>
            </button>
          )}
          {onLogout && (
            <button 
              onClick={onLogout}
              className="text-xs bg-zinc-905 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-350 hover:text-white px-3.5 py-2 rounded-xl cursor-pointer transition-colors"
            >
              Sign Out
            </button>
          )}
        </div>
      </header>

      {/* Hero Section / Main Form */}
      <main className="w-full max-w-md mx-auto my-auto py-12 flex flex-col gap-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-extrabold tracking-tight text-white">
            Command Your Audience
          </h1>
          <p className="text-zinc-400 text-sm">
            Real-time synchronization for presenter-led interactive rooms.
          </p>
        </div>

        <div className="bg-zinc-900/40 border border-zinc-900 rounded-2xl p-6 shadow-2xl backdrop-blur-md space-y-6">
          <h2 className="text-lg font-semibold text-white">Join as Attendee</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="name-input" className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Your Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  id="name-input"
                  type="text"
                  placeholder="Jane Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors duration-200"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="code-input" className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Room Code</label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  id="code-input"
                  type="text"
                  maxLength={6}
                  placeholder="ABCDEF"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-sm font-mono tracking-widest text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors duration-200"
                />
              </div>
            </div>

            {error && (
              <div className="text-xs font-semibold text-rose-500 bg-rose-950/20 border border-rose-950/50 rounded-lg p-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-zinc-100 hover:bg-white text-zinc-950 font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 cursor-pointer disabled:opacity-50"
            >
              <span>{loading ? 'Joining Room...' : 'Enter Session'}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-zinc-900"></div>
            <span className="flex-shrink mx-4 text-zinc-600 text-xs font-bold uppercase tracking-widest">OR</span>
            <div className="flex-grow border-t border-zinc-900"></div>
          </div>

          <div className="space-y-3">
            <div className="text-center">
              <span className="text-zinc-500 text-xs">Are you the presenter?</span>
            </div>
            <button
              type="button"
              onClick={onCreateRoom}
              className="w-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-100 font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer"
            >
              <Presentation className="h-4 w-4" />
              <span>Launch Command Center</span>
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-4xl mx-auto py-4 text-center text-xs text-zinc-600 border-t border-zinc-900">
        © 2026 Lively Inc. All rights reserved. Real-time sub-second sync active.
      </footer>

      <ProfileModal 
        isOpen={isProfileModalOpen} 
        onClose={() => setIsProfileModalOpen(false)} 
      />
    </div>
  );
};
