// ABOUTME: Complex problem loop session scaffolding for iterative hard-task workflows.
// ABOUTME: Creates and updates lightweight .context state artifacts without duplicating planning or subagent systems.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const StartParams = Type.Object({
  goal: Type.String({ description: "Primary objective for the complex problem session" }),
  success_criteria: Type.Optional(Type.Array(Type.String(), { description: "Observable success criteria" })),
  constraints: Type.Optional(Type.Array(Type.String(), { description: "Known constraints" })),
  session_name: Type.Optional(Type.String({ description: "Optional session slug; defaults to complex-problem-loop" })),
});

const AdvanceParams = Type.Object({
  next_slice: Type.String({ description: "The next focused execution slice" }),
  last_slice: Type.Optional(Type.String({ description: "What was just attempted or completed" })),
  current_understanding: Type.Optional(Type.Array(Type.String(), { description: "Updated facts or findings" })),
  active_hypothesis: Type.Optional(Type.String({ description: "Current best hypothesis or approach" })),
  open_questions: Type.Optional(Type.Array(Type.String(), { description: "Open questions that still matter" })),
  risks: Type.Optional(Type.Array(Type.String(), { description: "Current risks or concerns" })),
  session_name: Type.Optional(Type.String({ description: "Optional session slug; defaults to complex-problem-loop" })),
});

function ensureDir(path: string) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "complex-problem-loop";
}

function sessionPath(cwd: string, sessionName?: string, goal?: string): string {
  const sessionsDir = join(cwd, ".context", "complex-problem-sessions");
  ensureDir(sessionsDir);
  const base = sessionName?.trim() || (goal ? slugify(goal) : "complex-problem-loop");
  return join(sessionsDir, `${base}.md`);
}

function bulletLines(items?: string[]): string {
  if (!items || items.length === 0) return "- None recorded";
  return items.map((item) => `- ${item}`).join("\n");
}

function upsertSection(markdown: string, title: string, content: string): string {
  const header = `## ${title}`;
  const pattern = new RegExp(`(^## ${title}\\n)([\\s\\S]*?)(?=\\n## [^\\n]+|$)`, "m");
  if (pattern.test(markdown)) {
    return markdown.replace(pattern, `${header}\n${content.trim()}\n`);
  }
  const trimmed = markdown.trimEnd();
  return `${trimmed}\n\n${header}\n${content.trim()}\n`;
}

function initialMarkdown(goal: string, successCriteria?: string[], constraints?: string[]): string {
  return `# Complex Problem Session\n\n## Goal\n${goal}\n\n## Success Criteria\n${bulletLines(successCriteria)}\n\n## Constraints\n${bulletLines(constraints)}\n\n## Current Understanding\n- Session created\n\n## Active Hypothesis\n- Not set yet\n\n## Evidence\n| Evidence | Source |\n|----------|--------|\n| Session initialized | tool: complex_problem_loop_start |\n\n## Files in Play\n| File | Role |\n|------|------|\n| _TBD_ | Pending reconnaissance |\n\n## Open Questions\n- None recorded\n\n## Risks\n- Unknown scope until reconnaissance\n\n## Last Slice\n- None yet\n\n## Next Slice\n- Clarify unknowns and gather initial reconnaissance\n\n## Delegation Notes\n- None yet\n`;
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "complex_problem_loop_start",
    label: "Complex Problem Loop Start",
    description: "Create a .context session scaffold for a hard multi-step problem-solving loop",
    parameters: StartParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { goal, success_criteria, constraints, session_name } = params as {
        goal: string;
        success_criteria?: string[];
        constraints?: string[];
        session_name?: string;
      };
      const cwd = ctx.cwd || process.cwd();
      const filePath = sessionPath(cwd, session_name, goal);
      ensureDir(dirname(filePath));
      const content = initialMarkdown(goal, success_criteria, constraints);
      writeFileSync(filePath, content, "utf-8");
      return { content: [{ type: "text" as const, text: `Started complex problem session at ${filePath}` }] };
    },
  });

  pi.registerTool({
    name: "complex_problem_loop_advance",
    label: "Complex Problem Loop Advance",
    description: "Update the current .context session with the latest reflection and next slice",
    parameters: AdvanceParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const {
        next_slice,
        last_slice,
        current_understanding,
        active_hypothesis,
        open_questions,
        risks,
        session_name,
      } = params as {
        next_slice: string;
        last_slice?: string;
        current_understanding?: string[];
        active_hypothesis?: string;
        open_questions?: string[];
        risks?: string[];
        session_name?: string;
      };
      const cwd = ctx.cwd || process.cwd();
      const filePath = sessionPath(cwd, session_name);
      ensureDir(dirname(filePath));
      const existing = existsSync(filePath) ? readFileSync(filePath, "utf-8") : initialMarkdown("Unnamed session");
      let updated = existing;
      if (current_understanding) {
        updated = upsertSection(updated, "Current Understanding", bulletLines(current_understanding));
      }
      if (active_hypothesis) {
        updated = upsertSection(updated, "Active Hypothesis", `- ${active_hypothesis}`);
      }
      if (open_questions) {
        updated = upsertSection(updated, "Open Questions", bulletLines(open_questions));
      }
      if (risks) {
        updated = upsertSection(updated, "Risks", bulletLines(risks));
      }
      if (last_slice) {
        updated = upsertSection(updated, "Last Slice", `- ${last_slice}`);
      }
      updated = upsertSection(updated, "Next Slice", `- ${next_slice}`);
      writeFileSync(filePath, updated, "utf-8");
      return { content: [{ type: "text" as const, text: `Updated complex problem session at ${filePath}` }] };
    },
  });
}
