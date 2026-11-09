import React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

export const Comparison: React.FC = () => {
  const comparisonRows = [
    {
      feature: "Real-Time Usage Tracking",
      voltwise: "Instant, second-by-second live updates",
      oldWay: "Zero live data; wait 30 days for utility bill",
      isVoltwisePositive: true
    },
    {
      feature: "Appliance Waste Detection",
      voltwise: "Automatic AI spots phantom leaks",
      oldWay: "Hours spent manually guessing and unplugging",
      isVoltwisePositive: true
    },
    {
      feature: "Surge & Burnout Protection",
      voltwise: "Auto-relay cuts power in under 3 seconds",
      oldWay: "None; appliances take full surge damage",
      isVoltwisePositive: true
    },
    {
      feature: "Bill Cost Prediction",
      voltwise: "Accurate dollar forecast updated daily",
      oldWay: "Frustrating math and surprise bill shock",
      isVoltwisePositive: true
    },
    {
      feature: "Setup & Effort",
      voltwise: "2-minute setup, zero tools needed",
      oldWay: "Tedious manual data entry into spreadsheets",
      isVoltwisePositive: true
    }
  ];

  return (
    <section id="comparison" className="py-20 border-t border-slate-800/80 bg-slate-950">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        
        {/* Section Header */}
        <div className="text-center max-w-xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-xs font-semibold text-emerald-400 mb-3">
            <span>Direct Comparison</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            VoltWise vs The Old Way.
          </h2>
          <p className="mt-3 text-base text-slate-300">
            Why manual spreadsheets and monthly utility guessing never work.
          </p>
        </div>

        {/* 5-Row Comparison Table */}
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl">
          <div className="grid grid-cols-12 bg-slate-900 p-4 border-b border-slate-800 text-xs font-bold uppercase tracking-wider text-slate-400">
            <div className="col-span-5 sm:col-span-4">Capability</div>
            <div className="col-span-4 sm:col-span-4 text-emerald-400 flex items-center gap-1.5 font-extrabold">
              <span>VoltWise Smart System</span>
            </div>
            <div className="col-span-3 sm:col-span-4 text-slate-400">
              <span>Spreadsheets & Manual Guesswork</span>
            </div>
          </div>

          <div className="divide-y divide-slate-800/80">
            {comparisonRows.map((row, idx) => (
              <div 
                key={idx}
                className="grid grid-cols-12 p-4 sm:p-5 items-center hover:bg-slate-800/30 transition-colors text-xs sm:text-sm"
              >
                <div className="col-span-5 sm:col-span-4 font-bold text-white pr-2">
                  {row.feature}
                </div>
                
                {/* VoltWise column */}
                <div className="col-span-4 sm:col-span-4 text-emerald-300 flex items-start gap-2 pr-2 font-medium">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{row.voltwise}</span>
                </div>

                {/* Old way column */}
                <div className="col-span-3 sm:col-span-4 text-slate-400 flex items-start gap-2">
                  <XCircle className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
                  <span>{row.oldWay}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
};
