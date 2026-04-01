'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

export default function LandingPage() {
  return (
    <div className="min-h-screen w-full bg-black text-slate-100 flex flex-col items-center justify-center relative overflow-hidden font-sans">
      {/* Decorative Background Grid/Glow */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-indigo-500/10 blur-[120px]" />
      </div>

      <main className="z-10 flex flex-col items-center justify-center text-center px-6 max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-semibold text-emerald-400 tracking-wide uppercase shadow-lg shadow-emerald-500/5"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Live execution engines online
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-5xl md:text-7xl font-extrabold tracking-tight text-white mb-6 leading-tight"
        >
          Institutional Options Flow. <br className="hidden md:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-indigo-500">
            Distilled.
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-lg md:text-xl text-slate-400 mb-10 max-w-2xl leading-relaxed"
        >
          A zero-noise quantitative scanner tracking Anomalous Premium Breakouts in real-time. Uncover structural market advantages before the institutional sweep settles.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto"
        >
          <Link
            href="/terminal"
            className="group relative inline-flex items-center justify-center px-8 py-4 font-bold text-black bg-emerald-500 rounded-xl overflow-hidden transition-all hover:scale-105 hover:shadow-[0_0_40px_-10px_rgba(34,197,94,0.6)] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            <span className="relative z-10 flex items-center gap-2">
              Launch Terminal
              <svg className="w-5 h-5 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </span>
            <div className="absolute inset-0 h-full w-full bg-gradient-to-r from-emerald-400 to-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
          
          <button
            onClick={() => alert("Methodology: Anomalous option block detection routing inside Volatility bounds")}
            className="inline-flex items-center justify-center px-8 py-4 font-semibold text-slate-300 bg-white/5 border border-white/10 rounded-xl transition-all hover:bg-white/10 hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            Explore Methodology
          </button>
        </motion.div>
      </main>
      
      {/* Brand Footer / Trust indicators */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.6 }}
        className="absolute bottom-10 left-0 w-full flex justify-center text-sm text-slate-500 font-medium tracking-widest uppercase"
      >
        Orevix Quantitative Systems © {new Date().getFullYear()}
      </motion.div>
    </div>
  );
}
