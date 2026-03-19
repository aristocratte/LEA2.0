import type { SwarmEventEnvelope, SwarmEventPayload } from '../../types/events.js';

export interface SwarmRuntimeValidationIssue {
  rule: string;
  message: string;
  eventId?: string;
  sequence?: number;
  correlationId?: string;
}

export interface SwarmRuntimeInvariantResult {
  rule: string;
  passed: boolean;
  details?: string;
}

export interface SwarmRuntimeValidationSummary {
  passed: boolean;
  invariants: SwarmRuntimeInvariantResult[];
  issues: SwarmRuntimeValidationIssue[];
}

const AGENT_TRANSITIONS: Record<string, string[]> = {
  'agent.drafted': ['agent.spawning', 'agent.running', 'agent.failed', 'agent.cancelled'],
  'agent.spawning': ['agent.running', 'agent.failed', 'agent.cancelled'],
  'agent.running': ['agent.running', 'agent.completed', 'agent.failed', 'agent.cancelled'],
  'agent.completed': [],
  'agent.failed': [],
  'agent.cancelled': [],
};

function buildCorrelationGroups(
  envelopes: SwarmEventEnvelope<SwarmEventPayload>[],
): Record<string, SwarmEventEnvelope<SwarmEventPayload>[]> {
  return envelopes.reduce<Record<string, SwarmEventEnvelope<SwarmEventPayload>[]>>((groups, envelope) => {
    if (!envelope.correlationId) return groups;
    if (!groups[envelope.correlationId]) {
      groups[envelope.correlationId] = [];
    }
    groups[envelope.correlationId].push(envelope);
    return groups;
  }, {});
}

export class SwarmRuntimeValidator {
  validate(envelopes: SwarmEventEnvelope<SwarmEventPayload>[]): SwarmRuntimeValidationSummary {
    const issues: SwarmRuntimeValidationIssue[] = [];
    const invariants: SwarmRuntimeInvariantResult[] = [];

    this.validateSequence(envelopes, issues, invariants);
    this.validateCorrelations(envelopes, issues, invariants);
    this.validateApprovals(envelopes, issues, invariants);
    this.validateAgentTransitions(envelopes, issues, invariants);
    this.validateTerminalStreams(envelopes, issues, invariants);
    this.validateArtifacts(envelopes, issues, invariants);

    return {
      passed: issues.length === 0,
      invariants,
      issues,
    };
  }

  buildCorrelationSummary(envelopes: SwarmEventEnvelope<SwarmEventPayload>[]) {
    const groups = buildCorrelationGroups(envelopes);
    return Object.entries(groups).map(([correlationId, items]) => ({
      correlationId,
      count: items.length,
      eventTypes: items.map((item) => item.eventType),
      startSequence: items[0]?.sequence ?? null,
      endSequence: items[items.length - 1]?.sequence ?? null,
    }));
  }

  private validateSequence(
    envelopes: SwarmEventEnvelope<SwarmEventPayload>[],
    issues: SwarmRuntimeValidationIssue[],
    invariants: SwarmRuntimeInvariantResult[],
  ) {
    let lastSequence = 0;
    let hasGap = false;

    for (const envelope of envelopes) {
      if (envelope.sequence <= lastSequence) {
        issues.push({
          rule: 'sequence_monotonic',
          message: `Sequence ${envelope.sequence} is not greater than ${lastSequence}`,
          eventId: envelope.id,
          sequence: envelope.sequence,
        });
      }
      if (lastSequence > 0 && envelope.sequence !== lastSequence + 1) {
        hasGap = true;
        issues.push({
          rule: 'sequence_contiguous',
          message: `Sequence gap between ${lastSequence} and ${envelope.sequence}`,
          eventId: envelope.id,
          sequence: envelope.sequence,
        });
      }
      lastSequence = envelope.sequence;
    }

    invariants.push({
      rule: 'sequence_monotonic',
      passed: !issues.some((issue) => issue.rule === 'sequence_monotonic'),
      details: `${envelopes.length} envelopes checked`,
    });
    invariants.push({
      rule: 'sequence_contiguous',
      passed: !hasGap,
    });
  }

  private validateCorrelations(
    envelopes: SwarmEventEnvelope<SwarmEventPayload>[],
    issues: SwarmRuntimeValidationIssue[],
    invariants: SwarmRuntimeInvariantResult[],
  ) {
    const groups = buildCorrelationGroups(envelopes);
    let passed = true;

    for (const [correlationId, items] of Object.entries(groups)) {
      let last = 0;
      for (const item of items) {
        if (item.sequence <= last) {
          passed = false;
          issues.push({
            rule: 'correlation_ordering',
            message: `Correlation group ${correlationId} is out of order`,
            eventId: item.id,
            correlationId,
            sequence: item.sequence,
          });
        }
        last = item.sequence;
      }
    }

    invariants.push({
      rule: 'correlation_ordering',
      passed,
      details: `${Object.keys(groups).length} groups checked`,
    });
  }

  private validateApprovals(
    envelopes: SwarmEventEnvelope<SwarmEventPayload>[],
    issues: SwarmRuntimeValidationIssue[],
    invariants: SwarmRuntimeInvariantResult[],
  ) {
    const pending = new Map<string, SwarmEventEnvelope<SwarmEventPayload>>();

    for (const envelope of envelopes) {
      if (envelope.eventType === 'approval.requested') {
        pending.set(envelope.correlationId || envelope.id, envelope);
      }
      if (envelope.eventType === 'approval.resolved') {
        pending.delete(envelope.correlationId || envelope.id);
      }
    }

    pending.forEach((envelope, key) => {
      issues.push({
        rule: 'approval_resolution',
        message: `Approval ${key} was never resolved`,
        eventId: envelope.id,
        correlationId: envelope.correlationId,
        sequence: envelope.sequence,
      });
    });

    invariants.push({
      rule: 'approval_resolution',
      passed: pending.size === 0,
      details: `${pending.size} unresolved approvals`,
    });
  }

  private validateAgentTransitions(
    envelopes: SwarmEventEnvelope<SwarmEventPayload>[],
    issues: SwarmRuntimeValidationIssue[],
    invariants: SwarmRuntimeInvariantResult[],
  ) {
    const lastStateByAgent = new Map<string, string>();
    let passed = true;

    for (const envelope of envelopes) {
      if (!envelope.eventType.startsWith('agent.')) continue;
      const payload = envelope.payload as Extract<SwarmEventPayload, { agentId: string }>;
      const lastState = lastStateByAgent.get(payload.agentId);
      if (lastState) {
        const nextAllowed = AGENT_TRANSITIONS[lastState] || [];
        if (!nextAllowed.includes(envelope.eventType)) {
          passed = false;
          issues.push({
            rule: 'agent_state_transition',
            message: `Invalid agent transition ${lastState} -> ${envelope.eventType}`,
            eventId: envelope.id,
            sequence: envelope.sequence,
          });
        }
      }
      lastStateByAgent.set(payload.agentId, envelope.eventType);
    }

    invariants.push({
      rule: 'agent_state_transition',
      passed,
      details: `${lastStateByAgent.size} agents checked`,
    });
  }

  private validateTerminalStreams(
    envelopes: SwarmEventEnvelope<SwarmEventPayload>[],
    issues: SwarmRuntimeValidationIssue[],
    invariants: SwarmRuntimeInvariantResult[],
  ) {
    const terminalDone = new Set<string>();
    let passed = true;

    for (const envelope of envelopes) {
      if (!envelope.eventType.startsWith('terminal.stream.')) continue;
      const payload = envelope.payload as Extract<SwarmEventPayload, { streamId: string }>;
      if (envelope.eventType === 'terminal.stream.done') {
        if (terminalDone.has(payload.streamId)) {
          passed = false;
          issues.push({
            rule: 'terminal_single_completion',
            message: `Terminal stream ${payload.streamId} completed more than once`,
            eventId: envelope.id,
            correlationId: envelope.correlationId,
            sequence: envelope.sequence,
          });
        }
        terminalDone.add(payload.streamId);
      }
    }

    invariants.push({
      rule: 'terminal_single_completion',
      passed,
      details: `${terminalDone.size} terminal completions observed`,
    });
  }

  private validateArtifacts(
    envelopes: SwarmEventEnvelope<SwarmEventPayload>[],
    issues: SwarmRuntimeValidationIssue[],
    invariants: SwarmRuntimeInvariantResult[],
  ) {
    let passed = true;

    for (const envelope of envelopes) {
      if (envelope.eventType !== 'artifact.created' && envelope.eventType !== 'artifact.updated') continue;
      const payload = envelope.payload as Extract<SwarmEventPayload, { artifactId: string; reviewId: string }>;
      if (!payload.reviewId) {
        passed = false;
        issues.push({
          rule: 'artifact_review_linkage',
          message: `Artifact ${payload.artifactId} is missing review linkage`,
          eventId: envelope.id,
          sequence: envelope.sequence,
        });
      }
    }

    invariants.push({
      rule: 'artifact_review_linkage',
      passed,
    });
  }
}
