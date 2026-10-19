export type ProjectMode = 'project' | 'workspace';

export interface ProjectMetadata {
  schemaVersion: 1;
  resourceVersion: '0.1.0' | '0.2.0' | '0.2.1' | '0.2.2' | '0.3.0' | '0.3.1' | '0.3.2' | '0.3.3' | '0.3.4' | '0.3.5' | '0.3.6' | '0.4.0';
  mode: ProjectMode;
  repositories: string[];
  repositoryPaths?: Record<string, string>;
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
  compatibility: 'read-write' | 'read-only' | 'unsupported';
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
