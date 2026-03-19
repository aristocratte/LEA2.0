/**
 * Utility functions for managing pentest drafts in localStorage
 */

const DRAFT_KEY = 'lea-pentest-draft';

/**
 * Clears the pentest draft from localStorage
 * Should be called after successful pentest creation
 */
export function clearPentestDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch (error) {
    console.warn('Failed to clear pentest draft:', error);
  }
}

/**
 * Checks if a draft exists in localStorage
 */
export function hasPentestDraft(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(DRAFT_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * Gets the draft data from localStorage without parsing errors
 */
export function getPentestDraft<T>(): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
