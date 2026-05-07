import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { getSoundImageCacheDir } from "../lib/sounds/sounds-config.ts";
import {
	createImageCacheKey,
	ensureCachedImage,
	readCachedImageEntry,
} from "../lib/sounds/sounds-image-cache.ts";

const cacheDir = getSoundImageCacheDir();
const pngBytes = Buffer.from("89504e470d0a1a0a", "hex");

afterEach(() => {
	vi.restoreAllMocks();
	if (existsSync(cacheDir)) rmSync(cacheDir, { recursive: true, force: true });
});

describe("sounds image cache", () => {
	it("creates the cache directory before writing files", () => {
		mkdirSync(cacheDir, { recursive: true });
		expect(existsSync(cacheDir)).toBe(true);
	});

	it("downloads an image once and reuses the cached file on subsequent calls", async () => {
		mkdirSync(cacheDir, { recursive: true });
		const url = "https://example.com/sound.png";
		const fetchMock = vi.fn(async () => new Response(pngBytes, {
			status: 200,
			headers: {
				"content-type": "image/png",
				etag: '"abc"',
				"cache-control": "max-age=3600",
			},
		}));
		vi.stubGlobal("fetch", fetchMock as any);

		const first = await ensureCachedImage(url);
		expect(first.cacheHit).toBe(false);
		expect(existsSync(first.filePath)).toBe(true);
		expect(fetchMock).toHaveBeenCalledTimes(1);

		const second = await ensureCachedImage(url);
		expect(second.cacheHit).toBe(true);
		expect(fetchMock).toHaveBeenCalledTimes(1);

		const key = createImageCacheKey(url);
		const cached = readCachedImageEntry(key);
		expect(cached?.contentType).toBe("image/png");
	});

	it("falls back to an existing cached file when upstream refresh fails", async () => {
		mkdirSync(cacheDir, { recursive: true });
		const url = "https://example.com/sound.png";
		const firstFetch = vi.fn(async () => new Response(pngBytes, {
			status: 200,
			headers: { "content-type": "image/png", etag: '"abc"', "cache-control": "max-age=0" },
		}));
		vi.stubGlobal("fetch", firstFetch as any);
		await ensureCachedImage(url);

		const secondFetch = vi.fn(async () => new Response("nope", { status: 502 }));
		vi.stubGlobal("fetch", secondFetch as any);
		const second = await ensureCachedImage(url);
		expect(second.cacheHit).toBe(true);
		expect(existsSync(second.filePath)).toBe(true);
	});

	it("rejects unsupported content types without writing a cache entry", async () => {
		mkdirSync(cacheDir, { recursive: true });
		const url = "https://example.com/not-image.txt";
		vi.stubGlobal("fetch", vi.fn(async () => new Response("hello", {
			status: 200,
			headers: { "content-type": "text/plain" },
		})) as any);

		await expect(ensureCachedImage(url)).rejects.toThrow(/Unsupported image content type/);
		expect(readCachedImageEntry(createImageCacheKey(url))).toBeNull();
	});
});
