// ABOUTME: Pure rotation logic for `.commander/claims.json` + `.commander/comments.json` sidecars.
// ABOUTME: Trims the unbounded `audit` array and per-bead comment arrays while preserving live state.

/**
 * Shape of `.commander/claims.json` as written by commander-v2's
 * `host/modules/tasks/adapter.bd/claims.ts`. Mirrored here as a structural type
 * so we can rotate without taking a commander-v2 dependency.
 */
export interface ClaimsShape {
	nextAuditId: number;
	byBead: Record<string, unknown>;
	audit: ReadonlyArray<{ readonly id: number;[k: string]: unknown }>;
}

/**
 * Shape of `.commander/comments.json` as written by commander-v2's
 * `host/modules/tasks/adapter.bd/comments.ts`. Same mirroring rationale.
 */
export interface CommentsShape {
	nextId: number;
	byBead: Record<string, ReadonlyArray<{ readonly id: number;[k: string]: unknown }>>;
}

export interface RotationLimits {
	/** Max rows to retain in `audit`. Older rows are discarded. */
	readonly maxAuditRows: number;
	/** Max comments to retain per bead. Older comments are discarded. */
	readonly maxCommentsPerBead: number;
}

export const DEFAULT_LIMITS: RotationLimits = {
	maxAuditRows: 500,
	maxCommentsPerBead: 100,
};

/**
 * Trim a claims sidecar payload. Keeps `byBead` (live state) untouched and
 * preserves `nextAuditId` so id allocation stays monotonic across rotations.
 *
 * @param state - Parsed claims.json contents.
 * @param limits - Retention limits; defaults to DEFAULT_LIMITS.
 * @returns A new state with `audit` trimmed to the last `maxAuditRows` rows.
 */
export function rotateClaims(state: ClaimsShape, limits: RotationLimits = DEFAULT_LIMITS): ClaimsShape {
	const audit = state.audit ?? [];
	if (audit.length <= limits.maxAuditRows) return state;
	const trimmed = audit.slice(audit.length - limits.maxAuditRows);
	return {
		nextAuditId: state.nextAuditId,
		byBead: state.byBead,
		audit: trimmed,
	};
}

/**
 * Trim a comments sidecar payload. Each bead's array is trimmed independently
 * to the last `maxCommentsPerBead` entries. `nextId` is preserved.
 *
 * @param state - Parsed comments.json contents.
 * @param limits - Retention limits; defaults to DEFAULT_LIMITS.
 * @returns A new state with each bead's comment list capped.
 */
export function rotateComments(state: CommentsShape, limits: RotationLimits = DEFAULT_LIMITS): CommentsShape {
	const byBead = state.byBead ?? {};
	const nextByBead: Record<string, ReadonlyArray<{ readonly id: number;[k: string]: unknown }>> = {};
	let changed = false;
	for (const beadId of Object.keys(byBead)) {
		const arr = byBead[beadId] ?? [];
		if (arr.length > limits.maxCommentsPerBead) {
			nextByBead[beadId] = arr.slice(arr.length - limits.maxCommentsPerBead);
			changed = true;
		} else {
			nextByBead[beadId] = arr;
		}
	}
	if (!changed) return state;
	return {
		nextId: state.nextId,
		byBead: nextByBead,
	};
}

/**
 * Decide whether a file at `sizeBytes` should be rotated. The threshold is
 * deliberately well above current real-world sizes so rotation is a no-op
 * until a sidecar genuinely grows out of hand; bump explicitly when ready.
 */
export function shouldRotate(sizeBytes: number, thresholdBytes: number): boolean {
	return sizeBytes >= thresholdBytes;
}
