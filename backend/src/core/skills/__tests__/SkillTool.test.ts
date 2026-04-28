/**
 * C10 — Skill tools
 *
 * Skills are declarative workflows registered as `skill:*` tools. They execute
 * their steps through ToolExecutor so validation, permissions, hooks, and output
 * capture stay centralized.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ToolExecutor } from '../../runtime/ToolExecutor.js';
import { ToolRegistry, buildTool } from '../../runtime/ToolRegistry.js';
import {
  createSkillTool,
  loadSkillDefinitionsFromDir,
  registerSkillTools,
} from '../index.js';

const ORIGINAL_ENV = {
  LEA_SKILL_STEP_ALLOW: process.env.LEA_SKILL_STEP_ALLOW,
  LEA_SKILL_STEP_DENY: process.env.LEA_SKILL_STEP_DENY,
};

function createExecutionContext() {
  const registry = new ToolRegistry();
  const executor = new ToolExecutor(registry);

  registry.register(
    buildTool({
      name: 'echo_tool',
      description: 'Echo a message',
      inputSchema: z.object({ message: z.string() }),
      call: async (args) => ({ data: `Echo: ${args.message}` }),
      maxResultSizeChars: 10_000,
    }),
  );

  registry.register(
    buildTool({
      name: 'strict_tool',
      description: 'Requires a required value',
      inputSchema: z.object({ value: z.string() }),
      call: async (args) => ({ data: `Strict: ${args.value}` }),
      maxResultSizeChars: 10_000,
    }),
  );

  return { registry, executor };
}

describe('C10 — SkillTool', () => {
  beforeEach(() => {
    process.env.LEA_SKILL_STEP_ALLOW = '*';
    delete process.env.LEA_SKILL_STEP_DENY;
  });

  afterEach(() => {
    if (ORIGINAL_ENV.LEA_SKILL_STEP_ALLOW === undefined) {
      delete process.env.LEA_SKILL_STEP_ALLOW;
    } else {
      process.env.LEA_SKILL_STEP_ALLOW = ORIGINAL_ENV.LEA_SKILL_STEP_ALLOW;
    }

    if (ORIGINAL_ENV.LEA_SKILL_STEP_DENY === undefined) {
      delete process.env.LEA_SKILL_STEP_DENY;
    } else {
      process.env.LEA_SKILL_STEP_DENY = ORIGINAL_ENV.LEA_SKILL_STEP_DENY;
    }
  });

  it('creates a skill-sourced tool with a canonical skill:* name and alias', () => {
    const { executor } = createExecutionContext();

    const skill = createSkillTool(
      {
        id: 'echo_target',
        description: 'Echo a target through a workflow',
        inputSchema: { target: { type: 'string' } },
        steps: [{ tool: 'echo_tool', input: { message: 'target={{target}}' } }],
      },
      { executor },
    );

    expect(skill.name).toBe('skill:echo_target');
    expect(skill.aliases).toContain('echo_target');
    expect(skill.source).toBe('skill');
  });

  it('executes steps through ToolExecutor and interpolates skill input', async () => {
    const { registry, executor } = createExecutionContext();

    registry.register(
      createSkillTool(
        {
          id: 'echo_target',
          description: 'Echo a target through a workflow',
          inputSchema: { target: { type: 'string' } },
          steps: [
            {
              id: 'echo',
              tool: 'echo_tool',
              input: { message: 'target={{target}}' },
            },
          ],
        },
        { executor },
      ),
    );

    const result = await executor.execute({
      toolUseId: 'tool-use-1',
      toolName: 'skill:echo_target',
      input: { target: 'example.com' },
      sessionId: 'session-1',
      abortController: new AbortController(),
    });

    expect(result.event.isError).not.toBe(true);
    const payload = JSON.parse(result.event.result as string);
    expect(payload.success).toBe(true);
    expect(payload.steps[0]).toMatchObject({
      id: 'echo',
      tool: 'echo_tool',
      success: true,
      result: 'Echo: target=example.com',
    });
  });

  it('continues after optional step failures', async () => {
    const { registry, executor } = createExecutionContext();

    registry.register(
      createSkillTool(
        {
          id: 'optional_flow',
          description: 'Optional failure then successful echo',
          steps: [
            { id: 'optional', tool: 'strict_tool', input: {}, optional: true },
            { id: 'echo', tool: 'echo_tool', input: { message: 'still running' } },
          ],
        },
        { executor },
      ),
    );

    const result = await executor.execute({
      toolUseId: 'tool-use-2',
      toolName: 'skill:optional_flow',
      input: {},
      sessionId: 'session-1',
      abortController: new AbortController(),
    });

    expect(result.event.isError).not.toBe(true);
    const payload = JSON.parse(result.event.result as string);
    expect(payload.success).toBe(true);
    expect(payload.steps[0]).toMatchObject({ success: false, optional: true });
    expect(payload.steps[1]).toMatchObject({ success: true, result: 'Echo: still running' });
  });

  it('fails the skill when a required step fails', async () => {
    const { registry, executor } = createExecutionContext();

    registry.register(
      createSkillTool(
        {
          id: 'required_failure',
          description: 'Required failing step',
          steps: [{ id: 'strict', tool: 'strict_tool', input: {} }],
        },
        { executor },
      ),
    );

    const result = await executor.execute({
      toolUseId: 'tool-use-3',
      toolName: 'skill:required_failure',
      input: {},
      sessionId: 'session-1',
      abortController: new AbortController(),
    });

    expect(result.event.isError).toBe(true);
    expect(result.event.result).toContain('Skill "skill:required_failure" failed at step "strict"');
  });

  it('rejects skill steps that target other skills in v1', () => {
    const { executor } = createExecutionContext();

    expect(() =>
      createSkillTool(
        {
          id: 'recursive_flow',
          description: 'Recursive skill flow',
          steps: [{ tool: 'skill:other', input: {} }],
        },
        { executor },
      ),
    ).toThrow('Skill steps cannot invoke other skills');
  });

  it('loads skill definitions from a JSON directory and registers them', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lea-skills-'));

    try {
      await writeFile(
        join(dir, 'echo-target.json'),
        JSON.stringify({
          id: 'echo_target',
          description: 'Echo target from disk',
          inputSchema: { target: { type: 'string' } },
          steps: [{ tool: 'echo_tool', input: { message: '{{target}}' } }],
        }),
        'utf8',
      );

      const definitions = await loadSkillDefinitionsFromDir(dir);
      expect(definitions).toHaveLength(1);
      expect(definitions[0].id).toBe('echo_target');

      const { registry, executor } = createExecutionContext();
      const result = registerSkillTools(registry, definitions, { executor });

      expect(result.registered).toBe(1);
      expect(registry.get('skill:echo_target')?.source).toBe('skill');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('C12 — skill step safety policy', () => {
  beforeEach(() => {
    delete process.env.LEA_SKILL_STEP_ALLOW;
    delete process.env.LEA_SKILL_STEP_DENY;
  });

  afterEach(() => {
    vi.restoreAllMocks();

    if (ORIGINAL_ENV.LEA_SKILL_STEP_ALLOW === undefined) {
      delete process.env.LEA_SKILL_STEP_ALLOW;
    } else {
      process.env.LEA_SKILL_STEP_ALLOW = ORIGINAL_ENV.LEA_SKILL_STEP_ALLOW;
    }

    if (ORIGINAL_ENV.LEA_SKILL_STEP_DENY === undefined) {
      delete process.env.LEA_SKILL_STEP_DENY;
    } else {
      process.env.LEA_SKILL_STEP_DENY = ORIGINAL_ENV.LEA_SKILL_STEP_DENY;
    }
  });

  it('blocks denied bash steps before execution', async () => {
    const { registry, executor } = createExecutionContext();
    const bashCall = vi.fn(async () => ({ data: 'should not run' }));

    registry.register(
      buildTool({
        name: 'bash',
        description: 'Shell execution',
        inputSchema: z.object({ command: z.string() }),
        call: bashCall,
        maxResultSizeChars: 10_000,
      }),
    );

    registry.register(
      createSkillTool(
        {
          id: 'unsafe_shell',
          description: 'Unsafe shell wrapper',
          steps: [{ id: 'shell', tool: 'bash', input: { command: 'id' } }],
        },
        { executor },
      ),
    );

    const result = await executor.execute({
      toolUseId: 'tool-use-policy-1',
      toolName: 'skill:unsafe_shell',
      input: {},
      sessionId: 'session-1',
      abortController: new AbortController(),
    });

    expect(result.event.isError).toBe(true);
    expect(result.event.result).toContain('denied by skill step policy');
    expect(bashCall).not.toHaveBeenCalled();
  });

  it('allows MCP steps by default', async () => {
    const { registry, executor } = createExecutionContext();

    registry.register(
      buildTool({
        name: 'mcp:whois_lookup',
        description: 'WHOIS lookup',
        inputSchema: z.object({ target: z.string() }),
        call: async (args) => ({ data: `WHOIS: ${args.target}` }),
        maxResultSizeChars: 10_000,
        source: 'mcp',
      }),
    );

    registry.register(
      createSkillTool(
        {
          id: 'safe_whois',
          description: 'Safe MCP workflow',
          inputSchema: { target: 'string' },
          steps: [{ id: 'whois', tool: 'mcp:whois_lookup', input: { target: '{{target}}' } }],
        },
        { executor },
      ),
    );

    const result = await executor.execute({
      toolUseId: 'tool-use-policy-2',
      toolName: 'skill:safe_whois',
      input: { target: 'example.com' },
      sessionId: 'session-1',
      abortController: new AbortController(),
      runtimeContext: {
        target: 'example.com',
        inScope: ['example.com'],
        outOfScope: [],
        scopeMode: 'extended',
      },
    });

    expect(result.event.isError).not.toBe(true);
    const payload = JSON.parse(result.event.result as string);
    expect(payload.steps[0]).toMatchObject({
      tool: 'mcp:whois_lookup',
      success: true,
      result: 'WHOIS: example.com',
    });
  });
});
