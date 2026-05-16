import { createHash } from "node:crypto";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	ensureSoundsImageCacheDir,
	getSoundImageCacheDir,
} from "./sounds-config.ts";

const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;
const ALLOWED_IMAGE_MIME_TYPES = new Set([
	"image/png",
	"image/jpeg",
	"image/jpg",
	"image/webp",
	"image/gif",
	"image/svg+xml",
]);

export interface SoundsImageCacheEntry {
	key: string;
	url: string;
	contentType: string;
	extension: string;
	etag?: string | null;
	expires: number;
}

export interface EnsureCachedImageResult {
	key: string;
	contentType: string;
	extension: string;
	cacheHit: boolean;
	refreshed: boolean;
	filePath: string;
	metadataPath: string;
}

export function createImageCacheKey(url: string): string {
	return createHash("sha256").update(url).digest("hex").slice(0, 24);
}

export function getCachedImagePaths(key: string, extension: string) {
	const dir = getSoundImageCacheDir();
	return {
		metadataPath: join(dir, `${key}.json`),
		filePath: join(dir, `${key}.${extension}`),
	};
}

export function readCachedImageEntry(key: string): (SoundsImageCacheEntry & { filePath: string; metadataPath: string }) | null {
	ensureSoundsImageCacheDir();
	const metadataPath = join(getSoundImageCacheDir(), `${key}.json`);
	if (!existsSync(metadataPath)) return null;
	try {
		const entry = JSON.parse(readFileSync(metadataPath, "utf-8")) as SoundsImageCacheEntry;
		const filePath = join(getSoundImageCacheDir(), `${entry.key}.${entry.extension}`);
		if (!existsSync(filePath)) return null;
		return { ...entry, filePath, metadataPath };
	} catch {
		return null;
	}
}

export async function ensureCachedImage(url: string): Promise<EnsureCachedImageResult> {
	ensureSoundsImageCacheDir();
	const key = createImageCacheKey(url);
	const existing = readCachedImageEntry(key);
	const now = Math.floor(Date.now() / 1000);

	if (existing && existing.expires > now) {
		return {
			key,
			contentType: existing.contentType,
			extension: existing.extension,
			cacheHit: true,
			refreshed: false,
			filePath: existing.filePath,
			metadataPath: existing.metadataPath,
		};
	}

	const response = await fetch(url, {
		headers: {
			"Cache-Control": "max-age=0",
			...(existing?.etag ? { "If-None-Match": existing.etag } : {}),
		},
	});

	if (response.status === 304 && existing) {
		const refreshedEntry: SoundsImageCacheEntry = {
			...existing,
			expires: getExpires(response.headers),
		};
		saveCacheEntry(refreshedEntry);
		return {
			key,
			contentType: existing.contentType,
			extension: existing.extension,
			cacheHit: true,
			refreshed: true,
			filePath: existing.filePath,
			metadataPath: existing.metadataPath,
		};
	}

	if (!response.ok) {
		if (existing) {
			return {
				key,
				contentType: existing.contentType,
				extension: existing.extension,
				cacheHit: true,
				refreshed: false,
				filePath: existing.filePath,
				metadataPath: existing.metadataPath,
			};
		}
		throw new Error(`Failed to fetch image: ${response.status}`);
	}

	const contentTypeHeader = normalizeContentType(response.headers.get("content-type"));
	if (!contentTypeHeader || !ALLOWED_IMAGE_MIME_TYPES.has(contentTypeHeader)) {
		throw new Error(`Unsupported image content type: ${contentTypeHeader || "unknown"}`);
	}

	const extension = extensionFromContentType(contentTypeHeader);
	const paths = getCachedImagePaths(key, extension);
	ensureSoundsImageCacheDir();
	const bytes = Buffer.from(await response.arrayBuffer());
	writeFileSync(paths.filePath, bytes);

	const entry: SoundsImageCacheEntry = {
		key,
		url,
		contentType: contentTypeHeader,
		extension,
		etag: response.headers.get("etag"),
		expires: getExpires(response.headers),
	};
	cleanupStaleFiles(key, extension);
	saveCacheEntry(entry);

	return {
		key,
		contentType: contentTypeHeader,
		extension,
		cacheHit: false,
		refreshed: true,
		filePath: paths.filePath,
		metadataPath: paths.metadataPath,
	};
}

function saveCacheEntry(entry: SoundsImageCacheEntry): void {
	const { metadataPath } = getCachedImagePaths(entry.key, entry.extension);
	writeFileSync(metadataPath, JSON.stringify(entry, null, 2) + "\n", "utf-8");
}

function cleanupStaleFiles(key: string, extension: string): void {
	const dir = getSoundImageCacheDir();
	const knownExtensions = ["png", "jpg", "jpeg", "webp", "gif", "svg"];
	for (const ext of knownExtensions) {
		if (ext === extension) continue;
		const candidate = join(dir, `${key}.${ext}`);
		if (existsSync(candidate)) {
			try {
				unlinkSync(candidate);
			} catch {}
		}
	}
}

function normalizeContentType(contentType: string | null): string | null {
	if (!contentType) return null;
	return contentType.split(";")[0].trim().toLowerCase();
}

function extensionFromContentType(contentType: string): string {
	switch (contentType) {
		case "image/png": return "png";
		case "image/jpeg":
		case "image/jpg": return "jpg";
		case "image/webp": return "webp";
		case "image/gif": return "gif";
		case "image/svg+xml": return "svg";
		default: return "bin";
	}
}

function getExpires(headers: Headers): number {
	const now = Math.floor(Date.now() / 1000);
	const maxAgeSeconds = parseMaxAge(headers.get("cache-control"));
	if (maxAgeSeconds != null) return now + maxAgeSeconds;
	const expires = headers.get("expires");
	if (expires) {
		const expiresTime = Date.parse(expires);
		if (!Number.isNaN(expiresTime)) return Math.floor(expiresTime / 1000);
	}
	return now + DEFAULT_TTL_SECONDS;
}

function parseMaxAge(cacheControl: string | null): number | null {
	if (!cacheControl) return null;
	const match = cacheControl.match(/max-age=(\d+)/i);
	return match ? parseInt(match[1] || "", 10) : null;
}
