import { useState } from 'react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { Problem } from './components/Problem';
import { Solution } from './components/Solution';
import { Benefits } from './components/Benefits';
import { SocialProof } from './components/SocialProof';
import { HowItWorks } from './components/HowItWorks';
import { Comparison } from './components/Comparison';
import { Urgency } from './components/Urgency';
import { FAQ } from './components/FAQ';
import { FinalCTA } from './components/FinalCTA';
import { Footer } from './components/Footer';
import { StickyMobileBar } from './components/StickyMobileBar';
import { TrialModal } from './components/TrialModal';

export function App() {
  const [isTrialOpen, setIsTrialOpen] = useState(false);

  const handleOpenTrial = () => {
    setIsTrialOpen(true);
  };

  const handleCloseTrial = () => {
    setIsTrialOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased selection:bg-emerald-500/25 selection:text-emerald-300">
      {/* 1. Header & Navigation */}
      <Navbar onOpenTrial={handleOpenTrial} />

      {/* Main Content Sections (AIDA & Cognitive Fluency Flow) */}
      <main className="flex-grow">
        {/* Section 1: Hero (Attention) */}
        <Hero onOpenTrial={handleOpenTrial} />

        {/* Section 2: Problem (Interest - Daily Headache) */}
        <Problem />

        {/* Section 3: Solution (Interest - 3 Simple Sentences) */}
        <Solution />

        {/* Section 4: Benefits (Desire - Payoff + Because + Savings Calculator) */}
        <Benefits onOpenTrial={handleOpenTrial} />

        {/* Section 5: Social Proof (Desire - 3 Testimonials + Trusted By) */}
        <SocialProof />

        {/* Section 6: How It Works (Cognitive Fluency - 3 Simple Steps) */}
        <HowItWorks />

        {/* Section 7: Comparison (Desire - You vs The Old Way, 5 Rows) */}
        <Comparison />

        {/* Section 8: Urgency (Action - Limited Onboarding Window) */}
        <Urgency onOpenTrial={handleOpenTrial} />

        {/* Section 9: FAQ (Cognitive Friction Removal - 5 Core Questions) */}
        <FAQ />

        {/* Section 10: Final CTA (Action - Repeated Primary Action & Guarantee) */}
        <FinalCTA onOpenTrial={handleOpenTrial} />
      </main>

      {/* Footer */}
      <Footer />

      {/* Fitts's Law Mobile Sticky Bottom Tap Target */}
      <StickyMobileBar onOpenTrial={handleOpenTrial} />

      {/* Frictionless Trial Signup Modal */}
      <TrialModal isOpen={isTrialOpen} onClose={handleCloseTrial} />
    </div>
  );
}

export default App;
