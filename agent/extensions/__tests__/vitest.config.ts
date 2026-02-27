// Vitest configuration for user-question extension tests
// Supports TypeScript and module mocking for pi-tui and pi-coding-agent
// Located in extensions/__tests__/ - paths adjusted for new location

import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["**/*.test.ts", "**/*.spec.ts"],
		exclude: ["node_modules", "dist", "build"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			include: ["../user-question.ts"],
			exclude: ["**/*.test.ts", "**/*.spec.ts"],
			lines: 80,
			functions: 80,
			branches: 75,
			statements: 80,
		},
	},
	resolve: {
		alias: {
			"@mariozechner/pi-tui": "<rootDir>/../mocks/pi-tui.ts",
			"@mariozechner/pi-coding-agent": "<rootDir>/../mocks/pi-coding-agent.ts",
			"@mariozechner/pi-ai": "<rootDir>/../mocks/pi-ai.ts",
			"@sinclair/typebox": "<rootDir>/../mocks/typebox.ts",
		},
	},
});
