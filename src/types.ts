export type ProjectMode = 'project' | 'workspace';

export interface ProjectMetadata {
  schemaVersion: 1;
  resourceVersion: string;
  mode: ProjectMode;
  repositories: string[];
  repositoryPaths: Record<string, string>;
  managedFiles: Record<string, string>;
  createdAt: string;
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
}

export interface FileChange {
  path: string;
  before: string | null;
  after: string;
}
