# Draft Auto-Save System

## Overview

The LEA application implements an automatic draft-saving system for pentest configurations. This ensures users never lose their work if they accidentally close the browser or navigate away during the pentest creation wizard.

## Architecture

### Components

1. **`useDraftPentest` Hook** (`lea-app/hooks/useDraftPentest.ts`)
   - Manages draft lifecycle
   - Implements auto-save logic
   - Provides draft recovery functionality

2. **`DraftRecoveryModal`** (`lea-app/components/onboarding/DraftRecoveryModal.tsx`)
   - UI component for draft recovery
   - Displays draft information
   - Handles user decision

3. **`pentest-creation-store`** (`lea-app/store/pentest-creation-store.ts`)
   - Zustand store for pentest creation state
   - Includes `loadFromDraft` action
   - Manages all wizard data

4. **Draft Utilities** (`lea-app/lib/draft-utils.ts`)
   - Helper functions for localStorage operations
   - Safe draft management

## Features

### Auto-Save

- **Interval-based**: Saves every 30 seconds when target is set
- **Debounced**: Saves 2 seconds after any change
- **Smart**: Only saves when meaningful data exists

### Persistence

- **Storage**: Uses `localStorage` with key `lea-pentest-draft`
- **Expiration**: Drafts expire after 7 days
- **Data**: Saves all wizard state including:
  - Target
  - Scope (in/out)
  - Scan type
  - Thinking budget
  - Current step
  - Provider/model selection

### Recovery

When a user returns to `/pentest/new`:

1. **Detection**: Hook checks for existing draft
2. **Validation**: Verifies draft is not expired
3. **Modal**: Shows `DraftRecoveryModal` with details
4. **Options**:
   - **Resume**: Loads draft into store, continues wizard
   - **Start Fresh**: Discards draft, starts from scratch

### Cleanup

Drafts are automatically cleared when:
- Pentest is successfully created
- User explicitly discards draft
- Draft expires (> 7 days old)

## Usage

### In Components

```tsx
import { useDraftPentest } from '@/hooks/useDraftPentest';

function MyComponent() {
  const { hasDraft, draftInfo, recoverDraft, discardDraft } = useDraftPentest(true);

  if (hasDraft && draftInfo) {
    // Show recovery UI
  }
}
```

### Manual Draft Management

```tsx
import { clearPentestDraft, hasPentestDraft, getPentestDraft } from '@/lib/draft-utils';

// Check if draft exists
if (hasPentestDraft()) {
  // Handle draft
}

// Get draft data
const draft = getPentestDraft<DraftData>();

// Clear draft manually
clearPentestDraft();
```

## Configuration

### Constants

```typescript
const DRAFT_KEY = 'lea-pentest-draft';
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const AUTOSAVE_INTERVAL_MS = 30_000; // 30 seconds
const DEBOUNCE_MS = 2_000; // 2 seconds
```

## Data Structure

```typescript
interface PersistedDraft {
  target: string;
  inScope: string[];
  outOfScope: string[];
  scanType: ScanType;
  thinkingBudget: ThinkingBudget;
  currentStep: number;
  savedAt: number;
  providerId?: string | null;
  modelId?: string | null;
}

interface DraftRecoveryInfo {
  target: string;
  scanType: string;
  currentStep: number;
  savedAt: number;
}
```

## Testing

### Unit Tests

- `useDraftPentest.test.ts`: Hook functionality
- `DraftRecoveryModal.test.tsx`: UI component

### Test Coverage

- Draft detection
- Draft recovery
- Draft discard
- Auto-save behavior
- Expiration handling
- Edge cases (SSR, localStorage errors)

## Best Practices

1. **Always call `clearPentestDraft()`** after successful pentest creation
2. **Use `useDraftPentest` hook** in wizard pages for consistent behavior
3. **Handle SSR gracefully** - check `typeof window !== 'undefined'`
4. **Catch localStorage errors** - user may have quota exceeded or private browsing

## Future Improvements

- [ ] Add draft versioning for backwards compatibility
- [ ] Implement draft sync across tabs (using BroadcastChannel)
- [ ] Add "Save as Template" feature from drafts
- [ ] Show draft preview in modal (full scope list)
- [ ] Add undo functionality after discard

## Troubleshooting

### Draft not saving

- Check browser console for localStorage errors
- Verify localStorage quota not exceeded
- Ensure auto-save is enabled (parameter to hook)

### Draft not recovering

- Check draft hasn't expired (> 7 days)
- Verify localStorage contains valid JSON
- Check browser's localStorage is enabled

### Multiple drafts

Currently only one draft is supported. If you need multiple drafts:
- Implement draft list UI
- Use `draft-utils.ts` functions with different keys
- Add draft management page
