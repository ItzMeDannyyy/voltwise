import React, { useState, useEffect } from 'react';
import { 
  Zap, 
  ShieldCheck, 
  ArrowRight, 
  CheckCircle2, 
  Activity, 
  AlertTriangle, 
  TrendingDown, 
  Power,
  RotateCcw
} from 'lucide-react';

interface HeroProps {
  onOpenTrial: () => void;
}

export const Hero: React.FC<HeroProps> = ({ onOpenTrial }) => {
  // Interactive Simulation State for the live Product UI mockup
  const [isSimulatedSpike, setIsSimulatedSpike] = useState(false);
  const [watts, setWatts] = useState(1240);
  const [cutoffActive, setCutoffActive] = useState(false);

  // Live slight wattage fluctuation for cognitive realism
  useEffect(() => {
    if (isSimulatedSpike || cutoffActive) return;
    const interval = setInterval(() => {
      setWatts(1240 + Math.floor(Math.sin(Date.now() / 1500) * 35));
    }, 1500);
    return () => clearInterval(interval);
  }, [isSimulatedSpike, cutoffActive]);

  const triggerSpikeSimulation = () => {
    setIsSimulatedSpike(true);
    setWatts(4850);
    // Simulate automated 3-second protection cutoff
    setTimeout(() => {
      setCutoffActive(true);
      setWatts(180);
      setIsSimulatedSpike(false);
    }, 2400);
  };

  const resetSimulation = () => {
    setCutoffActive(false);
    setIsSimulatedSpike(false);
    setWatts(1240);
  };

  return (
    <section id="hero" className="relative pt-12 pb-20 md:pt-20 md:pb-28 overflow-hidden">
      {/* Background radial glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-emerald-500/10 blur-[130px] rounded-full pointer-events-none" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          
          {/* Left Column: Copy (AIDA - Attention) */}
          <div className="lg:col-span-7 text-center lg:text-left">
            {/* Cognitive Fluency Pill Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs sm:text-sm font-semibold text-emerald-400 mb-6">
              <Zap className="h-4 w-4" />
              <span>Proven to cut home electric bills by up to 30%</span>
            </div>

            {/* Outcome Headline (Simple 8th-grade English) */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.12] mb-5">
              Cut Your Electric Bill by Up to 30%{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">
                Without Guessing.
              </span>
            </h1>

            {/* 1 Sentence Value */}
            <p className="text-lg sm:text-xl text-slate-300 leading-relaxed max-w-2xl mx-auto lg:mx-0 mb-8 font-normal">
              VoltWise tracks your home power in real time, catches wasteful appliances, and cuts off dangerous surges before they fry your gear.
            </p>

            {/* Primary CTA (Fitts's Law: dominant tap target) */}
            <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start mb-6">
              <button
                onClick={onOpenTrial}
                className="w-full sm:w-auto min-h-[56px] px-8 py-4 rounded-xl bg-emerald-500 text-slate-950 font-bold text-base sm:text-lg shadow-xl shadow-emerald-500/25 hover:bg-emerald-400 hover:shadow-emerald-500/40 transition-all flex items-center justify-center gap-2.5 active:scale-[0.98]"
              >
                <span>Start Your Free 14-Day Trial</span>
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>

            {/* Trust Line & Risk Reversal */}
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-y-2 gap-x-5 text-xs sm:text-sm text-slate-400">
              <span className="flex items-center gap-1.5 text-slate-300">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>No credit card needed</span>
              </span>
              <span className="flex items-center gap-1.5 text-slate-300">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>2-minute setup</span>
              </span>
              <span className="flex items-center gap-1.5 text-slate-300">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <span>Cancel anytime</span>
              </span>
            </div>

            {/* Micro Social Proof Proof Line */}
            <div className="mt-8 pt-6 border-t border-slate-800/80 flex items-center justify-center lg:justify-start gap-3">
              <div className="flex -space-x-2">
                <div className="h-8 w-8 rounded-full border-2 border-slate-950 bg-emerald-600 flex items-center justify-center text-[10px] font-bold text-white">MV</div>
                <div className="h-8 w-8 rounded-full border-2 border-slate-950 bg-teal-600 flex items-center justify-center text-[10px] font-bold text-white">SJ</div>
                <div className="h-8 w-8 rounded-full border-2 border-slate-950 bg-indigo-600 flex items-center justify-center text-[10px] font-bold text-white">DC</div>
              </div>
              <p className="text-xs text-slate-400 text-left">
                <strong className="text-white font-semibold">12,500+ homes</strong> saving electricity right now
              </p>
            </div>
          </div>

          {/* Right Column: Product UI Image Idea & Live Interactive Dashboard Mockup */}
          <div className="lg:col-span-5">
            <div className="relative mx-auto max-w-sm sm:max-w-md">
              {/* Decorative phone / tablet frame container */}
              <div className="relative rounded-3xl border border-slate-800 bg-slate-900/95 p-5 shadow-2xl backdrop-blur-xl">
                
                {/* Mockup Header Bar */}
                <div className="flex items-center justify-between pb-4 border-b border-slate-800 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="font-semibold text-slate-200">VoltWise Live Monitor</span>
                  </div>
                  <span className="text-slate-400 font-mono text-[11px]">Sync: 0.8s</span>
                </div>

                {/* Main Power Meter Card */}
                <div className={`mt-4 rounded-2xl p-4 transition-all duration-300 border ${
                  cutoffActive 
                    ? 'border-emerald-500/50 bg-emerald-950/20' 
                    : isSimulatedSpike 
                      ? 'border-red-500/80 bg-red-950/30' 
                      : 'border-slate-800 bg-slate-800/40'
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Current Load
                    </span>
                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                      cutoffActive 
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : isSimulatedSpike 
                          ? 'bg-red-500/20 text-red-300 animate-pulse'
                          : 'bg-emerald-500/20 text-emerald-300'
                    }`}>
                      <Activity className="h-3 w-3" />
                      {cutoffActive ? 'Surge Protected' : isSimulatedSpike ? 'Dangerous Spike!' : 'Normal State'}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-2 my-2">
                    <span className={`text-3xl font-extrabold font-mono tracking-tight ${
                      isSimulatedSpike ? 'text-red-400' : 'text-white'
                    }`}>
                      {watts.toLocaleString()}
                    </span>
                    <span className="text-slate-400 text-sm font-semibold">Watts</span>
                  </div>

                  {/* Dynamic Alert Banner inside UI */}
                  {isSimulatedSpike && (
                    <div className="mt-2 flex items-center gap-2 rounded-lg bg-red-500/20 p-2 text-xs font-medium text-red-300 border border-red-500/40">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
                      <span>Surge detected! 3-second auto-relay cutoff initiating...</span>
                    </div>
                  )}

                  {cutoffActive && (
                    <div className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-500/20 p-2 text-xs font-medium text-emerald-300 border border-emerald-500/40">
                      <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
                      <span>Hazard neutralized in 2.1s. Appliances protected.</span>
                    </div>
                  )}

                  {/* Monthly Projection */}
                  {!isSimulatedSpike && !cutoffActive && (
                    <div className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-500/10 p-2 text-xs text-emerald-300">
                      <TrendingDown className="h-4 w-4 shrink-0" />
                      <span>Projected bill: $114 (Saving $42 vs last month)</span>
                    </div>
                  )}
                </div>

                {/* Monitored Appliance Cards */}
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between rounded-xl bg-slate-800/40 border border-slate-800/80 p-2.5 text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-lg bg-slate-800 flex items-center justify-center text-emerald-400">
                        <Zap className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-slate-200">Living Room AC</div>
                        <div className="text-[10px] text-slate-400">Active &middot; High Efficiency</div>
                      </div>
                    </div>
                    <span className="font-mono font-semibold text-slate-300">
                      {cutoffActive ? '0 W' : '820 W'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-slate-800/40 border border-slate-800/80 p-2.5 text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-lg bg-slate-800 flex items-center justify-center text-teal-400">
                        <Power className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-slate-200">Kitchen Fridge</div>
                        <div className="text-[10px] text-slate-400">Cycle Idle &middot; Stable</div>
                      </div>
                    </div>
                    <span className="font-mono font-semibold text-slate-300">
                      {cutoffActive ? '0 W' : '110 W'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-slate-800/40 border border-slate-800/80 p-2.5 text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                        <ShieldCheck className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-slate-200">Home Office Setup</div>
                        <div className="text-[10px] text-emerald-400">Vampire Leak Prevented</div>
                      </div>
                    </div>
                    <span className="font-mono font-semibold text-emerald-400">Saved $14/mo</span>
                  </div>
                </div>

                {/* Interactive Simulator Control */}
                <div className="mt-5 pt-4 border-t border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-slate-400">Interactive Preview:</span>
                    {!cutoffActive && !isSimulatedSpike ? (
                      <button
                        onClick={triggerSpikeSimulation}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/20 transition-all"
                      >
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span>Simulate Voltage Spike</span>
                      </button>
                    ) : (
                      <button
                        onClick={resetSimulation}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition-all"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Reset Monitor</span>
                      </button>
                    )}
                  </div>
                </div>

              </div>

              {/* Product UI Image Idea Caption */}
              <div className="mt-3 text-center">
                <p className="text-[11px] text-slate-500 italic">
                  Live UI Mockup: Real-time Wattage Dial + Instant 3-Second Surge Cutoff + Appliance Tracker
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};
