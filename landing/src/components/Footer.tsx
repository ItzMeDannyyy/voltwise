import React from 'react';
import { Shield, Lock } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-slate-800 bg-slate-950 py-12 text-slate-400 text-xs">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-6">
        
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <Shield className="h-4 w-4" />
          </div>
          <span className="font-bold text-white text-sm">VoltWise by VoltMinds</span>
        </div>

        {/* Security / Privacy line */}
        <div className="flex items-center gap-1.5 text-slate-400">
          <Lock className="h-3.5 w-3.5 text-emerald-400" />
          <span>Bank-Grade 256-Bit TLS Encryption &middot; Data Never Sold</span>
        </div>

        {/* Copyright */}
        <div className="text-slate-500">
          &copy; {new Date().getFullYear()} VoltWise by VoltMinds. All rights reserved.
        </div>

      </div>
    </footer>
  );
};
