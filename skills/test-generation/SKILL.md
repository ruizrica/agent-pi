---
name: test-generation
description: >
  Thoughtful multi-phase test generation using agent chains. Discovers modules,
  plans test strategy, generates Gherkin and Playwright tests with iterative review.
  Use when the user wants to generate tests, create test specs, or test their modules.
allowed-tools: Bash(ls:*) Bash(cat:*) Bash(find:*) Bash(grep:*) Read run_chain show_test_viewer discover_modules
---

# Test Generation Skill

Generate comprehensive, high-quality test suites using a thoughtful multi-phase pipeline.
The test-generation skill coordinates an agent chain that discovers what to test,
plans test strategy, generates Gherkin and Playwright code, and iteratively reviews
with your input.

## When to Use

- User wants to generate tests for a codebase or module
- User asks "create tests", "write gherkin", "write playwright", "test my code"
- User says "generate a test suite", "write test specs", "test this module"
- User wants thoughtful, well-structured acceptance tests with Gherkin
- User needs Playwright test code aligned with Gherkin scenarios
- User says "run /test-gen" or "/test-gen <description>"

## The 6-Step Pipeline

### Overview

The test generation pipeline is a coordinated agent chain that moves through these phases:

```
Scout → Planner → Builder (Pass 1) → Reviewer (Pass 1) → Builder (Pass 2) → Reviewer (Pass 2) → Test Viewer
```

Each phase has a clear input and output. Phases 1 and 2 create a feedback loop
for refinement based on your review.

### Step 1: Scout — Discover Modules & Features

**Agent**: Scout
**Task**: Analyze the codebase and identify what can be tested.

The Scout:
- Discovers all modules, classes, functions, and public APIs
- Extracts docstrings, type signatures, and purpose
- Identifies feature surfaces: login flows, data validation, business rules, edge cases
- Creates a module index and surface map
- Outputs: `DiscoveryReport` with:
  - `modules`: list of modules and their exports
  - `surfaces`: identified feature surfaces with examples
  - `suggestion`: recommended focus areas for testing

**Your Input**: Review the discovered modules. Confirm what you want tested.

---

### Step 2: Planner — Design Test Strategy

**Agent**: Planner
**Task**: Design an effective test strategy based on discoveries.

The Planner:
- Reviews the module index from Scout
- Creates a test plan with coverage goals
- Decides which surfaces to test: happy path, error cases, edge cases
- Chooses test types: unit, component, integration, e2e
- Groups scenarios logically by feature
- Outputs: `TestPlan` with:
  - `strategy`: overall testing approach
  - `scenarios`: list of scenario outlines (not full Gherkin yet)
  - `coverage_goals`: what will be tested and why

**Your Input**: Review the plan. Ask for changes before generation begins.

---

### Step 3: Builder (Pass 1) — Generate Gherkin & Playwright

**Agent**: Builder
**Task**: Write initial Gherkin feature files and Playwright test code.

The Builder:
- Writes Gherkin feature files with Scenario Outline patterns
- Generates Playwright test code that implements the Gherkin
- Uses the gherkin-patterns guide for quality and consistency
- Creates draft files in `.gopher/gherkin/` and `.gopher/playwright/`
- Outputs: Draft feature files and test specs ready for review

**Your Input**: None yet—tests are being drafted.

---

### Step 4: Reviewer (Pass 1) — Quality Gate & Feedback

**Agent**: Reviewer
**Task**: Analyze drafts and provide improvement suggestions.

The Reviewer:
- Checks Gherkin against quality patterns (naming, Given/When/Then structure, etc.)
- Verifies Playwright code compiles and aligns with Gherkin
- Identifies missing edge cases or weak assertions
- Grades each scenario: ✓ Good, ◐ Needs revision, ✗ Rewrite
- Outputs: `ReviewReport` with feedback and improvement suggestions

**Your Input**: Review the Reviewer's feedback. Accept or request changes.

---

### Step 5: Builder (Pass 2) — Refine Based on Feedback

**Agent**: Builder
**Task**: Improve drafts based on Reviewer feedback.

The Builder:
- Addresses Reviewer's issues
- Strengthens assertions and edge case coverage
- Refines Gherkin naming and step clarity
- Rewrites weak scenarios
- Creates updated draft files
- Outputs: Revised feature files and test specs

**Your Input**: Review the changes. Confirm ready for approval or request more iterations.

---

### Step 6: Test Viewer — Approve & Export

**Display**: Interactive test viewer showing all Gherkin + Playwright pairs

In the Test Viewer you can:
- Read Gherkin feature files side-by-side with Playwright code
- Edit scenarios before saving
- Approve and export to your test directory
- Reject and request another round of generation

**Your Input**: Click "Approve & Save" or "Request Changes"

---

## How to Trigger

### Option A: Interactive Command
```bash
/test-gen
```
Then follow the prompts:
1. Describe what you want tested (or hit enter to auto-discover)
2. Review discovered modules
3. Review test plan
4. Review generated drafts
5. Approve final output

### Option B: Describe What You Want
```bash
/test-gen user authentication with email and password
```
The pipeline runs automatically, stopping at each review step.

### Option C: From Within Gopher CLI
If you're already running Gopher:
1. Select "Generate Tests"
2. Choose modules to test
3. Follow the pipeline

## Module Selection Flow

After Scout discovers modules:

```
Scout: "I found 12 modules. Which would you like to test?"

User selects:
  ✓ auth/login.ts
  ✓ auth/logout.ts
  ✓ user/profile.ts
  ✗ admin/analytics.ts (skip for now)

Planner: "I'll create a test plan for auth and user modules..."
```

If you don't select any, the Planner will focus on:
- Public APIs (exported functions)
- Business-critical modules
- Modules with clear inputs/outputs

## Test Viewer Approval Flow

After Pass 2 Builder, your tests appear in the Test Viewer:

```
┌─────────────────────────────────────────┐
│  Feature: User Authentication           │
│                                          │
│  Scenario: Successful login              │
│    Given a user with email...           │
│    When the user submits credentials   │
│    Then the auth token is returned     │
│                                          │
│  [Edit] [Approve] [Reject]              │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  playwright/auth-login.spec.ts          │
│                                          │
│  test('Successful login', async ({     │
│    page                                  │
│  }) => {                                │
│    // Playwright code here              │
│  })                                      │
│                                          │
│  [Syntax Check: ✓] [Approve] [Reject]  │
└─────────────────────────────────────────┘
```

Click **"Approve & Save Tests"** to export to your test directory.
Click **"Request Changes"** to start another iteration.

## Example Workflow

```
User: "Generate tests for my authentication module"

Scout: Discovers auth/, user/, session/ modules
  "Found 8 modules with 34 public functions. Here's what I found:
   - auth/login.ts: handleLogin(email, password)
   - auth/logout.ts: handleLogout()
   - auth/refresh.ts: refreshToken()
   - ...
   Which would you like me to focus on?"

User: "Test login, logout, and refresh token"

Planner: Creates test strategy
  "I'll create 3 feature files with 12 total scenarios covering:
   - Happy path: successful login
   - Error cases: invalid email, wrong password, account locked
   - Edge cases: concurrent logins, token expiry
   Ready to generate?"

User: "Yes, go ahead"

Builder (Pass 1): Generates Gherkin + Playwright
  "Generated 3 feature files and 3 test specs.
   - auth-login.feature: 6 scenarios
   - auth-logout.feature: 2 scenarios
   - auth-refresh.feature: 4 scenarios
   Review them next..."

Reviewer (Pass 1): Reviews quality
  "✓ 8 scenarios pass quality checks
   ◐ 3 scenarios need revision (weak assertions)
   ✗ 1 scenario needs rewrite (too vague)
   Here's what to improve..."

User: "Ok, fix it"

Builder (Pass 2): Improves tests
  "Fixed all issues. Improved assertions, added missing edge cases."

Test Viewer: Shows all tests side-by-side
  User reads, makes edits, clicks "Approve & Save"

Output: Test files saved to ./tests/
```

## What Gets Generated

### Gherkin Feature Files (.feature)

```gherkin
Feature: User Authentication
  In order to access the application
  As a user
  I want to authenticate with email and password

  Scenario Outline: Login with <credential_type>
    Given a user account with email "<email>"
    And the account password is "<password>"
    When the user submits login credentials
    Then the auth response status is "<expected_status>"
    And the response contains "<expected_field>"

    Examples:
      | credential_type | email           | password    | expected_status | expected_field |
      | valid           | user@example.com| correct123  | 200             | auth_token     |
      | invalid_email   | bad@example.com | correct123  | 401             | error          |
      | wrong_password  | user@example.com| wrong123    | 401             | error          |
```

### Playwright Test Files (.spec.ts)

```typescript
import { test, expect } from '@playwright/test';
import { createAuthClient } from './auth-client';

test.describe('User Authentication', () => {
  test('Login with valid credentials', async ({ page }) => {
    const client = createAuthClient(page);
    
    const response = await client.login({
      email: 'user@example.com',
      password: 'correct123'
    });
    
    expect(response.status).toBe(200);
    expect(response.body.auth_token).toBeDefined();
  });

  // More tests...
});
```

## Best Practices for This Skill

1. **Clear Input**: The more detail you provide about what to test, the better the plan
2. **Review Each Phase**: Don't skip the plan review—it shapes everything that follows
3. **Feedback is Helpful**: Tell Reviewer what matters most (edge cases? error handling? performance?)
4. **Edit in Test Viewer**: Feel free to tweak Gherkin or Playwright before saving
5. **Iterate**: It's okay to request another pass if tests aren't perfect yet

## Related Skills & Tools

- **gherkin-patterns**: Reference guide for writing high-quality Gherkin scenarios
- **gopher-test-viewer**: The interactive viewer used in Step 6 for approval
- **agent-device / agent-browser**: Run generated tests against real devices/browsers

## Troubleshooting

**"No modules discovered"**
- Ensure your codebase has exported functions or classes
- Try pointing the Scout to a specific directory: `/test-gen --path src/`

**"Tests don't compile"**
- The Builder might need more context about your testing framework
- Check the Gherkin quality—Playwright code is generated from feature files

**"I want to test an API endpoint"**
- The Planner will suggest integration tests with HTTP mocking
- Playwright can test API responses via `await fetch()` or axios

**"Too many scenarios generated"**
- Review the test plan before generation starts
- You can trim it down: "Only test happy path and 3 key error cases"
