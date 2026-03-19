export type SwarmRuntimeMode = 'live' | 'scenario' | 'replay';

export interface SwarmRuntimeSelection {
  mode?: SwarmRuntimeMode;
  scenarioId?: string;
  traceId?: string;
  speed?: number;
  startAtSequence?: number;
  autoStart?: boolean;
  capture?: boolean;
  failureProfileId?: string;
}

function asNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function asBoolean(value: string | null): boolean | undefined {
  if (value === null) return undefined;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return undefined;
}

export function getRuntimeSelectionFromSearchParams(
  searchParams: URLSearchParams,
): SwarmRuntimeSelection | undefined {
  const mode = searchParams.get('runtimeMode');
  if (mode !== 'live' && mode !== 'scenario' && mode !== 'replay') {
    return undefined;
  }

  return {
    mode,
    scenarioId: searchParams.get('scenarioId') || undefined,
    traceId: searchParams.get('traceId') || undefined,
    speed: asNumber(searchParams.get('runtimeSpeed')),
    startAtSequence: asNumber(searchParams.get('startAtSequence')),
    autoStart: asBoolean(searchParams.get('autoStart')),
    capture: asBoolean(searchParams.get('capture')),
    failureProfileId: searchParams.get('failureProfileId') || undefined,
  };
}
