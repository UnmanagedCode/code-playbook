// cc's /api/playbooks shapes (docs/protocol.md) and the editor's form shapes.

export type Policy = 'allow' | 'deny' | { pin: Record<string, unknown> };

export interface Need {
  stage: string;
  position: string[];
  liveness: string;
}

export interface Stage {
  needs: Need[];
  workers: string;
  tools: Record<string, Policy>;
  description?: string;
  spawnable: boolean;
}

export interface Transition {
  from: string;
  to: string;
  via: string;
  description?: string;
}

export interface PlaybookDetail {
  id: string;
  name: string;
  description: string;
  source: string;
  editable: boolean;
  entryStages: string[];
  stages: Record<string, Stage>;
  transitions: Transition[];
  liveWorkers: number | null;
}

export interface PlaybookSummary {
  id: string;
  name: string;
  description: string;
  source: string;
  editable: boolean;
  entryStages: string[];
  spawnableStages: string[];
}

export interface GovernableTool {
  name: string;
  pinArgs: string[];
}

export interface TakenIds {
  builtin: string[];
  user: string[];
  reserved: string[];
}

export interface PlaybookList {
  playbooks: PlaybookSummary[];
  errors: { id: string; message: string }[];
  governableTools: GovernableTool[];
  takenIds: TakenIds;
}

/** A validator error, cc's or local, with where it belongs. */
export interface LocatedError {
  message: string;
  stage: string | null;
  transition: { from: string; to: string } | null;
  tool?: string;
}

export interface ValidateResult {
  ok: boolean;
  errors?: LocatedError[];
}

/** The definition cc validates and the backend writes. */
export interface Definition {
  id: string;
  name: string;
  description: string;
  entryStages: string[];
  stages: Record<string, { needs: Need[]; workers: string; tools: Record<string, Policy>; description?: string }>;
  transitions: { from: string; to: string; on?: string; description?: string }[];
}

export interface PinRow {
  arg: string;
  json: string;
}

export interface ToolRow {
  tool: string;
  policy: string;
  pin: PinRow[];
}

export interface FormStage {
  key: string;
  name: string;
  workers: string;
  description: string;
  needs: Need[];
  tools: ToolRow[];
}

export interface FormTransition {
  from: string;
  to: string;
  via: string;
  description: string;
}

export interface Form {
  id: string;
  name: string;
  description: string;
  entryStages: string[];
  stages: FormStage[];
  transitions: FormTransition[];
}

export interface IdNotices {
  block?: string;
  warn: string[];
}

export interface PlacedErrors {
  playbook: LocatedError[];
  byStage: Record<string, LocatedError[]>;
  byTransition: Record<number, LocatedError[]>;
}

export interface Validation {
  rev: number;
  ok: boolean;
  errors: LocatedError[];
}
