import React, { useState } from 'react';
import { ChevronDown, HelpCircle, Shield, Wifi, Wrench, Headphones, DollarSign } from 'lucide-react';

export const FAQ: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      category: "Setup Time",
      icon: Wrench,
      question: "How hard is setup, and do I need an electrician?",
      answer: "Setup takes less than 2 minutes. You simply plug the device in or pair your existing smart meter through your home Wi-Fi network. No tools, no dangerous rewiring, and no electrician needed."
    },
    {
      category: "Integrations",
      icon: Wifi,
      question: "Does VoltWise work with my phone and smart home system?",
      answer: "Yes. VoltWise runs seamlessly on iOS and Android devices, and pairs effortlessly with Apple Home, Google Home, and Amazon Alexa for automated control."
    },
    {
      category: "Security",
      icon: Shield,
      question: "Is my home power data private and secure?",
      answer: "Yes, 100%. We use bank-grade 256-bit TLS encryption. Your personal power telemetry is strictly yours. It is never sold, shared, or handed to third-party advertisers or utility companies."
    },
    {
      category: "Support",
      icon: Headphones,
      question: "What kind of customer support do you offer?",
      answer: "You get 24/7 priority live chat and email support from dedicated energy specialists based in North America, ready to assist whenever you need help."
    },
    {
      category: "Pricing",
      icon: DollarSign,
      question: "How much does VoltWise cost after the free trial?",
      answer: "Plans start at just $19 per month with zero contracts or surprise charges. If you decide to cancel during your 14-day trial, you pay exactly $0."
    }
  ];

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className="py-20 border-t border-slate-800/80 bg-slate-900/60">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        
        {/* Section Header */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-xs font-semibold text-emerald-400 mb-3">
            <HelpCircle className="h-3.5 w-3.5" />
            <span>Got Questions?</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Frequently Asked Questions
          </h2>
          <p className="mt-3 text-base text-slate-300">
            Clear, honest answers. Zero technical runaround.
          </p>
        </div>

        {/* 5 FAQs Accordion (Cognitive Load Theory: low effort skimmability) */}
        <div className="space-y-3">
          {faqs.map((item, idx) => {
            const isOpen = openIndex === idx;
            const Icon = item.icon;
            return (
              <div 
                key={idx}
                className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden transition-colors hover:border-slate-700"
              >
                <button
                  onClick={() => toggleFAQ(idx)}
                  className="w-full p-5 text-left flex items-center justify-between gap-4"
                  aria-expanded={isOpen}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-slate-800 text-emerald-400 shrink-0">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-0.5">
                        {item.category}
                      </span>
                      <span className="text-base font-bold text-white leading-snug">
                        {item.question}
                      </span>
                    </div>
                  </div>
                  <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform duration-200 shrink-0 ${
                    isOpen ? 'rotate-180 text-emerald-400' : ''
                  }`} />
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 pt-1 text-sm text-slate-300 leading-relaxed border-t border-slate-800/60 font-normal">
                    {item.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
