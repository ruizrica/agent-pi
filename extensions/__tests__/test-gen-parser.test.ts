// ABOUTME: Tests for test-gen-parser.ts — parsing chain output delimiters, pairing files, and extracting review data.

import { describe, it, expect } from "vitest";
import {
	parseChainOutput,
	extractFiles,
	pairFiles,
	extractReviewerAnnotations,
	extractQualityScores,
} from "../lib/test-gen-parser.ts";

// ── extractFiles ─────────────────────────────────────────────────────

describe("extractFiles", () => {
	it("extracts feature and spec files from delimited output", () => {
		const output = `
Some preamble text...

=== FILE: user-auth.feature ===
Feature: User Authentication
  Scenario: Successful login
    Given a registered user
    When the user logs in
    Then the user sees the dashboard
=== END FILE ===

=== FILE: user-auth.spec.ts ===
import { test, expect } from '@playwright/test';

test('successful login', async ({ page }) => {
  await page.goto('/login');
  await expect(page).toHaveURL('/dashboard');
});
=== END FILE ===

Some trailing text...
		`;

		const files = extractFiles(output);
		expect(files.length).toBe(2);
		expect(files[0].fileName).toBe("user-auth.feature");
		expect(files[0].type).toBe("feature");
		expect(files[0].baseName).toBe("user-auth");
		expect(files[0].content).toContain("Feature: User Authentication");

		expect(files[1].fileName).toBe("user-auth.spec.ts");
		expect(files[1].type).toBe("spec");
		expect(files[1].baseName).toBe("user-auth");
		expect(files[1].content).toContain("import { test, expect }");
	});

	it("handles multiple feature/spec pairs", () => {
		const output = `
=== FILE: auth.feature ===
Feature: Auth
=== END FILE ===

=== FILE: auth.spec.ts ===
import { test } from '@playwright/test';
=== END FILE ===

=== FILE: cart.feature ===
Feature: Cart
=== END FILE ===

=== FILE: cart.spec.ts ===
import { test } from '@playwright/test';
=== END FILE ===
		`;

		const files = extractFiles(output);
		expect(files.length).toBe(4);
		expect(files.filter(f => f.type === "feature").length).toBe(2);
		expect(files.filter(f => f.type === "spec").length).toBe(2);
	});

	it("returns empty array for no delimiters", () => {
		const output = "Just some text without any file markers.";
		const files = extractFiles(output);
		expect(files).toEqual([]);
	});

	it("handles .test.ts extension", () => {
		const output = `
=== FILE: users.test.ts ===
import { test } from '@playwright/test';
test('works', () => {});
=== END FILE ===
		`;

		const files = extractFiles(output);
		expect(files.length).toBe(1);
		expect(files[0].type).toBe("spec");
		expect(files[0].baseName).toBe("users");
	});

	it("ignores files with unrecognized extensions", () => {
		const output = `
=== FILE: readme.md ===
# README
=== END FILE ===
		`;

		const files = extractFiles(output);
		expect(files.length).toBe(0);
	});

	it("handles whitespace variations in delimiters", () => {
		const output = `
===  FILE:  user-auth.feature  ===
Feature: Auth
===  END FILE  ===
		`;

		const files = extractFiles(output);
		expect(files.length).toBe(1);
		expect(files[0].fileName).toBe("user-auth.feature");
	});
});

// ── pairFiles ────────────────────────────────────────────────────────

describe("pairFiles", () => {
	it("pairs matching feature and spec files", () => {
		const files = [
			{ fileName: "auth.feature", content: "Feature: Auth", type: "feature" as const, baseName: "auth" },
			{ fileName: "auth.spec.ts", content: "test('auth', () => {})", type: "spec" as const, baseName: "auth" },
		];

		const features = pairFiles(files);
		expect(features.length).toBe(1);
		expect(features[0].name).toBe("Auth");
		expect(features[0].gherkin).toContain("Feature: Auth");
		expect(features[0].playwrightCode).toContain("test('auth'");
	});

	it("handles feature without matching spec", () => {
		const files = [
			{ fileName: "orphan.feature", content: "Feature: Orphan Module", type: "feature" as const, baseName: "orphan" },
		];

		const features = pairFiles(files);
		expect(features.length).toBe(1);
		expect(features[0].name).toBe("Orphan Module");
		expect(features[0].playwrightCode).toContain("No matching test file");
	});

	it("handles spec without matching feature", () => {
		const files = [
			{ fileName: "orphan.spec.ts", content: "test('orphan', () => {})", type: "spec" as const, baseName: "orphan" },
		];

		const features = pairFiles(files);
		expect(features.length).toBe(1);
		expect(features[0].name).toBe("orphan");
		expect(features[0].gherkin).toContain("No Gherkin feature file");
		expect(features[0].playwrightCode).toContain("test('orphan'");
	});

	it("case-insensitive matching", () => {
		const files = [
			{ fileName: "UserAuth.feature", content: "Feature: User Auth", type: "feature" as const, baseName: "UserAuth" },
			{ fileName: "userauth.spec.ts", content: "test('auth', () => {})", type: "spec" as const, baseName: "userauth" },
		];

		const features = pairFiles(files);
		expect(features.length).toBe(1);
		expect(features[0].gherkin).toContain("Feature: User Auth");
		expect(features[0].playwrightCode).toContain("test('auth'");
	});
});

// ── parseChainOutput ─────────────────────────────────────────────────

describe("parseChainOutput", () => {
	it("full end-to-end parse", () => {
		const output = `
### Module: user-auth
- **Final Score:** 8/10
- **Status:** APPROVED

### Final Test Content

=== FILE: user-auth.feature ===
Feature: User Authentication

  @api @smoke
  Scenario: Successful login with valid credentials
    Given a registered user with email "test@example.com"
    When the user sends a POST request to "/api/auth/login"
    Then the response status code shall be 200
    And the response body shall contain an access token
=== END FILE ===

=== FILE: user-auth.spec.ts ===
import { test, expect } from '@playwright/test';

test.describe('User Authentication', () => {
  test('successful login with valid credentials', async ({ request }) => {
    const response = await request.post('/api/auth/login', {
      data: { email: 'test@example.com', password: 'valid-password' }
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.accessToken).toBeTruthy();
  });
});
=== END FILE ===
		`;

		const features = parseChainOutput(output);
		expect(features.length).toBe(1);
		expect(features[0].name).toBe("User Authentication");
		expect(features[0].gherkin).toContain("@api @smoke");
		expect(features[0].gherkin).toContain("Successful login");
		expect(features[0].playwrightCode).toContain("test.describe");
		expect(features[0].playwrightCode).toContain("accessToken");
	});

	it("returns empty for no file content", () => {
		const output = "Just some review text without any files.";
		const features = parseChainOutput(output);
		expect(features).toEqual([]);
	});
});

// ── extractReviewerAnnotations ───────────────────────────────────────

describe("extractReviewerAnnotations", () => {
	it("extracts annotations from reviewer output", () => {
		const output = `
### Module: auth
- **Final Score:** 8/10

### Annotations for Developer:
- Consider adding rate limiting tests for the login endpoint
- The password reset flow could benefit from negative test cases
- Mock the email service in integration tests

### Final Verdict
		`;

		const annotations = extractReviewerAnnotations(output);
		expect(annotations.length).toBe(3);
		expect(annotations[0]).toContain("rate limiting");
		expect(annotations[1]).toContain("password reset");
		expect(annotations[2]).toContain("email service");
	});

	it("returns empty for no annotations", () => {
		const output = "Just a review without annotations.";
		const annotations = extractReviewerAnnotations(output);
		expect(annotations).toEqual([]);
	});
});

// ── extractQualityScores ─────────────────────────────────────────────

describe("extractQualityScores", () => {
	it("extracts scores from reviewer output", () => {
		const output = `
### Module: auth
- **Final Score:** 8/10

### Module: cart
- **Final Score:** 7/10

### Module: profile
- **Quality Score:** 9/10
		`;

		const scores = extractQualityScores(output);
		expect(scores.get("auth")).toBe(8);
		expect(scores.get("cart")).toBe(7);
		expect(scores.get("profile")).toBe(9);
	});

	it("returns empty map for no scores", () => {
		const output = "No scores here.";
		const scores = extractQualityScores(output);
		expect(scores.size).toBe(0);
	});
});
