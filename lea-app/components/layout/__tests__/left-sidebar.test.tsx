// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiPentest } from '@/types';

const navMocks = vi.hoisted(() => ({
  pathname: '/pentest',
  searchParams: new URLSearchParams(),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navMocks.pathname,
  useRouter: () => ({ push: navMocks.push }),
  useSearchParams: () => navMocks.searchParams,
}));

vi.mock('@/hooks/use-pentest-list', () => ({
  usePentestList: vi.fn(),
}));

import { LeftSidebar } from '../left-sidebar';
import { usePentestList } from '@/hooks/use-pentest-list';
import { usePentestStore } from '@/store/pentest-store';

const refresh = vi.fn();

interface PentestListFixture {
  pentests: ApiPentest[];
  isLoading: boolean;
  error: string | null;
  refresh: typeof refresh;
}

function makePentest(overrides: Partial<ApiPentest>): ApiPentest {
  return {
    id: 'pentest-1',
    target: '127.0.0.1',
    status: 'RUNNING',
    phase: 'RECON_ACTIVE',
    created_at: '2026-04-27T10:00:00.000Z',
    updated_at: '2026-04-27T10:03:00.000Z',
    tokens_used: 0,
    cost_usd: 0,
    _count: { findings: 0 },
    ...overrides,
  };
}

function mockPentestList(overrides: Partial<PentestListFixture> = {}) {
  vi.mocked(usePentestList).mockReturnValue({
    pentests: [],
    isLoading: false,
    error: null,
    refresh,
    ...overrides,
  });
}

describe('LeftSidebar recent scans', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navMocks.pathname = '/pentest';
    navMocks.searchParams = new URLSearchParams();
    usePentestStore.getState().reset();
  });

  it('opens recent scans with a stable pentest id URL and hydrates the store', () => {
    const pentest = makePentest({
      id: 'pentest-local',
      target: '127.0.0.1',
      status: 'RUNNING',
      _count: { findings: 1 },
    });
    mockPentestList({ pentests: [pentest] });

    render(<LeftSidebar />);

    const recentScan = screen.getByText('127.0.0.1').closest('button');
    expect(recentScan).not.toBeNull();

    fireEvent.click(recentScan!);

    expect(navMocks.push).toHaveBeenCalledWith('/pentest?id=pentest-local');
    expect(usePentestStore.getState().pentestId).toBe('pentest-local');
    expect(usePentestStore.getState().target).toBe('127.0.0.1');
  });

  it('hides experimental navigation by default', () => {
    mockPentestList();

    render(<LeftSidebar />);

    expect(screen.queryByRole('link', { name: /dashboard/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /active scan/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /reports/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument();
  });

  it('marks the URL pentest id as current even before the store hydrates', () => {
    navMocks.searchParams = new URLSearchParams('id=pentest-report');
    mockPentestList({
      pentests: [
        makePentest({
          id: 'pentest-local',
          target: '127.0.0.1',
          status: 'RUNNING',
        }),
        makePentest({
          id: 'pentest-report',
          target: 'portfolio.acordonnier.com',
          status: 'COMPLETED',
          _count: { findings: 2 },
        }),
      ],
    });

    render(<LeftSidebar />);

    const currentScan = screen.getByText('portfolio.acordonnier.com').closest('button');
    expect(currentScan).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Complete · 2 findings')).toBeInTheDocument();
  });

  it('shows a retry action when recent scans cannot be loaded', () => {
    mockPentestList({ error: 'Database unavailable' });

    render(<LeftSidebar />);

    expect(screen.getByText('Recent scans unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Retry'));

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('starts a new scan with a return path to the current scan', () => {
    navMocks.searchParams = new URLSearchParams('id=pentest-current');
    mockPentestList();

    render(<LeftSidebar />);

    fireEvent.click(screen.getByRole('button', { name: /new scan/i }));

    expect(navMocks.push).toHaveBeenCalledWith(
      '/pentest/new?returnTo=%2Fpentest%3Fid%3Dpentest-current',
    );
  });
});
