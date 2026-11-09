import React from 'react';
import { Star, ShieldCheck, Award } from 'lucide-react';

export const SocialProof: React.FC = () => {
  const testimonials = [
    {
      quote: "Our electric bill dropped $64 on the very first month. We discovered our second fridge in the garage was burning through power non-stop. VoltWise paid for itself right away.",
      author: "Marcus Vance",
      role: "Homeowner",
      location: "Austin, TX",
      highlight: "Saved $64 First Month",
      initials: "MV"
    },
    {
      quote: "A huge power spike hit our block during a thunderstorm. VoltWise cut the power to our HVAC in two seconds. It saved our $4,000 heat pump while my neighbor's system blew.",
      author: "Sarah Jenkins",
      role: "Homeowner",
      location: "Portland, OR",
      highlight: "Saved $4,000 Heat Pump",
      initials: "SJ"
    },
    {
      quote: "Clean app, no confusing jargon, and setup took less than 3 minutes. I finally understand where my money is going every single day without feeling overwhelmed.",
      author: "David Chen",
      role: "Apartment Renter",
      location: "Renton, WA",
      highlight: "Setup in 2 Minutes",
      initials: "DC"
    }
  ];

  const featuredLogos = [
    "SmartHome Weekly",
    "EnergyTech",
    "CleanPower Digest",
    "Modern Home",
    "TechReviews"
  ];

  return (
    <section id="proof" className="py-20 border-t border-slate-800/80 bg-slate-950">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        
        {/* "Trusted By" Line + Publication Logos */}
        <div className="text-center mb-16">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-6">
            Trusted by over 12,500 homeowners and featured in
          </p>
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10 opacity-70">
            {featuredLogos.map((logo, idx) => (
              <div 
                key={idx}
                className="flex items-center gap-2 text-sm sm:text-base font-bold text-slate-400 tracking-tight"
              >
                <Award className="h-4 w-4 text-emerald-400" />
                <span>{logo}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Section Title */}
        <div className="text-center max-w-xl mx-auto mb-12">
          <div className="inline-flex items-center gap-1.5 text-amber-400 mb-2">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
            ))}
            <span className="text-xs font-bold text-slate-300 ml-1.5">4.9 / 5 Rating from 1,200+ Reviews</span>
          </div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">
            Loved by Real Homeowners
          </h2>
        </div>

        {/* 3 Testimonials */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((item, idx) => (
            <div 
              key={idx}
              className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 flex flex-col justify-between shadow-sm"
            >
              <div>
                <div className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400 mb-4 border border-emerald-500/20">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>{item.highlight}</span>
                </div>

                <div className="flex gap-1 text-amber-400 mb-3">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-amber-400" />
                  ))}
                </div>

                <p className="text-sm text-slate-300 leading-relaxed italic mb-6">
                  "{item.quote}"
                </p>
              </div>

              <div className="pt-4 border-t border-slate-800 flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-emerald-400 shrink-0">
                  {item.initials}
                </div>
                <div>
                  <div className="text-sm font-bold text-white flex items-center gap-1">
                    <span>{item.author}</span>
                  </div>
                  <div className="text-xs text-slate-400">
                    {item.role} &middot; {item.location}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
};
