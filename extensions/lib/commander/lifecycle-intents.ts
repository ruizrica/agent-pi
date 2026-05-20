// ABOUTME: Durable pending Commander lifecycle intents for Pi recovery.
// ABOUTME: Stores only failed/in-flight Pi writes; cmd remains the canonical task store.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// Cross-session lifecycle retry budget. Counts how many sessions can pick up
// an open intent before the reconciler force-fails it. This is the persistent-
// failure budget (sessions), NOT the in-process transient-fault retry bound
// (see IN_PROCESS_RETRY_LIMIT in commander-lifecycle.ts for that axis).
export const MAX_INTENT_ATTEMPTS = 5;

export type LifecycleIntentAction = "claim" | "comment" | "complete" | "fail" | "cancel";
export type LifecycleIntentStatus = "pending" | "succeeded";

export interface LifecycleIntent {
	id: string;
	taskId: number | string;
	action: LifecycleIntentAction;
	owner?: string;
	message?: string;
	status?: LifecycleIntentStatus;
	createdAt: string;
	updatedAt: string;
	attempts: number;
	lastError?: string;
}

export interface LifecycleIntentStore {
	version: 1;
	intents: LifecycleIntent[];
}

function nowIso(): string {
	return new Date().toISOString();
}

function findIntentRoot(cwd = process.cwd()): string {
	let dir = cwd;
	while (dir && dir !== dirname(dir)) {
		if (existsSync(join(dir, "package.json")) || existsSync(join(dir, ".git"))) return dir;
		dir = dirname(dir);
	}
	return cwd;
}

function defaultPath(cwd = process.cwd()): string {
	return process.env.PI_LIFECYCLE_INTENTS_PATH || join(findIntentRoot(cwd), ".commander", "pi-lifecycle-intents.json");
}

function intentKey(taskId: number | string, action: LifecycleIntentAction): string {
	return `${taskId}:${action}`;
}

export function readLifecycleIntents(path = defaultPath()): LifecycleIntentStore {
	try {
		if (!existsSync(path)) return { version: 1, intents: [] };
		const parsed = JSON.parse(readFileSync(path, "utf-8"));
		return {
			version: 1,
			intents: Array.isArray(parsed?.intents) ? parsed.intents : [],
		};
	} catch {
		return { version: 1, intents: [] };
	}
}

function writeLifecycleIntents(store: LifecycleIntentStore, path = defaultPath()): void {
	mkdirSync(dirname(path), { recursive: true });
	const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
	writeFileSync(tmp, JSON.stringify(store, null, 2) + "\n", "utf-8");
	renameSync(tmp, path);
}

export function recordLifecycleIntent(
	intent: Omit<LifecycleIntent, "id" | "createdAt" | "updatedAt" | "attempts" | "status">,
	path = defaultPath(),
): LifecycleIntent {
	const store = readLifecycleIntents(path);
	const id = intentKey(intent.taskId, intent.action);
	const ts = nowIso();
	const existing = store.intents.find(i => i.id === id);
	const next: LifecycleIntent = existing
		? { ...existing, ...intent, status: "pending", updatedAt: ts, attempts: existing.attempts + 1 }
		: { ...intent, id, status: "pending", createdAt: ts, updatedAt: ts, attempts: 1 };
	writeLifecycleIntents({ version: 1, intents: [...store.intents.filter(i => i.id !== id), next] }, path);
	return next;
}

export function clearLifecycleIntent(taskId: number | string, action: LifecycleIntentAction, path = defaultPath()): void {
	const store = readLifecycleIntents(path);
	const id = intentKey(taskId, action);
	writeLifecycleIntents({ version: 1, intents: store.intents.filter(i => i.id !== id) }, path);
}

export function listOpenLifecycleIntents(path = defaultPath()): LifecycleIntent[] {
	return readLifecycleIntents(path).intents.filter(i => i.status !== "succeeded");
}
