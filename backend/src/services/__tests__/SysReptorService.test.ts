import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SysReptorService } from '../SysReptorService.js';

const { axiosCreateMock, axiosIsAxiosErrorMock } = vi.hoisted(() => ({
  axiosCreateMock: vi.fn(),
  axiosIsAxiosErrorMock: vi.fn(),
}));

vi.mock('axios', () => ({
  default: {
    create: axiosCreateMock,
    isAxiosError: axiosIsAxiosErrorMock,
  },
}));

interface AxiosClientMock {
  post: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  request: ReturnType<typeof vi.fn>;
}

const originalEnv = {
  SYREPTOR_URL: process.env.SYREPTOR_URL,
  SYREPTOR_API_TOKEN: process.env.SYREPTOR_API_TOKEN,
  SYREPTOR_DEFAULT_PROJECT_TYPE_ID: process.env.SYREPTOR_DEFAULT_PROJECT_TYPE_ID,
};

let httpClientMock: AxiosClientMock;

beforeEach(() => {
  vi.clearAllMocks();

  process.env.SYREPTOR_URL = 'https://sysreptor.example.test';
  process.env.SYREPTOR_API_TOKEN = 'token-123';
  process.env.SYREPTOR_DEFAULT_PROJECT_TYPE_ID = 'project-type-1';

  httpClientMock = {
    post: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    request: vi.fn(),
  };

  axiosCreateMock.mockReturnValue(httpClientMock as any);
  axiosIsAxiosErrorMock.mockImplementation((error: any) => Boolean(error?.isAxiosError));
});

afterEach(() => {
  process.env.SYREPTOR_URL = originalEnv.SYREPTOR_URL;
  process.env.SYREPTOR_API_TOKEN = originalEnv.SYREPTOR_API_TOKEN;
  process.env.SYREPTOR_DEFAULT_PROJECT_TYPE_ID = originalEnv.SYREPTOR_DEFAULT_PROJECT_TYPE_ID;
});

describe('SysReptorService', () => {
  it('createProject should create a SysReptor project via axios', async () => {
    httpClientMock.post.mockResolvedValue({
      data: { id: 'project-1', name: 'LEA Pentest' },
    });

    const service = new SysReptorService();
    const result = await service.createProject('LEA Pentest', ['lea', 'swarm']);

    expect(axiosCreateMock).toHaveBeenCalledTimes(1);
    expect(httpClientMock.post).toHaveBeenCalledWith('/api/v1/projects/', {
      name: 'LEA Pentest',
      tags: ['lea', 'swarm'],
      project_type: 'project-type-1',
    });

    expect(result).toEqual({
      id: 'project-1',
      name: 'LEA Pentest',
      linked: false,
      mock: false,
    });
  });

  it('pushFinding should send normalized payload with affectedComponents', async () => {
    httpClientMock.post.mockResolvedValue({
      data: { id: 'finding-1' },
    });

    const service = new SysReptorService();
    const result = await service.pushFinding('project-1', {
      id: 'lea-finding-42',
      title: 'Stored XSS',
      description: 'Unsanitized input reflected in admin panel',
      severity: 'HIGH',
      cvss: 8.6,
      proof: 'payload execution screenshot',
      remediation: 'Apply output encoding',
      affectedComponents: ['admin-ui'],
    });

    expect(httpClientMock.post).toHaveBeenCalledWith('/api/v1/projects/project-1/findings/', {
      title: 'Stored XSS',
      description: 'Unsanitized input reflected in admin panel',
      severity: 'high',
      cvss: 8.6,
      proof: 'payload execution screenshot',
      remediation: 'Apply output encoding',
      affected_components: ['admin-ui'],
      references: [{ key: 'leaFindingId', value: 'lea-finding-42' }],
    });

    expect(result).toEqual({
      id: 'finding-1',
      findingId: 'lea-finding-42',
      pushed: true,
      mock: false,
    });
  });

  it('renderReport should return PDF bytes from SysReptor', async () => {
    const pdfBytes = Buffer.from('%PDF-1.4 test');
    httpClientMock.request.mockResolvedValue({
      headers: { 'content-type': 'application/pdf' },
      data: pdfBytes,
    });

    const service = new SysReptorService();
    const result = await service.renderReport('project-1');

    expect(httpClientMock.request).toHaveBeenCalledWith({
      method: 'POST',
      url: '/api/v1/projects/project-1/render/',
      responseType: 'arraybuffer',
    });

    expect(result.contentType).toBe('application/pdf');
    expect(Buffer.from(result.data || []).toString('utf8')).toBe('%PDF-1.4 test');
    expect(result.mock).toBe(false);
  });

  it('linkToExistingProject should fetch and patch project metadata', async () => {
    httpClientMock.get.mockResolvedValue({
      data: {
        tags: ['existing-tag'],
        metadata: { owner: 'security-team' },
      },
    });
    httpClientMock.patch.mockResolvedValue({ data: {} });

    const service = new SysReptorService();
    const result = await service.linkToExistingProject('pentest-99', 'project-1');

    expect(httpClientMock.get).toHaveBeenCalledWith('/api/v1/projects/project-1/');
    expect(httpClientMock.patch).toHaveBeenCalledWith('/api/v1/projects/project-1/', {
      tags: ['existing-tag', 'lea', 'lea-pentest-pentest-99'],
      metadata: {
        owner: 'security-team',
        lea_pentest_id: 'pentest-99',
      },
    });

    expect(result).toEqual({
      pentestId: 'pentest-99',
      projectId: 'project-1',
      linked: true,
      mock: false,
    });
  });
});
