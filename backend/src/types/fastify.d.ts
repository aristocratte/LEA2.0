/**
 * Fastify type augmentation for Prisma
 */

import 'fastify';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

// ============================================
// Fastify Request/Response Types
// ============================================

export interface FastifyRequestWithParams {
  params: {
    id: string;
  };
}

export interface FastifyRequestWithPentestQuery {
  query: {
    status?: PentestStatus;
    limit?: string;
    offset?: string;
  };
}

export interface FastifyRequestWithFindingsQuery {
  params: {
    id: string;
  };
  query: {
    severity?: Severity;
    status?: FindingStatus;
    limit?: string;
    offset?: string;
  };
}

export interface FastishRequestWithMessagesQuery {
  params: {
    id: string;
  };
  query: {
    limit?: string;
    before?: string;
    includeArchived?: string;
  };
}

export interface FastifyRequestWithReportsQuery {
  query: {
    page?: string;
    limit?: string;
    status?: ReportStatus;
    severity?: Severity;
    search?: string;
    sortBy?: string;
    order?: 'asc' | 'desc';
  };
}

export interface FastifyRequestWithProviderUsageQuery {
  params: {
    id: string;
  };
  query: {
    days?: string;
  };
}

// Import types from index
import type {
  PentestStatus,
  Severity,
  FindingStatus,
} from './index.js';

export type { ReportStatus } from './index.js';
