export type ProjectMode = 'project' | 'workspace';
export type ProjectPlatform = 'github' | 'gitlab' | 'both';

export interface VerifyConfig {
  runner?: string;
  prepare?: string[];
}

/** One business repository inside a management workspace. `verify` overrides root defaults field by field. */
export interface RepositoryRecord {
  id: string;
  path: string;
  verify?: VerifyConfig;
}

export interface ProjectMetadata {
  schemaVersion: 1;
  resourceVersion: string;
  mode: ProjectMode;
  repositories: RepositoryRecord[];
  managedFiles: Record<string, string>;
  createdAt: string;
  platform?: ProjectPlatform;
  verify?: VerifyConfig;
  initBaseline?: InitBaseline;
}

export interface InitBaseline {
  id: string;
  branch: string;
  commit: string;
  head?: string;
  headRef?: string;
  status?: 'pending' | 'merged';
}

export interface ProjectInspection {
  root: string;
  initialized: boolean;
  ready: boolean;
  metadata: ProjectMetadata | null;
  issues: string[];
  hostVerification: 'not-verified';
  compatibility: 'read-write' | 'unsupported';
}

export interface InitializeOptions {
  root: string;
  mode?: ProjectMode;
  repositories?: string[];
  platform?: ProjectPlatform;
}

export interface FileChange {
  path: string;
  before: string | null;
  after: string;
}
