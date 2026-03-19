'use client';

import { motion } from 'framer-motion';
import { Settings2, Zap } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export interface WelcomeCardProps {
  onQuickStart: () => void;
  onAdvanced: () => void;
}

const containerVariants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.05,
    },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0 },
} as const;

const itemTransition = { duration: 0.22, ease: 'easeOut' as const };

export function WelcomeCard({ onQuickStart, onAdvanced }: WelcomeCardProps) {
  const [quickHovered, setQuickHovered] = useState(false);

  return (
    <div className="w-full max-w-lg mx-auto">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="flex flex-col gap-6"
      >
        {/* Header */}
        <motion.div variants={itemVariants} transition={itemTransition} className="text-center">
          <h1 className="text-[28px] font-bold text-zinc-900 leading-tight">
            Start a new pentest
          </h1>
          <p className="text-[15px] text-zinc-500 mt-1.5">
            Choose how you&apos;d like to begin
          </p>
        </motion.div>

        {/* Option cards */}
        <motion.div variants={itemVariants} transition={itemTransition} className="grid grid-cols-2 gap-3">
          {/* Quick Start */}
          <button
            type="button"
            onClick={onQuickStart}
            onMouseEnter={() => setQuickHovered(true)}
            onMouseLeave={() => setQuickHovered(false)}
            className={cn(
              'rounded-2xl border border-zinc-200 bg-white p-5 cursor-pointer text-left',
              'transition-all duration-200',
              'hover:border-[#F5A623] hover:shadow-sm',
            )}
          >
            <div
              className={cn(
                'inline-flex items-center justify-center h-10 w-10 rounded-xl mb-3 transition-colors duration-200',
                quickHovered ? 'bg-orange-50' : 'bg-zinc-50',
              )}
            >
              <Zap
                className={cn(
                  'h-5 w-5 transition-colors duration-200',
                  quickHovered ? 'text-[#F5A623]' : 'text-zinc-400',
                )}
              />
            </div>
            <p className="text-[14px] font-semibold text-zinc-900">Quick Start</p>
            <p className="text-[13px] text-zinc-500 mt-1 leading-snug">
              Launch in under 60s with smart defaults
            </p>
          </button>

          {/* Advanced */}
          <button
            type="button"
            onClick={onAdvanced}
            className={cn(
              'rounded-2xl border border-zinc-200 bg-white p-5 cursor-pointer text-left',
              'transition-all duration-200',
              'hover:border-zinc-400 hover:shadow-sm',
            )}
          >
            <div className="inline-flex items-center justify-center h-10 w-10 rounded-xl bg-zinc-50 mb-3">
              <Settings2 className="h-5 w-5 text-zinc-400" />
            </div>
            <p className="text-[14px] font-semibold text-zinc-900">Advanced</p>
            <p className="text-[13px] text-zinc-500 mt-1 leading-snug">
              Full configuration with custom scope and AI settings
            </p>
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
}
