import { AsyncLocalStorage } from 'node:async_hooks';
import { realpath } from 'node:fs/promises';

const visiting = new AsyncLocalStorage<{ path: readonly string[]; budget: { nodes: number }; active: { value: boolean } }>();
export const CONFIRMATION_LIMITS = Object.freeze({ depth: 32, nodes: 256 });

/** A path, not a global seen set: completed diamond branches remain valid. */
export async function withConfirmationVisit<T>(root: string, workId: string, requestId: string, fn: () => Promise<T>): Promise<T> {
  const actual = await realpath(root);
  const key = JSON.stringify([process.platform === 'win32' ? actual.toLowerCase() : actual, workId, requestId]);
  const inherited = visiting.getStore();
  const parent = inherited?.active.value ? inherited : undefined;
  const path = parent?.path ?? [];
  const budget = parent?.budget ?? { nodes: 0 };
  if (path.includes(key) || path.length >= CONFIRMATION_LIMITS.depth || ++budget.nodes > CONFIRMATION_LIMITS.nodes)
    throw Object.assign(new Error('确认依赖形成循环或超过有界核验限制。'), { code: 'CONFIRMATION_RECURSION_LIMIT' });
  const active = { value: true };
  try { return await visiting.run({ path: [...path, key], budget, active }, fn); }
  finally { active.value = false; }
}
