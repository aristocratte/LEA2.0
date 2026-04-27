/**
 * @module permissions/DenialTracker
 * @description Track permission denials for rate limiting and escalation.
 *
 * When the classifier or rule engine denies multiple consecutive actions,
 * the denial tracker can trigger escalation:
 * - After N consecutive denials → fall back to prompting the user
 * - After M total denials → abort the session
 *
 * Adapted from Claude Code's denialTracking.ts.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** State tracking consecutive and total permission denials. */
export type DenialTrackingState = {
  /** Number of consecutive denied actions (reset on any allow). */
  readonly consecutiveDenials: number;
  /** Total denials in this session (never resets). */
  readonly totalDenials: number;
};

/** Configuration for denial limits. */
export type DenialLimits = {
  /** Max consecutive denials before falling back to prompting. */
  readonly maxConsecutive: number;
  /** Max total denials before aborting the session. */
  readonly maxTotal: number;
};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Default denial limits. */
export const DENIAL_LIMITS: DenialLimits = {
  maxConsecutive: 3,
  maxTotal: 20,
} as const satisfies DenialLimits;

// ---------------------------------------------------------------------------
// State management
// ---------------------------------------------------------------------------

/**
 * Create a fresh denial tracking state.
 */
export function createDenialTrackingState(): DenialTrackingState {
  return {
    consecutiveDenials: 0,
    totalDenials: 0,
  };
}

/**
 * Record a denial, incrementing both counters.
 */
export function recordDenial(state: DenialTrackingState): DenialTrackingState {
  return {
    consecutiveDenials: state.consecutiveDenials + 1,
    totalDenials: state.totalDenials + 1,
  };
}

/**
 * Record a successful permission grant, resetting consecutive denials.
 * Returns the same reference if no change is needed.
 */
export function recordSuccess(state: DenialTrackingState): DenialTrackingState {
  if (state.consecutiveDenials === 0) return state;
  return {
    ...state,
    consecutiveDenials: 0,
  };
}

/**
 * Check whether the denial state has exceeded limits and the system
 * should fall back to prompting the user.
 *
 * @returns `true` if consecutive or total limit has been reached.
 */
export function shouldFallbackToPrompting(
  state: DenialTrackingState,
  limits?: DenialLimits,
): boolean {
  const l = limits ?? DENIAL_LIMITS;
  return (
    state.consecutiveDenials >= l.maxConsecutive ||
    state.totalDenials >= l.maxTotal
  );
}

// ---------------------------------------------------------------------------
// Escalation
// ---------------------------------------------------------------------------

/**
 * Build a warning message for the user when denial limits are exceeded.
 */
export function buildDenialWarning(state: DenialTrackingState): string {
  if (state.totalDenials >= DENIAL_LIMITS.maxTotal) {
    return (
      `${state.totalDenials} actions were blocked this session. ` +
      'Please review the transcript before continuing.'
    );
  }
  return (
    `${state.consecutiveDenials} consecutive actions were blocked. ` +
    'Please review the transcript before continuing.'
  );
}

/**
 * Check if total denial limit was hit (triggers session abort in headless).
 */
export function isTotalLimitExceeded(
  state: DenialTrackingState,
  limits?: DenialLimits,
): boolean {
  return state.totalDenials >= (limits ?? DENIAL_LIMITS).maxTotal;
}

// ---------------------------------------------------------------------------
// In-memory tracker singleton
// ---------------------------------------------------------------------------

let globalDenialState: DenialTrackingState = createDenialTrackingState();

/**
 * Get the global denial tracking state.
 */
export function getGlobalDenialState(): DenialTrackingState {
  return globalDenialState;
}

/**
 * Update the global denial tracking state.
 */
export function updateGlobalDenialState(
  updater: (state: DenialTrackingState) => DenialTrackingState,
): DenialTrackingState {
  globalDenialState = updater(globalDenialState);
  return globalDenialState;
}

/**
 * Reset the global denial tracking state.
 */
export function resetGlobalDenialState(): void {
  globalDenialState = createDenialTrackingState();
}
