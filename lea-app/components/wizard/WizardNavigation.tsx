'use client';

import { useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, ChevronLeft, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// New interface (Agent 2 spec)
interface NewWizardNavigationProps {
  currentStep: number;
  totalSteps: number;
  canProceed: boolean;
  onBack: () => void;
  onNext: () => void;
  isSubmitting?: boolean;
  className?: string;
}

// Legacy interface (existing usage)
interface LegacyWizardNavigationProps {
  onBack?: () => void;
  nextLabel?: string;
  backLabel?: string;
  nextDisabled?: boolean;
  isLoading?: boolean;
  showBack?: boolean;
  className?: string;
  onNext?: () => void;
}

type WizardNavigationProps = NewWizardNavigationProps | LegacyWizardNavigationProps;

// Type guard to check which interface is being used
function isNewInterface(props: WizardNavigationProps): props is NewWizardNavigationProps {
  return 'currentStep' in props && 'totalSteps' in props;
}

// New interface component
function NewWizardNavigation({
  currentStep,
  totalSteps,
  canProceed,
  onBack,
  onNext,
  isSubmitting = false,
  className,
}: NewWizardNavigationProps) {
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;
  const isNextDisabled = !canProceed || isSubmitting;
  const nextLabel = isLastStep ? 'Start Scan' : 'Continue';

  // Keyboard support (Enter to continue)
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !isNextDisabled) {
        event.preventDefault();
        onNext();
      }
    },
    [isNextDisabled, onNext]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      {/* Back button - disabled on first step */}
      <motion.button
        type="button"
        onClick={onBack}
        disabled={isFirstStep}
        whileHover={!isFirstStep ? { scale: 1.02 } : {}}
        whileTap={!isFirstStep ? { scale: 0.98 } : {}}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        className={cn(
          'inline-flex min-h-11 items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors',
          'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-40',
        )}
      >
        <ChevronLeft className="w-4 h-4" />
        Back
      </motion.button>

      {/* Next / Submit button */}
      <motion.button
        type="button"
        onClick={isNextDisabled ? undefined : onNext}
        disabled={isNextDisabled}
        whileHover={!isNextDisabled ? { scale: 1.02 } : {}}
        whileTap={!isNextDisabled ? { scale: 0.97 } : {}}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        className={cn(
          'inline-flex min-h-11 items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold text-white',
          'bg-[#F5A623] hover:bg-[#e09820]',
          'transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623] focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          'shadow-sm',
        )}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            {nextLabel}
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </motion.button>
    </div>
  );
}

// Legacy interface component
function LegacyWizardNavigation({
  onBack,
  onNext,
  nextLabel = 'Continue',
  backLabel = 'Back',
  nextDisabled = false,
  isLoading = false,
  showBack = true,
  className,
}: LegacyWizardNavigationProps) {
  const isNextDisabled = nextDisabled || isLoading;

  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      {/* Back button */}
      {showBack ? (
        <motion.button
          type="button"
          onClick={onBack}
          disabled={onBack == null}
          whileHover={onBack != null ? { scale: 1.02 } : {}}
          whileTap={onBack != null ? { scale: 0.98 } : {}}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className={cn(
            'inline-flex min-h-11 items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors',
            'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2',
            'disabled:pointer-events-none disabled:opacity-40',
          )}
        >
          <ChevronLeft className="w-4 h-4" />
          {backLabel}
        </motion.button>
      ) : (
        <div />
      )}

      {/* Next / Submit button */}
      <motion.button
        type="button"
        onClick={isNextDisabled ? undefined : onNext}
        disabled={isNextDisabled}
        whileHover={!isNextDisabled ? { scale: 1.02 } : {}}
        whileTap={!isNextDisabled ? { scale: 0.97 } : {}}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        className={cn(
          'inline-flex min-h-11 items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold text-white',
          'bg-[#F5A623] hover:bg-[#e09820]',
          'transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623] focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          'shadow-sm',
        )}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {nextLabel}
          </>
        ) : (
          <>
            {nextLabel}
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </motion.button>
    </div>
  );
}

export function WizardNavigation(props: WizardNavigationProps) {
  // Render the appropriate component based on which interface is being used
  if (isNewInterface(props)) {
    return <NewWizardNavigation {...props} />;
  }
  return <LegacyWizardNavigation {...props} />;
}
