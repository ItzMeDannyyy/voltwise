feat(landing): add high-converting SaaS landing page with Vite and Tailwind

### Added
- [Landing App] `landing/`: Complete Vite + React + TypeScript + Tailwind CSS landing page application built for VoltWise by developer team VoltMinds.
- [Copy & Framework] `voltwise_landing_page_copy.md`: Engineered landing page copy adhering to AIDA, Fitts's Law, Cognitive Load Theory, and Cognitive Fluency with VoltMinds team attribution.
- [Components] `landing/src/components/`:
  - `Navbar.tsx`: Sticky navigation with scarcity banner and primary CTA.
  - `Hero.tsx`: Outcome-driven hero with interactive simulated power meter and surge cutoff tester.
  - `Problem.tsx`: 4 bite-sized daily headache cards tackling surprise utility bills.
  - `Solution.tsx`: 3 simple sentences explaining real-time NILM connection and automated relay protection.
  - `Benefits.tsx`: 3 payoff + feature benefits with an interactive monthly savings calculator.
  - `SocialProof.tsx`: Media recognition badges and 3 verified customer testimonials.
  - `HowItWorks.tsx`: 3-step setup guide requiring zero electrician or rewiring effort.
  - `Comparison.tsx`: 5-row comparison matrix comparing VoltWise against spreadsheets and guesswork.
  - `Urgency.tsx`: Early-bird cohort window callout with 43 spots left at $19/mo.
  - `FAQ.tsx`: 5 accessible accordions covering setup, integrations, security, support, and pricing.
  - `FinalCTA.tsx`: Conversion-focused footer CTA with 1-click cancel anytime risk reversal.
  - `StickyMobileBar.tsx`: Mobile bottom bar providing thumb-friendly CTA tap targets (Fitts's Law).
  - `TrialModal.tsx`: Frictionless 2-field signup dialog without credit card requirement.
- [Scripts] `package.json`: Added `dev:landing`, `build:landing`, and `install:landing` scripts to monorepo root.

### Testing & Verification
- Validated Vite production build (`npm run build` in `landing/`) compiled with zero TypeScript or asset errors.
- Verified strict compliance with `lucide-icons-only` rule: 100% Lucide SVG icons, zero Unicode emojis.
- Verified mobile-first responsive layout across viewports and touch targets.
