import React, { useState } from 'react';
import { UserRole } from '../types';
import {
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
  User,
  ShieldCheck,
} from 'lucide-react';

interface PinModalProps {
  onAuthenticate: (role: UserRole) => void;
}

export const PinModal: React.FC<PinModalProps> = ({ onAuthenticate }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showPin, setShowPin] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = pin.trim();
    if (trimmed === '2345') {
      setError(null);
      onAuthenticate('user');
    } else if (trimmed === '6789') {
      setError(null);
      onAuthenticate('admin');
    } else {
      setError('PIN tidak valid. Silakan periksa kembali PIN Anda.');
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-neutral-900/90 border border-white/15 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative z-10 space-y-6">
        {/* Header Branding */}
        <div className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-neutral-800 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
            <KeyRound className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-serif font-extrabold text-white tracking-tight">
            AO TASIKMALAYA
          </h1>
          <p className="text-xs font-semibold text-amber-400/90 tracking-widest uppercase">
            Akses Digital CDC Platform
          </p>
        </div>

        {/* PIN Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-gray-300 flex items-center justify-between">
              <span>Masukkan PIN Akses</span>
              <span className="text-[10px] text-gray-500 font-normal">
                Wajib diisi
              </span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPin ? 'text' : 'password'}
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Masukkan PIN Akses"
                maxLength={10}
                autoFocus
                className="w-full bg-black/60 border border-white/15 focus:border-amber-500 rounded-xl pl-10 pr-10 py-3 text-sm text-white placeholder-gray-500 tracking-wider font-mono focus:outline-none transition-all shadow-inner"
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                {showPin ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium flex items-center gap-2 animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            className="w-full py-3.5 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-extrabold text-xs sm:text-sm uppercase tracking-widest rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer hover:scale-[1.01] active:scale-95"
          >
            <span>Masuk Platform</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Roles Hint */}
        <div className="pt-4 border-t border-white/10 space-y-2.5">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider text-center">
            Tingkat Hak Akses System:
          </p>
          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 text-left">
              <div className="flex items-center gap-1.5 text-blue-400 font-bold mb-1">
                <User className="w-3.5 h-3.5" />
                <span>Akses User</span>
              </div>
              <div className="text-[10px] text-gray-400 leading-relaxed">
                Akses khusus pengisian kuesioner & survey event.
              </div>
            </div>

            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 text-left">
              <div className="flex items-center gap-1.5 text-amber-400 font-bold mb-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Akses Admin</span>
              </div>
              <div className="text-[10px] text-gray-400 leading-relaxed">
                Full akses dashboard, summary performance, & export data.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
