// ABOUTME: Snapshot schemas and builders for durable, re-renderable viewer state.
// Captures the complete viewer state (markdown, parsed tasks, git diffs, comments) for re-opening from /reports browser.
// Snapshots are persisted to .context/reports/raw/<id>.json and allow viewers to re-render without relying on original files.

import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

// ── Constants ────────────────────────────────────────────────────────

export const SNAPSHOT_SCHEMA_VERSION = 1;

// ── Shared Schema Types ──────────────────────────────────────────────

const ActionResultSchema = Type.Optional(Type.Object({
	action: Type.String(),
	note: Type.Optional(Type.String()),
	raw: Type.Optional(Type.Any()),
}));

// Task node with optional children; recursion is not validated deeply by TypeBox
// to avoid stack overflow. The shape is validated, but deep recursion is allowed.
const TaskNodeSchema: any = Type.Object(
	{
		id: Type.String(),
		level: Type.Number(),
		text: Type.String(),
		checked: Type.Boolean(),
		children: Type.Optional(Type.Array(Type.Any())),
	},
	{ additionalProperties: true }
);

const GitHunkSchema = Type.Object({
	oldStart: Type.Number(),
	oldLines: Type.Number(),
	newStart: Type.Number(),
	newLines: Type.Number(),
	lines: Type.Array(Type.Object({
		type: Type.Union([Type.Literal("context"), Type.Literal("add"), Type.Literal("del")]),
		content: Type.String(),
	})),
});

const GitDiffSchema = Type.Object({
	path: Type.String(),
	oldPath: Type.Optional(Type.String()),
	mode: Type.Union([Type.Literal("added"), Type.Literal("modified"), Type.Literal("deleted"), Type.Literal("renamed")]),
	hunks: Type.Array(GitHunkSchema),
});

const SpecDocumentSchema = Type.Object({
	kind: Type.Union([Type.Literal("requirements"), Type.Literal("design"), Type.Literal("tasks")]),
	path: Type.String(),
	markdown: Type.String(),
	status: Type.Optional(Type.Union([Type.Literal("draft"), Type.Literal("approved")])),
});

const SpecCommentSchema = Type.Object({
	id: Type.String(),
	section: Type.String(),
	body: Type.String(),
	author: Type.String(),
	createdAt: Type.String(),
});

const SpecVisualSchema = Type.Object({
	fileName: Type.String(),
	relativePath: Type.String(),
	mimeType: Type.Optional(Type.String()),
});

// ── Plan Snapshot Schema ─────────────────────────────────────────────

export const PlanSnapshotSchema = Type.Object({
	schemaVersion: Type.Literal(1),
	capturedAt: Type.String(),
	mode: Type.Literal("plan"),
	title: Type.String(),
	summary: Type.String(),
	sourcePath: Type.String(),
	markdownContent: Type.String(),
	parsedTasks: Type.Array(TaskNodeSchema),
	actionResult: ActionResultSchema,
});

export type PlanSnapshot = Static<typeof PlanSnapshotSchema>;

// ── Questions Snapshot Schema ────────────────────────────────────────

export const QuestionsSnapshotSchema = Type.Object({
	schemaVersion: Type.Literal(1),
	capturedAt: Type.String(),
	mode: Type.Literal("questions"),
	title: Type.String(),
	summary: Type.String(),
	sourcePath: Type.String(),
	markdownContent: Type.String(),
	questionsHtml: Type.String(),
	actionResult: ActionResultSchema,
});

export type QuestionsSnapshot = Static<typeof QuestionsSnapshotSchema>;

// ── Spec Snapshot Schema ─────────────────────────────────────────────

export const SpecSnapshotSchema = Type.Object({
	schemaVersion: Type.Literal(1),
	capturedAt: Type.String(),
	title: Type.String(),
	summary: Type.String(),
	folderPath: Type.String(),
	documents: Type.Array(SpecDocumentSchema),
	comments: Type.Array(SpecCommentSchema),
	visuals: Type.Array(SpecVisualSchema),
	featureIdea: Type.Optional(Type.String()),
	actionResult: ActionResultSchema,
});

export type SpecSnapshot = Static<typeof SpecSnapshotSchema>;

// ── Completion Snapshot Schema ───────────────────────────────────────

export const CompletionSnapshotSchema = Type.Object({
	schemaVersion: Type.Literal(1),
	capturedAt: Type.String(),
	title: Type.String(),
	summaryMarkdown: Type.String(),
	baseRef: Type.String(),
	baseRefResolved: Type.Optional(Type.Union([Type.String(), Type.Null()])),
	gitDiffs: Type.Array(GitDiffSchema),
	tasksMarkdown: Type.Optional(Type.String()),
	filesChanged: Type.Number(),
	workingDirectory: Type.Optional(Type.String()),
	actionResult: ActionResultSchema,
	metadata: Type.Optional(Type.Record(Type.String(), Type.Any())),
});

export type CompletionSnapshot = Static<typeof CompletionSnapshotSchema>;

// ── Union Snapshot Schema ────────────────────────────────────────────

export const ViewerSnapshotSchema = Type.Union([
	PlanSnapshotSchema,
	QuestionsSnapshotSchema,
	SpecSnapshotSchema,
	CompletionSnapshotSchema,
]);

export type ViewerSnapshot = Static<typeof ViewerSnapshotSchema>;

// ── Builder Functions ────────────────────────────────────────────────

function getCurrentTimestamp(): string {
	return new Date().toISOString();
}

export function buildPlanSnapshot(args: {
	title: string;
	summary: string;
	sourcePath: string;
	markdownContent: string;
	parsedTasks: Array<any>;
	actionResult?: any;
}): PlanSnapshot {
	return {
		schemaVersion: SNAPSHOT_SCHEMA_VERSION,
		capturedAt: getCurrentTimestamp(),
		mode: "plan",
		title: args.title,
		summary: args.summary,
		sourcePath: args.sourcePath,
		markdownContent: args.markdownContent,
		parsedTasks: args.parsedTasks,
		actionResult: args.actionResult,
	};
}

export function buildQuestionsSnapshot(args: {
	title: string;
	summary: string;
	sourcePath: string;
	markdownContent: string;
	questionsHtml: string;
	actionResult?: any;
}): QuestionsSnapshot {
	return {
		schemaVersion: SNAPSHOT_SCHEMA_VERSION,
		capturedAt: getCurrentTimestamp(),
		mode: "questions",
		title: args.title,
		summary: args.summary,
		sourcePath: args.sourcePath,
		markdownContent: args.markdownContent,
		questionsHtml: args.questionsHtml,
		actionResult: args.actionResult,
	};
}

export function buildSpecSnapshot(args: {
	title: string;
	summary: string;
	folderPath: string;
	documents: Array<any>;
	comments: Array<any>;
	visuals: Array<any>;
	featureIdea?: string;
	actionResult?: any;
}): SpecSnapshot {
	return {
		schemaVersion: SNAPSHOT_SCHEMA_VERSION,
		capturedAt: getCurrentTimestamp(),
		title: args.title,
		summary: args.summary,
		folderPath: args.folderPath,
		documents: args.documents,
		comments: args.comments,
		visuals: args.visuals,
		featureIdea: args.featureIdea,
		actionResult: args.actionResult,
	};
}

export function buildCompletionSnapshot(args: {
	title: string;
	summaryMarkdown: string;
	baseRef: string;
	baseRefResolved?: string | null;
	gitDiffs: Array<any>;
	tasksMarkdown?: string;
	filesChanged: number;
	workingDirectory?: string;
	actionResult?: any;
	metadata?: Record<string, any>;
}): CompletionSnapshot {
	return {
		schemaVersion: SNAPSHOT_SCHEMA_VERSION,
		capturedAt: getCurrentTimestamp(),
		title: args.title,
		summaryMarkdown: args.summaryMarkdown,
		baseRef: args.baseRef,
		baseRefResolved: args.baseRefResolved,
		gitDiffs: args.gitDiffs,
		tasksMarkdown: args.tasksMarkdown,
		filesChanged: args.filesChanged,
		workingDirectory: args.workingDirectory,
		actionResult: args.actionResult,
		metadata: args.metadata,
	};
}

// ── Validator ────────────────────────────────────────────────────────

export function validateSnapshot(payload: unknown): { ok: true; snapshot: ViewerSnapshot } | { ok: false; error: string } {
	// First, do basic structure validation
	if (typeof payload !== "object" || payload === null) {
		return { ok: false, error: "Snapshot must be an object" };
	}

	const obj = payload as any;

	// Check schema version
	if (obj.schemaVersion !== undefined && obj.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
		return { ok: false, error: `Unsupported snapshot schemaVersion: ${obj.schemaVersion}` };
	}

	// Try to validate against each schema type, starting with discriminated ones (plan, questions)
	// This avoids the expensive union validation that tries all branches

	if (obj.mode === "plan") {
		if (!Value.Check(PlanSnapshotSchema, payload)) {
			const errors = Array.from(Value.Errors(PlanSnapshotSchema, payload));
			const errorMessages = errors.map((err) => `${err.path || "root"}: ${err.message}`).join("; ");
			return { ok: false, error: `Snapshot validation failed: ${errorMessages}` };
		}
		return { ok: true, snapshot: payload as ViewerSnapshot };
	}

	if (obj.mode === "questions") {
		if (!Value.Check(QuestionsSnapshotSchema, payload)) {
			const errors = Array.from(Value.Errors(QuestionsSnapshotSchema, payload));
			const errorMessages = errors.map((err) => `${err.path || "root"}: ${err.message}`).join("; ");
			return { ok: false, error: `Snapshot validation failed: ${errorMessages}` };
		}
		return { ok: true, snapshot: payload as ViewerSnapshot };
	}

	// For spec and completion, discriminate by presence of required fields
	// Spec has: documents, comments, visuals, folderPath
	// Completion has: gitDiffs, filesChanged, baseRef, summaryMarkdown

	if (obj.documents !== undefined && obj.comments !== undefined && obj.visuals !== undefined) {
		if (!Value.Check(SpecSnapshotSchema, payload)) {
			const errors = Array.from(Value.Errors(SpecSnapshotSchema, payload));
			const errorMessages = errors.map((err) => `${err.path || "root"}: ${err.message}`).join("; ");
			return { ok: false, error: `Snapshot validation failed: ${errorMessages}` };
		}
		return { ok: true, snapshot: payload as ViewerSnapshot };
	}

	if (obj.gitDiffs !== undefined && obj.filesChanged !== undefined) {
		if (!Value.Check(CompletionSnapshotSchema, payload)) {
			const errors = Array.from(Value.Errors(CompletionSnapshotSchema, payload));
			const errorMessages = errors.map((err) => `${err.path || "root"}: ${err.message}`).join("; ");
			return { ok: false, error: `Snapshot validation failed: ${errorMessages}` };
		}
		return { ok: true, snapshot: payload as ViewerSnapshot };
	}

	// If we can't discriminate, try the union
	if (!Value.Check(ViewerSnapshotSchema, payload)) {
		const errors = Array.from(Value.Errors(ViewerSnapshotSchema, payload));
		const errorMessages = errors.map((err) => `${err.path || "root"}: ${err.message}`).join("; ");
		return { ok: false, error: `Snapshot validation failed: ${errorMessages}` };
	}

	return { ok: true, snapshot: payload as ViewerSnapshot };
}
