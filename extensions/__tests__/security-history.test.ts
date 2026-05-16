import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	saveScanSnapshot,
	loadHistory,
	loadTrendData,
	getLatestSnapshots,
	computeDelta,
	loadHistoryForReport,
	getScanCount,
	resetHistoryForTests,
	countSeverities,
	findingKey,
} from "../lib/security/security-history.ts";
import type { SecurityReportData, SecurityReportFinding } from "../lib/security/security-report-html.ts";

function makeReport(overrides?: Partial<SecurityReportData>): SecurityReportData {
	return {
		title: overrides?.title || "Test Security Report",
		summary: overrides?.summary || "Test summary",
		generatedAt: new Date().toISOString(),
		scope: overrides?.scope || "localhost",
		findings: overrides?.findings || [
			{ title: "Open port 22", severity: "medium", category: "network" },
			{ title: "Weak cipher", severity: "high", category: "crypto" },
		],
		mitigations: overrides?.mitigations || ["Close port 22", "Upgrade cipher suite"],
	};
}

function makeFinding(title: string, severity: SecurityReportFinding["severity"]): SecurityReportFinding {
	return { title, severity, category: "test" };
}

describe("security-history", () => {
	beforeEach(() => {
		resetHistoryForTests();
	});

	afterEach(() => {
		resetHistoryForTests();
	});

	describe("countSeverities", () => {
		it("counts each severity level", () => {
			const findings: SecurityReportFinding[] = [
				makeFinding("A", "critical"),
				makeFinding("B", "high"),
				makeFinding("C", "high"),
				makeFinding("D", "medium"),
				makeFinding("E", "low"),
				makeFinding("F", "info"),
			];
			const counts = countSeverities(findings);
			expect(counts).toEqual({ critical: 1, high: 2, medium: 1, low: 1, info: 1 });
		});

		it("returns zeros for empty array", () => {
			const counts = countSeverities([]);
			expect(counts).toEqual({ critical: 0, high: 0, medium: 0, low: 0, info: 0 });
		});
	});

	describe("findingKey", () => {
		it("creates a stable key from severity, title, and category", () => {
			const f = makeFinding("Open port 22", "medium");
			expect(findingKey(f)).toBe("medium|Open port 22|test");
		});
	});

	describe("saveScanSnapshot", () => {
		it("persists a scan and returns a snapshot", () => {
			const report = makeReport();
			const snapshot = saveScanSnapshot(report);
			expect(snapshot).toBeDefined();
			expect(snapshot.title).toBe("Test Security Report");
			expect(snapshot.totalFindings).toBe(2);
			expect(snapshot.severityCounts.high).toBe(1);
			expect(snapshot.severityCounts.medium).toBe(1);
			expect(snapshot.findings).toHaveLength(2);
			expect(snapshot.mitigations).toHaveLength(2);
		});

		it("increments scan count", () => {
			expect(getScanCount()).toBe(0);
			saveScanSnapshot(makeReport());
			expect(getScanCount()).toBe(1);
			saveScanSnapshot(makeReport({ title: "Second scan" }));
			expect(getScanCount()).toBe(2);
		});
	});

	describe("loadHistory", () => {
		it("returns scans in reverse chronological order", () => {
			saveScanSnapshot(makeReport({ title: "Scan A" }));
			saveScanSnapshot(makeReport({ title: "Scan B" }));
			saveScanSnapshot(makeReport({ title: "Scan C" }));

			const history = loadHistory();
			expect(history).toHaveLength(3);
			// Most recent first
			expect(history[0].title).toBe("Scan C");
			expect(history[2].title).toBe("Scan A");
		});

		it("respects limit parameter", () => {
			saveScanSnapshot(makeReport({ title: "S1" }));
			saveScanSnapshot(makeReport({ title: "S2" }));
			saveScanSnapshot(makeReport({ title: "S3" }));

			const history = loadHistory({ limit: 2 });
			expect(history).toHaveLength(2);
		});

		it("returns empty array when no history", () => {
			expect(loadHistory()).toEqual([]);
		});
	});

	describe("loadTrendData", () => {
		it("returns trend points in chronological order", () => {
			saveScanSnapshot(makeReport({ title: "T1", findings: [makeFinding("A", "high")] }));
			saveScanSnapshot(makeReport({ title: "T2", findings: [makeFinding("A", "high"), makeFinding("B", "medium")] }));
			saveScanSnapshot(makeReport({ title: "T3", findings: [makeFinding("A", "high"), makeFinding("B", "medium"), makeFinding("C", "low")] }));

			const trend = loadTrendData();
			expect(trend).toHaveLength(3);
			// Chronological order (oldest first)
			expect(trend[0].totalFindings).toBe(1);
			expect(trend[1].totalFindings).toBe(2);
			expect(trend[2].totalFindings).toBe(3);
		});

		it("includes correct severity breakdowns", () => {
			saveScanSnapshot(makeReport({
				findings: [
					makeFinding("A", "critical"),
					makeFinding("B", "critical"),
					makeFinding("C", "high"),
				],
			}));

			const trend = loadTrendData();
			expect(trend).toHaveLength(1);
			expect(trend[0].severityCounts.critical).toBe(2);
			expect(trend[0].severityCounts.high).toBe(1);
			expect(trend[0].severityCounts.medium).toBe(0);
		});
	});

	describe("getLatestSnapshots", () => {
		it("returns the N most recent snapshots", () => {
			saveScanSnapshot(makeReport({ title: "A" }));
			saveScanSnapshot(makeReport({ title: "B" }));
			saveScanSnapshot(makeReport({ title: "C" }));

			const latest = getLatestSnapshots(2);
			expect(latest).toHaveLength(2);
			expect(latest[0].title).toBe("C");
			expect(latest[1].title).toBe("B");
		});
	});

	describe("computeDelta", () => {
		it("identifies new findings", () => {
			const previous = saveScanSnapshot(makeReport({
				findings: [makeFinding("A", "high")],
			}));

			const current = makeReport({
				findings: [makeFinding("A", "high"), makeFinding("B", "medium")],
			});

			const delta = computeDelta(current, previous);
			expect(delta.newFindings).toHaveLength(1);
			expect(delta.newFindings[0].title).toBe("B");
			expect(delta.resolvedFindings).toHaveLength(0);
			expect(delta.unchangedCount).toBe(1);
		});

		it("identifies resolved findings", () => {
			const previous = saveScanSnapshot(makeReport({
				findings: [makeFinding("A", "high"), makeFinding("B", "medium")],
			}));

			const current = makeReport({
				findings: [makeFinding("A", "high")],
			});

			const delta = computeDelta(current, previous);
			expect(delta.newFindings).toHaveLength(0);
			expect(delta.resolvedFindings).toHaveLength(1);
			expect(delta.resolvedFindings[0].title).toBe("B");
			expect(delta.unchangedCount).toBe(1);
		});

		it("handles completely new set of findings", () => {
			const previous = saveScanSnapshot(makeReport({
				findings: [makeFinding("A", "high")],
			}));

			const current = makeReport({
				findings: [makeFinding("X", "critical"), makeFinding("Y", "low")],
			});

			const delta = computeDelta(current, previous);
			expect(delta.newFindings).toHaveLength(2);
			expect(delta.resolvedFindings).toHaveLength(1);
			expect(delta.unchangedCount).toBe(0);
		});

		it("handles identical scans", () => {
			const findings = [makeFinding("A", "high"), makeFinding("B", "medium")];
			const previous = saveScanSnapshot(makeReport({ findings }));
			const current = makeReport({ findings });

			const delta = computeDelta(current, previous);
			expect(delta.newFindings).toHaveLength(0);
			expect(delta.resolvedFindings).toHaveLength(0);
			expect(delta.unchangedCount).toBe(2);
		});
	});

	describe("loadHistoryForReport", () => {
		it("returns complete history data with delta", () => {
			saveScanSnapshot(makeReport({
				title: "Previous",
				findings: [makeFinding("A", "high"), makeFinding("B", "medium")],
			}));

			const current = makeReport({
				title: "Current",
				findings: [makeFinding("A", "high"), makeFinding("C", "low")],
			});

			const historyData = loadHistoryForReport(current);
			expect(historyData.snapshots).toHaveLength(1);
			expect(historyData.trend.length).toBeGreaterThan(0);
			expect(historyData.delta).not.toBeNull();
			expect(historyData.delta!.newFindings).toHaveLength(1);
			expect(historyData.delta!.resolvedFindings).toHaveLength(1);
		});

		it("returns null delta when no previous scans", () => {
			const current = makeReport();
			const historyData = loadHistoryForReport(current);
			expect(historyData.snapshots).toHaveLength(0);
			expect(historyData.delta).toBeNull();
		});
	});
});
