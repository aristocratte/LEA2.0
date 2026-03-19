'use client';

import { motion } from 'framer-motion';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PentestTemplate } from '@/store/pentest-creation-store';

export interface TemplateCardProps {
  template: PentestTemplate;
  selected?: boolean;
  onClick: () => void;
}

export function TemplateCard({ template, selected = false, onClick }: TemplateCardProps) {
  const [minMin, maxMin] = template.estimatedMinutes;
  const costDollars = (template.estimatedCostCents / 100).toFixed(2);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className={cn(
        'rounded-xl border bg-white p-4 cursor-pointer text-left w-full transition-all duration-200',
        selected
          ? 'border-[#F5A623] bg-orange-50/40'
          : 'border-zinc-200 hover:border-zinc-300 hover:shadow-sm',
      )}
    >
      {/* Icon */}
      <div className="h-8 w-8 rounded-lg bg-zinc-100 flex items-center justify-center text-[18px] leading-none">
        {template.icon}
      </div>

      {/* Name */}
      <p className="text-[13px] font-semibold text-zinc-800 mt-2">{template.name}</p>

      {/* Description */}
      <p className="text-[12px] text-zinc-500 mt-0.5 leading-snug">{template.description}</p>

      {/* Tags */}
      {template.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2.5">
          {template.tags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] bg-zinc-100 text-zinc-500 rounded px-1.5 py-0.5"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-2 mt-3">
        <Clock className="h-3 w-3 text-zinc-400 shrink-0" />
        <span className="text-[11px] text-zinc-400">
          {minMin}–{maxMin} min
        </span>
        <span className="text-[11px] text-zinc-300 select-none">·</span>
        <span className="text-[11px] text-zinc-400">${costDollars}</span>
      </div>
    </motion.button>
  );
}
