import React from 'react';
import { ActiveTab, UserRole } from '../types';
import {
  LayoutDashboard,
  ClipboardList,
  CalendarCheck,
  PartyPopper,
  ShieldCheck,
  User,
  LogOut,
} from 'lucide-react';

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  spbLoggedIn: boolean;
  eventLoggedIn: boolean;
  hajatanLoggedIn: boolean;
  spbName?: string;
  eventPicName?: string;
  userRole: UserRole;
  onLogoutPin?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  spbLoggedIn,
  eventLoggedIn,
  hajatanLoggedIn,
  userRole,
  onLogoutPin,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-[#0A0A0A]/90 backdrop-blur-md text-[#D4D4D4] border-b border-white/10 shadow-2xl">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Title */}
          <div
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-lg bg-white/10 border border-white/20 text-white font-serif italic font-bold flex items-center justify-center text-lg shadow-sm group-hover:bg-white/20 transition-all">
              AO
            </div>
            <div>
              <h1 className="font-extrabold text-base md:text-lg tracking-tight leading-tight text-white font-serif">
                AO TASIKMALAYA
              </h1>
              <p className="text-[10px] text-white/50 font-semibold tracking-widest uppercase">
                Digital CDC Platform
              </p>
            </div>
          </div>

          {/* Desktop Navigation & Actions */}
          <div className="flex items-center gap-3">
            <nav className="hidden md:flex items-center gap-1.5 bg-neutral-900/80 p-1.5 rounded-xl border border-white/10">
              <button
                type="button"
                onClick={() => setActiveTab('dashboard')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  activeTab === 'dashboard'
                    ? 'bg-white text-black shadow-md scale-102'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>Dashboard</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('spb')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all relative cursor-pointer ${
                  activeTab === 'spb'
                    ? 'bg-white text-black shadow-md scale-102'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                <ClipboardList className="w-4 h-4" />
                <span>Tracking SPB</span>
                {spbLoggedIn && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('event')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all relative cursor-pointer ${
                  activeTab === 'event'
                    ? 'bg-white text-black shadow-md scale-102'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                <CalendarCheck className="w-4 h-4" />
                <span>CDC FP/SPB</span>
                {eventLoggedIn && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('hajatan')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all relative cursor-pointer ${
                  activeTab === 'hajatan'
                    ? 'bg-white text-black shadow-md scale-102'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                <PartyPopper className="w-4 h-4" />
                <span>Hajatan Survey</span>
                {hajatanLoggedIn && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
                )}
              </button>
            </nav>

            {/* Role indicator and Logout */}
            {userRole && (
              <div className="flex items-center gap-2 pl-2 border-l border-white/10">
                {userRole === 'admin' ? (
                  <span className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Admin</span>
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center gap-1">
                    <User className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">User Mode</span>
                  </span>
                )}

                {onLogoutPin && (
                  <button
                    type="button"
                    onClick={onLogoutPin}
                    className="p-1.5 sm:px-2.5 sm:py-1 rounded-lg text-xs font-bold text-gray-400 hover:text-red-400 hover:bg-white/10 transition-colors flex items-center gap-1 cursor-pointer"
                    title="Keluar / Ganti PIN"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Ganti PIN</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Mobile Tab Navigation */}
        <div className="flex md:hidden items-center justify-around py-2 border-t border-white/10 text-[11px] font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded cursor-pointer ${
              activeTab === 'dashboard'
                ? 'text-white font-black'
                : 'text-white/50 hover:text-white/80'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Home</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('spb')}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded relative cursor-pointer ${
              activeTab === 'spb'
                ? 'text-white font-black'
                : 'text-white/50 hover:text-white/80'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            <span>SPB</span>
            {spbLoggedIn && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('event')}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded relative cursor-pointer ${
              activeTab === 'event'
                ? 'text-white font-black'
                : 'text-white/50 hover:text-white/80'
            }`}
          >
            <CalendarCheck className="w-4 h-4" />
            <span>CDC FP/SPB</span>
            {eventLoggedIn && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('hajatan')}
            className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded relative cursor-pointer ${
              activeTab === 'hajatan'
                ? 'text-white font-black'
                : 'text-white/50 hover:text-white/80'
            }`}
          >
            <PartyPopper className="w-4 h-4" />
            <span>Hajatan</span>
            {hajatanLoggedIn && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
