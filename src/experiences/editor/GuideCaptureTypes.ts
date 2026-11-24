import type { EditorDraft, ExperienceTarget, RuntimeGuideDefinition } from "../types";

export interface CapturedGuideTarget {
  id: string;
  target: ExperienceTarget & { tagName: string; targetContext: { pagePath: string } };
}

export type CaptureObservation = { sequence: number } & (
  | { type: "target"; path: string; targetId: string }
  | { type: "click"; path: string; targetId?: string; control: "link" | "button" | "choice" }
  | { type: "route"; from: string; to: string; afterClick?: number }
  | { type: "ui"; path: string; surface: "dialog" | "menu" | "expanded"; afterClick?: number }
);

export interface CaptureWorkflow {
  prompt: string;
  stage: "capture" | "plan" | "preview";
  draftRevision: number;
  plan?: CapturePlan;
  previewStepId?: string;
}

export interface GuideCaptureCheckpoint {
  mode: "select" | "navigate";
  targets: CapturedGuideTarget[];
  observations?: CaptureObservation[];
  workflow?: CaptureWorkflow;
}

export interface GuideCaptureRevision {
  revision: number;
  checkpointRevision: number;
}

export type StoredGuideCapture = GuideCaptureCheckpoint & GuideCaptureRevision;

export type CaptureAdvance =
  | { type: "button" | "element_click" }
  | { type: "element_hover"; durationMs?: number }
  | { type: "route"; targetId: string }
  | { type: "custom_event"; eventName: string }
  | { type: "unconfigured"; reason: string };

export interface CapturePlanStep {
  pattern: "modal" | "anchored_card";
  targetId: string | null;
  heading: string;
  body: string;
  purpose: string;
  advance: CaptureAdvance;
  delayMs: number;
  missingTarget: { action: "wait" | "skip" | "dismiss"; timeoutMs: number } | null;
}

export interface CapturePlan { steps: CapturePlanStep[] }

export interface CapturePreview {
  definition: RuntimeGuideDefinition;
  previewTicket: string;
}

export interface CaptureBridge {
  loadCapture(): Promise<StoredGuideCapture>;
  saveCapture(checkpoint: GuideCaptureCheckpoint, checkpointRevision: number): Promise<{ checkpointRevision: number }>;
  planCapture(input: GuideCaptureRevision & { prompt: string }, signal: AbortSignal): Promise<{ plan: CapturePlan }>;
  previewCapture(input: GuideCaptureRevision & { plan: CapturePlan }, signal: AbortSignal): Promise<CapturePreview>;
  applyCapture(input: GuideCaptureRevision & { plan: CapturePlan; previewTicket: string }): Promise<{ version: EditorDraft["version"] }>;
  load(): Promise<EditorDraft>;
}
