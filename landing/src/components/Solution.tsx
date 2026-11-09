import React from 'react';
import { Cpu, Search, ShieldCheck } from 'lucide-react';

export const Solution: React.FC = () => {
  const steps = [
    {
      num: "01",
      icon: Cpu,
      title: "Real-Time Connection",
      sentence: "VoltWise plugs right into your home and reads electrical usage live.",
      accent: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/30"
    },
    {
      num: "02",
      icon: Search,
      title: "Intelligent Waste Detection",
      sentence: "Our smart system spots which appliances waste money and flags sudden power spikes.",
      accent: "text-teal-400",
      bg: "bg-teal-500/10",
      border: "border-teal-500/30"
    },
    {
      num: "03",
      icon: ShieldCheck,
      title: "Automated Protection",
      sentence: "You get instant alerts on your phone and automatic protection that shuts off danger in seconds.",
      accent: "text-cyan-400",
      bg: "bg-cyan-500/10",
      border: "border-cyan-500/30"
    }
  ];

  return (
    <section id="solution" className="py-20 relative overflow-hidden">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-xs font-semibold text-emerald-400 mb-3">
            <span>The Effortless Fix</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Meet VoltWise: Your Home's Smart Energy Shield.
          </h2>
          <p className="mt-3 text-base text-slate-300">
            A smarter way to manage your electricity without lifting a finger.
          </p>
        </div>

        {/* 3 Simple Sentences Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div 
                key={idx}
                className="relative rounded-2xl bg-slate-900 border border-slate-800 p-6 flex flex-col justify-between hover:border-slate-700 transition-all shadow-md group"
              >
                <div>
                  <div className="flex items-center justify-between mb-5">
                    <div className={`p-3 rounded-xl ${item.bg} ${item.accent} border ${item.border}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <span className="font-mono text-2xl font-black text-slate-700 group-hover:text-slate-600 transition-colors">
                      {item.num}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">
                    {item.title}
                  </h3>
                  <p className="text-sm text-slate-300 leading-relaxed font-normal">
                    {item.sentence}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center gap-2 text-xs font-semibold text-slate-400">
                  <span className={`h-1.5 w-1.5 rounded-full ${item.bg}`} />
                  <span>Always active 24/7</span>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
