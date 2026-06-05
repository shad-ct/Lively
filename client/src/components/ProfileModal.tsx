import React, { useState, useEffect } from 'react';
import { createAvatar } from '@dicebear/core';
import { initials, lorelei, bottts, funEmoji, shapes, adventurer } from '@dicebear/collection';
import { useAuth } from '../context/AuthContext';
import { User, Sparkles, RefreshCw, Save, X } from 'lucide-react';

const styles = [
  { name: 'Fun Emoji', value: funEmoji },
  { name: 'Lorelei', value: lorelei },
  { name: 'Bottts', value: bottts },
  { name: 'Adventurer', value: adventurer },
  { name: 'Shapes', value: shapes },
  { name: 'Initials', value: initials },
];

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose }) => {
  const { user, completeProfileSetup } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [selectedStyleIndex, setSelectedStyleIndex] = useState(0);
  const [seed, setSeed] = useState(user?.name || 'PresentSync');
  const [isManualSeed, setIsManualSeed] = useState(false);
  const [avatarDataUrl, setAvatarDataUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Reset local state when modal opens/changes user details
  useEffect(() => {
    if (isOpen && user) {
      setName(user.name);
      setSeed(user.name);
      setIsManualSeed(false);
    }
  }, [isOpen, user]);

  // Auto-generate avatar whenever style or seed changes
  useEffect(() => {
    if (!isOpen) return;
    try {
      const avatar = createAvatar(styles[selectedStyleIndex].value as any, {
        seed: seed.trim() || 'PresentSync',
      });
      
      const dataUri = avatar.toDataUri();
      setAvatarDataUrl(dataUri);
    } catch (err) {
      console.error('Error generating avatar:', err);
    }
  }, [selectedStyleIndex, seed, isOpen]);

  // Sync seed with name initially, until user manually edits seed
  useEffect(() => {
    if (!isManualSeed && name.trim()) {
      setSeed(name.trim());
    }
  }, [name, isManualSeed]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!name.trim()) {
      setError('Please enter a display name.');
      return;
    }

    setLoading(true);
    try {
      await completeProfileSetup(name.trim(), avatarDataUrl);
      onClose();
    } catch (err: any) {
      console.error('Failed to update profile:', err);
      setError(err.message || 'Failed to update profile details. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRandomizeSeed = () => {
    const randomSeed = Math.random().toString(36).substring(2, 10);
    setSeed(randomSeed);
    setIsManualSeed(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm transition-all duration-300">
      <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-850 rounded-2xl p-6 shadow-2xl space-y-6 animate-scale-up">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-500 hover:text-white transition duration-200 cursor-pointer"
          title="Close Modal"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Title */}
        <div className="space-y-1 text-center">
          <h2 className="text-xl font-bold text-white flex items-center justify-center gap-2">
            Customize Presenter Profile
          </h2>
          <p className="text-zinc-400 text-xs">
            Edit your display details and avatar for PresentSync rooms.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Avatar Preview */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative group">
              <div className="absolute inset-0 bg-violet-600/30 rounded-full blur-md transition duration-300"></div>
              <div className="relative h-24 w-24 rounded-full border-2 border-zinc-800 hover:border-violet-500 bg-zinc-950 p-1 flex items-center justify-center transition duration-300 overflow-hidden">
                {avatarDataUrl ? (
                  <img 
                    src={avatarDataUrl} 
                    alt="Avatar Preview" 
                    className="h-full w-full rounded-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full rounded-full bg-zinc-900 flex items-center justify-center">
                    <User className="h-8 w-8 text-zinc-600 animate-pulse" />
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleRandomizeSeed}
                className="absolute bottom-0 right-0 bg-violet-600 hover:bg-violet-500 border border-zinc-950 text-white rounded-full p-2 hover:scale-110 active:scale-95 transition shadow-lg cursor-pointer"
                title="Randomize Avatar Seed"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Name Input */}
          <div className="space-y-1">
            <label htmlFor="modal-display-name" className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Display Name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600" />
              <input
                id="modal-display-name"
                type="text"
                required
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-violet-600 focus:ring-1 focus:ring-violet-600 rounded-xl py-2.5 pl-10 pr-4 text-sm text-zinc-100 placeholder-zinc-700 focus:outline-none transition-colors duration-200"
              />
            </div>
          </div>

          {/* Avatar Styles Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Avatar Style
            </label>
            <div className="grid grid-cols-3 gap-2">
              {styles.map((style, index) => (
                <button
                  key={style.name}
                  type="button"
                  onClick={() => setSelectedStyleIndex(index)}
                  className={`py-1.5 px-1 text-xs rounded-xl border font-medium cursor-pointer transition-all duration-200 text-center ${
                    selectedStyleIndex === index
                      ? 'bg-violet-600 border-violet-500 text-white shadow-md shadow-violet-600/10'
                      : 'bg-zinc-950 border-zinc-850 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  {style.name}
                </button>
              ))}
            </div>
          </div>

          {/* Avatar Seed */}
          <div className="space-y-1">
            <label htmlFor="modal-avatar-seed" className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Avatar Seed
            </label>
            <div className="relative">
              <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-650" />
              <input
                id="modal-avatar-seed"
                type="text"
                placeholder="Type anything to randomize details..."
                value={seed}
                onChange={(e) => {
                  setSeed(e.target.value);
                  setIsManualSeed(true);
                }}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-violet-600 focus:ring-1 focus:ring-violet-600 rounded-xl py-2.5 pl-10 pr-4 text-sm text-zinc-100 placeholder-zinc-700 focus:outline-none transition-colors duration-200"
              />
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="text-xs font-semibold text-rose-500 bg-rose-950/20 border border-rose-950/50 rounded-lg p-3">
              {error}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="w-1/2 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 text-zinc-300 font-medium py-3 px-4 rounded-xl transition duration-200 cursor-pointer text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="w-1/2 bg-zinc-100 hover:bg-white text-zinc-950 font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99] transition duration-200 cursor-pointer text-sm shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="h-4 w-4" />
              <span>{loading ? 'Saving...' : 'Save Profile'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
