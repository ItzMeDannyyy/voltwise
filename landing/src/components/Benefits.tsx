import React, { useState } from 'react';
import { DollarSign, ShieldAlert, Smartphone, ArrowRight, Sliders, CheckCircle2 } from 'lucide-react';

interface BenefitsProps {
  onOpenTrial: () => void;
}

export const Benefits: React.FC<BenefitsProps> = ({ onOpenTrial }) => {
  // Interactive Savings Calculator state
  const [currentBill, setCurrentBill] = useState(180);
  const estimatedSavingsMonthly = Math.round(currentBill * 0.28);
  const estimatedSavingsYearly = estimatedSavingsMonthly * 12;

  const benefitsList = [
    {
      icon: DollarSign,
      title: "Save $30 to $80 Every Month",
      featureLabel: "Smart Load Tracking",
      copy: "You keep more cash in your wallet because smart load tracking spots power-hungry appliances before they run up your utility bill.",
      color: "text-emerald-400",
      border: "border-emerald-500/30",
      bg: "bg-emerald-500/10"
    },
    {
      icon: ShieldAlert,
      title: "Sleep Easy with Safe Appliances",
      featureLabel: "3-Second Auto Relay",
      copy: "You never have to stress about ruined appliances because auto-relay protection cuts off dangerous voltage surges in under 3 seconds.",
      color: "text-teal-400",
      border: "border-teal-500/30",
      bg: "bg-teal-500/10"
    },
    {
      icon: Smartphone,
      title: "Take Full Control from Anywhere",
      featureLabel: "Live Telemetry & Predictor",
      copy: "You always know what you owe before the mail arrives because live telemetry converts raw electricity usage into clear dollars and cents.",
      color: "text-cyan-400",
      border: "border-cyan-500/30",
      bg: "bg-cyan-500/10"
    }
  ];

  return (
    <section id="benefits" className="py-20 bg-slate-900/40 border-t border-slate-800/80">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-xs font-semibold text-emerald-400 mb-3">
            <span>Guaranteed Payoffs</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Keep More Money in Your Pocket Every Single Month.
          </h2>
          <p className="mt-3 text-base text-slate-300">
            Clear financial payoffs backed by real hardware and machine learning.
          </p>
        </div>

        {/* 3 Core Benefits (Payoff + Because...) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {benefitsList.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div 
                key={idx}
                className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 flex flex-col justify-between hover:border-slate-700 transition-all shadow-sm"
              >
                <div>
                  <div className={`w-12 h-12 rounded-xl ${item.bg} ${item.color} border ${item.border} flex items-center justify-center mb-5`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    {item.featureLabel}
                  </span>
                  <h3 className="text-xl font-bold text-white mb-3">
                    {item.title}
                  </h3>
                  <p className="text-sm text-slate-300 leading-relaxed font-normal">
                    {item.copy}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800 flex items-center gap-2 text-xs font-semibold text-emerald-400">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>Immediate everyday payoff</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Interactive Savings Calculator (Cognitive Fluency: Tangible Value) */}
        <div className="rounded-3xl border border-emerald-500/30 bg-gradient-to-b from-slate-900 to-slate-950 p-6 sm:p-8 shadow-xl">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
            
            <div className="lg:max-w-md">
              <div className="inline-flex items-center gap-2 rounded-md bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400 mb-2">
                <Sliders className="h-3.5 w-3.5" />
                <span>Instant Savings Calculator</span>
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">
                See How Much You Could Save
              </h3>
              <p className="text-sm text-slate-300 mb-6">
                Slide to your approximate monthly electric bill to estimate your annual VoltWise savings:
              </p>

              {/* Bill Range Slider */}
              <div className="space-y-3">
                <div className="flex justify-between text-sm font-semibold">
                  <span className="text-slate-400">Current Monthly Bill:</span>
                  <span className="text-xl font-mono font-bold text-white">${currentBill} / mo</span>
                </div>
                <input
                  type="range"
                  min="80"
                  max="600"
                  step="10"
                  value={currentBill}
                  onChange={(e) => setCurrentBill(Number(e.target.value))}
                  className="w-full h-2.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                />
                <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                  <span>$80/mo</span>
                  <span>$340/mo</span>
                  <span>$600/mo</span>
                </div>
              </div>
            </div>

            {/* Calculated Results Box */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 flex flex-col justify-center text-center sm:text-left min-w-[280px]">
              <div className="mb-4">
                <span className="text-xs uppercase font-bold tracking-wider text-slate-400 block mb-1">
                  Estimated Monthly Savings
                </span>
                <div className="text-4xl font-extrabold font-mono text-emerald-400">
                  ${estimatedSavingsMonthly}
                  <span className="text-sm font-normal text-slate-400"> / month</span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 mb-5">
                <span className="text-xs text-slate-400">Estimated Annual Money Back:</span>
                <div className="text-xl font-bold font-mono text-white">
                  ${estimatedSavingsYearly} / year
                </div>
              </div>

              {/* Fitts's Law Primary CTA repetition */}
              <button
                onClick={onOpenTrial}
                className="w-full min-h-[48px] rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-emerald-400 transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 active:scale-95"
              >
                <span>Start Your Free 14-Day Trial</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

          </div>
        </div>

      </div>
    </section>
  );
};
