import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { getSoundImageCacheDir } from "../lib/sounds/sounds-config.ts";
import { createImageCacheKey, readCachedImageEntry } from "../lib/sounds/sounds-image-cache.ts";

const pngBytes = Buffer.from("89504e470d0a1a0a", "hex");

async function startRouteServer() {
	const server = createServer((req, res) => {
		const url = new URL(req.url || "/", "http://localhost");
		if (req.method === "GET" && url.pathname.startsWith("/api/image/")) {
			const key = decodeURIComponent(url.pathname.slice("/api/image/".length));
			const cached = readCachedImageEntry(key);
			if (!cached) {
				res.writeHead(404, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: "Image not cached" }));
				return;
			}
			res.writeHead(200, { "Content-Type": cached.contentType, "Cache-Control": "public, max-age=604800, immutable" });
			res.end(readFileSync(cached.filePath));
			return;
		}
		res.writeHead(404);
		res.end();
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
	const port = (server.address() as any).port;
	return { server, port };
}

afterEach(() => {
	vi.restoreAllMocks();
	const dir = getSoundImageCacheDir();
	if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
});

describe("sounds image route", () => {
	it("serves a cached image with the expected content type and cache header", async () => {
		const sourceUrl = "https://example.com/sound.png";
		const key = createImageCacheKey(sourceUrl);
		const dir = getSoundImageCacheDir();
		mkdirSync(dir, { recursive: true });
		const imagePath = `${dir}/${key}.png`;
		const metadataPath = `${dir}/${key}.json`;
		writeFileSync(imagePath, pngBytes);
		writeFileSync(metadataPath, JSON.stringify({
			key,
			url: sourceUrl,
			contentType: "image/png",
			extension: "png",
			expires: Math.floor(Date.now() / 1000) + 3600,
		}) + "\n");
		const handle = await startRouteServer();

		try {
			expect(existsSync(dir)).toBe(true);
			expect(existsSync(imagePath)).toBe(true);
			expect(readFileSync(imagePath).length).toBeGreaterThan(0);
			const cached = readCachedImageEntry(key);
			expect(cached).not.toBeNull();
			const response = await new Promise<{ status: number; headers: Record<string, string> }>((resolve, reject) => {
				const http = require("node:http");
				http.get(`http://127.0.0.1:${handle.port}/api/image/${key}`, (res: any) => {
					res.resume();
					res.on("end", () => resolve({
						status: res.statusCode || 0,
						headers: {
							"content-type": res.headers["content-type"] || "",
							"cache-control": res.headers["cache-control"] || "",
						},
					}));
				}).on("error", reject);
			});
			expect(response.status).toBe(200);
			expect(response.headers["content-type"]).toBe("image/png");
			expect(response.headers["cache-control"]).toContain("immutable");
		} finally {
			await new Promise<void>((resolve) => handle.server.close(() => resolve()));
		}
	});
});
