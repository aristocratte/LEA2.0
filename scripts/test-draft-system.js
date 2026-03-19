/**
 * Manual Testing Script for Draft Auto-Save System
 *
 * Run this in browser console at http://localhost:3000/pentest/new
 */

// 1. Clear any existing draft
localStorage.removeItem('lea-pentest-draft');
console.log('✅ Draft cleared');

// 2. Create a test draft
const testDraft = {
  target: 'test-example.com',
  inScope: ['test-example.com', 'api.test-example.com'],
  outOfScope: ['blog.test-example.com'],
  scanType: 'deep',
  thinkingBudget: 'deep',
  currentStep: 2,
  savedAt: Date.now(),
  providerId: 'anthropic',
  modelId: 'claude-sonnet-4-6',
};

localStorage.setItem('lea-pentest-draft', JSON.stringify(testDraft));
console.log('✅ Test draft created:', testDraft);

// 3. Verify draft exists
const saved = localStorage.getItem('lea-pentest-draft');
console.log('✅ Draft in storage:', JSON.parse(saved));

// 4. Test expiration (uncomment to test)
// const expiredDraft = { ...testDraft, savedAt: Date.now() - 8 * 24 * 60 * 60 * 1000 };
// localStorage.setItem('lea-pentest-draft', JSON.stringify(expiredDraft));
// console.log('✅ Expired draft created (should be auto-removed)');

// 5. Reload page to see draft recovery modal
console.log('🔄 Reload the page to see the draft recovery modal');
console.log('📌 Expected: Modal shows "test-example.com", Step 3 of 4, "2 hours ago"');

// Helper functions
window.draftTest = {
  create: (target = 'demo.com', step = 1) => {
    const draft = {
      target,
      inScope: [target],
      outOfScope: [],
      scanType: 'standard',
      thinkingBudget: 'standard',
      currentStep: step,
      savedAt: Date.now(),
    };
    localStorage.setItem('lea-pentest-draft', JSON.stringify(draft));
    console.log('✅ Draft created:', draft);
    return draft;
  },

  createExpired: (target = 'old-demo.com') => {
    const draft = {
      target,
      inScope: [target],
      outOfScope: [],
      scanType: 'quick',
      thinkingBudget: 'quick',
      currentStep: 0,
      savedAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
    };
    localStorage.setItem('lea-pentest-draft', JSON.stringify(draft));
    console.log('✅ Expired draft created:', draft);
    return draft;
  },

  read: () => {
    const draft = localStorage.getItem('lea-pentest-draft');
    console.log('📖 Current draft:', draft ? JSON.parse(draft) : null);
    return draft ? JSON.parse(draft) : null;
  },

  clear: () => {
    localStorage.removeItem('lea-pentest-draft');
    console.log('🗑️ Draft cleared');
  },

  simulateSteps: () => {
    console.log('\n📋 Test Scenarios:');
    console.log('1. draftTest.create("target1.com", 0) - Step 1: Target');
    console.log('2. draftTest.create("target2.com", 1) - Step 2: Scope');
    console.log('3. draftTest.create("target3.com", 2) - Step 3: Config');
    console.log('4. draftTest.create("target4.com", 3) - Step 4: Review');
    console.log('5. draftTest.createExpired() - Expired draft');
    console.log('6. draftTest.read() - Read current draft');
    console.log('7. draftTest.clear() - Clear draft');
    console.log('\nThen reload page to see modal');
  },
};

console.log('\n🎮 Test helpers available at window.draftTest');
console.log('Run draftTest.simulateSteps() for test scenarios\n');
