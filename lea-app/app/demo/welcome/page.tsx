/**
 * Page de démonstration pour WelcomeScreen
 *
 * Cette page permet de tester le composant WelcomeScreen de manière isolée.
 * Accès: http://localhost:3000/demo/welcome
 */

'use client';

import { useState } from 'react';
import { WelcomeScreen, type StartMode } from '@/components/onboarding';
import type { PentestTemplate } from '@/store/pentest-creation-store';

export default function WelcomeScreenDemo() {
  const [result, setResult] = useState<{
    mode: StartMode;
    template?: PentestTemplate;
  } | null>(null);

  const handleStart = (mode: StartMode, template?: PentestTemplate) => {
    console.log('=== WelcomeScreen Demo ===');
    console.log('Mode:', mode);
    console.log('Template:', template);
    console.log('========================');

    setResult({ mode, template });

    // Dans une vraie application, vous feriez:
    // if (mode === 'quick' && template) {
    //   applyTemplate(template);
    //   router.push('/pentest/new/scope');
    // } else if (mode === 'advanced') {
    //   router.push('/pentest/new/config');
    // }
  };

  const handleReset = () => {
    setResult(null);
  };

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header de démo */}
      <div className="bg-white border-b border-zinc-200 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-lg font-semibold text-zinc-900">
            Demo: WelcomeScreen Component
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Testez l'expérience Quick Start avec templates
          </p>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="flex items-center justify-center min-h-[calc(100vh-120px)] p-6">
        {!result ? (
          <WelcomeScreen onStart={handleStart} />
        ) : (
          <div className="max-w-md w-full">
            {/* Résultat */}
            <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  Action completed!
                </h2>
              </div>

              <div className="space-y-3">
                <div className="p-3 bg-zinc-50 rounded-lg">
                  <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Mode</p>
                  <p className="text-sm font-semibold text-zinc-900 mt-1">
                    {result.mode === 'quick' ? '⚡ Quick Start' : '⚙️ Advanced'}
                  </p>
                </div>

                {result.template && (
                  <>
                    <div className="p-3 bg-zinc-50 rounded-lg">
                      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Template</p>
                      <p className="text-sm font-semibold text-zinc-900 mt-1">
                        {result.template.icon} {result.template.name}
                      </p>
                    </div>

                    <div className="p-3 bg-zinc-50 rounded-lg">
                      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Configuration</p>
                      <div className="mt-2 space-y-1">
                        <p className="text-xs text-zinc-600">
                          <span className="font-medium">Scan Type:</span> {result.template.scanType}
                        </p>
                        <p className="text-xs text-zinc-600">
                          <span className="font-medium">Thinking Budget:</span> {result.template.thinkingBudget}
                        </p>
                        <p className="text-xs text-zinc-600">
                          <span className="font-medium">Duration:</span> {result.template.estimatedMinutes[0]}-{result.template.estimatedMinutes[1]} min
                        </p>
                        <p className="text-xs text-zinc-600">
                          <span className="font-medium">Cost:</span> ${(result.template.estimatedCostCents / 100).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </>
                )}

                <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                  <p className="text-xs font-medium text-orange-800">
                    ℹ️ Dans une vraie application, vous seriez redirigé vers l'étape suivante du wizard.
                  </p>
                </div>
              </div>

              <button
                onClick={handleReset}
                className="mt-6 w-full px-4 py-2.5 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors"
              >
                Reset Demo
              </button>
            </div>

            {/* Console log */}
            <div className="mt-4 bg-zinc-900 rounded-lg p-4 text-xs font-mono text-zinc-300">
              <p className="text-zinc-500 mb-2">// Console output:</p>
              <p>Mode: {result.mode}</p>
              {result.template && (
                <>
                  <p>Template: {result.template.id}</p>
                  <p>Scan Type: {result.template.scanType}</p>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-zinc-200 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <p className="text-xs text-zinc-500">
            Component: <code className="text-zinc-700">@/components/onboarding/WelcomeScreen</code>
          </p>
          <p className="text-xs text-zinc-400">
            Press <kbd className="px-1.5 py-0.5 bg-zinc-100 rounded text-zinc-600">Esc</kbd> to reset
          </p>
        </div>
      </div>
    </div>
  );
}
