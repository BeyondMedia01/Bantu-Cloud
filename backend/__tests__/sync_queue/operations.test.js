import { describe, it, expect, vi } from 'vitest';
import { executeOperation, isKnownOperation } from '../../sync_queue/operations.js';

describe('executeOperation', () => {
  it('throws for unknown operation', async () => {
    await expect(executeOperation('UNKNOWN_OP', {}, {})).rejects.toThrow('Unknown sync operation');
  });

  it('calls the correct handler', async () => {
    const mockPrisma = {
      employee: {
        upsert: vi.fn().mockResolvedValue({ id: '1' }),
      },
    };
    const result = await executeOperation('CREATE_EMPLOYEE', { id: '1', name: 'Test' }, mockPrisma);
    expect(mockPrisma.employee.upsert).toHaveBeenCalledWith({
      where: { id: '1' },
      create: { id: '1', name: 'Test' },
      update: { id: '1', name: 'Test' },
    });
    expect(result).toEqual({ id: '1' });
  });
});

describe('isKnownOperation', () => {
  it('returns true for known operations', () => {
    expect(isKnownOperation('CREATE_EMPLOYEE')).toBe(true);
    expect(isKnownOperation('UPDATE_PAYSLIP')).toBe(true);
  });

  it('returns false for unknown operations', () => {
    expect(isKnownOperation('DESTROY_EVERYTHING')).toBe(false);
  });
});
