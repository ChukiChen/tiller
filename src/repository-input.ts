import {resolve} from 'node:path';
import {readProjectMetadata} from './core.js';
import {resolveRepositoryRootsFromMetadata} from './delivery-location.js';
import type {ProjectMetadata} from './types.js';
import type {TextProof, TextReadInput} from './files.js';

/** Repository identities shared by consumers of one explicitly declared operation. */
export interface RepositoryInput {
  root: string;
  workId?: string;
  metadata: ProjectMetadata;
  repositories: ReadonlyMap<string, string>;
  materials?: TextReadInput;
}

export async function loadRepositoryInput(root: string, repositories: readonly string[], workId?: string,
  suppliedMetadata?: ProjectMetadata, materials?: TextReadInput): Promise<RepositoryInput> {
  const metadata = suppliedMetadata ?? await readProjectMetadata(root, materials);
  const roots = await resolveRepositoryRootsFromMetadata(root, repositories, metadata, workId);
  const input: RepositoryInput = {root: resolve(root), ...(workId ? {workId} : {}), metadata, repositories: roots};
  if (materials) Object.defineProperty(input, 'materials', {value: materials});
  return input;
}

export async function assertRepositoryInputCurrent(input: RepositoryInput): Promise<void> {
  const actual = await loadRepositoryInput(input.root, [...input.repositories.keys()], input.workId);
  if (JSON.stringify(actual.metadata) !== JSON.stringify(input.metadata)
    || [...input.repositories].some(([repository, root]) => actual.repositories.get(repository) !== root))
    throw new Error('工程登记或仓库位置已变化。');
}

export async function proveRepositoryInput(input: RepositoryInput, proofs?: TextProof[]): Promise<void> {
  if (proofs) proofs.push({root: input.root, inputs: [],
    verifyAfter: {key: input, run: () => assertRepositoryInputCurrent(input)}});
  else await assertRepositoryInputCurrent(input);
}
