'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface WizardStep {
  id: string;
  label: string;
  description?: string;
}

interface WizardStepperProps {
  steps: WizardStep[];
  currentStep: number; // 0-indexed
  onStepClick?: (index: number) => void; // only for completed steps
}

type StepState = 'completed' | 'current' | 'upcoming';

function getStepState(index: number, currentStep: number): StepState {
  if (index < currentStep) return 'completed';
  if (index === currentStep) return 'current';
  return 'upcoming';
}

// Desktop step item component
function DesktopStepItem({
  step,
  index,
  state,
  isLast,
  onStepClick,
  prefersReducedMotion,
}: {
  step: WizardStep;
  index: number;
  state: StepState;
  isLast: boolean;
  onStepClick?: (index: number) => void;
  prefersReducedMotion: boolean;
}) {
  const isCompleted = state === 'completed';
  const isCurrent = state === 'current';
  const isClickable = isCompleted && onStepClick != null;

  return (
    <li
      className={cn(
        'flex items-center',
        isLast ? 'flex-none' : 'flex-1',
      )}
    >
      {/* Step node */}
      <div className="flex flex-col items-center gap-1.5">
        <button
          type="button"
          onClick={isClickable ? () => onStepClick(index) : undefined}
          disabled={!isClickable}
          aria-current={isCurrent ? 'step' : undefined}
          aria-label={`Step ${index + 1}: ${step.label}${isCompleted ? ' (completed)' : ''}`}
          className={cn(
            'relative flex items-center justify-center rounded-full transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623] focus-visible:ring-offset-2',
            isCompleted
              ? 'cursor-pointer hover:opacity-80'
              : 'cursor-default',
            'w-10 h-10',
          )}
        >
          {/* Outer pulse ring for current step */}
          {isCurrent && !prefersReducedMotion && (
            <motion.span
              className="absolute inset-0 rounded-full border-2 border-[#F5A623]"
              animate={{ scale: [1, 1.25, 1], opacity: [1, 0, 1] }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          )}

          {/* Circle background */}
          <motion.span
            className={cn(
              'relative z-10 flex items-center justify-center w-10 h-10 rounded-full border-2 text-sm font-semibold transition-colors',
              isCompleted && 'bg-[#F5A623] border-[#F5A623] text-white',
              isCurrent && 'bg-white border-[#F5A623] text-[#F5A623]',
              state === 'upcoming' && 'bg-zinc-100 border-zinc-300 text-zinc-400',
            )}
            animate={
              isCurrent && !prefersReducedMotion
                ? { scale: [1, 1.04, 1] }
                : { scale: 1 }
            }
            transition={
              isCurrent
                ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }
                : {}
            }
          >
            {isCompleted ? (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              >
                <Check className="w-5 h-5 stroke-[2.5]" />
              </motion.div>
            ) : (
              <span>{index + 1}</span>
            )}
          </motion.span>
        </button>

        {/* Label */}
        <span
          className={cn(
            'text-sm font-medium text-center max-w-[100px] transition-colors',
            isCompleted && 'text-zinc-500',
            isCurrent && 'text-[#F5A623]',
            state === 'upcoming' && 'text-zinc-400',
          )}
        >
          {step.label}
        </span>
      </div>

      {/* Connector line between steps */}
      {!isLast && (
        <motion.div
          className="flex-1 h-0.5 mx-4 rounded-full"
          initial={{ scaleX: 0 }}
          animate={{
            scaleX: 1,
            backgroundColor: isCompleted ? '#F5A623' : '#d1d5db',
          }}
          style={{ transformOrigin: 'left' }}
          transition={{ duration: 0.3 }}
          aria-hidden="true"
        />
      )}
    </li>
  );
}

// Mobile step item component (vertical layout)
function MobileStepItem({
  step,
  index,
  state,
  isLast,
  onStepClick,
  prefersReducedMotion,
}: {
  step: WizardStep;
  index: number;
  state: StepState;
  isLast: boolean;
  onStepClick?: (index: number) => void;
  prefersReducedMotion: boolean;
}) {
  const isCompleted = state === 'completed';
  const isCurrent = state === 'current';
  const isClickable = isCompleted && onStepClick != null;

  return (
    <li className="flex items-start">
      {/* Circle and vertical connector */}
      <div className="flex flex-col items-center mr-4">
        <button
          type="button"
          onClick={isClickable ? () => onStepClick(index) : undefined}
          disabled={!isClickable}
          aria-current={isCurrent ? 'step' : undefined}
          aria-label={`Step ${index + 1}: ${step.label}${isCompleted ? ' (completed)' : ''}`}
          className={cn(
            'relative flex items-center justify-center rounded-full transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623] focus-visible:ring-offset-2',
            isCompleted
              ? 'cursor-pointer hover:opacity-80'
              : 'cursor-default',
            'w-10 h-10',
          )}
        >
          {/* Circle background */}
          <motion.span
            className={cn(
              'relative z-10 flex items-center justify-center w-10 h-10 rounded-full border-2 text-sm font-semibold transition-colors',
              isCompleted && 'bg-[#F5A623] border-[#F5A623] text-white',
              isCurrent && 'bg-white border-[#F5A623] text-[#F5A623]',
              state === 'upcoming' && 'bg-zinc-100 border-zinc-300 text-zinc-400',
            )}
            whileHover={isClickable ? { scale: 1.05 } : {}}
            whileTap={isClickable ? { scale: 0.95 } : {}}
            animate={
              isCurrent && !prefersReducedMotion
                ? { scale: [1, 1.05, 1] }
                : { scale: 1 }
            }
            transition={
              isCurrent
                ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }
                : { duration: 0.2 }
            }
          >
            {isCompleted ? (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              >
                <Check className="w-5 h-5 stroke-[2.5]" />
              </motion.div>
            ) : (
              <span>{index + 1}</span>
            )}
          </motion.span>
        </button>

        {/* Vertical connector */}
        {!isLast && (
          <motion.div
            className="w-0.5 h-8 mt-2 rounded-full"
            initial={{ scaleY: 0 }}
            animate={{
              scaleY: 1,
              backgroundColor: isCompleted ? '#F5A623' : '#d1d5db',
            }}
            style={{ transformOrigin: 'top' }}
            transition={{ duration: 0.3 }}
            aria-hidden="true"
          />
        )}
      </div>

      {/* Label */}
      <div className="flex-1 pt-2">
        <span
          className={cn(
            'text-sm font-medium',
            isCompleted && 'text-zinc-500',
            isCurrent && 'text-[#F5A623]',
            state === 'upcoming' && 'text-zinc-400',
          )}
        >
          {step.label}
        </span>
      </div>
    </li>
  );
}

export function WizardStepper({
  steps,
  currentStep,
  onStepClick,
}: WizardStepperProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <nav aria-label="Progress" className="w-full mb-8">
      {/* Desktop: Horizontal stepper */}
      <ol className="hidden md:flex items-center w-full">
        {steps.map((step, index) => {
          const state = getStepState(index, currentStep);
          const isLast = index === steps.length - 1;

          return (
            <DesktopStepItem
              key={step.id}
              step={step}
              index={index}
              state={state}
              isLast={isLast}
              onStepClick={onStepClick}
              prefersReducedMotion={prefersReducedMotion ?? false}
            />
          );
        })}
      </ol>

      {/* Mobile: Vertical stepper */}
      <ol className="md:hidden flex flex-col space-y-4">
        {steps.map((step, index) => {
          const state = getStepState(index, currentStep);
          const isLast = index === steps.length - 1;

          return (
            <MobileStepItem
              key={step.id}
              step={step}
              index={index}
              state={state}
              isLast={isLast}
              onStepClick={onStepClick}
              prefersReducedMotion={prefersReducedMotion ?? false}
            />
          );
        })}
      </ol>
    </nav>
  );
}
