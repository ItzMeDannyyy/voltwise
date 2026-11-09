import React from 'react';
import { ArrowRight, Clock, ShieldCheck, Flame } from 'lucide-react';

interface UrgencyProps {
  onOpenTrial: () => void;
}

export const Urgency: React.FC<UrgencyProps> = ({ onOpenTrial }) => {
  return (
    <section className="py-16 bg-gradient-to-b from-slate-950 via-emerald-950/20 to-slate-950 border-t border-slate-800">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        
        <div className="relative rounded-3xl border border-emerald-500/40 bg-slate-900/90 p-8 sm:p-12 text-center shadow-2xl overflow-hidden">
          
          {/* Background subtle radial light */}
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-48 bg-emerald-500/20 blur-[90px] rounded-full pointer-events-none" />

          {/* Scarcity Pill Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs font-bold text-amber-400 mb-6">
            <Flame className="h-4 w-4 text-amber-400" />
            <span>Limited Cohort Window: Only 43 Spots Left</span>
          </div>

          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-4 leading-tight">
            Lock In Early-Bird Pricing Before Rates Increase.
          </h2>

          <p className="text-base sm:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed mb-8">
            We are welcoming a limited cohort of 500 new homes this month with grandfathered lifetime pricing at just <span className="font-bold text-white">$19/month</span> (regularly $29/month), plus complimentary access to our Smart Surge Shield hardware pack.
          </p>

          {/* Primary CTA (Fitts's Law: large, centered) */}
          <div className="max-w-md mx-auto mb-6">
            <button
              onClick={onOpenTrial}
              className="w-full min-h-[56px] px-8 py-4 rounded-xl bg-emerald-500 text-slate-950 font-bold text-base sm:text-lg shadow-xl shadow-emerald-500/30 hover:bg-emerald-400 transition-all flex items-center justify-center gap-2 active:scale-95"
            >
              <span>Start Your Free 14-Day Trial</span>
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-y-2 gap-x-6 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-emerald-400" />
              <span>14-day free access</span>
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>Price locked for life</span>
            </span>
          </div>

        </div>

      </div>
    </section>
  );
};
