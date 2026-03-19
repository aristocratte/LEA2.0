'use client';

import { Sparkles, Globe, Target } from 'lucide-react';

interface ModelCardProps {
  model: string;
  description: string;
}

export function ModelCard({ model, description }: ModelCardProps) {
  return (
    <div className="bg-white border border-[#E5E5E5] rounded-xl p-4">
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs text-gray-400 uppercase tracking-wider">Model</p>
        <Sparkles className="w-4 h-4 text-gray-400" />
      </div>
      <h3 className="font-semibold text-gray-900 mb-1">{model}</h3>
      <p className="text-sm text-gray-500">{description}</p>
    </div>
  );
}

interface TargetCardProps {
  target: string;
  description: string;
}

export function TargetCard({ target, description }: TargetCardProps) {
  return (
    <div className="bg-white border border-[#E5E5E5] rounded-xl p-4">
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs text-gray-400 uppercase tracking-wider">Target</p>
        <Globe className="w-4 h-4 text-gray-400" />
      </div>
      <h3 className="font-semibold text-gray-900 mb-1 font-mono">{target}</h3>
      <p className="text-sm text-gray-500">{description}</p>
    </div>
  );
}

interface StartingPointCardProps {
  title?: string;
  subtitle?: string;
  optionText?: string;
  status?: string;
  onClick?: () => void;
}

export function StartingPointCard({
  title = "Choose one starting point.",
  subtitle = "Ask one precise question. Expand only when needed.",
  optionText = "Start with scope mapping or auth review",
  status = "Ready",
  onClick,
}: StartingPointCardProps) {
  return (
    <div className="bg-white border border-[#E5E5E5] rounded-xl p-4">
      <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-500 mb-4">{subtitle}</p>
      <button
        onClick={onClick}
        className="w-full flex items-center justify-between p-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 rounded border border-gray-300 flex items-center justify-center">
            <div className="w-2.5 h-2.5 rounded-sm border border-[#F5A623]" />
          </div>
          <span className="text-sm text-gray-700">{optionText}</span>
        </div>
        <span className="text-sm text-gray-400">{status}</span>
      </button>
    </div>
  );
}

interface ConfigCardsProps {
  model?: string;
  modelDescription?: string;
  target?: string;
  targetDescription?: string;
}

export function ConfigCards({
  model = "GPT-5 Pentest Analyst",
  modelDescription = "Reasoning enabled and scoped to the current target.",
  target = "app.example.internal",
  targetDescription = "Authenticated web surface only.",
}: ConfigCardsProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <ModelCard model={model} description={modelDescription} />
        <TargetCard target={target} description={targetDescription} />
      </div>
      <StartingPointCard />
    </div>
  );
}
