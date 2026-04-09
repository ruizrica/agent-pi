import { describe, expect, it, vi } from "vitest";
import { createViewerServer } from "../lib/viewer-server.ts";

async function closeServer(server: { close: (cb?: () => void) => void }) {
	await new Promise<void>((resolve) => server.close(() => resolve()));
}

describe("createViewerServer /result handling", () => {
	it("resolves waitForResult even when no onResult callback is provided", async () => {
		const handle = await createViewerServer({
			getHtml: () => "<html><body>viewer</body></html>",
		});

		try {
			const waitForResult = handle.waitForResult();
			const payload = {
				action: "approved",
				comments: [{ id: "c1", text: "Looks good" }],
				modified: true,
			};

			const response = await fetch(`http://127.0.0.1:${handle.port}/result`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			expect(response.status).toBe(200);
			await expect(waitForResult).resolves.toEqual(payload);
		} finally {
			await closeServer(handle.server);
		}
	});

	it("still invokes onResult while resolving waitForResult with the posted payload", async () => {
		const onResult = vi.fn();
		const handle = await createViewerServer({
			getHtml: () => "<html><body>viewer</body></html>",
			onResult,
		});

		try {
			const waitForResult = handle.waitForResult();
			const payload = { action: "changes_requested", modified: false };

			const response = await fetch(`http://127.0.0.1:${handle.port}/result`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			expect(response.status).toBe(200);
			await expect(waitForResult).resolves.toEqual(payload);
			expect(onResult).toHaveBeenCalledTimes(1);
			expect(onResult).toHaveBeenCalledWith(payload);
		} finally {
			await closeServer(handle.server);
		}
	});
});
