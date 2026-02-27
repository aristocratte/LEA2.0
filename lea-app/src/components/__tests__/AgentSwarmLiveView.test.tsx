import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentSwarmLiveView } from '@/src/components/AgentSwarmLiveView';

describe('AgentSwarmLiveView', () => {
  it('matches snapshot when opened', () => {
    render(
      <AgentSwarmLiveView
        open
        pentestId={null}
        target="demo.internal"
        onOpenChange={vi.fn()}
      />
    );

    expect(screen.getByTestId('agent-swarm-live-view')).toMatchSnapshot();
  });
});
