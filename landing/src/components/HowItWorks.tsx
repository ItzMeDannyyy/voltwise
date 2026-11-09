import React from 'react';
import { PlugZap, Smartphone, ShieldCheck } from 'lucide-react';

export const HowItWorks: React.FC = () => {
  const steps = [
    {
      step: "Step 1",
      icon: PlugZap,
      title: "Connect in 2 Minutes",
      desc: "Plug the compact sensor in or sync your existing smart meter. No tools, no rewiring, and no electrician required.",
      accent: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/30"
    },
    {
      step: "Step 2",
      icon: Smartphone,
      title: "See Waste Instantly",
      desc: "Open the mobile app to see live watts, daily dollar costs, and sneaky power leaks in clear, simple numbers.",
      accent: "text-teal-400",
      bg: "bg-teal-500/10",
      border: "border-teal-500/30"
    },
    {
      step: "Step 3",
      icon: ShieldCheck,
      title: "Save Money & Protect Gear",
      desc: "Let VoltWise automate your savings and shut down dangerous power spikes before they reach your appliances.",
      accent: "text-cyan-400",
      bg: "bg-cyan-500/10",
      border: "border-cyan-500/30"
    }
  ];

  return (
    <section id="how-it-works" className="py-20 bg-slate-900/50 border-t border-slate-800/80">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-xs font-semibold text-emerald-400 mb-3">
            <span>Dead Simple Process</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Start Saving in 3 Simple Steps.
          </h2>
          <p className="mt-3 text-base text-slate-300">
            Engineered so anyone can set it up in minutes without technical experience.
          </p>
        </div>

        {/* 3 Step Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {steps.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div 
                key={idx}
                className="relative rounded-2xl border border-slate-800 bg-slate-900 p-6 flex flex-col justify-between shadow-lg"
              >
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-md">
                      {item.step}
                    </span>
                    <div className={`p-3 rounded-xl ${item.bg} ${item.accent} border ${item.border}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                  </div>

                  <h3 className="text-xl font-bold text-white mb-3">
                    {item.title}
                  </h3>
                  <p className="text-sm text-slate-300 leading-relaxed font-normal">
                    {item.desc}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800 text-[11px] font-semibold text-slate-400">
                  Estimated time: &lt; 60 seconds
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
