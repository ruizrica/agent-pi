// ABOUTME: Mermaid source normalization helpers shared by browser viewers and standalone exports.
// ABOUTME: Repairs a narrow set of common malformed node shorthands before Mermaid parsing.

const MALFORMED_RIGHT_SLANTED_NODE = /([A-Za-z0-9_:-]+)\[\/([^\]\n]+)\]/g;

function appendMissingClosingSlash(label: string): string {
	const trailingWhitespaceMatch = label.match(/\s*$/);
	const trailingWhitespace = trailingWhitespaceMatch ? trailingWhitespaceMatch[0] : "";
	const coreLabel = trailingWhitespace ? label.slice(0, -trailingWhitespace.length) : label;
	if (coreLabel.endsWith("/")) return label;
	return `${coreLabel}/${trailingWhitespace}`;
}

export function normalizeMermaidSource(source: string): string {
	return String(source || "").replace(MALFORMED_RIGHT_SLANTED_NODE, (match, nodeId, label) => {
		const normalizedLabel = appendMissingClosingSlash(label);
		if (normalizedLabel === label) return match;
		return `${nodeId}[/${normalizedLabel}]`;
	});
}

export function getMermaidNormalizationBrowserScript(functionName = "normalizeMermaidSource"): string {
	return `
function ${functionName}(source) {
  return String(source || '').replace(/([A-Za-z0-9_:-]+)\\[\\/([^\\]\\n]+)\\]/g, function(match, nodeId, label) {
    var trailingWhitespaceMatch = label.match(/\\s*$/);
    var trailingWhitespace = trailingWhitespaceMatch ? trailingWhitespaceMatch[0] : '';
    var coreLabel = trailingWhitespace ? label.slice(0, -trailingWhitespace.length) : label;
    if (coreLabel.endsWith('/')) return match;
    return nodeId + '[/' + coreLabel + '/' + trailingWhitespace + ']';
  });
}
`.trim();
}
