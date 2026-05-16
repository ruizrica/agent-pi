# Extensions Analysis Report

Generated: 2026-04-23T19:31:15.438Z

## Summary

- Entry files: 55
- Viewer/report-related files: 40
- Test files under extensions/__tests__: 106

## Entry Files

| File | Category | Matching tests |
| --- | --- | --- |
| `extensions/agent-banner.ts` | agent/orchestration | — |
| `extensions/agent-chain.ts` | agent/orchestration | — |
| `extensions/agent-nav.ts` | agent/orchestration | — |
| `extensions/agent-team.ts` | agent/orchestration | extensions/__tests__/agent-team-commander.test.ts<br>extensions/__tests__/agent-team-reset.test.ts |
| `extensions/board-viewer.ts` | viewer/report | — |
| `extensions/claude-advisor.ts` | general | extensions/__tests__/claude-advisor-extension.test.ts<br>extensions/__tests__/claude-advisor.test.ts |
| `extensions/cleanup-viewer.ts` | viewer/report | — |
| `extensions/commander-mcp.ts` | general | extensions/__tests__/commander-mcp.test.ts |
| `extensions/commander-tracker.ts` | general | extensions/__tests__/commander-tracker-ext.test.ts<br>extensions/__tests__/commander-tracker.test.ts |
| `extensions/completion-report.ts` | viewer/report | extensions/__tests__/completion-report-html.test.ts |
| `extensions/complex-problem-loop.ts` | general | — |
| `extensions/debug-capture.ts` | general | — |
| `extensions/dream-scheduler.ts` | general | extensions/__tests__/dream-scheduler.test.ts |
| `extensions/escape-cancel.ts` | general | extensions/__tests__/escape-cancel.test.ts |
| `extensions/file-viewer.ts` | viewer/report | extensions/__tests__/file-viewer-html.test.ts<br>extensions/__tests__/file-viewer.test.ts |
| `extensions/footer.ts` | general | extensions/__tests__/footer-auto-compaction.test.ts |
| `extensions/lean-tools.ts` | general | — |
| `extensions/learn.ts` | general | extensions/__tests__/learn.test.ts |
| `extensions/memory-cycle.ts` | general | extensions/__tests__/memory-cycle-proactive.test.ts<br>extensions/__tests__/memory-cycle.test.ts |
| `extensions/message-integrity-guard.ts` | general | — |
| `extensions/mode-cycler.ts` | general | extensions/__tests__/mode-cycler-logic.test.ts |
| `extensions/network-inspect.ts` | planning/research | extensions/__tests__/network-inspect.test.ts |
| `extensions/oauth-provider.ts` | general | extensions/__tests__/oauth-provider.test.ts |
| `extensions/obsidian-memory.ts` | general | — |
| `extensions/openrouter-routing.ts` | general | extensions/__tests__/openrouter-routing-extension.test.ts<br>extensions/__tests__/openrouter-routing-integration.test.ts<br>extensions/__tests__/openrouter-routing-models.test.ts<br>extensions/__tests__/openrouter-routing-picker.test.ts<br>extensions/__tests__/openrouter-routing-provider.test.ts<br>extensions/__tests__/openrouter-routing-state.test.ts |
| `extensions/pipeline-team.ts` | agent/orchestration | extensions/__tests__/pipeline-team-prompt.test.ts |
| `extensions/plan-viewer.ts` | viewer/report | extensions/__tests__/plan-viewer.test.ts |
| `extensions/reports-viewer.ts` | viewer/report | — |
| `extensions/research-viewer.ts` | viewer/report | — |
| `extensions/safe-port-scan.ts` | security | extensions/__tests__/safe-port-scan.test.ts |
| `extensions/secure.ts` | general | extensions/__tests__/secure-engine.test.ts<br>extensions/__tests__/secure-installer.test.ts |
| `extensions/security-guard.ts` | security | — |
| `extensions/security-news.ts` | security | extensions/__tests__/security-news.test.ts |
| `extensions/security-report.ts` | viewer/report | extensions/__tests__/security-report.test.ts |
| `extensions/send-email.ts` | general | extensions/__tests__/send-email.test.ts |
| `extensions/session-recap.ts` | general | — |
| `extensions/session-replay.ts` | general | extensions/__tests__/session-replay.test.ts |
| `extensions/sounds.ts` | general | extensions/__tests__/sounds-image-cache.test.ts<br>extensions/__tests__/sounds-image-route.test.ts<br>extensions/__tests__/sounds-viewer-html.test.ts |
| `extensions/spec-viewer.ts` | viewer/report | extensions/__tests__/spec-viewer.test.ts |
| `extensions/subagent-widget.ts` | agent/orchestration | extensions/__tests__/subagent-widget-render.test.ts |
| `extensions/summary-mode.ts` | general | extensions/__tests__/summary-mode.test.ts |
| `extensions/summary-runtime-patch.ts` | general | — |
| `extensions/system-select.ts` | general | — |
| `extensions/tasks.ts` | general | extensions/__tests__/tasks-gate.test.ts<br>extensions/__tests__/tasks-newlist-confirm.test.ts<br>extensions/__tests__/tasks-output.test.ts |
| `extensions/test-viewer.ts` | viewer/report | — |
| `extensions/theme-cycler.ts` | general | — |
| `extensions/tool-caller.ts` | general | — |
| `extensions/tool-registry.ts` | general | — |
| `extensions/tool-response-attribution.ts` | general | extensions/__tests__/tool-response-attribution.test.ts |
| `extensions/tool-search.ts` | general | — |
| `extensions/toolkit-commands.ts` | general | extensions/__tests__/toolkit-commands.test.ts |
| `extensions/user-question.ts` | general | extensions/__tests__/user-question-render.test.ts |
| `extensions/vuln-scanner.ts` | general | extensions/__tests__/vuln-scanner-engine.test.ts<br>extensions/__tests__/vuln-scanner-installer.test.ts |
| `extensions/web-chat.ts` | general | — |
| `extensions/web-test.ts` | general | — |

## Viewer and Report Surface

- `extensions/__tests__/commander-viewer.test.ts`
- `extensions/__tests__/completion-report-html.test.ts`
- `extensions/__tests__/file-viewer-html.test.ts`
- `extensions/__tests__/file-viewer.test.ts`
- `extensions/__tests__/plan-prompt.test.ts`
- `extensions/__tests__/plan-viewer.test.ts`
- `extensions/__tests__/report-index.test.ts`
- `extensions/__tests__/security-report.test.ts`
- `extensions/__tests__/sounds-viewer-html.test.ts`
- `extensions/__tests__/spec-viewer.test.ts`
- `extensions/__tests__/subagent-cleanup.test.ts`
- `extensions/__tests__/viewer-server.test.ts`
- `extensions/__tests__/viewer-session.test.ts`
- `extensions/board-viewer.ts`
- `extensions/cleanup-viewer.ts`
- `extensions/completion-report.ts`
- `extensions/file-viewer.ts`
- `extensions/lib/board-viewer-html.ts`
- `extensions/lib/cleanup-viewer-html.ts`
- `extensions/lib/commander-viewer.ts`
- `extensions/lib/completion-report-html.ts`
- `extensions/lib/file-viewer-html.ts`
- `extensions/lib/plan-viewer-html.ts`
- `extensions/lib/report-index.ts`
- `extensions/lib/reports-viewer-html.ts`
- `extensions/lib/research-viewer-html.ts`
- `extensions/lib/security-report-html.ts`
- `extensions/lib/sounds-viewer-html.ts`
- `extensions/lib/spec-viewer-html.ts`
- `extensions/lib/subagent-cleanup.ts`
- `extensions/lib/test-viewer-html.ts`
- `extensions/lib/viewer-server.ts`
- `extensions/lib/viewer-session.ts`
- `extensions/lib/viewer-standalone-export.ts`
- `extensions/plan-viewer.ts`
- `extensions/reports-viewer.ts`
- `extensions/research-viewer.ts`
- `extensions/security-report.ts`
- `extensions/spec-viewer.ts`
- `extensions/test-viewer.ts`

## Test Files

- `extensions/__tests__/advisor-strategy.test.ts`
- `extensions/__tests__/agent-resolved-model.test.ts`
- `extensions/__tests__/agent-team-commander.test.ts`
- `extensions/__tests__/agent-team-reset.test.ts`
- `extensions/__tests__/chain-widget-gate.test.ts`
- `extensions/__tests__/chain-yaml-parser.test.ts`
- `extensions/__tests__/claude-advice-format.test.ts`
- `extensions/__tests__/claude-advisor-extension.test.ts`
- `extensions/__tests__/claude-advisor.test.ts`
- `extensions/__tests__/claude-cli.test.ts`
- `extensions/__tests__/claude-context.test.ts`
- `extensions/__tests__/claude-overlay-routing.test.ts`
- `extensions/__tests__/cloud-code-bridge-auth.test.ts`
- `extensions/__tests__/cloud-code-orchestration.test.ts`
- `extensions/__tests__/cloud-code-plugin-manifest.test.ts`
- `extensions/__tests__/codex-cli.test.ts`
- `extensions/__tests__/commander-lifecycle.test.ts`
- `extensions/__tests__/commander-mcp.test.ts`
- `extensions/__tests__/commander-prompt.test.ts`
- `extensions/__tests__/commander-ready.test.ts`
- `extensions/__tests__/commander-sync.test.ts`
- `extensions/__tests__/commander-tracker-ext.test.ts`
- `extensions/__tests__/commander-tracker.test.ts`
- `extensions/__tests__/commander-viewer.test.ts`
- `extensions/__tests__/completion-report-html.test.ts`
- `extensions/__tests__/context-budget.test.ts`
- `extensions/__tests__/context-gate.test.ts`
- `extensions/__tests__/cursor-cli.test.ts`
- `extensions/__tests__/dispatch-render.test.ts`
- `extensions/__tests__/dream-scheduler.test.ts`
- `extensions/__tests__/dream-state.test.ts`
- `extensions/__tests__/droid-cli.test.ts`
- `extensions/__tests__/escape-cancel.test.ts`
- `extensions/__tests__/file-viewer-html.test.ts`
- `extensions/__tests__/file-viewer.test.ts`
- `extensions/__tests__/footer-auto-compaction.test.ts`
- `extensions/__tests__/gemini-cli.test.ts`
- `extensions/__tests__/gopher-draft-storage.test.ts`
- `extensions/__tests__/hook-ordering.test.ts`
- `extensions/__tests__/learn.test.ts`
- `extensions/__tests__/mcp-client-timeout.test.ts`
- `extensions/__tests__/mcp-client.test.ts`
- `extensions/__tests__/memory-cycle-proactive.test.ts`
- `extensions/__tests__/memory-cycle.test.ts`
- `extensions/__tests__/mermaid-normalization.test.ts`
- `extensions/__tests__/mode-cycler-logic.test.ts`
- `extensions/__tests__/mode-prompts.test.ts`
- `extensions/__tests__/models-json-openai-codex-override.test.ts`
- `extensions/__tests__/module-discovery.test.ts`
- `extensions/__tests__/network-inspect.test.ts`
- `extensions/__tests__/normal-prompt.test.ts`
- `extensions/__tests__/oauth-provider.test.ts`
- `extensions/__tests__/obsidian-integration-test.ts`
- `extensions/__tests__/opencode-cli.test.ts`
- `extensions/__tests__/openrouter-routing-extension.test.ts`
- `extensions/__tests__/openrouter-routing-integration.test.ts`
- `extensions/__tests__/openrouter-routing-models.test.ts`
- `extensions/__tests__/openrouter-routing-picker.test.ts`
- `extensions/__tests__/openrouter-routing-provider.test.ts`
- `extensions/__tests__/openrouter-routing-state.test.ts`
- `extensions/__tests__/output-box.test.ts`
- `extensions/__tests__/panel-backdrop.test.ts`
- `extensions/__tests__/pi-skill.test.ts`
- `extensions/__tests__/pipeline-team-prompt.test.ts`
- `extensions/__tests__/pipeline-yaml-parser.test.ts`
- `extensions/__tests__/plan-prompt.test.ts`
- `extensions/__tests__/plan-viewer.test.ts`
- `extensions/__tests__/report-index.test.ts`
- `extensions/__tests__/safe-port-scan.test.ts`
- `extensions/__tests__/secure-engine.test.ts`
- `extensions/__tests__/secure-installer.test.ts`
- `extensions/__tests__/security-engine.test.ts`
- `extensions/__tests__/security-history.test.ts`
- `extensions/__tests__/security-news.test.ts`
- `extensions/__tests__/security-report.test.ts`
- `extensions/__tests__/send-email.test.ts`
- `extensions/__tests__/session-replay.test.ts`
- `extensions/__tests__/sounds-image-cache.test.ts`
- `extensions/__tests__/sounds-image-route.test.ts`
- `extensions/__tests__/sounds-viewer-html.test.ts`
- `extensions/__tests__/spec-documents.test.ts`
- `extensions/__tests__/spec-prompt.test.ts`
- `extensions/__tests__/spec-scaffold.test.ts`
- `extensions/__tests__/spec-viewer.test.ts`
- `extensions/__tests__/subagent-cleanup.test.ts`
- `extensions/__tests__/subagent-lifecycle.test.ts`
- `extensions/__tests__/subagent-model-resolution.test.ts`
- `extensions/__tests__/subagent-widget-render.test.ts`
- `extensions/__tests__/summary-mode.test.ts`
- `extensions/__tests__/summary-render.test.ts`
- `extensions/__tests__/task-list-publish.test.ts`
- `extensions/__tests__/task-list-widget.test.ts`
- `extensions/__tests__/tasks-gate.test.ts`
- `extensions/__tests__/tasks-newlist-confirm.test.ts`
- `extensions/__tests__/tasks-output.test.ts`
- `extensions/__tests__/test-gen-parser.test.ts`
- `extensions/__tests__/theme-persist.test.ts`
- `extensions/__tests__/themeMap.test.ts`
- `extensions/__tests__/tool-response-attribution.test.ts`
- `extensions/__tests__/toolkit-commands.test.ts`
- `extensions/__tests__/toolkit-worker.test.ts`
- `extensions/__tests__/user-question-render.test.ts`
- `extensions/__tests__/viewer-server.test.ts`
- `extensions/__tests__/viewer-session.test.ts`
- `extensions/__tests__/vuln-scanner-engine.test.ts`
- `extensions/__tests__/vuln-scanner-installer.test.ts`

## Notes

- Entry files are identified as top-level TypeScript files directly under `extensions/`.
- Viewer/report files are identified using filename heuristics and may include helper HTML/render modules.
- Matching tests are inferred by basename similarity and may miss tests with broader or indirect naming.
