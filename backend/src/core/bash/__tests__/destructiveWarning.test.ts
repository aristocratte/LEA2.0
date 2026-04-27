import { describe, it, expect } from 'vitest';
import {
  detectDestructiveCommand,
  isDestructive,
  getAllDestructiveWarnings,
} from '../destructiveWarning.js';

describe('destructiveWarning', () => {
  describe('detectDestructiveCommand', () => {
    it('returns null for safe commands', () => {
      expect(detectDestructiveCommand('ls -la')).toBeNull();
      expect(detectDestructiveCommand('cat file.txt')).toBeNull();
      expect(detectDestructiveCommand('echo hello')).toBeNull();
      expect(detectDestructiveCommand('grep pattern file')).toBeNull();
    });

    it('detects rm -rf', () => {
      const w = detectDestructiveCommand('rm -rf /tmp/test');
      expect(w).not.toBeNull();
      expect(w!.severity).toBe('high');
    });

    it('detects rm -r', () => {
      const w = detectDestructiveCommand('rm -r /tmp/test');
      expect(w).not.toBeNull();
    });

    it('detects rm -f', () => {
      const w = detectDestructiveCommand('rm -f /tmp/test');
      expect(w).not.toBeNull();
    });

    it('detects git reset --hard', () => {
      const w = detectDestructiveCommand('git reset --hard');
      expect(w).not.toBeNull();
      expect(w!.warning).toContain('uncommitted');
    });

    it('detects git push --force', () => {
      const w = detectDestructiveCommand('git push --force');
      expect(w).not.toBeNull();
      expect(w!.warning).toContain('overwrite');
    });

    it('detects git push -f', () => {
      const w = detectDestructiveCommand('git push -f origin main');
      expect(w).not.toBeNull();
    });

    it('detects dd', () => {
      const w = detectDestructiveCommand('dd if=/dev/zero of=/dev/sda');
      expect(w).not.toBeNull();
    });

    it('detects DROP TABLE', () => {
      const w = detectDestructiveCommand('DROP TABLE users');
      expect(w).not.toBeNull();
    });

    it('detects TRUNCATE TABLE', () => {
      const w = detectDestructiveCommand('TRUNCATE TABLE users');
      expect(w).not.toBeNull();
    });

    it('detects git clean -f', () => {
      const w = detectDestructiveCommand('git clean -f');
      expect(w).not.toBeNull();
    });

    it('detects git checkout .', () => {
      const w = detectDestructiveCommand('git checkout .');
      expect(w).not.toBeNull();
    });

    it('detects chmod 777', () => {
      const w = detectDestructiveCommand('chmod 777 /tmp');
      expect(w).not.toBeNull();
    });
  });

  describe('isDestructive', () => {
    it('returns true for rm -rf', () => {
      expect(isDestructive('rm', ['-rf', '/tmp'])).toBe(true);
    });

    it('returns false for ls', () => {
      expect(isDestructive('ls', ['-la'])).toBe(false);
    });

    it('returns false for cat', () => {
      expect(isDestructive('cat', ['file.txt'])).toBe(false);
    });
  });

  describe('getAllDestructiveWarnings', () => {
    it('returns empty array for safe commands', () => {
      expect(getAllDestructiveWarnings('ls -la')).toEqual([]);
    });

    it('may return multiple warnings', () => {
      // A command could match multiple patterns
      const warnings = getAllDestructiveWarnings('rm -rf /');
      expect(warnings.length).toBeGreaterThanOrEqual(1);
    });
  });
});
