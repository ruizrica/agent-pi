// ABOUTME: Shared scrollbar CSS for generated HTML viewers and reports.
// ABOUTME: Keeps scrollbar tracks aligned with each page's background color.

/**
 * Shared scrollbar styling for generated viewer/report HTML pages.
 *
 * Every target viewer defines --bg, --border, and --text-dim in its local
 * template. The track intentionally uses --bg so browser scrollbar gutters
 * blend into the page background instead of rendering a contrasting default
 * track color.
 */
export const VIEWER_SCROLLBAR_STYLES = `
  :root {
    --scrollbar-thumb: var(--border);
    --scrollbar-thumb-hover: var(--text-dim);
  }

  * {
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb, var(--border)) var(--bg);
  }

  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  ::-webkit-scrollbar-track {
    background: var(--bg);
  }

  ::-webkit-scrollbar-corner {
    background: var(--bg);
  }

  ::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb, var(--border));
    border-radius: 999px;
    border: 2px solid var(--bg);
  }

  ::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover, var(--text-dim));
  }
`;
