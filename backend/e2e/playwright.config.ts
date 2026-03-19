import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const backendUrl = 'http://127.0.0.1:3301';
const frontendUrl = 'http://127.0.0.1:3300';
const artifactDir = process.env.PLAYWRIGHT_ARTIFACT_DIR || resolve(process.cwd(), 'test-results');
const testOutputDir = resolve(artifactDir, 'results');

export default defineConfig({
  testDir: './',
  testMatch: ['swarm-runtime.spec.ts', 'swarm-reduced-motion.spec.ts'],
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  outputDir: testOutputDir,
  reporter: [
    ['list'],
    ['html', { outputFolder: resolve(artifactDir, 'html-report'), open: 'never' }],
    ['json', { outputFile: resolve(artifactDir, 'results.json') }],
  ],
  use: {
    baseURL: frontendUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command:
        "PORT=3301 HOST=127.0.0.1 DATABASE_URL='postgresql://lea_admin:CHANGE_THIS_PASSWORD_IN_PRODUCTION@127.0.0.1:5433/lea_platform' DATABASE_DIRECT_URL='postgresql://lea_admin:CHANGE_THIS_PASSWORD_IN_PRODUCTION@127.0.0.1:5433/lea_platform' ALLOWED_ORIGINS='http://127.0.0.1:3300,http://localhost:3300' MCP_KALI_ENDPOINT='http://127.0.0.1:3002/mcp' ENCRYPTION_MASTER_KEY='bd092b77f9b63291ad71892c1e22fc5ca41dbdbc42bea6874fdda9f213bd773f' DEFAULT_PROVIDER='anthropic' DEFAULT_MODEL='claude-sonnet-4-5-20250929' node --import tsx src/index.ts",
      url: `${backendUrl}/api/health`,
      cwd: '/Users/aris/Documents/LEA/backend',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: `PORT=3300 API_URL=${backendUrl} NEXT_PUBLIC_API_BASE=${backendUrl} npm run dev`,
      url: `${frontendUrl}/pentest`,
      cwd: '/Users/aris/Documents/LEA/lea-app',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
