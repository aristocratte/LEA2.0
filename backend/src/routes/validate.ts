import { FastifyPluginAsync } from 'fastify';
import dns from 'node:dns/promises';

interface ValidateTargetQuery {
  target: string;
}

interface TargetValidationResponse {
  type: 'domain' | 'ip' | 'cidr' | 'url';
  resolved?: string;
  behindCdn?: string;
  isPrivate?: boolean;
  suggestions?: string[];
}

// CDN detection patterns
const CDN_PATTERNS: [RegExp, string][] = [
  [/cloudflare/i, 'Cloudflare'],
  [/fastly/i, 'Fastly'],
  [/akamai/i, 'Akamai'],
  [/\bcdn\b/i, 'CDN'],
];

// Validation regex patterns
const DOMAIN_REGEX = /^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
const CIDR_REGEX = /^\d+\.\d+\.\d+\.\d+\/\d+$/;
const IP_REGEX = /^\d+\.\d+\.\d+\.\d+$/;

function isValidOctet(s: string): boolean {
  const n = parseInt(s, 10);
  return !isNaN(n) && n >= 0 && n <= 255 && String(n) === s;
}

function isPrivateIp(parts: string[]): boolean {
  const [a, b] = parts.map(Number);
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true; // localhost
  return false;
}

function detectCdn(hostname: string): { isCdn: boolean; cdnName?: string } {
  for (const [pattern, name] of CDN_PATTERNS) {
    if (pattern.test(hostname)) {
      return { isCdn: true, cdnName: name };
    }
  }
  return { isCdn: false };
}

async function resolveDns(hostname: string): Promise<string | null> {
  try {
    const addresses = await dns.resolve4(hostname);
    return addresses[0] || null;
  } catch {
    // Try resolving CNAME if A record fails
    try {
      const cnames = await dns.resolveCname(hostname);
      return cnames[0] || null;
    } catch {
      return null;
    }
  }
}

async function detectCdnFromDns(hostname: string): Promise<string | null> {
  try {
    // Try to get CNAME records which often reveal CDN usage
    const cnames = await dns.resolveCname(hostname);
    const cname = cnames.join(' ').toLowerCase();

    for (const [pattern, name] of CDN_PATTERNS) {
      if (pattern.test(cname)) {
        return name;
      }
    }
  } catch {
    // CNAME lookup failed, ignore
  }

  // Also check if the hostname itself contains CDN indicators
  const cdn = detectCdn(hostname);
  if (cdn.isCdn && cdn.cdnName) {
    return cdn.cdnName;
  }

  return null;
}

export const validateRoutes: FastifyPluginAsync = async (fastify) => {
  // Validate target endpoint
  fastify.get<{ Querystring: ValidateTargetQuery }>(
    '/api/validate/target',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['target'],
          properties: {
            target: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { target } = request.query;

      if (!target || target.trim().length === 0) {
        return reply.code(400).send({
          error: 'Target is required',
        });
      }

      let normalized = target.trim();
      let type: TargetValidationResponse['type'] = 'domain';

      // Strip protocol if present
      if (/^https?:\/\//i.test(normalized)) {
        type = 'url';
        normalized = normalized.replace(/^https?:\/\//i, '');
      }

      // Strip trailing slash
      normalized = normalized.replace(/\/+$/, '');

      // Extract just the hostname if there's a path
      const hostname = normalized.split('/')[0].split(':')[0];

      const response: TargetValidationResponse = {
        type,
      };

      // Check if it's a CIDR range
      if (CIDR_REGEX.test(hostname)) {
        response.type = 'cidr';
        const parts = hostname.split('/')[0].split('.');
        if (parts.every(isValidOctet)) {
          response.isPrivate = isPrivateIp(parts);
        }
        return { data: response };
      }

      // Check if it's an IP address
      if (IP_REGEX.test(hostname)) {
        response.type = 'ip';
        const parts = hostname.split('.');
        if (parts.every(isValidOctet)) {
          response.isPrivate = isPrivateIp(parts);
        }
        return { data: response };
      }

      // It's a domain
      if (type !== 'url') {
        response.type = 'domain';
      }

      // Perform DNS resolution
      const resolvedIp = await resolveDns(hostname);
      if (resolvedIp) {
        response.resolved = resolvedIp;

        // Check if resolved IP is private
        const ipParts = resolvedIp.split('.');
        if (ipParts.every(isValidOctet)) {
          response.isPrivate = isPrivateIp(ipParts);
        }
      }

      // Detect CDN
      const cdnName = await detectCdnFromDns(hostname);
      if (cdnName) {
        response.behindCdn = cdnName;
      }

      // Generate suggestions
      const domainParts = hostname.split('.');
      if (domainParts.length >= 2) {
        const suggestions: string[] = [`*.${hostname}`];
        if (domainParts.length === 2) {
          suggestions.push(`api.${hostname}`, `www.${hostname}`);
        }
        response.suggestions = suggestions;
      }

      return { data: response };
    }
  );
};

export default validateRoutes;
