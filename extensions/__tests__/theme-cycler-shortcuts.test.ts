// ABOUTME: Verifies theme-cycler.ts registers safe keyboard shortcuts.
// ABOUTME: Guards against re-introducing ctrl+x (collides with terminal cut) or ctrl+q (XON flow control on some terminals).

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const SOURCE = readFileSync(
	resolve(__dirname, "../theme-cycler.ts"),
	"utf-8",
);

describe("theme-cycler shortcut bindings", () => {
	it("does NOT bind ctrl+x (collides with terminal cut + Emacs prefix)", () => {
		expect(SOURCE).not.toMatch(/registerShortcut\(["']ctrl\+x["']/);
	});

	it("does NOT bind ctrl+q (collides with XON/XOFF flow control in some terminals)", () => {
		expect(SOURCE).not.toMatch(/registerShortcut\(["']ctrl\+q["']/);
	});

	it("binds alt+t to cycle theme forward (mnemonic: T for Theme)", () => {
		expect(SOURCE).toMatch(/registerShortcut\(["']alt\+t["']/);
	});

	it("binds alt+shift+t to cycle theme backward", () => {
		expect(SOURCE).toMatch(/registerShortcut\(["']alt\+shift\+t["']/);
	});

	it("ABOUTME comment reflects the new bindings (Alt+T / Alt+Shift+T)", () => {
		const first200 = SOURCE.slice(0, 200);
		expect(first200).toMatch(/Alt\+T/i);
	});
});
