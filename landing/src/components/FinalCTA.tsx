import React from 'react';
import { ArrowRight, ShieldCheck, CheckCircle2, Zap } from 'lucide-react';

interface FinalCTAProps {
  onOpenTrial: () => void;
}

export const FinalCTA: React.FC<FinalCTAProps> = ({ onOpenTrial }) => {
  return (
    <section className="py-24 relative overflow-hidden bg-slate-950">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[350px] bg-emerald-500/15 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 relative text-center">
        
        {/* Brand badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold text-emerald-400 mb-6">
          <Zap className="h-4 w-4" />
          <span>Stop Overpaying for Electricity Today</span>
        </div>

        <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-tight mb-5">
          Ready to Cut Your Electric Bill and Protect Your Home?
        </h2>

        <p className="text-base sm:text-lg text-slate-300 max-w-xl mx-auto mb-9 font-normal">
          Join 12,500+ happy homeowners who stop wasting money and protect their expensive gear every day.
        </p>

        {/* Primary CTA (Fitts's Law: prominent repeated target) */}
        <div className="max-w-md mx-auto mb-6">
          <button
            onClick={onOpenTrial}
            className="w-full min-h-[58px] px-8 py-4 rounded-xl bg-emerald-500 text-slate-950 font-extrabold text-lg shadow-xl shadow-emerald-500/30 hover:bg-emerald-400 hover:shadow-emerald-500/40 transition-all flex items-center justify-center gap-2.5 active:scale-95"
          >
            <span>Start Your Free 14-Day Trial</span>
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>

        {/* Risk Reversal & Cancel Anytime Line */}
        <div className="flex flex-wrap items-center justify-center gap-y-2 gap-x-5 text-xs sm:text-sm text-slate-400">
          <span className="flex items-center gap-1.5 text-slate-300">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>No credit card required</span>
          </span>
          <span className="flex items-center gap-1.5 text-slate-300">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>Instant access</span>
          </span>
          <span className="flex items-center gap-1.5 text-slate-300">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>Cancel anytime in 1 click</span>
          </span>
          <span className="flex items-center gap-1.5 text-slate-300">
            <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>30-day money-back guarantee</span>
          </span>
        </div>

      </div>
    </section>
  );
};
