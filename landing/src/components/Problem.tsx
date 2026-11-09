import React from 'react';
import { HelpCircle, BatteryLow, Flame, RotateCcw } from 'lucide-react';

export const Problem: React.FC = () => {
  const headaches = [
    {
      icon: HelpCircle,
      title: "Mystery Bill Surges",
      text: "Your utility bill arrives, and you have zero clue why it jumped $80.",
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20"
    },
    {
      icon: BatteryLow,
      title: "Silent Vampire Leaks",
      text: "Old appliances quietly suck electricity 24/7, even when turned off.",
      color: "text-rose-400",
      bg: "bg-rose-500/10",
      border: "border-rose-500/20"
    },
    {
      icon: Flame,
      title: "Burnout Anxiety",
      text: "Sudden voltage spikes quietly cook your expensive electronics and appliances.",
      color: "text-red-400",
      bg: "bg-red-500/10",
      border: "border-red-500/20"
    },
    {
      icon: RotateCcw,
      title: "Wasted Everyday Effort",
      text: "Walk around turning off lights, only to see next month's bill go up anyway.",
      color: "text-orange-400",
      bg: "bg-orange-500/10",
      border: "border-orange-500/20"
    }
  ];

  return (
    <section id="problem" className="py-20 bg-slate-900/60 border-y border-slate-800/80">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-3.5 py-1 text-xs font-semibold text-red-400 mb-3">
            <span>The Daily Energy Headache</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
            Tired of Playing the Guessing Game with Your Power Bill?
          </h2>
          <p className="mt-4 text-base text-slate-300">
            Most homes lose hundreds of dollars every year to power waste they cannot see.
          </p>
        </div>

        {/* 4 Daily Headache Bullets (Chunked Cognitive Load) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {headaches.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div 
                key={idx}
                className="flex items-start gap-4 p-5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-colors shadow-sm"
              >
                <div className={`p-3 rounded-xl shrink-0 ${item.bg} ${item.color} border ${item.border}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white mb-1">
                    {item.title}
                  </h3>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {item.text}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
