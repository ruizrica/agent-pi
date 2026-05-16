// ABOUTME: Scrollable session timeline replay via /replay command.
// ABOUTME: Shows conversation history with user/assistant/tool messages in a full-screen overlay.
import { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { applyExtensionDefaults } from "./lib/themeMap.ts";
import {
  Box, Text, Markdown, Container, Spacer,
  matchesKey, Key, truncateToWidth, getMarkdownTheme
} from "@earendil-works/pi-tui";
import { DynamicBorder, getMarkdownTheme as getPiMdTheme } from "@earendil-works/pi-coding-agent";
import { extractContent, buildHistoryItems } from "./lib/session-replay-helpers.ts";

function formatTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export interface HistoryItem {
    type: 'user' | 'assistant' | 'tool';
    title: string;
    content: string;
    timestamp: Date;
    elapsed?: string;
}

export class SessionReplayUI {
    private selectedIndex = 0;
    private expandedIndex: number | null = null;
    private scrollOffset = 0;
    
    constructor(
        private items: HistoryItem[],
        private onDone: () => void
    ) {
        // Start selected at the bottom (most recent)
        this.selectedIndex = Math.max(0, items.length - 1);
        this.ensureVisible(20); // rough height estimate
    }

    handleInput(data: string, tui: any): void {
        if (matchesKey(data, Key.up)) {
            this.selectedIndex = Math.max(0, this.selectedIndex - 1);
        } else if (matchesKey(data, Key.down)) {
            this.selectedIndex = Math.min(this.items.length - 1, this.selectedIndex + 1);
        } else if (matchesKey(data, Key.enter)) {
            this.expandedIndex = this.expandedIndex === this.selectedIndex ? null : this.selectedIndex;
        } else if (matchesKey(data, Key.escape)) {
            this.onDone();
            return;
        }
        tui.requestRender();
    }

    private ensureVisible(height: number) {
        // Simple scroll window logic
        const pageSize = Math.floor(height / 3); // Approx items per page
        if (this.selectedIndex < this.scrollOffset) {
            this.scrollOffset = this.selectedIndex;
        } else if (this.selectedIndex >= this.scrollOffset + pageSize) {
            this.scrollOffset = this.selectedIndex - pageSize + 1;
        }
    }

    render(width: number, height: number, theme: any): string[] {
        this.ensureVisible(height);
        
        const container = new Container();
        const mdTheme = getPiMdTheme();

        // Header
        container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
        container.addChild(new Text(`${theme.fg("accent", theme.bold(" SESSION REPLAY"))} ${theme.fg("dim", "|")} ${theme.fg("success", this.items.length.toString())} entries`, 1, 0));
        container.addChild(new Spacer(1));

        // Calculate visible range
        const visibleItems = this.items.slice(this.scrollOffset);

        visibleItems.forEach((item, idx) => {
            const absoluteIndex = idx + this.scrollOffset;
            const isSelected = absoluteIndex === this.selectedIndex;
            const isExpanded = absoluteIndex === this.expandedIndex;
            
            const cardBox = new Box(1, 0, (s) => isSelected ? theme.bg("selectedBg", s) : s);
            
            // Icon and Title
            let icon = "○";
            let color = "dim";
            if (item.type === 'user') { icon = "U"; color = "success"; }
            else if (item.type === 'assistant') { icon = "A"; color = "accent"; }
            else if (item.type === 'tool') { icon = "T"; color = "warning"; }

            const timeStr = theme.fg("success", `[${formatTime(item.timestamp)}]`);
            const elapsedStr = item.elapsed ? theme.fg("dim", ` (+${item.elapsed})`) : "";
            
            const titleLine = `${theme.fg(color, icon)} ${theme.bold(item.title)} ${timeStr}${elapsedStr}`;
            cardBox.addChild(new Text(titleLine, 0, 0));

            if (isExpanded) {
                cardBox.addChild(new Spacer(1));
                cardBox.addChild(new Markdown(item.content, 2, 0, mdTheme));
            } else {
                // Truncated preview
                const preview = item.content.replace(/\n/g, ' ').substring(0, width - 10);
                cardBox.addChild(new Text(theme.fg("dim", "  " + preview + "..."), 0, 0));
            }

            container.addChild(cardBox);
            // Don't add too many spacers if we have many items
            if (visibleItems.length < 15) container.addChild(new Spacer(1));
        });

        // Footer
        container.addChild(new Spacer(1));
        container.addChild(new Text(theme.fg("dim", " ↑/↓ Navigate • Enter Expand • Esc Close"), 1, 0));
        container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

        return container.render(width);
    }
}

export default function(pi: ExtensionAPI) {
    pi.registerCommand("replay", {
        description: "Show a scrollable timeline of the current session",
        handler: async (args, ctx) => {
            const branch = ctx.sessionManager.getBranch();
            const items: HistoryItem[] = buildHistoryItems(branch);

            if (items.length === 0) {
                ctx.ui.notify("No session history found.", "warning");
                return;
            }

            await ctx.ui.custom((tui, theme, kb, done) => {
                const component = new SessionReplayUI(items, () => done(undefined));
                return {
                    render: (w) => component.render(w, 30, theme),
                    handleInput: (data) => component.handleInput(data, tui),
                    invalidate: () => {},
                };
            }, {
                overlay: true,
                overlayOptions: { width: "80%", anchor: "center" },
            });
        },
    });

    pi.on("session_start", async (_event, ctx) => {
        applyExtensionDefaults(import.meta.url, ctx);
    });
}
