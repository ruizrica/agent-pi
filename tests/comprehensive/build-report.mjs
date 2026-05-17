#!/usr/bin/env node
// ABOUTME: Aggregates JSON test results into a single-file dark-mode HTML report
// ABOUTME: with a focused-issue browser (clickable list, prev/next nav, keyboard shortcuts).

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(HERE, "results");
const OUT_HTML = join(HERE, "report.html");

function normalizeShape(json, file) {
  const out = { ...json };
  // tolerate: tests as number → salvage from alternate keys
  if (!Array.isArray(out.tests)) {
    let salvaged = null;
    for (const k of ["viewers", "extensions", "items", "entries", "results", "checks"]) {
      if (Array.isArray(out[k])) {
        salvaged = out[k].map((it, i) => ({
          id: (it.id || it.name || `${k}.${i}`).toString(),
          name: it.name || it.title || it.id || `${k} entry ${i}`,
          command: it.command || "(static)",
          status: it.status || (out.fail > 0 ? "fail" : "pass"),
          evidence: it.evidence || it.description || it.purpose || it.note || "",
          notes: it.notes || it.commands?.join?.(", ") || "",
        }));
        break;
      }
    }
    out.__schema_deviated = true;
    out.tests = salvaged || [];
  }
  if (!Array.isArray(out.improvements)) out.improvements = [];
  if (!Array.isArray(out.divergences)) out.divergences = [];
  // coerce string entries into objects (some agents emit plain strings)
  out.improvements = out.improvements.map((i, idx) => {
    if (typeof i === "string") return { id: `imp${idx}`, title: i, description: "", severity: "low" };
    return { ...i, severity: i.severity || "low" };
  });
  out.divergences = out.divergences.map((d, idx) => {
    if (typeof d === "string") return { title: d, expected: "", observed: "", impact: "", severity: "medium" };
    return { ...d, severity: d.severity || "medium" };
  });
  // also coerce test entries — some agents may emit malformed tests
  out.tests = out.tests.filter((t) => t && typeof t === "object").map((t, idx) => ({
    id: t.id || `t${idx}`,
    name: t.name || t.title || `Test ${idx}`,
    command: t.command || "",
    status: t.status || "pass",
    evidence: typeof t.evidence === "string" ? t.evidence : JSON.stringify(t.evidence || ""),
    notes: t.notes || "",
    duration_ms: typeof t.duration_ms === "number" ? t.duration_ms : null,
  }));
  if (!out.summary || typeof out.summary !== "object") {
    out.summary = {
      total: out.tests.length,
      pass: out.tests.filter((t) => t.status === "pass").length,
      fail: out.tests.filter((t) => t.status === "fail").length,
      skip: out.tests.filter((t) => t.status === "skip").length,
      error: out.tests.filter((t) => t.status === "error").length,
    };
  } else {
    // accept summary.tests as alias for summary.total
    if (out.summary.total == null && typeof out.summary.tests === "number") {
      out.summary.total = out.summary.tests;
    }
    out.summary.pass = out.summary.pass || 0;
    out.summary.fail = out.summary.fail || 0;
    out.summary.skip = out.summary.skip || 0;
    out.summary.error = out.summary.error || 0;
    if (out.summary.total == null) {
      out.summary.total =
        (out.summary.pass || 0) + (out.summary.fail || 0) + (out.summary.skip || 0) + (out.summary.error || 0);
    }
  }
  // schema-deviation reported as a divergence so it surfaces in the report
  if (out.__schema_deviated) {
    out.divergences.push({
      title: `Slice ${file} did not match schema`,
      expected: "tests as array, plus improvements[] and divergences[] arrays",
      observed: `tests was ${typeof json.tests}; salvaged from alternate keys if present`,
      impact: "Slice entries may be partially populated; review JSON",
      severity: "medium",
    });
  }
  return out;
}

function loadResults() {
  const files = readdirSync(RESULTS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  const out = [];
  for (const f of files) {
    try {
      let json = JSON.parse(readFileSync(join(RESULTS_DIR, f), "utf8"));
      json = normalizeShape(json, f);
      json.__file = f;
      const m = /^(\d{2})/.exec(f);
      const idx = m ? parseInt(m[1], 10) : 999;
      json.__index = idx;
      json.__phase = idx <= 10 ? 1 : 2;
      out.push(json);
    } catch (e) {
      out.push({
        __file: f,
        __index: 999,
        __phase: 0,
        category: f.replace(/\.json$/, ""),
        category_name: f.replace(/\.json$/, ""),
        scope: "(unparseable)",
        tests: [],
        summary: { total: 0, pass: 0, fail: 0, skip: 0, error: 1 },
        improvements: [],
        divergences: [
          {
            title: "Result file unparseable",
            expected: "valid JSON",
            observed: String(e.message || e),
            impact: "Slice excluded from totals",
            severity: "high",
          },
        ],
      });
    }
  }
  out.sort((a, b) => a.__index - b.__index);
  return out;
}

function totals(results) {
  const agg = { total: 0, pass: 0, fail: 0, skip: 0, error: 0 };
  for (const r of results) {
    const s = r.summary || {};
    agg.total += s.total || 0;
    agg.pass += s.pass || 0;
    agg.fail += s.fail || 0;
    agg.skip += s.skip || 0;
    agg.error += s.error || 0;
  }
  return agg;
}

function buildIssueList(results) {
  const issues = [];
  for (const r of results) {
    const sliceLabel = r.category_name || r.category || r.__file;
    const phase = r.__phase;
    for (const t of r.tests || []) {
      if (t.status === "fail" || t.status === "error") {
        issues.push({
          kind: "test",
          status: t.status,
          severity: t.status === "error" ? "high" : "high",
          title: t.name || t.id || "(unnamed test)",
          slice: sliceLabel,
          sliceFile: r.__file,
          phase,
          id: t.id || "",
          command: t.command || "",
          evidence: t.evidence || "",
          notes: t.notes || "",
          duration_ms: t.duration_ms || null,
        });
      }
    }
    for (const i of r.improvements || []) {
      issues.push({
        kind: "improvement",
        status: "improvement",
        severity: i.severity || "low",
        title: i.title || i.id || "(improvement)",
        slice: sliceLabel,
        sliceFile: r.__file,
        phase,
        description: i.description || "",
      });
    }
    for (const d of r.divergences || []) {
      issues.push({
        kind: "divergence",
        status: "divergence",
        severity: d.severity || "medium",
        title: d.title || "(divergence)",
        slice: sliceLabel,
        sliceFile: r.__file,
        phase,
        expected: d.expected || "",
        observed: d.observed || "",
        impact: d.impact || "",
      });
    }
  }
  const sevRank = { high: 0, medium: 1, low: 2 };
  const kindRank = { test: 0, divergence: 1, improvement: 2 };
  issues.sort((a, b) => {
    if (a.phase !== b.phase) return a.phase - b.phase;
    const kindA = a.kind === "test" && a.status === "error" ? -1 : kindRank[a.kind];
    const kindB = b.kind === "test" && b.status === "error" ? -1 : kindRank[b.kind];
    if (kindA !== kindB) return kindA - kindB;
    const sa = sevRank[a.severity] ?? 9;
    const sb = sevRank[b.severity] ?? 9;
    if (sa !== sb) return sa - sb;
    return a.slice.localeCompare(b.slice);
  });
  return issues;
}

function buildAllTests(results) {
  const all = [];
  for (const r of results) {
    const sliceLabel = r.category_name || r.category || r.__file;
    for (const t of r.tests || []) {
      all.push({
        slice: sliceLabel,
        sliceFile: r.__file,
        phase: r.__phase,
        id: t.id || "",
        name: t.name || "",
        command: t.command || "",
        status: t.status || "",
        evidence: t.evidence || "",
        notes: t.notes || "",
        duration_ms: t.duration_ms || null,
      });
    }
  }
  return all;
}

function inferMethod(r) {
  // Phase 1 slices are inherently static/flag-parse style.
  if (r.__phase === 1) {
    // Slice 05 (vitest) is an exception — it actually ran tests
    if (r.__file.includes("extensions-vitest")) return "tests-ran";
    return "static";
  }
  const durations = (r.tests || []).map((t) => Number(t.duration_ms) || 0);
  const total = durations.length;
  if (!total) return "unknown";
  const longCalls = durations.filter((d) => d >= 1000).length;
  const ratio = longCalls / total;
  if (ratio >= 0.4) return "live";
  if (ratio >= 0.15) return "mixed";
  return "static";
}

function buildSliceCards(results) {
  return results.map((r) => {
    const s = r.summary || { total: 0, pass: 0, fail: 0, skip: 0, error: 0 };
    return {
      file: r.__file,
      phase: r.__phase,
      category: r.category || "",
      category_name: r.category_name || r.category || r.__file,
      scope: r.scope || "",
      tested_by: r.tested_by || "",
      method: inferMethod(r),
      total: s.total || 0,
      pass: s.pass || 0,
      fail: s.fail || 0,
      skip: s.skip || 0,
      error: s.error || 0,
      improvements: (r.improvements || []).length,
      divergences: (r.divergences || []).length,
    };
  });
}

function pct(n, d) {
  if (!d) return "0";
  return ((n / d) * 100).toFixed(1);
}

function loadRemediations() {
  try {
    const p = join(HERE, "remediations.json");
    const raw = readFileSync(p, "utf8");
    const j = JSON.parse(raw);
    return j.groups || [];
  } catch {
    return [];
  }
}

function buildHtml(results) {
  const agg = totals(results);
  const issues = buildIssueList(results);
  const allTests = buildAllTests(results);
  const slices = buildSliceCards(results);
  const remediations = loadRemediations();
  const remediationCount = remediations.reduce((n, g) => n + (g.items || []).length, 0);
  const env = results[0]?.environment || {};
  const generated = new Date().toISOString();
  const data = { agg, issues, allTests, slices, env, generated, phaseCounts: {}, remediations, remediationCount };
  for (const r of results) {
    const k = `phase${r.__phase}`;
    data.phaseCounts[k] = (data.phaseCounts[k] || 0) + 1;
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PI Agent — Comprehensive Test Report</title>
<style>
  :root {
    --bg: #0a0d12;
    --bg-elev: #11151c;
    --bg-elev-2: #161b23;
    --bg-elev-3: #1c222d;
    --border: #232a36;
    --border-strong: #2f3847;
    --fg: #e2e8f0;
    --fg-dim: #9aa5b8;
    --fg-faint: #6b7689;
    --accent: #7aa2f7;
    --accent-strong: #93b6ff;
    --pass: #4ade80;
    --fail: #f87171;
    --skip: #fbbf24;
    --error: #f472b6;
    --improvement: #7aa2f7;
    --divergence: #c4a8ff;
    --code-bg: #0a0d12;
    --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace;
    --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--fg); font-family: var(--sans); line-height: 1.45; height: 100%; overflow: hidden; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  code, pre, kbd { font-family: var(--mono); font-size: 12.5px; }
  pre { white-space: pre-wrap; word-break: break-word; margin: 0; }
  kbd { background: var(--bg-elev-3); border: 1px solid var(--border-strong); border-bottom-width: 2px; padding: 1px 6px; border-radius: 3px; font-size: 11px; color: var(--fg-dim); }
  button { font-family: inherit; color: inherit; background: none; border: none; cursor: pointer; }
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-thumb { background: var(--bg-elev-3); border-radius: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }

  body { display: grid; grid-template-rows: auto 1fr; }

  /* Header */
  header.top { background: var(--bg-elev); border-bottom: 1px solid var(--border); padding: 14px 22px 12px; }
  header.top .row { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  header.top h1 { margin: 0; font-size: 17px; letter-spacing: -0.005em; font-weight: 600; }
  header.top .env { color: var(--fg-faint); font-size: 11.5px; margin-top: 4px; font-family: var(--mono); }
  header.top .stats { display: flex; gap: 6px; flex-wrap: wrap; }
  .stat-pill { font-size: 11.5px; padding: 4px 10px; border-radius: 999px; background: var(--bg-elev-2); border: 1px solid var(--border); display: flex; align-items: center; gap: 6px; }
  .stat-pill .label { color: var(--fg-faint); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
  .stat-pill .val { font-weight: 600; font-family: var(--mono); }
  .stat-pill.pass { border-color: rgba(74,222,128,0.4); } .stat-pill.pass .val { color: var(--pass); }
  .stat-pill.fail { border-color: rgba(248,113,113,0.4); } .stat-pill.fail .val { color: var(--fail); }
  .stat-pill.skip { border-color: rgba(251,191,36,0.4); } .stat-pill.skip .val { color: var(--skip); }
  .stat-pill.error { border-color: rgba(244,114,182,0.4); } .stat-pill.error .val { color: var(--error); }

  /* Tabs */
  nav.tabs { display: flex; gap: 0; margin-top: 10px; border-bottom: 1px solid var(--border); margin-left: -22px; margin-right: -22px; padding: 0 22px; }
  nav.tabs button { padding: 8px 14px; font-size: 13px; color: var(--fg-dim); border-bottom: 2px solid transparent; margin-bottom: -1px; }
  nav.tabs button:hover { color: var(--fg); }
  nav.tabs button.active { color: var(--fg); border-bottom-color: var(--accent); }
  nav.tabs .count { font-family: var(--mono); font-size: 11px; color: var(--fg-faint); margin-left: 6px; }

  /* Body grid */
  main.body { display: grid; min-height: 0; overflow: hidden; }
  main.body[data-tab="issues"] { grid-template-columns: minmax(340px, 420px) 1fr; }
  main.body[data-tab="slices"] { grid-template-columns: 1fr; }
  main.body[data-tab="tests"] { grid-template-columns: 1fr; }
  main.body[data-tab="remediation"] { grid-template-columns: 1fr; }

  /* Remediation tab */
  section.remediation-view { padding: 22px 28px 60px; overflow-y: auto; max-width: 1100px; }
  .rem-intro { background: var(--bg-elev); border: 1px solid var(--border); border-radius: 8px; padding: 14px 18px; margin-bottom: 18px; color: var(--fg-dim); font-size: 13.5px; line-height: 1.55; }
  .rem-intro strong { color: var(--fg); }
  .rem-legend { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 10px; font-size: 11.5px; color: var(--fg-faint); font-family: var(--mono); }
  .rem-legend span b { color: var(--fg-dim); margin-right: 4px; font-family: var(--sans); font-weight: 600; }
  .rem-group { background: var(--bg-elev); border: 1px solid var(--border); border-radius: 8px; padding: 16px 20px 18px; margin-bottom: 16px; }
  .rem-group h2 { margin: 0 0 4px; font-size: 16px; font-weight: 600; }
  .rem-group .group-summary { color: var(--fg-dim); font-size: 13px; margin: 4px 0 14px; line-height: 1.5; }
  .rem-item { background: var(--bg-elev-2); border: 1px solid var(--border); border-left-width: 3px; border-radius: 6px; padding: 12px 14px; margin: 8px 0; }
  .rem-item.p0 { border-left-color: var(--fail); }
  .rem-item.p1 { border-left-color: var(--skip); }
  .rem-item.p2 { border-left-color: var(--accent); }
  .rem-item.p3 { border-left-color: var(--fg-faint); }
  .rem-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
  .rem-head .rem-title { font-size: 14px; font-weight: 600; color: var(--fg); }
  .rem-prio { font-family: var(--mono); font-size: 10.5px; padding: 2px 7px; border-radius: 3px; text-transform: uppercase; letter-spacing: 0.05em; }
  .rem-prio.p0 { background: rgba(248,113,113,0.15); color: var(--fail); }
  .rem-prio.p1 { background: rgba(251,191,36,0.12); color: var(--skip); }
  .rem-prio.p2 { background: rgba(122,162,247,0.12); color: var(--accent); }
  .rem-prio.p3 { background: var(--bg-elev-3); color: var(--fg-faint); }
  .rem-eff { font-family: var(--mono); font-size: 10.5px; padding: 2px 7px; border-radius: 3px; background: var(--bg-elev-3); color: var(--fg-dim); }
  .rem-owner { font-family: var(--mono); font-size: 11px; color: var(--fg-faint); margin-left: auto; }
  .rem-field { margin-top: 6px; font-size: 13px; line-height: 1.5; }
  .rem-field .label { color: var(--fg-faint); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.07em; display: inline-block; min-width: 80px; margin-right: 6px; }
  .rem-field .body { color: var(--fg-dim); }
  .rem-field .body code { background: var(--code-bg); border: 1px solid var(--border); border-radius: 3px; padding: 1px 5px; font-size: 12px; color: var(--fg); }
  .rem-files { margin-top: 6px; display: flex; gap: 6px; flex-wrap: wrap; }
  .rem-files .f { font-family: var(--mono); font-size: 11px; padding: 2px 7px; border-radius: 3px; background: var(--code-bg); border: 1px solid var(--border); color: var(--fg-dim); }

  /* Issues list (left pane) */
  section.list { background: var(--bg-elev); border-right: 1px solid var(--border); overflow-y: auto; display: flex; flex-direction: column; }
  section.list .filters { padding: 12px 14px 10px; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--bg-elev); z-index: 1; }
  section.list .search { width: 100%; background: var(--bg-elev-2); border: 1px solid var(--border); color: var(--fg); padding: 6px 10px; border-radius: 5px; font-size: 13px; outline: none; }
  section.list .search:focus { border-color: var(--accent); }
  section.list .chips { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 8px; }
  .chip { font-size: 11px; padding: 3px 8px; border: 1px solid var(--border); border-radius: 999px; color: var(--fg-dim); background: transparent; }
  .chip:hover { color: var(--fg); border-color: var(--border-strong); }
  .chip.active { color: var(--fg); background: var(--bg-elev-3); border-color: var(--border-strong); }
  .chip .n { color: var(--fg-faint); margin-left: 4px; font-family: var(--mono); font-size: 10px; }

  ul.items { list-style: none; padding: 0; margin: 0; flex: 1; min-height: 0; }
  li.item { padding: 10px 14px; border-bottom: 1px solid var(--border); cursor: pointer; display: grid; grid-template-columns: 14px 1fr auto; gap: 10px; align-items: start; }
  li.item:hover { background: var(--bg-elev-2); }
  li.item.active { background: var(--bg-elev-3); border-left: 3px solid var(--accent); padding-left: 11px; }
  li.item .dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; }
  li.item .dot.fail, li.item .dot.error { background: var(--fail); }
  li.item .dot.error { background: var(--error); }
  li.item .dot.improvement { background: var(--improvement); }
  li.item .dot.divergence { background: var(--divergence); }
  li.item .title { font-size: 13px; color: var(--fg); margin: 0; font-weight: 500; line-height: 1.35; }
  li.item .meta { font-size: 11px; color: var(--fg-faint); margin-top: 3px; font-family: var(--mono); }
  li.item .meta .slice-tag { color: var(--accent); }
  li.item .kind-tag { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.06em; padding: 2px 6px; border-radius: 3px; font-family: var(--mono); align-self: start; margin-top: 1px; }
  .kind-fail { background: rgba(248,113,113,0.12); color: var(--fail); }
  .kind-error { background: rgba(244,114,182,0.14); color: var(--error); }
  .kind-improvement { background: rgba(122,162,247,0.12); color: var(--improvement); }
  .kind-divergence { background: rgba(196,168,255,0.12); color: var(--divergence); }

  /* Detail pane */
  section.detail { overflow-y: auto; background: var(--bg); padding: 0; }
  .empty-state { padding: 80px 40px; text-align: center; color: var(--fg-faint); }
  .empty-state h2 { color: var(--fg-dim); font-weight: 500; margin: 0 0 8px; }
  .detail-inner { padding: 22px 32px 60px; max-width: 1100px; }
  .detail-nav { display: flex; align-items: center; justify-content: space-between; padding: 10px 32px; border-bottom: 1px solid var(--border); background: var(--bg-elev); position: sticky; top: 0; z-index: 2; }
  .detail-nav .left { display: flex; gap: 8px; align-items: center; }
  .nav-btn { padding: 6px 12px; border: 1px solid var(--border); border-radius: 5px; font-size: 12px; color: var(--fg-dim); display: inline-flex; gap: 6px; align-items: center; background: var(--bg-elev-2); }
  .nav-btn:hover:not(:disabled) { color: var(--fg); border-color: var(--border-strong); background: var(--bg-elev-3); }
  .nav-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .nav-btn .arrow { font-family: var(--mono); }
  .detail-nav .pos { font-size: 12px; color: var(--fg-faint); font-family: var(--mono); }
  .detail-nav .hint { font-size: 11px; color: var(--fg-faint); }
  .detail-nav .hint kbd { margin: 0 2px; }

  .detail h2.title { margin: 0 0 8px; font-size: 19px; font-weight: 600; letter-spacing: -0.005em; }
  .detail .badges { display: flex; gap: 6px; flex-wrap: wrap; margin: 0 0 16px; }
  .badge { display: inline-flex; align-items: center; padding: 3px 9px; border-radius: 999px; font-size: 11px; font-family: var(--mono); text-transform: uppercase; letter-spacing: 0.05em; border: 1px solid transparent; }
  .badge-fail { background: rgba(248,113,113,0.12); color: var(--fail); border-color: rgba(248,113,113,0.35); }
  .badge-error { background: rgba(244,114,182,0.14); color: var(--error); border-color: rgba(244,114,182,0.35); }
  .badge-improvement { background: rgba(122,162,247,0.12); color: var(--improvement); border-color: rgba(122,162,247,0.35); }
  .badge-divergence { background: rgba(196,168,255,0.12); color: var(--divergence); border-color: rgba(196,168,255,0.35); }
  .badge-sev-high { background: rgba(248,113,113,0.10); color: var(--fail); border-color: rgba(248,113,113,0.25); }
  .badge-sev-medium { background: rgba(251,191,36,0.10); color: var(--skip); border-color: rgba(251,191,36,0.28); }
  .badge-sev-low { background: rgba(122,162,247,0.08); color: var(--accent); border-color: rgba(122,162,247,0.22); }
  .badge-phase { background: var(--bg-elev-2); color: var(--fg-dim); border-color: var(--border); }
  .badge-slice { background: var(--bg-elev-2); color: var(--accent); border-color: var(--border); }

  .field { margin-top: 16px; }
  .field .k { color: var(--fg-faint); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; }
  .field .v { color: var(--fg); font-size: 13.5px; }
  .field pre.code { background: var(--code-bg); border: 1px solid var(--border); border-radius: 6px; padding: 10px 12px; font-size: 12.5px; overflow-x: auto; max-height: 380px; }
  .field code.inline { background: var(--code-bg); border: 1px solid var(--border); border-radius: 3px; padding: 1px 6px; font-size: 12px; }

  /* Slices tab */
  section.slices-view { padding: 20px 24px 60px; overflow-y: auto; }
  .grid-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(310px, 1fr)); gap: 12px; }
  .slice-card { background: var(--bg-elev); border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; cursor: pointer; transition: border-color 80ms; }
  .slice-card:hover { border-color: var(--border-strong); }
  .slice-card.has-fail { border-left: 3px solid var(--fail); }
  .slice-card.has-error { border-left: 3px solid var(--error); }
  .slice-card.all-pass { border-left: 3px solid var(--pass); }
  .slice-card h3 { margin: 0 0 4px; font-size: 14px; font-weight: 600; display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .slice-card .phase-tag { font-size: 10px; color: var(--fg-faint); font-family: var(--mono); text-transform: uppercase; letter-spacing: 0.05em; }
  .slice-card .scope { color: var(--fg-dim); font-size: 12px; margin: 6px 0 10px; min-height: 32px; }
  .slice-card .file { color: var(--fg-faint); font-family: var(--mono); font-size: 10.5px; }
  .slice-card .nums { display: flex; gap: 8px; margin: 10px 0 4px; flex-wrap: wrap; }
  .slice-card .num { font-family: var(--mono); font-size: 11px; color: var(--fg-dim); }
  .slice-card .num.p { color: var(--pass); }
  .slice-card .num.f { color: var(--fail); }
  .slice-card .num.s { color: var(--skip); }
  .slice-card .num.e { color: var(--error); }
  .slice-card .barwrap { background: var(--bg-elev-2); height: 5px; border-radius: 3px; overflow: hidden; display: flex; }
  .slice-card .bar-p { background: var(--pass); }
  .slice-card .bar-f { background: var(--fail); }
  .slice-card .bar-s { background: var(--skip); }
  .slice-card .bar-e { background: var(--error); }

  /* Tests tab */
  section.tests-view { padding: 20px 24px 60px; overflow-y: auto; }
  table.all-tests { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  table.all-tests th { color: var(--fg-faint); font-size: 11px; text-transform: uppercase; letter-spacing: 0.07em; padding: 8px 10px; text-align: left; font-weight: 500; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--bg); }
  table.all-tests td { padding: 6px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
  table.all-tests tr:hover td { background: var(--bg-elev); }
  table.all-tests .t-id { font-family: var(--mono); color: var(--fg-dim); white-space: nowrap; max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
  table.all-tests .t-slice { color: var(--accent); white-space: nowrap; }
  table.all-tests .badge { font-size: 10px; padding: 2px 7px; }
  .badge-pass { background: rgba(74,222,128,0.10); color: var(--pass); border-color: rgba(74,222,128,0.25); }
  .badge-skip { background: rgba(251,191,36,0.10); color: var(--skip); border-color: rgba(251,191,36,0.25); }

  .pill-row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }

  @media (max-width: 900px) {
    main.body[data-tab="issues"] { grid-template-columns: 1fr; grid-template-rows: 40vh 1fr; }
    section.list { border-right: none; border-bottom: 1px solid var(--border); }
  }
</style>
</head>
<body>

<header class="top">
  <div class="row">
    <div>
      <h1>PI Agent — Comprehensive Test Report</h1>
      <div class="env">generated <span id="gen-ts"></span> · pi <span id="pi-ver"></span> · node <span id="node-ver"></span> · <span id="platform"></span></div>
    </div>
    <div class="stats">
      <span class="stat-pill"><span class="label">Total</span><span class="val" id="s-total"></span></span>
      <span class="stat-pill pass"><span class="label">Pass</span><span class="val" id="s-pass"></span></span>
      <span class="stat-pill fail"><span class="label">Fail</span><span class="val" id="s-fail"></span></span>
      <span class="stat-pill skip"><span class="label">Skip</span><span class="val" id="s-skip"></span></span>
      <span class="stat-pill error"><span class="label">Error</span><span class="val" id="s-error"></span></span>
      <span class="stat-pill"><span class="label">Slices</span><span class="val" id="s-slices"></span></span>
    </div>
  </div>
  <nav class="tabs" role="tablist">
    <button data-tab="issues" class="active" type="button">Issues<span class="count" id="t-issues"></span></button>
    <button data-tab="slices" type="button">Slices<span class="count" id="t-slices"></span></button>
    <button data-tab="tests" type="button">All tests<span class="count" id="t-tests"></span></button>
    <button data-tab="remediation" type="button">Remediation<span class="count" id="t-rem"></span></button>
  </nav>
</header>

<main class="body" data-tab="issues">
  <section class="list" id="issues-list">
    <div class="filters">
      <input class="search" id="search" placeholder="Search issues..." autocomplete="off">
      <div class="chips" id="chips"></div>
    </div>
    <ul class="items" id="items"></ul>
  </section>

  <section class="detail" id="detail">
    <div class="detail-nav">
      <div class="left">
        <button class="nav-btn" id="prev" type="button" title="Previous (←/k)"><span class="arrow">&larr;</span> Prev</button>
        <button class="nav-btn" id="next" type="button" title="Next (→/j)">Next <span class="arrow">&rarr;</span></button>
        <span class="pos" id="pos"></span>
      </div>
      <div class="hint">Navigate: <kbd>&larr;</kbd> <kbd>&rarr;</kbd> or <kbd>j</kbd> <kbd>k</kbd></div>
    </div>
    <div id="detail-body"></div>
  </section>

  <section class="slices-view" id="slices-view" hidden>
    <div class="grid-cards" id="slice-cards"></div>
  </section>

  <section class="remediation-view" id="remediation-view" hidden>
    <div class="rem-intro">
      <strong>Remediation plan.</strong> Concrete actions synthesized from the failures, improvements, and divergences observed across all test slices. Items are grouped by area and prioritized P0 (ship-blocker) through P3 (nice to have). Effort is a rough size estimate: XS, S, M, L.
      <div class="rem-legend">
        <span><b>P0</b>blocker / unusable</span>
        <span><b>P1</b>should fix soon</span>
        <span><b>P2</b>quality / DX</span>
        <span><b>P3</b>polish</span>
        <span><b>XS</b>&lt;30 min</span>
        <span><b>S</b>under a day</span>
        <span><b>M</b>1-3 days</span>
        <span><b>L</b>&gt; a week</span>
      </div>
    </div>
    <div id="remediation-body"></div>
  </section>
  <section class="tests-view" id="tests-view" hidden>
    <div class="pill-row">
      <input class="search" id="tests-search" style="max-width: 360px" placeholder="Filter tests by name, command, id...">
      <span class="chip" data-test-status="all">All <span class="n" id="ts-all"></span></span>
      <span class="chip" data-test-status="pass">Pass <span class="n" id="ts-pass"></span></span>
      <span class="chip" data-test-status="fail">Fail <span class="n" id="ts-fail"></span></span>
      <span class="chip" data-test-status="skip">Skip <span class="n" id="ts-skip"></span></span>
      <span class="chip" data-test-status="error">Error <span class="n" id="ts-error"></span></span>
    </div>
    <table class="all-tests">
      <thead><tr><th>ID</th><th>Name</th><th>Status</th><th>Slice</th><th>Command</th><th>Notes</th></tr></thead>
      <tbody id="tests-body"></tbody>
    </table>
  </section>
</main>

<script>
const DATA = ${JSON.stringify(data)};

const state = {
  tab: "issues",
  filter: "all",
  search: "",
  activeIndex: 0,
  filteredIssues: [],
  testStatusFilter: "all",
  testSearch: "",
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function init() {
  $("#gen-ts").textContent = new Date(DATA.generated).toLocaleString();
  $("#pi-ver").textContent = DATA.env.pi_version || "?";
  $("#node-ver").textContent = DATA.env.node_version || "?";
  $("#platform").textContent = DATA.env.platform || "?";
  $("#s-total").textContent = DATA.agg.total;
  $("#s-pass").textContent = DATA.agg.pass;
  $("#s-fail").textContent = DATA.agg.fail;
  $("#s-skip").textContent = DATA.agg.skip;
  $("#s-error").textContent = DATA.agg.error;
  $("#s-slices").textContent = DATA.slices.length;
  $("#t-issues").textContent = "(" + DATA.issues.length + ")";
  $("#t-slices").textContent = "(" + DATA.slices.length + ")";
  $("#t-tests").textContent = "(" + DATA.allTests.length + ")";
  $("#t-rem").textContent = "(" + DATA.remediationCount + ")";

  renderChips();
  renderItems();
  if (state.filteredIssues.length) selectIndex(0);

  $$("nav.tabs button").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.tab)));
  $("#prev").addEventListener("click", () => selectIndex(state.activeIndex - 1));
  $("#next").addEventListener("click", () => selectIndex(state.activeIndex + 1));
  $("#search").addEventListener("input", (e) => { state.search = e.target.value.toLowerCase(); renderItems(); });
  $("#tests-search").addEventListener("input", (e) => { state.testSearch = e.target.value.toLowerCase(); renderTests(); });
  $$("[data-test-status]").forEach(el => el.addEventListener("click", () => {
    state.testStatusFilter = el.dataset.testStatus;
    $$("[data-test-status]").forEach(x => x.classList.toggle("active", x.dataset.testStatus === state.testStatusFilter));
    renderTests();
  }));
  document.addEventListener("keydown", onKey);

  renderSlices();
  renderTests();
  renderRemediation();
  applyHash();
  window.addEventListener("hashchange", applyHash);
}

function applyHash() {
  const h = window.location.hash.replace(/^#/, "");
  if (h.startsWith("issue-")) {
    const n = parseInt(h.slice("issue-".length), 10);
    if (!Number.isNaN(n) && n >= 0 && n < state.filteredIssues.length) {
      selectIndex(n, false);
    }
  } else if (h.startsWith("tab-")) {
    switchTab(h.slice("tab-".length));
  }
}

function switchTab(tab) {
  state.tab = tab;
  $("main.body").dataset.tab = tab;
  $$("nav.tabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  $("#issues-list").hidden = tab !== "issues";
  $("#detail").hidden = tab !== "issues";
  $("#slices-view").hidden = tab !== "slices";
  $("#tests-view").hidden = tab !== "tests";
  $("#remediation-view").hidden = tab !== "remediation";
}

function renderRemediation() {
  const html = (DATA.remediations || []).map(g => {
    const items = (g.items || []).map(it => {
      const prioClass = (it.priority || "p3").toLowerCase();
      const filesHtml = (it.files || []).map(f => \`<span class="f">\${esc(f)}</span>\`).join("");
      return \`<div class="rem-item \${prioClass}" id="rem-\${esc(it.id || "")}">
        <div class="rem-head">
          <span class="rem-prio \${prioClass}">\${esc(it.priority || "")}</span>
          <span class="rem-eff">\${esc(it.effort || "")}</span>
          <span class="rem-title">\${esc(it.title)}</span>
          \${it.owner_hint ? '<span class="rem-owner">' + esc(it.owner_hint) + '</span>' : ''}
        </div>
        \${it.rationale ? '<div class="rem-field"><span class="label">Why</span><span class="body">' + esc(it.rationale) + '</span></div>' : ''}
        \${it.action ? '<div class="rem-field"><span class="label">Action</span><span class="body">' + esc(it.action) + '</span></div>' : ''}
        \${filesHtml ? '<div class="rem-files">' + filesHtml + '</div>' : ''}
      </div>\`;
    }).join("");
    return \`<section class="rem-group" id="rem-group-\${esc(g.id || "")}">
      <h2>\${esc(g.title)}</h2>
      \${g.summary ? '<div class="group-summary">' + esc(g.summary) + '</div>' : ''}
      \${items}
    </section>\`;
  }).join("");
  $("#remediation-body").innerHTML = html || \`<div class="empty-state"><h2>No remediations</h2><p>The remediations.json file is empty.</p></div>\`;
}

function chipCounts() {
  const c = { all: DATA.issues.length, fail: 0, error: 0, improvement: 0, divergence: 0, p1: 0, p2: 0 };
  for (const i of DATA.issues) {
    if (i.status === "fail") c.fail++;
    if (i.status === "error") c.error++;
    if (i.kind === "improvement") c.improvement++;
    if (i.kind === "divergence") c.divergence++;
    if (i.phase === 1) c.p1++; if (i.phase === 2) c.p2++;
  }
  return c;
}

function renderChips() {
  const c = chipCounts();
  const chips = [
    { key: "all", label: "All", n: c.all },
    { key: "fail", label: "Fail", n: c.fail },
    { key: "error", label: "Error", n: c.error },
    { key: "improvement", label: "Improve", n: c.improvement },
    { key: "divergence", label: "Divergence", n: c.divergence },
    { key: "phase1", label: "Phase 1", n: c.p1 },
    { key: "phase2", label: "Phase 2", n: c.p2 },
  ];
  $("#chips").innerHTML = chips.map(ch =>
    \`<span class="chip\${state.filter === ch.key ? " active" : ""}" data-filter="\${ch.key}">\${ch.label}<span class="n">\${ch.n}</span></span>\`
  ).join("");
  $$("#chips .chip").forEach(el => el.addEventListener("click", () => {
    state.filter = el.dataset.filter;
    renderChips();
    renderItems();
    if (state.filteredIssues.length) selectIndex(0);
  }));
}

function passesFilter(it) {
  if (state.filter === "all") return true;
  if (state.filter === "fail") return it.status === "fail";
  if (state.filter === "error") return it.status === "error";
  if (state.filter === "improvement") return it.kind === "improvement";
  if (state.filter === "divergence") return it.kind === "divergence";
  if (state.filter === "phase1") return it.phase === 1;
  if (state.filter === "phase2") return it.phase === 2;
  return true;
}

function passesSearch(it) {
  if (!state.search) return true;
  const hay = (it.title + " " + (it.slice || "") + " " + (it.description || "") + " " + (it.notes || "") + " " + (it.command || "") + " " + (it.expected || "") + " " + (it.observed || "")).toLowerCase();
  return hay.includes(state.search);
}

function renderItems() {
  state.filteredIssues = DATA.issues.filter(i => passesFilter(i) && passesSearch(i));
  const html = state.filteredIssues.map((it, idx) => {
    const cls = it.kind === "test" ? (it.status === "error" ? "error" : "fail") : it.kind;
    const tagText = it.kind === "test" ? it.status.toUpperCase() : it.kind.toUpperCase();
    return \`<li class="item\${idx === state.activeIndex ? " active" : ""}" data-idx="\${idx}">
      <span class="dot \${cls}"></span>
      <div>
        <p class="title">\${esc(it.title)}</p>
        <div class="meta"><span class="slice-tag">\${esc(it.slice)}</span> · phase \${it.phase}\${it.severity ? " · " + it.severity : ""}</div>
      </div>
      <span class="kind-tag kind-\${cls}">\${tagText}</span>
    </li>\`;
  }).join("");
  const itemsEl = $("#items");
  itemsEl.innerHTML = html || \`<li class="item"><div><p class="title" style="color: var(--fg-faint)">No issues match the current filter.</p></div></li>\`;
  $$("#items li.item[data-idx]").forEach(el => el.addEventListener("click", () => selectIndex(parseInt(el.dataset.idx, 10))));
}

function selectIndex(idx, updateHash = true) {
  if (!state.filteredIssues.length) {
    $("#detail-body").innerHTML = \`<div class="empty-state"><h2>No issues</h2><p>Adjust filters above to see results.</p></div>\`;
    $("#pos").textContent = "";
    $("#prev").disabled = true;
    $("#next").disabled = true;
    return;
  }
  idx = Math.max(0, Math.min(state.filteredIssues.length - 1, idx));
  state.activeIndex = idx;
  $$("#items li.item[data-idx]").forEach(el => el.classList.toggle("active", parseInt(el.dataset.idx, 10) === idx));
  const it = state.filteredIssues[idx];
  $("#prev").disabled = idx <= 0;
  $("#next").disabled = idx >= state.filteredIssues.length - 1;
  $("#pos").textContent = \`\${idx + 1} of \${state.filteredIssues.length}\`;
  renderDetail(it);
  // scroll item into view
  const activeEl = document.querySelector(\`#items li.item[data-idx="\${idx}"]\`);
  if (activeEl) activeEl.scrollIntoView({ block: "nearest" });
  if (updateHash) {
    history.replaceState(null, "", "#issue-" + idx);
  }
}

function renderDetail(it) {
  const sevBadge = it.severity ? \`<span class="badge badge-sev-\${esc(it.severity)}">sev: \${esc(it.severity)}</span>\` : "";
  const kindClass = it.kind === "test" ? (it.status === "error" ? "error" : "fail") : it.kind;
  const kindLabel = it.kind === "test" ? it.status : it.kind;
  const parts = [
    \`<div class="detail-inner">
       <h2 class="title">\${esc(it.title)}</h2>
       <div class="badges">
         <span class="badge badge-\${kindClass}">\${esc(kindLabel)}</span>
         \${sevBadge}
         <span class="badge badge-phase">phase \${it.phase}</span>
         <span class="badge badge-slice">\${esc(it.slice)}</span>
       </div>\`,
  ];
  if (it.kind === "test") {
    if (it.id) parts.push(\`<div class="field"><div class="k">Test ID</div><div class="v"><code class="inline">\${esc(it.id)}</code></div></div>\`);
    if (it.command) parts.push(\`<div class="field"><div class="k">Command</div><pre class="code">\${esc(it.command)}</pre></div>\`);
    if (it.evidence) parts.push(\`<div class="field"><div class="k">Evidence</div><pre class="code">\${esc(it.evidence)}</pre></div>\`);
    if (it.notes) parts.push(\`<div class="field"><div class="k">Notes</div><div class="v">\${esc(it.notes)}</div></div>\`);
    if (it.duration_ms != null) parts.push(\`<div class="field"><div class="k">Duration</div><div class="v"><code class="inline">\${esc(it.duration_ms)} ms</code></div></div>\`);
  } else if (it.kind === "improvement") {
    if (it.description) parts.push(\`<div class="field"><div class="k">Description</div><div class="v">\${esc(it.description)}</div></div>\`);
  } else if (it.kind === "divergence") {
    if (it.expected) parts.push(\`<div class="field"><div class="k">Expected</div><pre class="code">\${esc(it.expected)}</pre></div>\`);
    if (it.observed) parts.push(\`<div class="field"><div class="k">Observed</div><pre class="code">\${esc(it.observed)}</pre></div>\`);
    if (it.impact) parts.push(\`<div class="field"><div class="k">Impact</div><div class="v">\${esc(it.impact)}</div></div>\`);
  }
  parts.push(\`<div class="field"><div class="k">Source file</div><div class="v"><code class="inline">tests/comprehensive/results/\${esc(it.sliceFile)}</code></div></div>\`);
  parts.push(\`</div>\`);
  $("#detail-body").innerHTML = parts.join("");
  $("#detail").scrollTop = 0;
}

function renderSlices() {
  const html = DATA.slices.map((s, i) => {
    const cls = s.error > 0 ? "has-error" : s.fail > 0 ? "has-fail" : "all-pass";
    const tot = Math.max(1, s.total);
    const methodColors = { live: "var(--pass)", "tests-ran": "var(--pass)", mixed: "var(--skip)", static: "var(--fg-faint)", unknown: "var(--fg-faint)" };
    const methodLabel = s.method === "tests-ran" ? "tests" : s.method;
    return \`<div class="slice-card \${cls}" data-slice-idx="\${i}">
      <h3><span>\${esc(s.category_name)}</span><span class="phase-tag">phase \${s.phase} · <span style="color: \${methodColors[s.method] || "var(--fg-faint)"}">\${esc(methodLabel)}</span></span></h3>
      <div class="scope">\${esc(s.scope || "")}</div>
      <div class="file">\${esc(s.file)} · \${esc(s.tested_by)}</div>
      <div class="nums">
        <span class="num p">\${s.pass} pass</span>
        <span class="num f">\${s.fail} fail</span>
        <span class="num s">\${s.skip} skip</span>
        <span class="num e">\${s.error} err</span>
        <span class="num">\${s.total} total</span>
        \${s.improvements ? '<span class="num">' + s.improvements + ' imp</span>' : ''}
        \${s.divergences ? '<span class="num">' + s.divergences + ' div</span>' : ''}
      </div>
      <div class="barwrap">
        <span class="bar-p" style="width: \${(s.pass / tot * 100).toFixed(2)}%"></span>
        <span class="bar-f" style="width: \${(s.fail / tot * 100).toFixed(2)}%"></span>
        <span class="bar-s" style="width: \${(s.skip / tot * 100).toFixed(2)}%"></span>
        <span class="bar-e" style="width: \${(s.error / tot * 100).toFixed(2)}%"></span>
      </div>
    </div>\`;
  }).join("");
  $("#slice-cards").innerHTML = html;
  $$("#slice-cards .slice-card[data-slice-idx]").forEach(el => el.addEventListener("click", () => {
    const i = parseInt(el.dataset.slice_idx || el.getAttribute("data-slice-idx"), 10);
    const sliceFile = DATA.slices[i].file;
    state.filter = "all";
    state.search = "";
    $("#search").value = "";
    renderChips();
    state.filteredIssues = DATA.issues.filter(x => x.sliceFile === sliceFile);
    // override: render this set directly
    const html = state.filteredIssues.map((it, idx) => {
      const cls = it.kind === "test" ? (it.status === "error" ? "error" : "fail") : it.kind;
      const tagText = it.kind === "test" ? it.status.toUpperCase() : it.kind.toUpperCase();
      return \`<li class="item\${idx === 0 ? " active" : ""}" data-idx="\${idx}">
        <span class="dot \${cls}"></span>
        <div><p class="title">\${esc(it.title)}</p><div class="meta"><span class="slice-tag">\${esc(it.slice)}</span> · phase \${it.phase}</div></div>
        <span class="kind-tag kind-\${cls}">\${tagText}</span>
      </li>\`;
    }).join("") || \`<li class="item"><div><p class="title" style="color: var(--fg-faint)">No issues in this slice.</p></div></li>\`;
    $("#items").innerHTML = html;
    $$("#items li.item[data-idx]").forEach(el => el.addEventListener("click", () => selectIndex(parseInt(el.dataset.idx, 10))));
    switchTab("issues");
    state.activeIndex = 0;
    if (state.filteredIssues.length) selectIndex(0);
  }));
}

function renderTests() {
  const filtered = DATA.allTests.filter(t => {
    if (state.testStatusFilter !== "all" && t.status !== state.testStatusFilter) return false;
    if (!state.testSearch) return true;
    const h = (t.id + " " + t.name + " " + (t.command || "") + " " + t.slice + " " + (t.notes || "")).toLowerCase();
    return h.includes(state.testSearch);
  });
  $("#ts-all").textContent = DATA.allTests.length;
  $("#ts-pass").textContent = DATA.allTests.filter(t => t.status === "pass").length;
  $("#ts-fail").textContent = DATA.allTests.filter(t => t.status === "fail").length;
  $("#ts-skip").textContent = DATA.allTests.filter(t => t.status === "skip").length;
  $("#ts-error").textContent = DATA.allTests.filter(t => t.status === "error").length;
  $("#tests-body").innerHTML = filtered.slice(0, 600).map(t => \`<tr>
    <td class="t-id" title="\${esc(t.id)}">\${esc(t.id)}</td>
    <td>\${esc(t.name)}</td>
    <td><span class="badge badge-\${esc(t.status)}">\${esc(t.status)}</span></td>
    <td class="t-slice">\${esc(t.slice)}</td>
    <td><code class="inline" style="font-size: 11px">\${esc((t.command || "").slice(0, 90))}</code></td>
    <td style="color: var(--fg-dim); max-width: 280px">\${esc((t.notes || "").slice(0, 160))}</td>
  </tr>\`).join("");
  if (filtered.length > 600) {
    $("#tests-body").innerHTML += \`<tr><td colspan="6" style="color: var(--fg-faint); padding: 12px; text-align: center">Showing first 600 of \${filtered.length}. Refine search to narrow.</td></tr>\`;
  }
}

function onKey(e) {
  if (e.target.tagName === "INPUT") return;
  if (state.tab !== "issues") return;
  if (e.key === "ArrowLeft" || e.key === "k" || e.key === "K") { e.preventDefault(); selectIndex(state.activeIndex - 1); }
  else if (e.key === "ArrowRight" || e.key === "j" || e.key === "J") { e.preventDefault(); selectIndex(state.activeIndex + 1); }
  else if (e.key === "1") switchTab("issues");
  else if (e.key === "2") switchTab("slices");
  else if (e.key === "3") switchTab("tests");
  else if (e.key === "4") switchTab("remediation");
}

init();
</script>
</body>
</html>
`;
}

const results = loadResults();
const html = buildHtml(results);
writeFileSync(OUT_HTML, html, "utf8");
const agg = totals(results);
const issues = buildIssueList(results);
console.log(
  `Wrote ${OUT_HTML} — slices=${results.length} total=${agg.total} pass=${agg.pass} fail=${agg.fail} skip=${agg.skip} error=${agg.error} issues=${issues.length}`
);
