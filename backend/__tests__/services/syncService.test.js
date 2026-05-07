import { describe, it, expect } from 'vitest';
import { topoSort } from '../../services/syncService.js';

describe('topoSort', () => {
  it('returns items without dependencies first', () => {
    const items = [
      { id: 'b', dependsOn: 'a', operation: 'UPDATE_EMPLOYEE', payload: '{}' },
      { id: 'a', dependsOn: null, operation: 'CREATE_EMPLOYEE', payload: '{}' },
    ];
    const result = topoSort(items);
    expect(result[0].id).toBe('a');
    expect(result[1].id).toBe('b');
  });

  it('handles items with no dependencies', () => {
    const items = [
      { id: '1', dependsOn: null, operation: 'CREATE_COMPANY', payload: '{}' },
      { id: '2', dependsOn: null, operation: 'CREATE_EMPLOYEE', payload: '{}' },
    ];
    const result = topoSort(items);
    expect(result).toHaveLength(2);
  });

  it('handles empty array', () => {
    expect(topoSort([])).toEqual([]);
  });
});
