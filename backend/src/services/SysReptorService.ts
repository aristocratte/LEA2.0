/**
 * SysReptorService
 *
 * REST client for SysReptor project lifecycle and reporting.
 */

import { randomUUID } from 'node:crypto';
import axios, { AxiosInstance } from 'axios';

export interface CreateProjectResult {
  id: string;
  name: string;
  linked: boolean;
  mock: boolean;
}

export interface SysReptorFindingInput {
  id?: string;
  title: string;
  description: string;
  severity: string;
  cvss?: number | null;
  proof?: string;
  remediation?: string;
  affectedComponents?: string[];
  affected_components?: string[];
}

export interface PushFindingResult {
  id: string;
  findingId: string;
  pushed: boolean;
  mock: boolean;
}

export interface RenderReportResult {
  contentType: string;
  data?: Uint8Array;
  mock: boolean;
}

export interface LinkProjectResult {
  pentestId: string;
  projectId: string;
  linked: boolean;
  mock: boolean;
}

type HttpMethod = 'GET' | 'POST';

export class SysReptorService {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly defaultProjectTypeId: string;
  private readonly httpClient: AxiosInstance | null;

  constructor() {
    this.baseUrl = String(process.env.SYREPTOR_URL || '').trim().replace(/\/$/, '');
    this.token = String(process.env.SYREPTOR_API_TOKEN || '').trim();
    this.defaultProjectTypeId = String(process.env.SYREPTOR_DEFAULT_PROJECT_TYPE_ID || '').trim();

    this.httpClient = this.isConfigured()
      ? axios.create({
          baseURL: this.baseUrl,
          timeout: 30000,
          headers: {
            Authorization: `Token ${this.token}`,
            'Content-Type': 'application/json',
          },
        })
      : null;

    if (!this.httpClient) {
      console.warn('[SysReptor] Missing configuration, mock mode enabled');
    }
  }

  async createProject(name: string, tags: string[] = []): Promise<CreateProjectResult> {
    const normalizedName = String(name || '').trim();
    if (!normalizedName) {
      throw new Error('[SysReptor] createProject requires a non-empty name');
    }

    if (!this.httpClient) {
      return {
        id: `mock-project-${Date.now()}`,
        name: normalizedName,
        linked: false,
        mock: true,
      };
    }

    const payload: Record<string, unknown> = {
      name: normalizedName,
      tags,
    };

    if (this.defaultProjectTypeId) {
      payload.project_type = this.defaultProjectTypeId;
    }

    let lastError: unknown;
    const endpoints = ['/api/v1/projects/', '/api/v1/pentestprojects/'];
    for (const endpoint of endpoints) {
      try {
        const response = await this.httpClient.post(endpoint, payload);
        const projectData = response.data || {};
        return {
          id: this.extractId(projectData, 'project'),
          name: String(projectData.name || normalizedName),
          linked: false,
          mock: false,
        };
      } catch (error) {
        lastError = error;
        console.warn(`[SysReptor] createProject failed on ${endpoint}: ${this.describeError(error)}`);
      }
    }

    throw new Error(`[SysReptor] Unable to create project: ${this.describeError(lastError)}`);
  }

  async pushFinding(projectId: string, findingData: SysReptorFindingInput): Promise<PushFindingResult> {
    const normalizedProjectId = String(projectId || '').trim();
    if (!normalizedProjectId) {
      throw new Error('[SysReptor] pushFinding requires a projectId');
    }

    const findingId = String(findingData.id || '').trim() || randomUUID();

    if (!this.httpClient) {
      return {
        id: `mock-finding-${Date.now()}`,
        findingId,
        pushed: true,
        mock: true,
      };
    }

    const affectedComponents = this.resolveAffectedComponents(findingData);
    const payload = {
      title: findingData.title,
      description: findingData.description,
      severity: this.normalizeSeverity(findingData.severity),
      cvss: findingData.cvss ?? null,
      proof: findingData.proof || '',
      remediation: findingData.remediation || '',
      affected_components: affectedComponents,
      references: [
        {
          key: 'leaFindingId',
          value: findingId,
        },
      ],
    };

    let lastError: unknown;
    const endpoints = [
      `/api/v1/projects/${encodeURIComponent(normalizedProjectId)}/findings/`,
      `/api/v1/pentestprojects/${encodeURIComponent(normalizedProjectId)}/findings/`,
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await this.httpClient.post(endpoint, payload);
        const findingResponse = response.data || {};
        return {
          id: this.extractId(findingResponse, 'finding'),
          findingId,
          pushed: true,
          mock: false,
        };
      } catch (error) {
        lastError = error;
        console.warn(`[SysReptor] pushFinding failed on ${endpoint}: ${this.describeError(error)}`);
      }
    }

    throw new Error(`[SysReptor] Unable to push finding: ${this.describeError(lastError)}`);
  }

  async renderReport(projectId: string): Promise<RenderReportResult> {
    const normalizedProjectId = String(projectId || '').trim();
    if (!normalizedProjectId) {
      throw new Error('[SysReptor] renderReport requires a projectId');
    }

    if (!this.httpClient) {
      return {
        contentType: 'application/pdf',
        data: undefined,
        mock: true,
      };
    }

    const endpointCandidates: Array<{ path: string; method: HttpMethod }> = [
      { path: `/api/v1/projects/${encodeURIComponent(normalizedProjectId)}/render/`, method: 'POST' },
      { path: `/api/v1/projects/${encodeURIComponent(normalizedProjectId)}/report.pdf`, method: 'GET' },
      { path: `/api/v1/pentestprojects/${encodeURIComponent(normalizedProjectId)}/render/`, method: 'POST' },
      { path: `/api/v1/pentestprojects/${encodeURIComponent(normalizedProjectId)}/report.pdf`, method: 'GET' },
    ];

    let lastError: unknown;
    for (const endpoint of endpointCandidates) {
      try {
        const response = await this.httpClient.request({
          method: endpoint.method,
          url: endpoint.path,
          responseType: 'arraybuffer',
        });

        const contentType = String(response.headers['content-type'] || 'application/pdf');
        return {
          contentType,
          data: this.toUint8Array(response.data),
          mock: false,
        };
      } catch (error) {
        lastError = error;
        console.warn(`[SysReptor] renderReport failed on ${endpoint.path}: ${this.describeError(error)}`);
      }
    }

    throw new Error(`[SysReptor] Unable to render report: ${this.describeError(lastError)}`);
  }

  async linkToExistingProject(pentestId: string, projectId: string): Promise<LinkProjectResult> {
    const normalizedPentestId = String(pentestId || '').trim();
    const normalizedProjectId = String(projectId || '').trim();

    if (!normalizedPentestId) {
      throw new Error('[SysReptor] linkToExistingProject requires a pentestId');
    }
    if (!normalizedProjectId) {
      throw new Error('[SysReptor] linkToExistingProject requires a projectId');
    }

    if (!this.httpClient) {
      return {
        pentestId: normalizedPentestId,
        projectId: normalizedProjectId,
        linked: true,
        mock: true,
      };
    }

    const endpointCandidates = [
      `/api/v1/projects/${encodeURIComponent(normalizedProjectId)}/`,
      `/api/v1/pentestprojects/${encodeURIComponent(normalizedProjectId)}/`,
    ];

    let projectEndpoint: string | null = null;
    let projectData: any = {};
    let lastError: unknown;

    for (const endpoint of endpointCandidates) {
      try {
        const response = await this.httpClient.get(endpoint);
        projectEndpoint = endpoint;
        projectData = response.data || {};
        break;
      } catch (error) {
        lastError = error;
        console.warn(`[SysReptor] linkToExistingProject lookup failed on ${endpoint}: ${this.describeError(error)}`);
      }
    }

    if (!projectEndpoint) {
      throw new Error(`[SysReptor] Unable to locate project for linking: ${this.describeError(lastError)}`);
    }

    const existingTags = Array.isArray(projectData.tags)
      ? projectData.tags.filter((tag: unknown) => typeof tag === 'string')
      : [];

    const updatePayload = {
      tags: Array.from(new Set([...existingTags, 'lea', `lea-pentest-${normalizedPentestId}`])),
      metadata: {
        ...(this.isRecord(projectData.metadata) ? projectData.metadata : {}),
        lea_pentest_id: normalizedPentestId,
      },
    };

    await this.httpClient.patch(projectEndpoint, updatePayload);

    return {
      pentestId: normalizedPentestId,
      projectId: normalizedProjectId,
      linked: true,
      mock: false,
    };
  }

  private isConfigured(): boolean {
    return Boolean(this.baseUrl && this.token);
  }

  private resolveAffectedComponents(finding: SysReptorFindingInput): string[] {
    if (Array.isArray(finding.affectedComponents)) {
      return finding.affectedComponents;
    }
    if (Array.isArray(finding.affected_components)) {
      return finding.affected_components;
    }
    return [];
  }

  private normalizeSeverity(value: string): string {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'critical') return 'critical';
    if (normalized === 'high') return 'high';
    if (normalized === 'medium') return 'medium';
    if (normalized === 'low') return 'low';
    if (normalized === 'informational') return 'info';
    if (normalized === 'info') return 'info';
    return 'medium';
  }

  private extractId(payload: any, type: string): string {
    const id = payload?.id || payload?.pk || payload?.uuid;
    if (!id) {
      throw new Error(`[SysReptor] Missing ${type} id in API response`);
    }
    return String(id);
  }

  private toUint8Array(data: unknown): Uint8Array {
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) {
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(data)) {
      return new Uint8Array(data);
    }
    return new Uint8Array();
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  private describeError(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const statusText = error.response?.statusText || '';
      const payload = this.formatErrorPayload(error.response?.data);

      if (status) {
        const suffix = payload ? ` - ${payload}` : '';
        return `${status} ${statusText}${suffix}`.trim();
      }

      return error.message;
    }

    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'Unknown error';
  }

  private formatErrorPayload(payload: unknown): string {
    if (!payload) return '';
    if (typeof payload === 'string') return payload.slice(0, 300);
    try {
      return JSON.stringify(payload).slice(0, 300);
    } catch {
      return '';
    }
  }
}
