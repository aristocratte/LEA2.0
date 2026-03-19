'use client';

import { motion } from 'framer-motion';
import { FileText, Clock, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface DraftRecoveryModalProps {
  isOpen: boolean;
  target: string;
  currentStep: number;
  totalSteps: number;
  savedAt: number;
  scanType?: string;
  onRecover: () => void;
  onDiscard: () => void;
}

function formatRelativeTime(savedAt: number): string {
  const diffMs = Date.now() - savedAt;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

function getStepName(step: number): string {
  const steps = ['Target', 'Scope', 'Configuration', 'Review'];
  return steps[step] || 'Unknown';
}

export function DraftRecoveryModal({
  isOpen,
  target,
  currentStep,
  totalSteps,
  savedAt,
  scanType,
  onRecover,
  onDiscard,
}: DraftRecoveryModalProps) {
  const relativeTime = formatRelativeTime(savedAt);
  const stepName = getStepName(currentStep);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onDiscard()}>
      <DialogContent className="sm:max-w-[500px]" showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-100">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <DialogTitle className="text-xl">Draft Found</DialogTitle>
          </div>
          <DialogDescription className="text-base">
            We found an unfinished pentest configuration. Would you like to continue where you left off?
          </DialogDescription>
        </DialogHeader>

        <div className="my-4 p-4 rounded-lg bg-zinc-50 border border-zinc-200 space-y-3">
          {/* Target */}
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-white border border-zinc-200 shrink-0">
              <AlertCircle className="w-4 h-4 text-zinc-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Target</p>
              <p className="text-sm font-mono font-medium text-zinc-900 truncate">{target || 'Not specified'}</p>
            </div>
          </div>

          {/* Progress */}
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-white border border-zinc-200 shrink-0">
              <FileText className="w-4 h-4 text-zinc-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Progress</p>
              <p className="text-sm font-medium text-zinc-900">
                Step {currentStep + 1} of {totalSteps} ({stepName})
              </p>
            </div>
          </div>

          {/* Scan Type */}
          {scanType && (
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-md bg-white border border-zinc-200 shrink-0">
                <FileText className="w-4 h-4 text-zinc-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Scan Type</p>
                <p className="text-sm font-medium text-zinc-900 capitalize">{scanType}</p>
              </div>
            </div>
          )}

          {/* Last Saved */}
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-white border border-zinc-200 shrink-0">
              <Clock className="w-4 h-4 text-zinc-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Last Saved</p>
              <p className="text-sm font-medium text-zinc-900">{relativeTime}</p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onDiscard}
            className="flex-1 sm:flex-none"
          >
            Start Fresh
          </Button>
          <Button
            type="button"
            onClick={onRecover}
            className="flex-1 sm:flex-none"
          >
            Resume Draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
