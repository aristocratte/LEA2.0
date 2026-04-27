import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RuntimeExtensionsPanel } from '../RuntimeExtensionsPanel';
import { useRuntimeExtensions, type RuntimeExtensionsState } from '@/hooks/use-runtime-extensions';
import { useSkills, type UseSkillsReturn } from '@/hooks/use-skills';
import { extensionsApi } from '@/lib/extensions-api';

vi.mock('@/hooks/use-runtime-extensions', () => ({
  useRuntimeExtensions: vi.fn(),
}));

vi.mock('@/hooks/use-skills', () => ({
  useSkills: vi.fn(),
}));

vi.mock('@/lib/extensions-api', () => ({
  extensionsApi: {
    runLspDiagnostics: vi.fn(),
    runLspSymbols: vi.fn(),
  },
}));

const mockUseRuntimeExtensions = vi.mocked(useRuntimeExtensions);
const mockUseSkills = vi.mocked(useSkills);
const mockedExtensionsApi = vi.mocked(extensionsApi);

function createRuntimeState(): RuntimeExtensionsState {
  return {
    hooks: {
      observationOnly: true,
      events: [
        { name: 'pre-tool', listenerCount: 1, hasListeners: true },
        { name: 'post-tool', listenerCount: 0, hasListeners: false },
      ],
    },
    mcp: {
      connected: true,
      mode: 'jsonrpc',
      endpoint: 'http://kali:3001',
      containerName: 'lea-kali',
      bridgedTools: ['mcp:nmap_scan', 'mcp:whois_lookup'],
    },
    plugins: {
      pluginsDir: '/tmp/plugins',
      trustStorePath: '/tmp/plugins/.trust.json',
      plugins: [
        {
          id: 'safe_recon',
          name: 'Safe Recon',
          version: '1.0.0',
          description: 'Passive recon tools',
          directory: '/tmp/plugins/safe_recon',
          digest: 'abc1234567890',
          trust: 'trusted',
          state: 'loaded',
          skills: ['whois.json'],
          registeredTools: ['skill:whois'],
          errors: [],
        },
      ],
      errors: [],
    },
    isLoading: false,
    isSyncingMcp: false,
    isReloadingPlugins: false,
    pendingPluginId: null,
    error: null,
    actionError: null,
    refresh: vi.fn(async () => undefined),
    syncMcp: vi.fn(async () => undefined),
    reloadPlugins: vi.fn(async () => undefined),
    trustPlugin: vi.fn(async () => undefined),
    denyPlugin: vi.fn(async () => undefined),
  };
}

function createSkillsState(): UseSkillsReturn {
  return {
    snapshot: {
      skillsDir: '/tmp/skills',
      loadedAt: '2026-04-25T10:00:00.000Z',
      registered: 1,
      skipped: 0,
      errors: [],
      skills: [
        {
          id: 'safe_whois',
          toolName: 'skill:safe_whois',
          aliases: ['safe_whois'],
          description: 'Safe WHOIS workflow',
          steps: [{ id: 'whois', tool: 'mcp:whois_lookup', optional: false }],
          readOnly: true,
          concurrencySafe: true,
          destructive: false,
          maxResultSizeChars: 50_000,
        },
      ],
    },
    skills: [
      {
        id: 'safe_whois',
        toolName: 'skill:safe_whois',
        aliases: ['safe_whois'],
        description: 'Safe WHOIS workflow',
        steps: [{ id: 'whois', tool: 'mcp:whois_lookup', optional: false }],
        readOnly: true,
        concurrencySafe: true,
        destructive: false,
        maxResultSizeChars: 50_000,
      },
    ],
    isLoading: false,
    isReloading: false,
    error: null,
    invocation: { isLoading: false, result: null, error: null },
    refresh: vi.fn(async () => undefined),
    reload: vi.fn(async () => undefined),
    invoke: vi.fn(async () => null),
    clearInvocation: vi.fn(),
  };
}

describe('RuntimeExtensionsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRuntimeExtensions.mockReturnValue(createRuntimeState());
    mockUseSkills.mockReturnValue(createSkillsState());
    mockedExtensionsApi.runLspDiagnostics.mockResolvedValue({
      files: ['backend/src/index.ts'],
      diagnostics: [
        {
          file: 'backend/src/index.ts',
          line: 12,
          column: 4,
          code: 2339,
          category: 'error',
          message: 'Property x does not exist',
        },
      ],
    });
    mockedExtensionsApi.runLspSymbols.mockResolvedValue({
      files: ['backend/src/index.ts'],
      symbols: [
        {
          file: 'backend/src/index.ts',
          name: 'bootstrap',
          kind: 'FunctionDeclaration',
          line: 1,
          column: 1,
          exported: true,
        },
      ],
    });
  });

  it('renders the Bloc C runtime console overview', () => {
    render(<RuntimeExtensionsPanel />);

    expect(screen.getByText('Runtime extensions console')).toBeInTheDocument();
    expect(screen.getByText('Bloc C control plane')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1/1')).toBeInTheDocument();
  });

  it('navigates to MCP and triggers sync', () => {
    const syncMcp = vi.fn(async () => undefined);
    mockUseRuntimeExtensions.mockReturnValue({
      ...createRuntimeState(),
      syncMcp,
    });

    render(<RuntimeExtensionsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'MCP' }));
    fireEvent.click(screen.getByRole('button', { name: /sync mcp tools/i }));

    expect(screen.getByText('Kali MCP is exposed through the ToolRegistry bridge.')).toBeInTheDocument();
    expect(syncMcp).toHaveBeenCalledTimes(1);
  });

  it('renders hooks and skills browsers', () => {
    render(<RuntimeExtensionsPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Hooks' }));
    expect(screen.getByText('pre-tool')).toBeInTheDocument();
    expect(screen.getByText('post-tool')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Skills' }));
    expect(screen.getByText('skill:safe_whois')).toBeInTheDocument();
    expect(screen.getByText('mcp:whois_lookup')).toBeInTheDocument();
  });

  it('renders plugin trust actions', () => {
    const trustPlugin = vi.fn(async () => undefined);
    const denyPlugin = vi.fn(async () => undefined);
    mockUseRuntimeExtensions.mockReturnValue({
      ...createRuntimeState(),
      trustPlugin,
      denyPlugin,
    });

    render(<RuntimeExtensionsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Plugins' }));

    expect(screen.getByText('Safe Recon')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /deny/i }));
    expect(denyPlugin).toHaveBeenCalledWith('safe_recon');
  });

  it('runs LSP diagnostics from the LSP tab', async () => {
    render(<RuntimeExtensionsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'LSP' }));
    fireEvent.click(screen.getByRole('button', { name: /run diagnostics/i }));

    await waitFor(() => {
      expect(screen.getByText('Property x does not exist')).toBeInTheDocument();
    });
    expect(mockedExtensionsApi.runLspDiagnostics).toHaveBeenCalledWith({
      paths: ['src'],
      limit: 80,
    });
  });

  it('renders the error state', () => {
    mockUseRuntimeExtensions.mockReturnValueOnce({
      ...createRuntimeState(),
      error: 'Runtime extension status requires API auth',
    });

    render(<RuntimeExtensionsPanel />);

    expect(screen.getByText('Runtime extension status requires API auth')).toBeInTheDocument();
  });
});
