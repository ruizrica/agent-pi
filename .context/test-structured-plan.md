# Plan: Overhaul AssistantChat UI — Copy specbook-v3 Styling + Add Voice Input

## Context

The Commander assistant chat view (AssistantChat.tsx, 1,777 lines) has text extending beyond the visible area due to inline styles with insufficient overflow handling. The goal is to wholesale copy the styling from specbook-v3/frontend/src/components/search/ and add push-to-talk voice input (already exists as PushToTalkWithAutoSend in AddTask/NewSpec wizards).

The current file has everything inline: markdown rendering (defined TWICE — duplicated code), message bubbles, tool indicators, and a bare textarea+send input. The specbook-v3 approach uses clean Tailwind classes, `prose prose-invert prose-sm max-w-none` for markdown, `max-w-[95%] rounded-xl` for bubbles, and a proper input footer with 44px touch-target buttons.

### Color Mapping (specbook hardcoded to Commander CSS vars)

| specbook-v3 | Commander |
|-------------|-----------|
| bg-neutral-800 | bg-[var(--bg-elevated)] |
| bg-neutral-900 | bg-[var(--bg-panel)] |
| bg-neutral-950 | bg-[var(--bg-surface)] |
| bg-blue-600 | bg-[var(--accent-primary)] |
| text-neutral-100 | text-[var(--text-primary)] |
| text-neutral-300 | text-[var(--text-secondary)] |
| text-neutral-400 | text-[var(--text-muted)] |
| text-neutral-500 | text-[var(--text-dim)] |
| border-neutral-700 | border-[var(--border-subtle)] |
| text-blue-400 (links) | text-[var(--accent-blue,#60a5fa)] |
| text-blue-300 (inline code) | text-[var(--accent-cyan,#22d3ee)] |
| ring-neutral-700/50 | ring-[var(--border-subtle)] |

---

## Phase 1: Extract AssistantMarkdownRenderer (TDD)

**Why:** Current file has TWO nearly-identical markdown component defs (~lines 707-856). Extract into dedicated component following specbook-v3's MarkdownRenderer.tsx pattern. Eliminates duplication and fixes overflow.

**Test first** → `commander-app/src/components/assistant/__tests__/AssistantMarkdownRenderer.test.tsx`
- Renders paragraphs, headings h1-h4, lists, blockquotes, links, strong/em
- Code blocks: language header bar, overflow-x-auto, ring border
- Inline code: elevated bg, cyan text
- Tables: overflow-x-auto wrapper, alternating rows
- Long unbroken strings break properly (no horizontal overflow)
- Accepts breaks prop

**New file** → `commander-app/src/components/assistant/AssistantMarkdownRenderer.tsx`
- Port specbook-v3's MarkdownRenderer.tsx structure with CSS variable mapping
- Keep Commander-specific features: HighlightedCodeBlock (line numbers + copy), SandboxedHtml, RenderedContentBlock (markdown/HTML preview toggle)
- Wrapper: `prose prose-invert prose-sm max-w-none leading-relaxed`
- Export both AssistantMarkdownRenderer and innerMarkdownComponents (for RenderedContentBlock recursion)

**Modify** → `AssistantChat.tsx`
- Remove inline markdownComponents, innerMarkdownComponents, wrapStyle, languageMap, renderedLanguages, HighlightedCodeBlock, SandboxedHtml, RenderedContentBlock (~lines 28-700)
- Import from new file

---

## Phase 2: Extract and Restyle AssistantMessageBubble (TDD)

**Why:** The inline MessageBubble function uses `maxWidth: '80%'/'90%'` with complex inline borderRadius. Specbook-v3's `max-w-[95%] rounded-xl` with proper padding is cleaner and handles overflow correctly.

**Test first** → `commander-app/src/components/assistant/__tests__/AssistantMessageBubble.test.tsx`
- User bubble: accent-primary bg, max-w-[95%], rounded-xl, px-4 py-3
- Assistant bubble: elevated bg, max-w-[95%], rounded-xl, p-5
- Assistant bubble uses AssistantMarkdownRenderer for content
- Streaming: shows "Thinking..." spinner when content empty
- Copy button in footer
- Long text breaks properly (word-break)
- role="article" and aria-label preserved

**New file** → `commander-app/src/components/assistant/AssistantMessageBubble.tsx`
- Port inline MessageBubble from AssistantChat.tsx
- Apply specbook styling with CSS var mapping
- Keep Bot avatar for assistant messages
- Also export ToolCallIndicator

**Modify** → `AssistantChat.tsx`
- Remove inline MessageBubble and ToolCallIndicator
- Import from new file

---

## Phase 3: Restyle Container + Input Area with Voice (TDD)

**Why:** Input needs voice (PushToTalkWithAutoSend already exists with iconOnly/compact modes). Container needs specbook-v3 spacing. This is the user-facing change that adds voice input.

**Test first** → `commander-app/src/components/assistant/__tests__/AssistantChatInput.test.tsx`
- Textarea: min-h-[44px], max-h-[150px], auto-resize
- PushToTalkWithAutoSend renders with iconOnly and compact
- LightningButton renders with compact
- Send button: 44px, disabled when empty, spinner when sending
- Enter sends, Shift+Enter newline
- Voice transcript populates textarea
- Auto-send sends directly when lightning is on
- ChatQuickActionToolbar visible above input

**Modify** → `AssistantChat.tsx`
- Messages container: `className="flex-1 overflow-y-auto overflow-x-hidden px-4 md:px-6 pb-4 md:pb-6 space-y-5"`
- Input area: new footer layout with flex items-end gap-2
- New state/handlers: autoSendEnabled, handleVoiceTranscript, handleAutoSend
- Add imports: PushToTalkWithAutoSend, LightningButton from ../common/PushToTalkWithAutoSend

---

## Phase 4: Integration Test + Polish

**Test first** → `commander-app/src/components/assistant/__tests__/AssistantChat.integration.test.tsx`
- Full chat renders: empty state, message list, input area
- Message bubbles have max-w-[95%] class
- Code blocks have overflow-x-auto
- Voice button present and functional
- Quick action toolbar visible

---

## Critical Files

| File | Action |
|------|--------|
| `commander-app/src/components/assistant/AssistantChat.tsx` | Modify (extract + restyle) |
| `commander-app/src/components/assistant/AssistantMarkdownRenderer.tsx` | New |
| `commander-app/src/components/assistant/AssistantMessageBubble.tsx` | New |
| `commander-app/src/components/common/PushToTalkWithAutoSend.tsx` | Read-only (reuse as-is) |
| `specbook-v3/.../MarkdownRenderer.tsx` | Reference |
| `specbook-v3/.../ChatMessage.tsx` | Reference |
| `specbook-v3/.../SemanticSearch.tsx` | Reference |

## Reusable Components (no changes needed)

- **PushToTalkWithAutoSend** — already supports iconOnly, compact, hideLightningButton
- **LightningButton** — already exported from same file, supports compact
- **TauriVoiceRecordButton** — Tauri Whisper backend (keep over specbook's Web Speech API)

## Verification

1. `./node_modules/.bin/vitest run --reporter=verbose` — all new + existing tests pass
2. Visual check: open assistant chat, send messages, verify no horizontal overflow
3. Voice: click mic button, speak, verify transcript appears in input
4. Lightning: toggle on, speak, verify auto-send
5. Code blocks: paste long code, verify horizontal scroll within block (not page)
6. Tables: render markdown table, verify horizontal scroll wrapper
