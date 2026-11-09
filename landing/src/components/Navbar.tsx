import React from 'react';
import { Shield, Zap, ArrowRight } from 'lucide-react';

interface NavbarProps {
  onOpenTrial: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenTrial }) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
      {/* Top micro-announcement bar for urgency */}
      <div className="bg-gradient-to-r from-emerald-950/80 via-slate-900 to-emerald-950/80 py-1.5 px-4 text-center border-b border-emerald-900/40">
        <p className="text-xs font-medium text-emerald-300 flex items-center justify-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Limited Onboarding: Only 43 spots remain at grandfathered $19/mo pricing</span>
        </p>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <a href="#hero" className="flex items-center gap-2.5 text-white group">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-transform">
            <Shield className="h-5 w-5 text-slate-950" />
            <Zap className="h-3 w-3 text-white absolute fill-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-black tracking-tight text-white leading-tight">
              VoltWise
            </span>
            <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-400">
              by VoltMinds
            </span>
          </div>
        </a>

        {/* Minimal Nav Links for Cognitive Fluency */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300">
          <a href="#problem" className="hover:text-emerald-400 transition-colors">
            Why VoltWise
          </a>
          <a href="#benefits" className="hover:text-emerald-400 transition-colors">
            Benefits
          </a>
          <a href="#how-it-works" className="hover:text-emerald-400 transition-colors">
            How It Works
          </a>
          <a href="#comparison" className="hover:text-emerald-400 transition-colors">
            Comparison
          </a>
          <a href="#faq" className="hover:text-emerald-400 transition-colors">
            FAQ
          </a>
        </nav>

        {/* Primary CTA Button (Fitts's Law: prominent contrast) */}
        <button
          onClick={onOpenTrial}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 sm:px-5 sm:py-2.5 text-xs sm:text-sm font-bold text-slate-950 shadow-md shadow-emerald-500/20 hover:bg-emerald-400 hover:shadow-emerald-500/30 transition-all active:scale-95"
        >
          <span>Start Free Trial</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
};
