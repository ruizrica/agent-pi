import { describe, expect, it } from "vitest";

import modeCycler from "../mode-cycler.ts";
import themeCycler from "../theme-cycler.ts";

function createPiStub() {
	const shortcuts: string[] = [];

	const pi = {
		registerShortcut: (keyId: string) => {
			shortcuts.push(keyId);
		},
		registerCommand: () => {},
		registerTool: () => {},
		on: () => {},
		getThinkingLevel: () => "off",
		setThinkingLevel: () => {},
	} as any;

	return { pi, shortcuts };
}

describe("extension shortcut bindings", () => {
	it("mode-cycler binds F5 (and not Shift+Tab)", () => {
		const { pi, shortcuts } = createPiStub();
		modeCycler(pi);
		expect(shortcuts).toContain("f5");
		expect(shortcuts).not.toContain("shift+tab");
	});

	it("theme-cycler binds F6/F7 (and not Ctrl+X/Ctrl+Q)", () => {
		const { pi, shortcuts } = createPiStub();
		themeCycler(pi);
		expect(shortcuts).toContain("f6");
		expect(shortcuts).toContain("f7");
		expect(shortcuts).not.toContain("ctrl+x");
		expect(shortcuts).not.toContain("ctrl+q");
	});
});

