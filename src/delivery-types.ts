export interface DeliveryBinding {
  root: string;
  sourceRoot: string;
  commonDir: string;
}

export interface DeliveryLocation {
  schemaVersion: 1;
  anchorRoot: string;
  recordRoot: string;
  workId: string;
  mode: 'project' | 'workspace';
  state: 'active';
  bindings: Record<string, DeliveryBinding>;
}

export interface DeliveryRepository {
  id: string;
  role: 'management' | 'business';
  base: string;
  branch: string;
  target: string;
  remote?: string;
  [key: string]: unknown;
}

export interface DeliveryEvent {
  id: string;
  action: string;
  state: 'prepared' | 'running' | 'succeeded' | 'failed' | 'unknown';
  at: string;
  details: Record<string, unknown>;
}

export interface DeliveryRecord {
  schemaVersion: 1;
  workId: string;
  mode: 'project' | 'workspace';
  designRequest: string;
  createdAt: string;
  repositories: DeliveryRepository[];
  events: DeliveryEvent[];
  [key: string]: unknown;
}

export interface DeliveryContext {
  anchorRoot: string;
  recordRoot: string;
  workId: string;
  record: DeliveryRecord;
  bindings: Record<string, DeliveryBinding>;
}

export interface PreparationTransfer {
  path: string;
  operation: 'add' | 'modify' | 'delete';
}

export interface DeliveryPreparationInput {
  schemaVersion: 1;
  designRequest: string;
  repositories: {
    id: string;
    base: string;
    branch: string;
    target: string;
    remote?: string;
    transfers?: PreparationTransfer[];
  }[];
}
