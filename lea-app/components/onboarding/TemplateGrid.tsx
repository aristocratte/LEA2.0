'use client';

import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { PENTEST_TEMPLATES, type PentestTemplate } from '@/store/pentest-creation-store';
import { TemplateCard } from './TemplateCard';

export interface TemplateGridProps {
  selectedId: string | null;
  onSelect: (template: PentestTemplate) => void;
}

const gridVariants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.04,
    },
  },
} as const;

const cardVariants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0 },
} as const;

const cardTransition = { duration: 0.2, ease: 'easeOut' as const };

export function TemplateGrid({ selectedId, onSelect }: TemplateGridProps) {
  return (
    <div className="w-full">
      {/* Divider + label */}
      <div className="flex items-center gap-3 mb-3">
        <hr className="flex-1 border-zinc-200" />
        <span className="text-[12px] font-semibold uppercase tracking-widest text-zinc-400 whitespace-nowrap">
          Choose a template
        </span>
        <hr className="flex-1 border-zinc-200" />
      </div>

      {/* Grid */}
      <motion.div
        variants={gridVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 sm:grid-cols-4 gap-3"
      >
        {PENTEST_TEMPLATES.map((template) => {
          const isSelected = template.id === selectedId;
          return (
            <motion.div key={template.id} variants={cardVariants} transition={cardTransition} className="relative">
              <TemplateCard
                template={template}
                selected={isSelected}
                onClick={() => onSelect(template)}
              />
              {/* Orange checkmark badge when selected */}
              {isSelected && (
                <motion.div
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-[#F5A623] flex items-center justify-center shadow-sm pointer-events-none"
                >
                  <Check className="h-3 w-3 text-white stroke-[2.5]" />
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
