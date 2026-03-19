#!/bin/bash

# Verification script for Draft Auto-Save System
# Run this to verify all components are in place

echo "🔍 Verifying Draft Auto-Save System..."
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check function
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $1"
        return 0
    else
        echo -e "${RED}✗${NC} $1 ${RED}(missing)${NC}"
        return 1
    fi
}

# Track results
ERRORS=0

echo "Core Components:"
check_file "lea-app/hooks/useDraftPentest.ts" || ((ERRORS++))
check_file "lea-app/components/onboarding/DraftRecoveryModal.tsx" || ((ERRORS++))
check_file "lea-app/components/onboarding/DraftRecoveryBanner.tsx" || ((ERRORS++))
check_file "lea-app/store/pentest-creation-store.ts" || ((ERRORS++))
check_file "lea-app/lib/draft-utils.ts" || ((ERRORS++))
echo ""

echo "Module Exports:"
check_file "lea-app/draft/index.ts" || ((ERRORS++))
check_file "lea-app/draft/README.md" || ((ERRORS++))
echo ""

echo "Integration:"
check_file "lea-app/app/pentest/new/page.tsx" || ((ERRORS++))
check_file "lea-app/app/pentest/new/review/page.tsx" || ((ERRORS++))
echo ""

echo "Tests:"
check_file "lea-app/hooks/__tests__/useDraftPentest.test.ts" || ((ERRORS++))
check_file "lea-app/components/onboarding/__tests__/DraftRecoveryModal.test.tsx" || ((ERRORS++))
echo ""

echo "Documentation:"
check_file "docs/draft-auto-save-system.md" || ((ERRORS++))
check_file "docs/draft-testing-guide.md" || ((ERRORS++))
echo ""

echo "Scripts:"
check_file "scripts/test-draft-system.js" || ((ERRORS++))
echo ""

# Summary
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✅ All components verified successfully!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Run tests: cd lea-app && npm test -- useDraftPentest"
    echo "2. Start dev server: cd lea-app && npm run dev"
    echo "3. Navigate to: http://localhost:3000/pentest/new"
    echo "4. Test draft creation and recovery"
    exit 0
else
    echo -e "${RED}❌ Verification failed with $ERRORS error(s)${NC}"
    exit 1
fi
