# Test Review Rubric — Quality Scoring Guide

A comprehensive rubric for reviewers to evaluate test quality using weighted criteria. Provides consistent, objective scoring with detailed checklists and common issues to flag.

---

## Scoring Scale (1-10)

### 1-3: Poor
Test quality is significantly below standard. Tests would not provide reliable coverage and likely need complete rewrite.

- Missing multiple fundamental quality criteria
- Significant flakiness indicators
- Poor test isolation
- Inadequate assertions or coverage
- Reviewers recommend: Reject and request rewrite

**Example**: Tests using arbitrary timeouts, missing assertions, hardcoded magic values, non-isolated state

---

### 4-5: Below Average
Tests work but have significant gaps. Acceptable only with major revisions before merge.

- Several quality issues that impact maintainability
- Some flakiness risks
- Coverage gaps in critical paths
- Moderate refactoring needed
- Reviewers recommend: Request changes, re-review after fixes

**Example**: Tests that mostly work but use brittle locators, insufficient error path coverage, some timing issues

---

### 6-7: Good
Solid, functional tests that meet core requirements. Minor issues that can be addressed.

- Covers main scenarios
- Generally well-structured
- Isolated with minor concerns
- Clear intent
- Minor gaps in edge cases or error handling
- Reviewers recommend: Approve with minor notes for improvement

**Example**: Tests with good POM usage, adequate coverage, but missing a few edge cases or using suboptimal locators in places

---

### 8-9: Excellent
High-quality tests that are thorough, well-structured, and maintainable. Few, minor issues.

- Comprehensive coverage including happy path, edge cases, error conditions
- Excellent test isolation
- Strong use of patterns (POM, fixtures, factories)
- Clear, maintainable code
- Minor notes for edge cases or polish
- Reviewers recommend: Approve with minor suggestions

**Example**: Well-organized tests using POM, good fixtures, comprehensive coverage, occasional unused variable or very minor improvement opportunity

---

### 10: Outstanding
Exemplary test quality that should serve as a template for the team. No issues found.

- Comprehensive coverage
- Exemplary use of patterns and best practices
- Perfectly isolated
- Clear, well-documented
- Maintainable and future-proof
- No notes
- Reviewers recommend: Approve and use as reference

**Example**: Tests that exceed requirements, include excellent helpers, comprehensive documentation, perfect isolation, edge case coverage

---

## Evaluation Criteria (Weighted)

Total score = (Gherkin Quality × 25%) + (Playwright Quality × 25%) + (Coverage Quality × 25%) + (Correctness × 25%)

Each section has a checklist scored independently, then weighted to final score.

---

## 1. Gherkin Quality (25% Weight)

Evaluate the Gherkin specification files (.feature files) for clarity, completeness, and best practices.

### Checklist

- [ ] **Scenario names are behavior-focused (not implementation)**
  - Good: "User should see error when submitting empty form"
  - Bad: "Test fillForm() function and check error handling"
  - Good: "Cart total updates when adding discounted item"
  - Bad: "Call cartService.addItem() with discount=true"

- [ ] **Given/When/Then reads naturally as prose**
  - Good: "Given the user is logged in / When they click logout / Then they should see login page"
  - Bad: "Given call loginAPI() / When click(logoutBtn) / Then assert(currentPage == 'login')"
  - Should be readable to non-technical stakeholders

- [ ] **Scenario Outlines used for parameterized data**
  - Used when testing same scenario with different inputs
  - Example: Testing login with various invalid email formats
  - Each row in Examples table should be meaningful
  - Avoid redundant Examples (e.g., same assertion repeated 10 times with different values)

- [ ] **Tags are consistent and meaningful**
  - `@smoke` — critical path, must always pass
  - `@regression` — covers previously found bugs
  - `@accessibility` — WCAG compliance
  - `@ui` / `@api` — test type
  - Avoid meaningless tags like `@test` or `@todo`

- [ ] **Background only for truly shared setup**
  - Good: Login step that every scenario needs
  - Bad: Background with 5 steps when only 2 scenarios use all of them
  - If only some scenarios need a step, move it into individual Given steps

- [ ] **Each scenario tests exactly one behavior**
  - Scenario should have one clear assertion/outcome
  - Bad: Scenario that tests both login AND profile update AND logout
  - Each should be separate scenario

- [ ] **No implementation details in steps**
  - Good: "When the user submits the form"
  - Bad: "When the user clicks the #submit-btn button using page.getByTestId()"
  - Implementation details belong in step definitions, not feature files
  - Bad: Mentioning CSS classes, specific URLs, API endpoints
  - Good: "When the user navigates to their profile" (not "When the user visits /users/profile")

### Scoring

- **9-10 points**: All criteria met, reads like specification language
- **7-8 points**: Most criteria met, minor implementation details or scenario structure issues
- **5-6 points**: Half criteria met, mixed quality scenarios and steps
- **3-4 points**: Several criteria missing, implementation details leak into specs
- **1-2 points**: Most criteria missing, not readable as specification

---

## 2. Playwright Quality (25% Weight)

Evaluate the TypeScript test implementation for best practices and maintainability.

### Checklist

- [ ] **POM pattern applied correctly**
  - Page objects exist for major pages/components
  - Locators are properties, not scattered in tests
  - Action methods return void or data, not locators
  - Tests use page objects, not direct selectors
  - Navigation and complex interactions encapsulated
  - Bad: Tests directly using `page.locator()` everywhere
  - Bad: Selectors hardcoded in 10 different tests

- [ ] **Tests are isolated (no shared state)**
  - No test depends on output of previous test
  - Tests pass when run in any order
  - beforeEach/afterEach handle setup/cleanup
  - No global variables storing test state
  - Database/API state cleared after each test
  - Bad: Test A creates user, Test B relies on it existing
  - Bad: Test passes only when run with Test C

- [ ] **Locators follow preference hierarchy**
  - Primary elements use data-testid
  - Form controls use role-based or label
  - No XPath unless absolutely unavoidable
  - No overly specific CSS selectors that break with styling changes
  - Selectors are resilient to cosmetic UI changes
  - Bad: Using XPath for standard button
  - Bad: Selector like `.btn.btn-primary.m-2.text-blue-600`

- [ ] **No arbitrary timeouts (setTimeout, waitForTimeout)**
  - Auto-wait is used for element interactions
  - Explicit waits use `.waitFor()`, `.toBeVisible()`, network waits
  - No `await page.waitForTimeout(5000)`
  - No `setTimeout(() => {}, 3000)` in tests
  - Bad: Tests with multiple `await page.waitForTimeout()`
  - Bad: `setTimeout` to "give app time to update"

- [ ] **Assertions have custom failure messages**
  - `expect(x).toBe(y, 'Message explaining what should happen')`
  - Messages are descriptive and help debugging
  - Bad: `expect(count).toBe(5)` with no message
  - Bad: Generic message "should be correct"
  - Good: `expect(cartItems.length).toBe(3, 'Should have 3 items after adding product')`

- [ ] **async/await used correctly throughout**
  - All promises are awaited
  - No missing `await` on async functions
  - No `then()` chains mixed with async/await
  - Error handling with try/catch where needed
  - Bad: `page.goto()` without await
  - Bad: `const text = loginPage.getText()` (not awaited)

- [ ] **Test data is generated/parameterized, not hardcoded**
  - Uses test data factories for objects
  - Email/ids generated dynamically (not hardcoded `user@test.com` in 50 tests)
  - Scenario Outlines for parameterized variations
  - Bad: Same email `testuser@example.com` in every test
  - Bad: Magic numbers like `productId: 12345` scattered everywhere
  - Good: `const user = createTestUser()` or factories

### Scoring

- **9-10 points**: All criteria excellently met, exemplary code quality
- **7-8 points**: Most criteria met, isolated well-structured tests with minor issues
- **5-6 points**: Half criteria met, some isolation/locator/timing issues
- **3-4 points**: Several criteria missing, flaky indicators, poor isolation
- **1-2 points**: Most criteria missing, brittle tests likely to fail

---

## 3. Coverage Quality (25% Weight)

Evaluate whether tests cover the intended scenarios and edge cases thoroughly.

### Checklist

- [ ] **All planned scenarios from test plan are covered**
  - Every scenario from the design document has a test
  - No planned scenarios skipped
  - Tests match intended feature spec
  - Bad: Test plan lists 8 scenarios but only 4 are implemented

- [ ] **Happy paths tested**
  - Primary user flow works end-to-end
  - Success case with valid inputs tested
  - Example: Login with correct credentials succeeds
  - Example: Form submission with valid data succeeds

- [ ] **Edge cases tested (empty, null, boundary values)**
  - Empty string inputs
  - Null/undefined values (if applicable)
  - Minimum/maximum values (empty list, 0 items, 1000+ items)
  - Whitespace-only inputs
  - Very long strings
  - Bad: Only testing "normal" cases
  - Good: Testing empty cart, single item, 1000 items

- [ ] **Error conditions tested with proper assertions**
  - Invalid input shows error message
  - API failures handled gracefully
  - Network timeout shows appropriate UI
  - Permissions/auth failures tested
  - Bad: No tests for error states
  - Bad: Error case tested but assertion just checks "something happened"
  - Good: "User sees specific error message 'Email already exists' when registering duplicate"

- [ ] **No redundant/duplicate test scenarios**
  - Same behavior not tested multiple times
  - Similar cases grouped into Scenario Outline rather than repeated scenarios
  - Each test adds unique coverage
  - Bad: Two tests that both test "successful login" with different credentials
  - Good: One Scenario Outline with Examples for different valid credentials

- [ ] **Integration points covered where applicable**
  - API calls made correctly
  - Database state reflected in UI
  - Navigation flows work end-to-end
  - Mocked vs real API calls tested appropriately
  - Bad: Only UI mocking, never test real API integration
  - Bad: Only happy path API calls, no error handling

### Scoring

- **9-10 points**: Comprehensive coverage, excellent edge cases, no gaps
- **7-8 points**: Good coverage, minor edge cases missing or incomplete
- **5-6 points**: Moderate coverage, some scenarios or error conditions missing
- **3-4 points**: Limited coverage, significant gaps in edge cases or error handling
- **1-2 points**: Minimal coverage, missing major scenarios

---

## 4. Correctness Checklist (25% Weight)

Verify that tests would actually execute without errors and assertions are meaningful.

### Checklist

- [ ] **Tests would compile without errors**
  - TypeScript would pass type checking
  - No undefined variables or functions
  - Imports are correct and available
  - Bad: `const page = pageObject.navigte()` (typo, function doesn't exist)
  - Bad: Missing import statement for test utilities

- [ ] **Import statements are correct**
  - All dependencies exist in project
  - Correct relative paths
  - No circular imports
  - Bad: `import { LoginPage } from '../../pages/LoginPage'` (path doesn't exist)
  - Bad: `import { describe } from 'jest'` (should be `@playwright/test`)

- [ ] **Selectors and URLs are plausible for the codebase**
  - data-testid values exist in component code
  - URLs match actual application routes
  - Not using hardcoded URLs from different projects
  - Selectors would actually find elements
  - Bad: `page.getByTestId('nonexistent-button')`
  - Bad: URL `/api/v1/users` when API is `/api/users`

- [ ] **Test data and fixtures are realistic**
  - Email formats are valid
  - Phone numbers format correctly
  - Dates are realistic
  - Not using placeholder like `XXXXX` or obviously fake data
  - Bad: `email: 'test@test.test'`, `phone: '555-555-5555'` (placeholder format)
  - Good: `email: 'testuser@example.com'`, `phone: '+14155552671'`

- [ ] **Async operations handled correctly**
  - No race conditions
  - Promises properly awaited
  - No "flaky" patterns like checking state immediately after async action
  - Example: Bad `button.click(); expect(modal).toBeVisible()` (race)
  - Example: Good `button.click(); await expect(modal).toBeVisible()` (waits)

- [ ] **No syntax errors in Gherkin or TypeScript**
  - Code is properly formatted
  - No missing semicolons (if required)
  - Proper indentation
  - Matching brackets/parentheses
  - Valid Gherkin syntax (Given/When/Then, not "Then then then")

### Scoring

- **9-10 points**: All checks pass, code is correct and would run
- **7-8 points**: Would compile/run, minor correctness issues
- **5-6 points**: Would likely run with minor fixes
- **3-4 points**: Would run but with issues, several bugs
- **1-2 points**: Would not run, multiple compile/runtime errors

---

## Common Issues to Flag

### Flaky Test Indicators

```typescript
// BAD: Race condition — button clicked, immediately check result
await button.click();
expect(page.getByText('Updated')).toBeVisible(); // Might not be there yet

// GOOD: Wait for update
await button.click();
await expect(page.getByText('Updated')).toBeVisible(); // Auto-waits

// BAD: Arbitrary timeout (never passes on slow CI)
await page.waitForTimeout(2000);
expect(result).toBe(expected);

// GOOD: Wait for condition
await expect(page.getByTestId('result')).toContainText('expected');

// BAD: Order dependency
test('first', async () => { data.id = 123; }); // Sets global
test('second', async () => { expect(data.id).toBe(123); }); // Depends on first

// GOOD: Isolated
test('first', async () => { const data = { id: 123 }; /* ... */ });
test('second', async () => { const data = { id: 456 }; /* ... */ });
```

### Over-Mocking

```typescript
// BAD: Mocking everything — loses integration value
await page.route('**/*', route => route.fulfill({ body: 'mocked' }));
// Test doesn't verify app works with real data

// GOOD: Mock strategically
// Test happy path and error path with real/mocked API appropriately
// At least some tests should verify real API integration

test('should show error when API fails', async ({ page }) => {
  // Mock 500 error response
  await page.route('/api/users', route => route.fulfill({ status: 500 }));
  await page.goto('/users');
  
  await expect(page.getByText('Failed to load users')).toBeVisible();
});

test('should load users from real API', async ({ page }) => {
  // No mocking — hit real backend (or staging)
  await page.goto('/users');
  await expect(page.getByText('User 1')).toBeVisible();
});
```

### Under-Testing Error Paths

```typescript
// BAD: Only tests happy path
test('should add item to cart', async ({ page }) => {
  await cartPage.addItem('product-1');
  await expect(cartPage.total).toContainText('$99.99');
});

// GOOD: Also test error cases
test('should show error when adding out-of-stock item', async ({ page }) => {
  await cartPage.addItem('out-of-stock-product');
  await expect(page.getByRole('alert')).toContainText('Out of stock');
});

test('should retry when network fails', async ({ page }) => {
  // Mock initial failure
  let callCount = 0;
  await page.route('/api/cart/add', route => {
    callCount++;
    if (callCount === 1) {
      route.abort('failed');
    } else {
      route.fulfill({ status: 200, body: JSON.stringify({ success: true }) });
    }
  });
  
  await cartPage.addItem('product-1');
  await expect(page.getByText('Retrying...')).toBeVisible();
  await expect(page.getByText('Added to cart')).toBeVisible();
});
```

### Hardcoded Magic Values

```typescript
// BAD: Magic number, unclear why
expect(items.length).toBe(5);

// GOOD: Named constant or explanation
const EXPECTED_ITEMS_PER_PAGE = 5;
expect(items.length).toBe(EXPECTED_ITEMS_PER_PAGE, 'Should show 5 items per page');

// BAD: Hardcoded user ID everywhere
const userId = 12345;
await api.getUser(userId);

// GOOD: Use factory
const user = createTestUser();
await api.getUser(user.id);
```

### Missing Cleanup

```typescript
// BAD: Creates data, never deletes
test('should create post', async ({ request }) => {
  const response = await request.post('/api/posts', {
    data: { title: 'Test Post' }
  });
  const post = await response.json();
  // Post 12345 now exists forever in test database
});

// GOOD: Cleanup in afterEach
const createdPostIds: string[] = [];

test.afterEach(async ({ request }) => {
  for (const postId of createdPostIds) {
    await request.delete(`/api/posts/${postId}`);
  }
  createdPostIds.length = 0;
});

test('should create post', async ({ request }) => {
  const response = await request.post('/api/posts', {
    data: { title: 'Test Post' }
  });
  const post = await response.json();
  createdPostIds.push(post.id);
  
  expect(post.title).toBe('Test Post');
});
```

### Vacuous Assertions

```typescript
// BAD: Assertion that always passes
const result = await cartPage.addItem('product-1');
expect(result).toBeTruthy(); // Result could be anything, test doesn't verify behavior

// GOOD: Specific assertion
const result = await cartPage.addItem('product-1');
expect(result.success).toBe(true, 'Should successfully add item');
expect(result.cartTotal).toBe(99.99, 'Cart total should update');
```

---

## Annotation Format for Issues

Use this format when documenting remaining issues or suggestions:

```
[MODULE-NAME] [SEVERITY] — Brief description

- File: module-name.spec.ts, line ~N
- Suggestion: How to fix this issue
- Reference: Link to pattern or best practice docs

---

[AUTH] [MAJOR] — Using XPath locator for login button

- File: auth.spec.ts, line ~45
- Current: await page.locator('//button[contains(text(), "Sign In")]').click()
- Suggestion: Use data-testid: await page.getByTestId('signin-btn').click()
  Requires adding data-testid to SignInButton component in LoginForm.tsx
- Reference: playwright-patterns.md#locator-strategy-hierarchy

---

[FORMS] [MINOR] — Form validation test missing whitespace input edge case

- File: forms.spec.ts, line ~87
- Suggestion: Add Scenario Outline example with "   " (spaces only) input
  Tests should verify that whitespace-only values are treated as empty
- Reference: playwright-patterns.md#5-assertion-best-practices

---

[CART] [MODERATE] — No cleanup after cart tests create orders

- File: cart.spec.ts, line ~120
- Current: Missing afterEach hook to delete test orders
- Suggestion: Add afterEach that calls request.delete('/api/orders/{id}') for each created order
- Reference: playwright-patterns.md#4-test-isolation-patterns
```

### Severity Levels

- **MAJOR**: Blocks merge, fundamentally breaks test quality
  - Critical flakiness indicators
  - Test would not run
  - Missing core functionality coverage

- **MODERATE**: Should fix before merge, impacts reliability
  - Resource leaks (no cleanup)
  - Weak coverage gaps
  - Isolation issues
  - Locator brittleness

- **MINOR**: Good to fix, polish improvements
  - Unnecessary timeout
  - Could add edge case test
  - Code style inconsistency
  - Could use helper function

- **STYLE**: Optional improvements
  - Naming could be clearer
  - Could extract method
  - Comment would help readability
  - Could apply pattern

---

## Calculation Examples

### Example 1: Score = 8 (Excellent)

- **Gherkin Quality**: 8/10 — All scenarios behavior-focused, clear prose, good tags; one scenario tests two behaviors (minor)
- **Playwright Quality**: 9/10 — Good POM usage, isolated, proper locators, good assertions; one test could use fixture
- **Coverage Quality**: 8/10 — Covers happy path and edge cases, one error case missing
- **Correctness**: 9/10 — Would compile, all imports correct, realistic data; one selector could be verified

**Weighted Score**: (8 × 0.25) + (9 × 0.25) + (8 × 0.25) + (9 × 0.25) = 8.5 → **8**

**Decision**: Approve with minor suggestions for improvement

---

### Example 2: Score = 6 (Good)

- **Gherkin Quality**: 6/10 — Some implementation details, okay prose; Background could be trimmed
- **Playwright Quality**: 6/10 — No POM pattern, direct selectors; some tests isolated, some not; has one arbitrary timeout
- **Coverage Quality**: 7/10 — Covers main scenarios, missing some edge cases (empty list, null values)
- **Correctness**: 6/10 — Would compile, mostly correct selectors; some test data could be more realistic

**Weighted Score**: (6 × 0.25) + (6 × 0.25) + (7 × 0.25) + (6 × 0.25) = 6.25 → **6**

**Decision**: Approve with notes for improvements before next similar task

---

### Example 3: Score = 4 (Below Average)

- **Gherkin Quality**: 3/10 — Implementation details throughout, unclear scenario names, background too large
- **Playwright Quality**: 4/10 — No POM, multiple arbitrary timeouts, hardcoded magic numbers, poor isolation
- **Coverage Quality**: 4/10 — Only happy paths, no edge cases or error testing
- **Correctness**: 5/10 — Would mostly run, but several selectors would fail, data is unrealistic

**Weighted Score**: (3 × 0.25) + (4 × 0.25) + (4 × 0.25) + (5 × 0.25) = 4 → **4**

**Decision**: Request major changes — significant refactoring needed before merge

---

## Reviewer Workflow

1. **First Read**: Scan all files to understand scope and structure
2. **Gherkin Review**: Score feature files against Gherkin checklist
3. **Implementation Review**: Score test code against Playwright checklist
4. **Coverage Review**: Verify test plan coverage and edge cases
5. **Correctness Review**: Check for compilation, imports, realistic data
6. **Aggregate**: Calculate weighted score
7. **Annotate**: Document all issues with references to patterns
8. **Recommend**: Approve, Request Changes, or Reject with path forward

---

## See Also

- `playwright-patterns.md` — Complete reference for all patterns used in scoring
- Test plan document — Feature specification to verify coverage against
- Project's `playwright.config.ts` — Framework configuration and baseline expectations
