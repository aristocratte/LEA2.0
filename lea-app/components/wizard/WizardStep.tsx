'use client';

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface WizardStepProps {
  children: ReactNode;
  title: string;
  description?: string;
  className?: string;
}

export function WizardStep({
  children,
  title,
  description,
  className,
}: WizardStepProps) {
  const prefersReducedMotion = useReducedMotion();

  const variants = {
    initial: prefersReducedMotion
      ? { opacity: 0 }
      : { opacity: 0, y: 12 },
    animate: prefersReducedMotion
      ? { opacity: 1 }
      : { opacity: 1, y: 0 },
    exit: prefersReducedMotion
      ? { opacity: 0 }
      : { opacity: 0, y: -8 },
  };

  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={cn('w-full', className)}
    >
      {/* Step header */}
      <div>
        <h2 className="text-[22px] font-semibold text-zinc-900 leading-tight">
          {title}
        </h2>
        {description != null && description.length > 0 && (
          <p className="text-[14px] text-zinc-500 mt-1 leading-relaxed">
            {description}
          </p>
        )}
      </div>

      {/* Step content */}
      <div className="mt-6">{children}</div>
    </motion.div>
  );
}
