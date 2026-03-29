// Vitest configuration for user-question extension tests
// Supports TypeScript and module mocking for pi-tui and pi-coding-agent
// Located in extensions/__tests__/ - paths adjusted for new location

import { defineConfig } from "vitest/config";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const mocksDir = resolve(__dirname, "..", "mocks");

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["**/*.test.ts", "**/*.spec.ts"],
		exclude: ["node_modules", "dist", "build"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			include: ["../user-question.ts", "../file-viewer.ts", "../lib/file-viewer-html.ts"],
			exclude: ["**/*.test.ts", "**/*.spec.ts"],
			lines: 80,
			functions: 80,
			branches: 75,
			statements: 80,
		},
	},
	resolve: {
		alias: {
			"@mariozechner/pi-tui": resolve(mocksDir, "pi-tui.ts"),
			"@mariozechner/pi-coding-agent": resolve(mocksDir, "pi-coding-agent.ts"),
			"@mariozechner/pi-ai": resolve(mocksDir, "pi-ai.ts"),
			"@sinclair/typebox": resolve(mocksDir, "typebox.ts"),
		},
	},
});
