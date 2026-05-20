// ABOUTME: Pure helpers for the Commander parent mid-progress comment.
// ABOUTME: Posted whenever a child task toggles to done so the parent card has
// ABOUTME: visible M/N progress between group:create and auto-close.

import { stripLeadingNumber } from "./task-list-render.ts";

export interface BuildParentProgressArgs {
	done: number;
	total: number;
	justCompletedText: string;
}

/**
 * Build the comment body posted to the Commander parent task when a child
 * transitions to done. Mirrors the agent's local display by stripping any
 * leading "N." prefix so the parent comment isn't double-numbered.
 */
export function buildParentProgressComment(args: BuildParentProgressArgs): string {
	const cleanText = stripLeadingNumber(args.justCompletedText.trim());
	return `${args.done}/${args.total} complete: ${cleanText}`;
}

export interface ShouldPostParentProgressArgs {
	prevStatus: "idle" | "inprogress" | "done";
	nextStatus: "idle" | "inprogress" | "done";
	groupId: number | undefined;
}

/**
 * Gate for the parent progress comment. Fires only on a transition INTO done
 * from a non-done state, and only when a Commander parent task exists (no
 * groupId means group:create is still in flight or sync is suppressed).
 */
export function shouldPostParentProgress(args: ShouldPostParentProgressArgs): boolean {
	if (args.groupId === undefined) return false;
	if (args.nextStatus !== "done") return false;
	if (args.prevStatus === "done") return false;
	return true;
}

export interface ShouldReopenParentArgs {
	prevStatus: "idle" | "inprogress" | "done";
	nextStatus: "idle" | "inprogress" | "done";
	groupId: number | undefined;
	parentClosedAt: number | undefined;
}

/**
 * Gate for re-opening a previously-completed Commander parent task. Fires
 * when a child task moves OUT of done (an "un-toggle" after mission-complete),
 * but only if the parent was actually closed by Pi before — otherwise there's
 * nothing to undo.
 */
export function shouldReopenParent(args: ShouldReopenParentArgs): boolean {
	if (args.groupId === undefined) return false;
	if (args.parentClosedAt === undefined) return false;
	if (args.prevStatus !== "done") return false;
	if (args.nextStatus === "done") return false;
	return true;
}
