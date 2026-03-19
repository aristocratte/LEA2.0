# Draft Auto-Save System - Testing Guide

## Quick Start

1. **Start the development server**:
   ```bash
   cd lea-app
   npm run dev
   ```

2. **Navigate to pentest creation**:
   ```
   http://localhost:3000/pentest/new
   ```

3. **Test auto-save**:
   - Enter a target domain (e.g., `example.com`)
   - Wait 30 seconds or make changes
   - Check browser DevTools > Application > Local Storage
   - Look for key `lea-pentest-draft`

4. **Test recovery**:
   - Refresh the page
   - Draft recovery modal should appear
   - Choose "Resume Draft" or "Start Fresh"

## Automated Testing

### Run Unit Tests

```bash
cd lea-app
npm test -- useDraftPentest.test.ts
npm test -- DraftRecoveryModal.test.tsx
```

### Expected Test Results

- ✅ Draft detection on mount
- ✅ Draft recovery loads all data
- ✅ Draft discard clears localStorage
- ✅ Expired drafts are ignored
- ✅ Auto-save triggers every 30s
- ✅ Debounced save on changes
- ✅ Modal displays correct information

## Manual Testing Script

A testing script is available for browser console testing:

1. Open browser console at `/pentest/new`
2. Load the script:
   ```javascript
   // Copy and paste the contents of scripts/test-draft-system.js
   ```
3. Run test scenarios:
   ```javascript
   draftTest.simulateSteps() // Show available scenarios
   draftTest.create("mytarget.com", 2) // Create draft at step 3
   draftTest.read() // View current draft
   draftTest.clear() // Clear draft
   ```

## Test Scenarios

### Scenario 1: Normal Flow

1. Navigate to `/pentest/new`
2. Enter target: `example.com`
3. Click Continue
4. Add scope items
5. Click Continue
6. Wait 2+ seconds (debounce)
7. Refresh page
8. **Expected**: Modal shows with target and step 2/4

### Scenario 2: Draft Recovery

1. Create draft via console:
   ```javascript
   draftTest.create("recovery-test.com", 2)
   ```
2. Refresh page
3. Modal appears
4. Click "Resume Draft"
5. **Expected**: Wizard jumps to step 3 with all data restored

### Scenario 3: Draft Discard

1. Create draft via console:
   ```javascript
   draftTest.create("discard-test.com", 1)
   ```
2. Refresh page
3. Modal appears
4. Click "Start Fresh"
5. **Expected**: Draft cleared, wizard starts at step 1

### Scenario 4: Expired Draft

1. Create expired draft:
   ```javascript
   draftTest.createExpired("old-test.com")
   ```
2. Refresh page
3. **Expected**: No modal, draft auto-removed

### Scenario 5: Auto-Save

1. Navigate to `/pentest/new`
2. Enter target: `autosave-test.com`
3. Open DevTools > Application > Local Storage
4. Wait 30 seconds
5. **Expected**: New entry in localStorage with updated `savedAt`

### Scenario 6: Cleanup on Success

1. Complete entire wizard flow
2. Launch pentest successfully
3. Check localStorage
4. **Expected**: `lea-pentest-draft` key removed

## Checklist for Acceptance

- [ ] Auto-save works every 30 seconds
- [ ] Draft persists in localStorage
- [ ] Modal appears if draft exists on load
- [ ] "Resume" loads all data correctly
- [ ] "Start Fresh" clears draft
- [ ] Expired drafts (>7 days) are ignored
- [ ] Draft clears after successful creation
- [ ] Works across browser tabs
- [ ] Handles localStorage errors gracefully
- [ ] SSR-safe (no hydration errors)

## Browser DevTools

### Check Draft in LocalStorage

1. Open DevTools (F12)
2. Go to Application tab
3. Expand Local Storage
4. Click on your domain
5. Find key `lea-pentest-draft`
6. View value (JSON format)

### Clear Draft Manually

```javascript
localStorage.removeItem('lea-pentest-draft')
```

### View Current Draft

```javascript
JSON.parse(localStorage.getItem('lea-pentest-draft'))
```

## Troubleshooting

### Modal doesn't appear

- Check if draft exists in localStorage
- Verify `savedAt` is recent (< 7 days)
- Check console for errors
- Ensure page is `/pentest/new`

### Data not restoring

- Check draft JSON structure
- Verify all fields present
- Look for console errors
- Check store state with Redux DevTools

### Auto-save not working

- Check if `useDraftPentest(true)` is called
- Verify store is updating (check `updatedAt`)
- Look for timer in React DevTools
- Check for localStorage quota errors

## Performance Considerations

- Auto-save debounced to 2s (prevents spam)
- Interval only runs when target is set
- localStorage writes are async (non-blocking)
- Draft cleanup happens on success (not on error)

## Security Notes

- Drafts stored in localStorage (client-side only)
- No sensitive data stored (just configuration)
- Drafts expire after 7 days
- Clear on logout if implementing auth
