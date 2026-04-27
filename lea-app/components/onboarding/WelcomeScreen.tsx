'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Settings, Shield, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { TemplateGrid } from './TemplateGrid';
import { PENTEST_TEMPLATES, type PentestTemplate } from '@/store/pentest-creation-store';

export type StartMode = 'quick' | 'advanced' | null;

export interface WelcomeScreenProps {
  onStart: (mode: StartMode, template?: PentestTemplate) => void;
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
} as const;

export function WelcomeScreen({ onStart }: WelcomeScreenProps) {
  const [selectedMode, setSelectedMode] = useState<StartMode>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  const handleModeSelect = (mode: StartMode) => {
    setSelectedMode(mode);
    setSelectedTemplateId(null);
  };

  const handleTemplateSelect = (template: PentestTemplate) => {
    setSelectedTemplateId(template.id);
  };

  const handleContinue = () => {
    if (selectedMode === 'quick' && selectedTemplateId) {
      const template = findTemplateById(selectedTemplateId);
      onStart('quick', template);
    } else if (selectedMode === 'advanced') {
      onStart('advanced');
    }
  };

  const findTemplateById = (id: string): PentestTemplate | undefined => {
    return PENTEST_TEMPLATES.find((t: PentestTemplate) => t.id === id);
  };

  const canContinue = selectedMode === 'advanced' || (selectedMode === 'quick' && selectedTemplateId);

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="w-full max-w-3xl mx-auto"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[#F5A623] to-[#E8940F] mb-4 shadow-lg">
          <Shield className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-zinc-900 mb-2">
          Commencez votre scan de securite
        </h1>
        <p className="text-zinc-500 text-sm">
          Choisissez comment vous souhaitez configurer votre pentest
        </p>
      </motion.div>

      {/* Mode Selection Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 gap-4 mb-6">
        {/* Quick Start Card */}
        <motion.button
          type="button"
          onClick={() => handleModeSelect('quick')}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          className={cn(
            'relative rounded-xl border-2 p-6 cursor-pointer text-left transition-all duration-200',
            selectedMode === 'quick'
              ? 'border-[#F5A623] bg-orange-50/40 shadow-md'
              : 'border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm',
          )}
        >
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'h-10 w-10 rounded-lg flex items-center justify-center shrink-0 transition-colors',
                selectedMode === 'quick' ? 'bg-[#F5A623]' : 'bg-zinc-100',
              )}
            >
              <Zap className={cn('h-5 w-5', selectedMode === 'quick' ? 'text-white' : 'text-zinc-600')} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-zinc-900 mb-1">Quick Start</h3>
              <p className="text-sm text-zinc-500 leading-snug">
                Configuration rapide avec templates predefinis. Pret en 30 secondes.
              </p>
            </div>
          </div>

          {/* Selected indicator */}
          {selectedMode === 'quick' && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute top-3 right-3 h-5 w-5 rounded-full bg-[#F5A623] flex items-center justify-center"
            >
              <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </motion.div>
          )}

          {/* Features */}
          <div className="mt-4 pt-4 border-t border-zinc-100">
            <ul className="space-y-1.5">
              <li className="flex items-center gap-2 text-xs text-zinc-500">
                <span className="h-1 w-1 rounded-full bg-zinc-300" />
                Templates preconfigures
              </li>
              <li className="flex items-center gap-2 text-xs text-zinc-500">
                <span className="h-1 w-1 rounded-full bg-zinc-300" />
                Parametres optimaux par defaut
              </li>
              <li className="flex items-center gap-2 text-xs text-zinc-500">
                <span className="h-1 w-1 rounded-full bg-zinc-300" />
                Ideal pour debuter
              </li>
            </ul>
          </div>
        </motion.button>

        {/* Advanced Card */}
        <motion.button
          type="button"
          onClick={() => handleModeSelect('advanced')}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          className={cn(
            'relative rounded-xl border-2 p-6 cursor-pointer text-left transition-all duration-200',
            selectedMode === 'advanced'
              ? 'border-[#F5A623] bg-orange-50/40 shadow-md'
              : 'border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm',
          )}
        >
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'h-10 w-10 rounded-lg flex items-center justify-center shrink-0 transition-colors',
                selectedMode === 'advanced' ? 'bg-[#F5A623]' : 'bg-zinc-100',
              )}
            >
              <Settings className={cn('h-5 w-5', selectedMode === 'advanced' ? 'text-white' : 'text-zinc-600')} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-zinc-900 mb-1">Advanced</h3>
              <p className="text-sm text-zinc-500 leading-snug">
                Configuration complete avec controle total sur tous les parametres.
              </p>
            </div>
          </div>

          {/* Selected indicator */}
          {selectedMode === 'advanced' && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute top-3 right-3 h-5 w-5 rounded-full bg-[#F5A623] flex items-center justify-center"
            >
              <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </motion.div>
          )}

          {/* Features */}
          <div className="mt-4 pt-4 border-t border-zinc-100">
            <ul className="space-y-1.5">
              <li className="flex items-center gap-2 text-xs text-zinc-500">
                <span className="h-1 w-1 rounded-full bg-zinc-300" />
                Configuration detaillee
              </li>
              <li className="flex items-center gap-2 text-xs text-zinc-500">
                <span className="h-1 w-1 rounded-full bg-zinc-300" />
                Choix du modele et budget
              </li>
              <li className="flex items-center gap-2 text-xs text-zinc-500">
                <span className="h-1 w-1 rounded-full bg-zinc-300" />
                Pour utilisateurs experimentes
              </li>
            </ul>
          </div>
        </motion.button>
      </motion.div>

      {/* Template Grid - Only show when Quick Start is selected */}
      <AnimatePresence mode="wait">
        {selectedMode === 'quick' && (
          <motion.div
            key="template-grid"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="mb-6"
          >
            <TemplateGrid
              selectedId={selectedTemplateId}
              onSelect={handleTemplateSelect}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Continue Button */}
      <motion.div variants={itemVariants} className="flex justify-center">
        <Button
          onClick={handleContinue}
          disabled={!canContinue}
          size="lg"
          className={cn(
            'min-w-[200px] h-11 text-base font-semibold gap-2',
            canContinue
              ? 'bg-[#F5A623] hover:bg-[#E8940F] text-white'
              : 'bg-zinc-100 text-zinc-400 cursor-not-allowed',
          )}
        >
          {selectedMode === 'advanced' ? (
            <>
              Configurer le scan
              <ArrowRight className="h-4 w-4" />
            </>
          ) : (
            <>
              Lancer le scan
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </motion.div>

      {/* Help text */}
      <motion.p
        variants={itemVariants}
        className="text-center text-xs text-zinc-400 mt-4"
      >
        {selectedMode === null && 'Selectionnez un mode pour commencer'}
        {selectedMode === 'quick' && !selectedTemplateId && 'Choisissez un template pour continuer'}
        {selectedMode === 'quick' && selectedTemplateId && 'Cliquez sur "Lancer le scan" pour demarrer'}
        {selectedMode === 'advanced' && 'Cliquez sur "Configurer le scan" pour personnaliser'}
      </motion.p>
    </motion.div>
  );
}
