// ABOUTME: Pure cleanup classification and summarization logic.
// ABOUTME: Keeps cleanup business rules testable outside the viewer/server adapter.

import path from "node:path";

export interface ScanFile {
	path: string;
	name: string;
	size: number;
	sizeFormatted: string;
	modified: string;
	isDirectory: boolean;
}

export const PROTECTED_DIRS = new Set([
	"/System", "/Library", "/usr", "/bin", "/sbin",
	"/private/var/protected", "/private/etc", "/etc", "/cores",
]);

export const CLEANUP_CATEGORIES: Record<string, {
	label: string;
	extensions?: Set<string>;
	names?: Set<string>;
	directories?: Set<string>;
}> = {
	temp: {
		label: "Temporary Files",
		extensions: new Set([".tmp", ".temp", ".swp", ".swo", ".bak", ".old", ".log"]),
		names: new Set([".DS_Store", "Thumbs.db", "desktop.ini"]),
	},
	compiled: {
		label: "Compiled / Build Artifacts",
		extensions: new Set([".o", ".obj", ".pyc", ".pyo", ".class", ".dSYM"]),
		directories: new Set(["node_modules", "__pycache__", "dist", "build", ".next", "target", ".cache", ".parcel-cache", ".turbo"]),
	},
	archives: {
		label: "Archives",
		extensions: new Set([".zip", ".tar", ".tar.gz", ".tgz", ".rar", ".7z", ".bz2", ".xz", ".gz", ".dmg", ".iso"]),
	},
};

export function formatSize(bytes: number): string {
	if (bytes === 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + " " + units[i];
}

export function isProtected(dirPath: string): boolean {
	const resolved = path.resolve(dirPath);
	for (const p of PROTECTED_DIRS) {
		if (resolved === p || resolved.startsWith(p + "/")) return true;
	}
	return false;
}

export function categorizeEntry(name: string, isDirectory: boolean): string | null {
	if (isDirectory) {
		if (CLEANUP_CATEGORIES.compiled.directories?.has(name)) return "compiled";
		return null;
	}
	const ext = path.extname(name).toLowerCase();
	const baseName = path.basename(name);
	const doubleExt = name.includes(".tar.") ? ".tar" + ext : ext;

	if (CLEANUP_CATEGORIES.temp.names?.has(baseName)) return "temp";
	if (CLEANUP_CATEGORIES.temp.extensions?.has(ext)) return "temp";
	if (CLEANUP_CATEGORIES.compiled.extensions?.has(ext)) return "compiled";
	if (CLEANUP_CATEGORIES.archives.extensions?.has(ext) || CLEANUP_CATEGORIES.archives.extensions?.has(doubleExt)) return "archives";
	return null;
}

export function summarizeCleanupResults(results: Record<string, ScanFile[]>) {
	const summary: Record<string, { count: number; size: number; sizeFormatted: string }> = {};
	let totalFiles = 0;
	let totalSize = 0;
	for (const [cat, files] of Object.entries(results)) {
		const catSize = files.reduce((s, f) => s + f.size, 0);
		summary[cat] = { count: files.length, size: catSize, sizeFormatted: formatSize(catSize) };
		totalFiles += files.length;
		totalSize += catSize;
	}
	return { summary, totalFiles, totalSize, totalSizeFormatted: formatSize(totalSize) };
}
