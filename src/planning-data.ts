import { createHash } from 'node:crypto';

export function planningDigest(value: unknown): string { return createHash('sha256').update(canonicalPlanning(value)).digest('hex'); }
export function canonicalPlanning(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalPlanning).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonicalPlanning(child)}`).join(',')}}`;
  return JSON.stringify(value);
}
