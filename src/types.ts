export type ProjectMode = 'project' | 'workspace';
export type ProjectPlatform = 'github' | 'gitlab' | 'both';

export interface VerifyConfig {
  runner?: string;
  prepare?: string[];
}

export interface ProjectMetadata {
  schemaVersion: 1;
  resourceVersion: string;
  mode: ProjectMode;
  repositories: string[];
  repositoryPaths: Record<string, string>;
  managedFiles: Record<string, string>;
  createdAt: string;
  platform?: ProjectPlatform;
  verify?: VerifyConfig;
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
