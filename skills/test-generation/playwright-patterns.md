# Playwright Testing Patterns — Comprehensive Reference

A guide to writing high-quality, maintainable Playwright tests with proven patterns for Page Object Model, locators, waiting strategies, isolation, assertions, and network mocking.

## 1. Page Object Model (POM)

### Why POM?

The Page Object Model pattern encapsulates page interactions into reusable, maintainable classes:

- **Reduces duplication**: Define selectors and actions once, use everywhere
- **Improves maintainability**: When UI changes, update only the page object
- **Increases readability**: Test code reads like behavior, not implementation
- **Enables code reuse**: Share complex interactions across multiple tests
- **Centralizes change management**: Single source of truth for page structure

### Structure: One Class Per Page/Component

```typescript
// LoginPage.ts — encapsulates all login-related interactions
import { Page, Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;
  readonly successMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByTestId('login-email-input');
    this.passwordInput = page.getByTestId('login-password-input');
    this.submitButton = page.getByRole('button', { name: 'Sign In' });
    this.errorMessage = page.locator('[role="alert"]');
    this.successMessage = page.getByText('Successfully signed in');
  }

  // Action methods — what can you DO on this page?

  async navigate() {
    await this.page.goto('/login');
    await this.page.waitForLoadState('networkidle');
  }

  async fillEmail(email: string) {
    await this.emailInput.fill(email);
  }

  async fillPassword(password: string) {
    await this.passwordInput.fill(password);
  }

  async clickSubmit() {
    await this.submitButton.click();
  }

  async login(email: string, password: string) {
    // Compound action — coordinates multiple steps
    await this.fillEmail(email);
    await this.fillPassword(password);
    await this.clickSubmit();
  }

  async loginAndWaitForSuccess(email: string, password: string) {
    await this.login(email, password);
    await this.successMessage.waitFor({ state: 'visible', timeout: 5000 });
  }

  async getErrorText(): Promise<string> {
    return await this.errorMessage.textContent() || '';
  }

  async isErrorVisible(): Promise<boolean> {
    return await this.errorMessage.isVisible();
  }
}
```

### How to Use POM in Tests

```typescript
import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';

test.describe('Login Flow', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.navigate();
  });

  test('should successfully log in with valid credentials', async () => {
    await loginPage.loginAndWaitForSuccess('user@example.com', 'secure-password');
    // Page object handles all the details; test reads like behavior
  });

  test('should show error message with invalid credentials', async () => {
    await loginPage.login('user@example.com', 'wrong-password');
    
    const errorText = await loginPage.getErrorText();
    expect(errorText).toContain('Invalid credentials');
  });

  test('should require email field', async () => {
    await loginPage.fillPassword('some-password');
    await loginPage.clickSubmit();

    const isErrorVisible = await loginPage.isErrorVisible();
    expect(isErrorVisible).toBeTruthy('Email field should be required');
  });
});
```

### POM Best Practices

- **Constructors**: Accept `Page` and initialize all locators
- **Locators as properties**: Declare all UI elements as class properties
- **Action methods**: Return `void` or data; never return locators
- **Naming**: Use descriptive names that describe what users do, not technical details
- **Hierarchy**: Create sub-POMs for complex components (e.g., `CartPage` contains `ProductCard`)
- **Reusability**: Design for composition — make page objects work together

---

## 2. Locator Strategy Hierarchy

Choose locators in this order. **Early strategies are more stable and resilient to UI changes.**

### 1. data-testid (Most Stable)

**Why**: Explicit, resilient to styling/layout changes, framework-agnostic

```typescript
// Add to your component:
<button data-testid="submit-btn">Submit</button>

// In test:
await page.getByTestId('submit-btn').click();
```

**Best for**: Primary UI elements that are core to the feature

---

### 2. Role-Based Locators (Semantic, Accessible)

**Why**: Reflects DOM semantics, requires proper ARIA, resilient to structure changes

```typescript
// Good HTML:
<button>Submit</button>
<input type="checkbox" aria-label="Subscribe" />
<nav aria-label="Main navigation"></nav>

// Tests:
await page.getByRole('button', { name: 'Submit' }).click();
await page.getByRole('checkbox', { name: 'Subscribe' }).check();
await page.getByRole('navigation', { name: 'Main navigation' }).isVisible();
```

**Best for**: Standard form controls, buttons, navigation, headings

**Role reference**: `button`, `checkbox`, `radio`, `textbox`, `combobox`, `heading`, `navigation`, `main`, `contentinfo`

---

### 3. Label/Placeholder Text

**Why**: Semantic for form fields, readable test code

```typescript
// HTML:
<label for="email">Email Address</label>
<input id="email" type="email" />

// Test:
await page.getByLabel('Email Address').fill('user@example.com');
```

**Best for**: Form inputs with associated labels

---

### 4. CSS Class Selectors

**Why**: Acceptable when semantics unavailable, but less stable than above

```typescript
// Use only if role/label unavailable:
await page.locator('.submit-button-primary').click();

// Avoid chaining classes that will change with theming:
// BAD:  page.locator('.bg-blue-600.text-white')
// GOOD: page.locator('.primary-action')
```

**Best for**: Legacy code, complex component styling where no semantic options exist

---

### 5. Text Content (Lower Priority)

**Why**: Can be fragile if copy changes, but useful for buttons/links with static text

```typescript
// Exact text:
await page.getByText('Sign Out', { exact: true }).click();

// Partial text (more resilient):
await page.getByText('Delete Account').click();
```

**Best for**: Buttons, links with static labels; NOT for user-entered content

---

### 6. XPath (Last Resort Only)

**Why**: Fragile, hard to read, brittle to structural changes

```typescript
// AVOID UNLESS ABSOLUTELY NECESSARY:
await page.locator('//div[@data-id="sidebar"]//button[contains(text(), "Save")]').click();

// Even then, prefer:
await page.locator('[data-id="sidebar"]').getByRole('button', { name: 'Save' }).click();
```

**Only use when**: No other option exists (legacy unmaintained code, external site automation)

---

### Locator Strategy Comparison

| Strategy | Stability | Readability | Speed | Use Case |
|----------|-----------|-------------|-------|----------|
| data-testid | Highest | High | Fast | Primary elements |
| Role-based | High | High | Fast | Standard form controls |
| Label text | High | High | Fast | Form inputs |
| CSS class | Medium | Medium | Fast | Styling-agnostic needs |
| Text content | Medium | High | Medium | Static text labels |
| XPath | Low | Low | Slow | Emergency only |

---

## 3. Waiting Strategies

### Playwright's Auto-Wait (Prefer This)

Playwright automatically waits for elements to be actionable before clicking/typing. **This is the default and most reliable approach.**

```typescript
// Playwright waits for element to be:
// - attached to DOM
// - visible
// - stable (not animating)
// - enabled (not disabled)

await page.getByTestId('submit-btn').click(); // Auto-waits
await page.getByTestId('email-input').fill('user@example.com'); // Auto-waits
```

**When to use**: 95% of the time — let Playwright handle waiting

---

### Explicit Waiting: When Auto-Wait Isn't Enough

#### Wait for Element Visibility

```typescript
// Wait for element to appear (default timeout: 30s)
await page.getByTestId('success-message').waitFor({ state: 'visible' });

// Custom timeout:
await page.getByTestId('loading-spinner').waitFor({ 
  state: 'hidden', 
  timeout: 10000 
});

// In assertions:
await expect(page.getByTestId('modal')).toBeVisible();
```

#### Wait for Network Idle

```typescript
// After navigation, wait for network to settle:
await page.goto('/products');
await page.waitForLoadState('networkidle');

// Load states:
// - 'domcontentloaded': DOM is ready
// - 'load': page load event fired
// - 'networkidle': no network requests for 500ms
```

#### Wait for Specific Network Calls

```typescript
// Wait for API response before proceeding:
const responsePromise = page.waitForResponse(
  response => response.url().includes('/api/users') && response.status() === 200
);

await page.getByRole('button', { name: 'Fetch Users' }).click();
const response = await responsePromise;

const data = await response.json();
expect(data.users.length).toBeGreaterThan(0);
```

#### Wait for Function/Condition

```typescript
// Wait for custom condition:
await page.waitForFunction(() => {
  return document.querySelectorAll('ul li').length === 5;
}, 'Expected 5 list items');

// With playwright/test:
await expect(async () => {
  const count = await page.locator('ul li').count();
  expect(count).toBe(5);
}).toPass({ timeout: 10000 });
```

---

### What NOT To Do

```typescript
// NEVER use arbitrary setTimeout:
// BAD:
await page.waitForTimeout(5000);
setTimeout(() => {}, 5000);

// This is a code smell indicating:
// - Flaky test that should wait for specific condition
// - Missing explicit wait for element/network
// - Test may pass locally but fail in CI
```

**Why arbitrary waits are bad**:
- Slow down all tests (5s * 50 tests = 4+ minutes wasted)
- Fail intermittently in CI (network slower)
- Don't actually test the app behavior
- Hide real timing issues

---

### Waiting Best Practices

```typescript
// GOOD: Wait for specific state
await expect(page.getByTestId('cart-total')).toContainText('$99.99');

// GOOD: Wait for network operation
const responsePromise = page.waitForResponse(r => r.url().includes('/api/cart'));
await page.getByRole('button', { name: 'Add to Cart' }).click();
await responsePromise;

// GOOD: Let auto-wait work
await page.getByRole('button', { name: 'Checkout' }).click();

// BAD: Arbitrary timeout
await page.waitForTimeout(3000);

// BAD: Polling with setTimeout
let cartUpdated = false;
for (let i = 0; i < 10; i++) {
  const total = await page.getByTestId('cart-total').textContent();
  if (total.includes('$99.99')) {
    cartUpdated = true;
    break;
  }
  await page.waitForTimeout(500);
}
```

---

## 4. Test Isolation Patterns

Each test must be **independently runnable** — tests should not depend on side effects from other tests.

### Setup and Teardown with beforeEach/afterEach

```typescript
import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';

test.describe('Dashboard', () => {
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    // Setup: run before each test
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
    
    await loginPage.navigate();
    await loginPage.loginAndWaitForSuccess('testuser@example.com', 'test-password');
  });

  test.afterEach(async ({ page }) => {
    // Cleanup: run after each test
    // Delete test data, logout, clear cookies
    await page.context().clearCookies();
  });

  test('should display user profile', async () => {
    // No setup code needed — beforeEach handles it
    await expect(dashboardPage.userGreeting).toContainText('testuser@example.com');
  });

  test('should allow profile update', async () => {
    // Same setup, independent test
    await dashboardPage.updateProfile({ name: 'New Name' });
    await expect(dashboardPage.profileName).toContainText('New Name');
  });
});
```

### Playwright Fixtures for Shared State

```typescript
import { test as base, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';

type TestFixtures = {
  authenticatedPage: Page;
  loginPage: LoginPage;
};

export const test = base.extend<TestFixtures>({
  authenticatedPage: async ({ page }, use) => {
    // Setup fixture
    const loginPage = new LoginPage(page);
    await loginPage.navigate();
    await loginPage.loginAndWaitForSuccess('testuser@example.com', 'password');
    
    // Test runs with authenticated page
    await use(page);
    
    // Cleanup after test
    await page.context().clearCookies();
  },

  loginPage: async ({ authenticatedPage }, use) => {
    const loginPage = new LoginPage(authenticatedPage);
    await use(loginPage);
  },
});

// Usage:
test('should display dashboard when authenticated', async ({ authenticatedPage, loginPage }) => {
  // Page is already authenticated, no setup needed
  await expect(authenticatedPage.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});
```

### Test Data Factories

```typescript
// factories/user-factory.ts
export function createTestUser(overrides?: Partial<User>): User {
  return {
    email: 'testuser@example.com',
    password: 'secure-password',
    firstName: 'Test',
    lastName: 'User',
    role: 'user',
    ...overrides,
  };
}

export function createAdminUser(overrides?: Partial<User>): User {
  return {
    ...createTestUser(overrides),
    role: 'admin',
    email: 'admin@example.com',
  };
}

// Usage in tests:
test('should allow admin to delete users', async ({ page }) => {
  const admin = createAdminUser();
  const targetUser = createTestUser({ email: 'to-delete@example.com' });
  
  // Setup test data via API
  await api.users.create(admin);
  await api.users.create(targetUser);
  
  // Test admin deletion flow
  const loginPage = new LoginPage(page);
  await loginPage.loginAndWaitForSuccess(admin.email, admin.password);
  // ... test deletion
});
```

### Resource Cleanup

```typescript
test.describe('Product Management', () => {
  const createdProductIds: string[] = [];

  test.afterEach(async ({ request }) => {
    // Clean up created test data via API (faster than UI)
    for (const productId of createdProductIds) {
      await request.delete(`/api/products/${productId}`);
    }
    createdProductIds.length = 0; // Reset for next test
  });

  test('should create new product', async ({ page, request }) => {
    const productPage = new ProductPage(page);
    await productPage.navigate();
    
    const newProductName = `Test Product ${Date.now()}`;
    await productPage.createProduct(newProductName);
    
    // Verify via API and save for cleanup
    const response = await request.get(`/api/products?name=${newProductName}`);
    const data = await response.json();
    createdProductIds.push(data.id);
    
    expect(data.name).toBe(newProductName);
  });
});
```

---

## 5. Assertion Best Practices

### Always Use expect() with Specific Matchers

```typescript
// GOOD: Specific, clear intent
expect(cartTotal).toBe(99.99, 'Cart total should be $99.99 after adding item');
expect(items).toHaveLength(3, 'Should have 3 items in cart');
expect(userName).toContain('John', 'User name should contain first name');

// BAD: Generic assertion, no message
expect(cartTotal).toBeTruthy();
expect(items).toBeTruthy();

// BAD: Assertion without context
expect(cartTotal).toBe(99.99);
```

### Custom Failure Messages for Clarity

```typescript
// Without message:
// Expected 5 but received 3
// ^^^ Unhelpful in CI

// With message:
// Expected 5 but received 3
// Cart should have 3 items after adding product
// ^^^ Context helps debugging

expect(cartItems.length).toBe(3, 'Should have 3 items in cart after adding one');

// For assertions:
await expect(page.getByTestId('error-message')).toBeVisible(
  'Error message should display when submitting empty form'
);
```

### Soft Assertions for Non-Critical Checks

```typescript
// Soft assertions continue after failure, collect all failures
test('should display complete profile', async ({ page }) => {
  const profilePage = new ProfilePage(page);
  await profilePage.navigate();

  // These fail but test continues:
  await expect.soft(profilePage.avatar).toBeVisible();
  await expect.soft(profilePage.bio).toContainText('Software Engineer');
  await expect.soft(profilePage.socialLinks.twitter).toBeVisible();
  
  // Hard assertion stops on first failure
  await expect(profilePage.profileName).toContainText('John Doe');

  // Report: 3 failures instead of stopping at first
});
```

### Visual Regression Testing

```typescript
test('should match homepage snapshot', async ({ page }) => {
  const homePage = new HomePage(page);
  await homePage.navigate();
  
  // Capture full page screenshot
  await expect(page).toHaveScreenshot('homepage.png');
  
  // Compare with baseline — fails if different
  // Update baseline with: npx playwright test --update-snapshots
});

test('should match product card visually', async ({ page }) => {
  const productPage = new ProductPage(page);
  await productPage.navigate();
  
  // Snapshot only the card component
  const productCard = page.locator('[data-testid="product-card"]').first();
  await expect(productCard).toHaveScreenshot('product-card.png');
});
```

### API Response Assertions

```typescript
test('should fetch user data with correct structure', async ({ page, request }) => {
  const response = await request.get('/api/users/123');
  
  // Assert status
  expect(response.status()).toBe(200, 'Should return 200 OK');
  
  // Assert headers
  expect(response.headers()['content-type']).toContain('application/json');
  
  // Assert body
  const data = await response.json();
  expect(data).toMatchObject({
    id: 123,
    email: expect.any(String),
    createdAt: expect.any(String),
  });
  
  // Assert nested data
  expect(data.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
});
```

### Assertion Helper Functions

```typescript
// helpers/assertions.ts
export async function expectToastMessage(page: Page, message: string) {
  const toast = page.getByRole('alert');
  await expect(toast).toContainText(message, 'Toast should display expected message');
  await expect(toast).toBeVisible('Toast should be visible');
}

export async function expectFormError(page: Page, fieldName: string, errorText: string) {
  const errorMsg = page.locator(`[data-error-for="${fieldName}"]`);
  await expect(errorMsg).toContainText(errorText);
}

export async function expectTableRowCount(page: Page, count: number) {
  const rows = page.locator('table tbody tr');
  await expect(rows).toHaveCount(count, `Table should have ${count} rows`);
}

// Usage:
test('should show validation error', async ({ page }) => {
  const form = new RegistrationForm(page);
  await form.submitWithoutEmail();
  
  await expectFormError(page, 'email', 'Email is required');
});
```

---

## 6. Network Mocking and API Interception

### Basic Route Interception

```typescript
test('should display mocked user data', async ({ page }) => {
  // Intercept all GET requests to /api/users
  await page.route('/api/users/**', async (route) => {
    // Respond with mock data instead of real API
    await route.abort('failed');
    
    // Or respond with custom data:
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 1,
        name: 'Mocked User',
        email: 'mock@example.com',
      }),
    });
  });

  await page.goto('/users/1');
  
  // UI shows mocked data
  await expect(page.getByText('Mocked User')).toBeVisible();
});
```

### Intercepting and Modifying Requests

```typescript
test('should intercept and modify request headers', async ({ page }) => {
  await page.route('/api/**', async (route) => {
    const request = route.request();
    
    // Inspect and modify request
    await route.continue({
      headers: {
        ...request.headers(),
        'Authorization': 'Bearer mocked-token',
      },
    });
  });

  await page.goto('/dashboard');
  // All requests to /api/* now have mocked auth header
});
```

### Waiting for Specific API Calls

```typescript
test('should call correct API when adding to cart', async ({ page }) => {
  // Setup expectation for specific API call
  const requestPromise = page.waitForRequest(
    request => request.url().includes('/api/cart/items') && request.method() === 'POST'
  );

  const responsePromise = page.waitForResponse(
    response => response.url().includes('/api/cart/items') && response.status() === 201
  );

  // Trigger action
  await page.getByRole('button', { name: 'Add to Cart' }).click();

  // Wait for and verify request/response
  const request = await requestPromise;
  const response = await responsePromise;

  const postData = request.postDataJSON();
  expect(postData.productId).toBe('product-123');
  
  const responseData = await response.json();
  expect(responseData.cartTotal).toBe(99.99);
});
```

### Recording Network Activity

```typescript
test('should log all network activity', async ({ page }) => {
  const networkLog: { url: string; status: number; method: string }[] = [];

  page.on('response', (response) => {
    networkLog.push({
      url: response.url(),
      status: response.status(),
      method: response.request().method(),
    });
  });

  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Load More' }).click();

  // Verify no failed requests
  const failedRequests = networkLog.filter(r => r.status >= 400);
  expect(failedRequests).toHaveLength(0, `No requests should fail: ${JSON.stringify(failedRequests)}`);

  // Verify specific endpoints called
  expect(networkLog.some(r => r.url.includes('/api/users'))).toBeTruthy('Should call users endpoint');
});
```

---

## 7. Common Testing Patterns

### Authentication Helper (Login Once, Reuse Session)

```typescript
// auth/authenticated-context.ts
export async function authenticateSession(context: BrowserContext, credentials: Credentials) {
  const page = await context.newPage();
  
  const loginPage = new LoginPage(page);
  await loginPage.navigate();
  await loginPage.login(credentials.email, credentials.password);
  
  // Wait for successful login redirect
  await page.waitForURL('/dashboard');
  
  // Save storage state for all pages in context
  await context.storageState({ path: 'auth.json' });
  await page.close();
}

// playwright.config.ts
use: {
  storageState: 'auth.json', // Reuse auth across tests
}
```

### Form Filling Pattern

```typescript
// pages/RegistrationForm.ts
export class RegistrationForm {
  constructor(private page: Page) {}

  async fillForm(userData: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }) {
    await this.page.getByLabel('First Name').fill(userData.firstName);
    await this.page.getByLabel('Last Name').fill(userData.lastName);
    await this.page.getByLabel('Email').fill(userData.email);
    await this.page.getByLabel('Password').fill(userData.password);
  }

  async submitForm() {
    await this.page.getByRole('button', { name: 'Register' }).click();
    await this.page.waitForURL('/welcome');
  }

  async registerUser(userData: Parameters<typeof this.fillForm>[0]) {
    await this.fillForm(userData);
    await this.submitForm();
  }
}

// Test:
test('should register new user', async ({ page }) => {
  const form = new RegistrationForm(page);
  const testUser = createTestUser();
  
  await form.registerUser(testUser);
  await expect(page.getByText(`Welcome, ${testUser.firstName}`)).toBeVisible();
});
```

### Table/List Testing

```typescript
export class DataTable {
  constructor(private page: Page) {}

  async getRowData(rowIndex: number): Promise<Record<string, string>> {
    const row = this.page.locator('table tbody tr').nth(rowIndex);
    const cells = await row.locator('td').allTextContents();
    
    const headers = await this.page.locator('table thead th').allTextContents();
    
    return headers.reduce((acc, header, i) => ({
      ...acc,
      [header]: cells[i],
    }), {});
  }

  async getTableData(): Promise<Record<string, string>[]> {
    const rowCount = await this.page.locator('table tbody tr').count();
    const rows = [];
    
    for (let i = 0; i < rowCount; i++) {
      rows.push(await this.getRowData(i));
    }
    
    return rows;
  }

  async searchTable(searchTerm: string) {
    await this.page.getByPlaceholder('Search...').fill(searchTerm);
    await this.page.waitForLoadState('networkidle');
  }

  async sortByColumn(columnName: string) {
    const header = this.page.getByRole('columnheader', { name: columnName });
    await header.click();
  }
}

// Test:
test('should search and sort product table', async ({ page }) => {
  const table = new DataTable(page);
  
  await table.searchTable('laptop');
  const results = await table.getTableData();
  
  expect(results.every(row => row.Name.includes('laptop'))).toBeTruthy();
  expect(results).toHaveLength(5);

  await table.sortByColumn('Price');
  const sortedResults = await table.getTableData();
  
  const prices = sortedResults.map(r => parseFloat(r.Price));
  const isSorted = prices.every((val, i, arr) => !i || arr[i - 1] <= val);
  expect(isSorted).toBeTruthy('Prices should be sorted ascending');
});
```

### File Upload Testing

```typescript
export class FileUploadForm {
  constructor(private page: Page) {}

  async uploadFile(filePath: string) {
    const fileInput = this.page.locator('input[type="file"]');
    await fileInput.setInputFiles(filePath);
    
    // Wait for upload to complete
    await this.page.waitForLoadState('networkidle');
  }

  async uploadMultipleFiles(filePaths: string[]) {
    const fileInput = this.page.locator('input[type="file"]');
    await fileInput.setInputFiles(filePaths);
    await this.page.waitForLoadState('networkidle');
  }

  async getUploadedFileList(): Promise<string[]> {
    return await this.page.locator('[data-testid="file-list"] li').allTextContents();
  }
}

// Test:
test('should upload CSV file', async ({ page }) => {
  const form = new FileUploadForm(page);
  
  // Create temp file
  const testFile = path.join(__dirname, 'fixtures', 'test-data.csv');
  
  await form.uploadFile(testFile);
  
  const files = await form.getUploadedFileList();
  expect(files).toContain('test-data.csv');
});
```

### Modal/Dialog Testing

```typescript
export class Modal {
  constructor(private page: Page, private testid: string) {}

  private get dialog() {
    return this.page.locator(`[data-testid="${this.testid}"]`);
  }

  async isOpen(): Promise<boolean> {
    return await this.dialog.isVisible();
  }

  async getTitle(): Promise<string> {
    return await this.dialog.getByRole('heading').textContent() || '';
  }

  async getContent(): Promise<string> {
    return await this.dialog.locator('.modal-content').textContent() || '';
  }

  async clickButton(buttonName: string) {
    await this.dialog.getByRole('button', { name: buttonName }).click();
  }

  async confirm() {
    await this.clickButton('Confirm');
    await this.page.waitForFunction(() => {
      return !document.querySelector(`[data-testid="${this.testid}"]`);
    });
  }

  async cancel() {
    await this.clickButton('Cancel');
    await expect(this.dialog).not.toBeVisible();
  }
}

// Test:
test('should delete item with confirmation', async ({ page }) => {
  const deleteButton = page.getByRole('button', { name: 'Delete' });
  await deleteButton.click();

  const confirmDialog = new Modal(page, 'delete-confirmation');
  await expect(confirmDialog.dialog).toBeVisible();
  
  const title = await confirmDialog.getTitle();
  expect(title).toContain('Delete Item');

  await confirmDialog.confirm();
  
  // Item should be removed from list
  await expect(page.getByText('Item Name')).not.toBeVisible();
});
```

---

## Summary: Key Takeaways

1. **Use Page Object Model** to encapsulate interactions and keep tests readable
2. **Follow the locator hierarchy** — data-testid > role > label > CSS > text > XPath
3. **Let Playwright auto-wait** — explicit waits only when necessary
4. **Isolate tests completely** — no shared state, each test runs independently
5. **Write clear assertions** — include custom messages explaining what you're testing
6. **Mock network calls strategically** — test happy path and error paths separately
7. **Keep tests focused** — one scenario per test, one behavior per assertion
8. **Use fixtures and factories** — reduce setup code duplication

These patterns create **maintainable, fast, reliable tests** that catch real bugs without flake.
