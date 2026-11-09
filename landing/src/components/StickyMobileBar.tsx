import React, { useState, useEffect } from 'react';
import { ArrowRight, ShieldCheck } from 'lucide-react';

interface StickyMobileBarProps {
  onOpenTrial: () => void;
}

export const StickyMobileBar: React.FC<StickyMobileBarProps> = ({ onOpenTrial }) => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // Show sticky mobile bar once user scrolls past 350px
      if (window.scrollY > 350) {
        setShow(true);
      } else {
        setShow(false);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 p-3 bg-slate-950/95 border-t border-slate-800 backdrop-blur-md md:hidden shadow-2xl transition-all">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>14-Day Free Access</span>
          </div>
          <span className="text-[11px] text-slate-400">Zero card needed &middot; $0 today</span>
        </div>

        {/* Fitts's Law: Large Thumb Tap Target */}
        <button
          onClick={onOpenTrial}
          className="min-h-[48px] px-5 py-2.5 rounded-xl bg-emerald-500 font-bold text-xs text-slate-950 flex items-center gap-1.5 shadow-lg shadow-emerald-500/25 active:scale-95 transition-all"
        >
          <span>Start Free Trial</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
