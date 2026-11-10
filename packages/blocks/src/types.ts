import type { CostRange, EpisodeStatus, Format, StepCosts, Studio } from "@talestudio/core";
import type { z } from "zod";

/**
 * A block is one production operation (write a script, animate shots, render…).
 * Blocks are pure descriptions: the engine reads them to validate, price and schedule work,
 * and the worker maps `executor` to the activity that does it. This file must stay free of I/O
 * because workflow code (Temporal sandbox) imports it.
 */
export type BlockCategory = "story" | "character" | "image" | "video" | "audio" | "editing" | "export";

/** Typed data flowing between blocks. An input is satisfied by an upstream output of the same type. */
export type PortType =
  | "brief" | "script" | "cast" | "keyframes" | "clips" | "voice" | "synced-clips" | "video"
  | "sources" | "claims" | "media" | "transcript" | "highlights" | "social-clips";

export interface Port {
  name: string;
  type: PortType;
  optional?: boolean;
}

/** How many times a block runs per production. */
/** "highlights" = one item per highlight the user kept selected. */
export type FanOut = "once" | "shots" | "spokenShots" | "onCameraShots" | "formats" | "highlights";

export interface ProviderOption {
  id: string;
  label: string;
}

/** Everything an estimate can depend on, known before anything runs. */
export interface EstimateContext {
  durationSec: number;
  shots: number;
  spokenShots: number;
  onCameraShots: number;
  formats: Format[];
  /** Podcast to Clips: length of the uploaded recording and number of clips to export. */
  sourceSec?: number;
  clips?: number;
}

/** Activity names the worker implements; a block declares which one executes one item. */
export type Executor = "writeScript" | "castCharacters" | "drawKeyframe" | "animateShot" | "voiceShot" | "lipsyncShot" | "renderFinal" | "checkFacts" | "transcribe" | "findHighlights" | "cutClip";

export interface BlockDefinition<C extends z.ZodType = z.ZodType> {
  type: string;
  /** Bump when behaviour changes; workflows pin a version so older projects keep working. */
  version: number;
  category: BlockCategory;
  inputs: Port[];
  outputs: Port[];
  configSchema: C;
  providers: ProviderOption[];
  fanOut: FanOut;
  executor: Executor;
  /** Production status shown while this block runs. */
  status: EpisodeStatus;
  /** Credits charged for the whole block (all items). */
  credits: (config: z.infer<C>, ctx: EstimateContext) => number;
  /** Provider cost (USD) for the whole block, for margin analytics. */
  cogs: (config: z.infer<C>, ctx: EstimateContext, costs: StepCosts) => CostRange;
}

export interface WorkflowNode {
  id: string;
  block: string;
  version: number;
  config?: Record<string, unknown>;
}

/**
 * A workflow is a DAG of blocks split into stages. Each stage runs as one durable run;
 * the user approves between stages (storyboard → production), which is what lets them fix a
 * scene before any video credit is spent.
 */
export interface WorkflowDefinition {
  id: string;
  version: number;
  studio: Studio;
  stages: { id: Stage; nodes: string[] }[];
  nodes: WorkflowNode[];
  edges: { from: string; to: string }[];
}

export type Stage = "storyboard" | "production";
