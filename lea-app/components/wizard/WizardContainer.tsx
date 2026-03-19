'use client';

import React, {
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { WizardStepper, type WizardStep } from './WizardStepper';
import { WizardNavigation } from './WizardNavigation';
import { cn } from '@/lib/utils';

// Define the 4 wizard steps
export const WIZARD_STEPS: WizardStep[] = [
  { id: 'target', label: 'Target', description: 'Define your target' },
  { id: 'scope', label: 'Scope', description: 'Set the scope' },
  { id: 'config', label: 'Config', description: 'Configure scan options' },
  { id: 'review', label: 'Review', description: 'Review and start' },
];

interface WizardContainerProps {
  children: ReactNode;
  currentStep: number;
  totalSteps?: number;
  canProceed: boolean;
  isSubmitting?: boolean;
  onStepChange: Dispatch<SetStateAction<number>>;
  onBack: () => void;
  onSubmit: () => void;
  className?: string;
  persistToUrl?: boolean;
}

export function WizardContainer({
  children,
  currentStep,
  totalSteps = WIZARD_STEPS.length,
  canProceed,
  isSubmitting = false,
  onStepChange,
  onBack,
  onSubmit,
  className,
  persistToUrl = true,
}: WizardContainerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const prefersReducedMotion = useReducedMotion();
  const initialSyncDone = useRef(false);

  // Sync step from URL on mount only
  useEffect(() => {
    if (!persistToUrl || initialSyncDone.current) return;
    initialSyncDone.current = true;

    const stepParam = searchParams.get('step');
    if (stepParam) {
      const step = parseInt(stepParam, 10);
      if (!isNaN(step) && step >= 1 && step <= totalSteps) {
        onStepChange(step - 1); // Convert to 0-indexed
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Update URL when step changes
  const updateUrl = useCallback(
    (step: number) => {
      if (!persistToUrl) return;

      const params = new URLSearchParams(searchParams.toString());
      params.set('step', (step + 1).toString()); // Convert to 1-indexed for URL
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [persistToUrl, searchParams, pathname, router]
  );

  // Handle step navigation
  const handleNext = useCallback(() => {
    if (currentStep < totalSteps - 1) {
      const newStep = currentStep + 1;
      onStepChange(newStep);
      updateUrl(newStep);
    } else {
      onSubmit();
    }
  }, [currentStep, totalSteps, onStepChange, updateUrl, onSubmit]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      const newStep = currentStep - 1;
      onStepChange(newStep);
      updateUrl(newStep);
    } else if (onBack) {
      onBack();
    }
  }, [currentStep, onStepChange, updateUrl, onBack]);

  const handleStepClick = useCallback(
    (stepIndex: number) => {
      if (stepIndex < currentStep) {
        onStepChange(stepIndex);
        updateUrl(stepIndex);
      }
    },
    [currentStep, onStepChange, updateUrl]
  );

  // Animation variants
  const slideVariants = {
    enter: {
      x: prefersReducedMotion ? 0 : 20,
      opacity: 0,
    },
    center: {
      x: 0,
      opacity: 1,
    },
    exit: {
      x: prefersReducedMotion ? 0 : -20,
      opacity: 0,
    },
  };

  return (
    <div className={cn('flex flex-col min-h-full', className)}>
      {/* Stepper */}
      <div className="mb-8">
        <WizardStepper
          steps={WIZARD_STEPS}
          currentStep={currentStep}
          onStepClick={handleStepClick}
        />
      </div>

      {/* Step content with animations */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={currentStep}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              x: { type: 'spring', stiffness: 300, damping: 30 },
              opacity: { duration: 0.2 },
            }}
            custom={0}
            className="h-full"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <div className="mt-8 pt-6 border-t border-zinc-200">
        <WizardNavigation
          currentStep={currentStep}
          totalSteps={totalSteps}
          canProceed={canProceed}
          onBack={handleBack}
          onNext={handleNext}
          isSubmitting={isSubmitting}
        />
      </div>
    </div>
  );
}

// Re-export for convenience
export { WizardStep } from './WizardStep';
