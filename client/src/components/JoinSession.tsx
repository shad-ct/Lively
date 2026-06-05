import React, { useState, useEffect } from 'react';
import Avatar from 'boring-avatars';
import { User, ArrowRight } from 'lucide-react';

interface JoinSessionProps {
  roomCode: string;
  onJoin: (name: string, guestId: string) => void;
  onCancel?: () => void;
}

export const JoinSession: React.FC<JoinSessionProps> = ({
  roomCode,
  onJoin,
  onCancel
}) => {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  // Prefill name if already stored in localStorage
  useEffect(() => {
    const savedName = localStorage.getItem('name');
    if (savedName) {
      setName(savedName);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Please enter your name to join.');
      return;
    }

    // 1. Get or generate permanent guestId
    let guestId = localStorage.getItem('guestId');
    if (!guestId) {
      guestId = typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }

    // 2. Save credentials to localStorage
    localStorage.setItem('name', trimmedName);
    localStorage.setItem('guestId', guestId);

    // 3. Trigger join flow
    onJoin(trimmedName, guestId);
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-zinc-100 selection:bg-zinc-800 selection:text-white">
      {/* Centered card */}
      <div className="bg-zinc-900/40 border border-zinc-900 rounded-3xl p-8 shadow-2xl backdrop-blur-md max-w-md w-full space-y-6 animate-fade-in">
        
        {/* Title */}
        <div className="text-center space-y-2">
          <div className="inline-block px-3 py-1 rounded-full bg-zinc-950 border border-zinc-850 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
            Room Code: <span className="font-mono text-zinc-200 tracking-wider">{roomCode}</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Guest Entry</h1>
          <p className="text-zinc-500 text-xs">
            Enter a display name to generate your avatar and join the session.
          </p>
        </div>

        {/* Live Avatar Preview */}
        <div className="flex flex-col items-center justify-center space-y-2">
          <div className="relative group">
            <div className="absolute inset-0 bg-violet-650/15 rounded-full blur-xl transition-all duration-300 group-hover:scale-110"></div>
            <div className="relative h-24 w-24 rounded-full border border-zinc-805 bg-zinc-950 p-1 flex items-center justify-center transition-all duration-300 overflow-hidden">
              <Avatar
                size={88}
                name={name.trim() || "Guest"}
                variant="beam"
                colors={['#8B5CF6', '#EC4899', '#3B82F6', '#10B981', '#F59E0B']}
              />
            </div>
          </div>
          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
            Live Preview
          </span>
        </div>

        {/* Entry Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="name-input" className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Display Name
            </label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <input
                id="name-input"
                type="text"
                autoFocus
                maxLength={24}
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-850 rounded-xl py-3 pl-10.5 pr-4 text-sm text-zinc-100 placeholder-zinc-700 focus:outline-none focus:border-zinc-500 transition-colors duration-200"
              />
            </div>
          </div>

          {error && (
            <div className="text-xs font-semibold text-rose-500 bg-rose-950/20 border border-rose-950/50 rounded-lg p-3">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 bg-zinc-950 hover:bg-zinc-900 border border-zinc-850 text-zinc-400 font-semibold py-3 px-4 rounded-xl text-xs uppercase tracking-wider transition-colors duration-200 cursor-pointer"
              >
                Back
              </button>
            )}
            <button
              type="submit"
              className="flex-[2] bg-zinc-100 hover:bg-white text-zinc-950 font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer hover:scale-[1.01] active:scale-[0.99] shadow-md shadow-zinc-950/50 text-xs uppercase tracking-wider"
            >
              <span>Join Room</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
