import type { ConfirmationReference, FileRef, Scope } from './confirmations.js';
import type { VerificationSelection, VerificationArtifactSnapshots, VerificationEvidenceReference } from './verification-selection.js';
import type { GateExceptionBinding } from './gate-exceptions.js';
import type { GateIssue } from './gate-conditions.js';

interface ArtifactCommon { id: string; purpose: string; required: boolean; optionalReason?: string; checks: string[] }
export type PlanningArtifact = ArtifactCommon & (
  { type: 'document'; source: FileRef } |
  { type: 'source'; files: FileRef[]; directories: FileRef[] } |
  { type: 'generated'; output: FileRef; inputs: FileRef[]; evidence: FileRef } |
  { type: 'reference'; taskId: string; artifactId: string }
);
export interface HumanCheckpoint {
  id: string; operation: 'start' | 'verify' | 'delivery-ready'; purpose: string; subjects: FileRef[];
}
export interface PlanningTask {
  id: string; title: string; outcome: string; scope: Scope; modules: string[]; relatedWorks: string[]; requirementIds: string[];
  basis: { requirements: ConfirmationReference | null; design: ConfirmationReference | null };
  specifications: { requirements: FileRef[]; design: FileRef[]; standards: FileRef[] };
  pendingDetails: string[];
  dependencies: { taskId: string; artifacts: string[] }[];
  artifacts: PlanningArtifact[];
  verification: VerificationSelection;
  humanCheckpoints: HumanCheckpoint[];
}
export interface PlanningDefinition {
  schemaVersion: 1; ownerWorkId: string; revision: string; scope: Scope;
  requirements: { id: string; source: FileRef; exclusion?: string }[];
  basis: { requirements: ConfirmationReference; design: ConfirmationReference };
  tasks: PlanningTask[];
  delivery: { requiredTasks: string[]; artifacts: PlanningArtifact[]; verification: VerificationSelection; humanCheckpoints: HumanCheckpoint[]; openIssues: string[] };
  changeReason: string;
}
export interface PlanningChanges {
  added: string[]; changed: string[]; retainedCandidates: string[]; removed: string[]; removedRequirements: string[];
}
export interface PlanningBoundFile extends FileRef { sha256: string }
export interface RegisteredPlanning {
  schemaVersion: 1; plan: PlanningDefinition; registeredAt: string; operationId: string; inputDigest: string;
  definitionDigest: string; taskDigests: Record<string, string>; specificationFiles: PlanningBoundFile[];
  confirmationBindings: { reference: ConfirmationReference; requestFingerprint: string; decisionFingerprint: string }[];
  changes: PlanningChanges;
}
export interface PlanningActivation {
  revision: string; confirmation: ConfirmationReference; definitionDigest: string; eventSequence: number;
}
export interface PlanningEvent {
  sequence: number; operationId: string; kind: 'planning-activated'; at: string; revision: string;
  definitionDigest: string; confirmation: ConfirmationReference; changes: PlanningChanges;
}
export interface PlanningReceipt {
  operationId: string; inputDigest: string; kind: 'register' | 'activate'; revision: number; planningRevision: string;
  basisDigest: string; operationAllowed: true; technicalReady: false; blockingReasons: string[];
}
export type TaskOperation = 'start' | 'verify' | 'resume';
export interface TaskOperationInput {
  operationId: string; expectedRevision: number; attemptId?: string;
  checkpointRefs: ConfirmationReference[]; evidenceRefs: VerificationEvidenceReference[];
  exceptionRefs?: ConfirmationReference[];
}
export interface TaskDependencyBasis { taskId: string; eventSequence: number; artifactDigest: string }
export interface TaskEvent {
  sequence: number; operationId: string; kind: 'task-started' | 'task-resumed' | 'task-verified' | 'task-verification-excepted'; at: string;
  taskId: string; attemptId: string; planningRevision: string; taskDigest: string; startBasisDigest: string;
  dependencies: TaskDependencyBasis[]; checkpointRefs: ConfirmationReference[]; checkpointDigest: string;
  startEventSequence: number; artifactSnapshots: VerificationArtifactSnapshots;
  verificationBasisDigest: string | null; evidenceRefs: VerificationEvidenceReference[];
  technicalBasisDigest?: string; exceptions?: GateExceptionBinding[]; failureReasons?: GateIssue[];
}
export interface TaskReceipt {
  operationId: string; inputDigest: string; kind: 'task-start' | 'task-verify' | 'task-resume'; revision: number; planningRevision: string;
  basisDigest: string; operationAllowed: true; technicalReady: boolean; blockingReasons: string[];
  taskId: string; attemptId: string; eventSequence: number;
  technicalBasisDigest?: string; exceptions?: GateExceptionBinding[]; failureReasons?: GateIssue[];
}
export interface PlanningState {
  schemaVersion: 1; ownerWorkId: string; revision: number; activePlanning: PlanningActivation | null;
  events: (PlanningEvent | TaskEvent)[]; operations: (PlanningReceipt | TaskReceipt)[];
}
export interface PlanningRegistrationInput { operationId: string; expectedRevision: number; plan: PlanningDefinition }
export interface PlanningActivationInput { operationId: string; expectedRevision: number; revision: string; confirmation: ConfirmationReference }
