# Gherkin Patterns & Best Practices

A comprehensive reference for writing high-quality Gherkin feature files.
Use this guide when authoring or reviewing feature scenarios for clarity, maintainability, and testability.

---

## Table of Contents

1. [Feature File Structure](#feature-file-structure)
2. [EARS Format Guide](#ears-format-guide)
3. [Scenario Naming](#scenario-naming)
4. [Given/When/Then Best Practices](#givenwhen-then-best-practices)
5. [Scenario Outline & Examples](#scenario-outline--examples)
6. [Tag Taxonomy](#tag-taxonomy)
7. [Background Guidelines](#background-guidelines)
8. [Anti-Patterns to Avoid](#anti-patterns-to-avoid)
9. [Complete Examples](#complete-examples)

---

## Feature File Structure

Every Gherkin feature file follows this structure:

```gherkin
# language: en
Feature: [Feature Name]
  [Long description explaining the feature value]

  Background:
    [Shared preconditions]

  Scenario: [Scenario name]
    Given [initial context]
    When [action taken]
    Then [expected outcome]

  Scenario Outline: [Parameterized scenario]
    Given [initial context with <placeholder>]
    When [action taken with <placeholder>]
    Then [expected outcome with <placeholder>]

    Examples:
      | placeholder | placeholder |
      | value1      | value1      |
      | value2      | value2      |

  Rule: [Business rule]
    Scenario: [Scenario under the rule]
```

### Key Elements

| Element | Purpose | When to Use |
|---------|---------|-----------|
| **Feature** | Top-level descriptor | Required. One per file. |
| **Feature Description** | Multi-line narrative explaining value | Recommended. Explain "who/what/why" |
| **Background** | Shared setup steps | Optional. Only if 2+ scenarios share setup |
| **Scenario** | Single test case | Required. Concrete example with fixed values |
| **Scenario Outline** | Parameterized test case | Use for testing multiple inputs |
| **Examples** | Data table for Outline | Required (with Scenario Outline) |
| **Rule** | Business rule grouping scenarios | Optional. Use for complex features with rules |

---

## EARS Format Guide

**EARS** = Event, Action, Response System format for acceptance criteria.

EARS maps test steps to a clear cause-and-effect structure:

### EARS Template

```
WHEN [Event/condition occurs]
IF [Optional condition modifier]
THEN [System SHALL perform action]
AND [Additional action]
AND [Constraint or quality statement]
```

### EARS in Gherkin

Map EARS to Given/When/Then:

```gherkin
Scenario: Process payment when customer submits checkout
  # Setup the event conditions
  Given a customer with valid payment method on file
  And a cart containing $99.99 in items
  And the customer is in the US (no tax)
  
  # The event that triggers the system
  When the customer submits the checkout form
  
  # The system's response(s)
  Then the order is created with status "pending_payment"
  And the payment processor is called
  And a confirmation email is sent within 5 seconds
  And the order receipt contains the 6-digit order ID
```

### EARS Variations

**Conditional Response (IF)**:
```gherkin
When the customer submits checkout
Then the order is created
And IF the shipping cost exceeds $50 THEN a discount is applied
```

**Quality Statements (SHALL/MUST)**:
```gherkin
Then the API response time SHALL be under 2 seconds
And the response MUST include all required fields
And the encryption standard MUST be AES-256
```

**Negative Cases**:
```gherkin
When the user attempts to withdraw $5000 but balance is $100
Then the withdrawal SHALL fail
And the account balance SHALL remain $100
And the error message SHALL be "Insufficient funds"
```

---

## Scenario Naming

Great scenario names **document the test at a glance**. They explain:
- What is being tested (the subject)
- The condition or context
- The expected outcome (optional, implied by name)

### Good vs. Bad Examples

| Bad | Good | Why Better |
|-----|------|-----------|
| Test login | Successful login with valid credentials | Specific. Tells you exactly what's tested. |
| Create account | User creates account with valid email and password | Subject + action + conditions. |
| Error handling | Login fails with invalid email format | Tests the error case explicitly. |
| Checkout process | Customer completes checkout and receives confirmation | Full scenario at a glance. |
| API test | API returns user data after authentication | System behavior, not implementation. |
| Validation | Email validation rejects duplicate domains | Specific, business-focused behavior. |
| Edge case | Login succeeds even when email has leading/trailing spaces | Documents the edge case being tested. |

### Naming Patterns by Test Type

**Happy Path**:
```
User successfully logs in with valid email and password
Customer completes purchase with valid payment method
Email is sent successfully to new subscriber
```

**Error Cases**:
```
Login fails when password is incorrect
Checkout fails when card is declined
API returns 404 when resource does not exist
```

**Edge Cases**:
```
Login succeeds when email has leading/trailing whitespace
Search returns results for special characters like apostrophes
Payment processes for amounts less than $0.01
```

**Boundary Cases**:
```
Maximum 10 items can be added to cart
Minimum password length is 8 characters
Usernames must not exceed 30 characters
```

---

## Given/When/Then Best Practices

### Given = Preconditions (State Setup)

**Given** establishes the initial state. It answers: "What is true before the action?"

#### Good Given Steps

```gherkin
Given a user with email "alice@example.com" exists in the system
Given the user has an active subscription
Given the database contains 5 user accounts
Given the authentication token expires in 1 minute
Given the cart contains a hat priced at $25
```

#### Characteristics of Good Given Steps

- **Past tense** (optional, but consistent): "Given a user was created"
- **Specific values**: "alice@example.com" not "some user email"
- **Testable state**: Something that can be verified or set up
- **Independent**: Not dependent on previous scenario results

#### Anti-Patterns in Given

```gherkin
# BAD: Too vague
Given the system is set up
Given the user is ready

# BAD: Action, not state
Given the user logs in
Given the admin approves the request

# BAD: Assertion (should be Then)
Given the user is logged in and has a valid token
Given the payment was successful and the order was created

# BETTER: Clear, specific state
Given a user exists with email "alice@example.com"
And the user's email has been verified
And the user's account status is "active"
```

---

### When = Actions (User Behavior, System Triggers)

**When** describes the action or event that triggers the system. It answers: "What does the user do? What happens?"

#### Good When Steps

```gherkin
When the user submits the login form with valid credentials
When the customer clicks the "Checkout" button
When the API receives a GET request to /users/123
When the system processes the payment
When the user updates their profile name
```

#### Characteristics of Good When Steps

- **Single action** (per step): One thing that happens
- **User-centric or system-event**: What the user does or what triggers the system
- **Present tense**: "When the user clicks..." (describes the action)
- **Concrete**: Not "When something happens"

#### Anti-Patterns in When

```gherkin
# BAD: Multiple actions
When the user logs in and updates their profile and clicks save

# BAD: Vague
When the system processes the request
When something is done

# BAD: Includes assertions
When the user submits the form and expects success

# BETTER: Single, clear action
When the user submits the login form
And the browser redirects to the dashboard
```

---

### Then = Expected Outcomes (Assertions)

**Then** describes what should happen as a result. It answers: "What is the expected outcome?"

#### Good Then Steps

```gherkin
Then the user is logged in
Then the API response status is 200
Then the success message "Account created" is displayed
Then the order is created with status "pending"
Then the email is sent to "alice@example.com" within 5 seconds
```

#### Characteristics of Good Then Steps

- **Observable outcome**: Something you can verify
- **Specific**: "201 Created" not "response is successful"
- **Quantified when possible**: "within 5 seconds", "exactly 3 emails"
- **Focused on behavior, not implementation**: "user is logged in" not "session cookie is set"

#### Anti-Patterns in Then

```gherkin
# BAD: Vague
Then the system works
Then everything is correct
Then success happens

# BAD: Implementation details
Then the database INSERT is called
Then the session cookie is set to value XYZ
Then localStorage contains {"user": "alice"}

# BAD: Multiple independent assertions
Then the order is created and the email is sent and the payment is processed
# Better: Use separate Then/And steps

# BETTER: Clear, verifiable outcome
Then the order is created with status "pending"
And a confirmation email is sent
And the payment is processed
```

---

### And/But for Multiple Steps

Use **And** to continue the same clause type, **But** to negate or contrast:

```gherkin
Scenario: User updates profile information
  Given the user is logged in
  And the user has a profile created
  And the user's name is "Alice"
  When the user updates their name to "Alicia"
  Then the profile is updated
  And the name change is reflected on the dashboard
  But the email remains unchanged
  And the update timestamp is recorded
```

#### When to Use And vs. But

| Use And | Use But |
|---------|---------|
| Continuing same clause type | Negating/contrasting previous step |
| Adding more conditions | Verifying something did NOT happen |
| Multiple assertions | Special case negation |

```gherkin
# And: Adding conditions
Given the user is logged in
And the user has a profile
And the user has 5 saved addresses

# But: Negating/contrast
Then the address is deleted
But the primary address is NOT changed
And the backup address remains intact
```

---

## Scenario Outline & Examples

**Scenario Outline** allows testing multiple inputs with the same scenario template.
Use it to test many combinations without repeating the scenario.

### Structure

```gherkin
Scenario Outline: [Template with placeholders]
  Given [condition with <placeholder>]
  When [action with <placeholder>]
  Then [assertion with <placeholder>]

  Examples:
    | Column1    | Column2    | Column3      |
    | value1     | value2     | expected1    |
    | value3     | value4     | expected2    |
    | value5     | value6     | expected3    |
```

### Complete Example

```gherkin
Feature: Email Validation
  Users should only be able to sign up with valid email addresses

  Scenario Outline: Email validation for signup
    Given a signup form is displayed
    When the user enters "<email>" as their email
    And clicks the submit button
    Then the form submission status is "<result>"
    And the error message is "<message>"

    Examples:
      | email                    | result   | message                      |
      | user@example.com         | success  | ""                           |
      | user+tag@example.co.uk   | success  | ""                           |
      | invalid.email@           | rejected | "Invalid email format"       |
      | @example.com             | rejected | "Email must include username"|
      | spaces in@email.com      | rejected | "Email cannot contain spaces"|
      | duplicate@example.com    | rejected | "Email already registered"   |
```

### Tips for Scenario Outline

1. **Keep placeholders readable**: Use names like `<email>`, `<status>`, not `<x>`, `<y>`
2. **Align Examples table**: Make it easy to read
3. **Test the important combinations**: Don't test every permutation, focus on:
   - Valid inputs
   - Common invalid inputs
   - Boundary values
4. **Keep rows focused**: Don't make Examples table with 10+ columns
5. **One assertion per row if possible**: Don't make table rows too complex

### Bad Example (Too Complex)

```gherkin
# DON'T: Too many columns and scenarios
Scenario Outline: Complex workflow
  Given the user has <status> account
  When the user submits <action> with <value>
  And the system processes <type>
  Then the response is <code>
  And the state becomes <new_state>
  And the user sees <message>
  And the email is sent to <recipient>
  And the notification status is <notif_status>

  Examples:
    | status | action | value | type | code | new_state | message | recipient | notif_status |
    | ...    | ...    | ...   | ...  | ...  | ...       | ...     | ...       | ...          |
```

This is too complex. Break it into 2-3 focused scenarios instead.

---

## Tag Taxonomy

Tags help organize, categorize, and filter scenarios for different test runs.

### Standard Tags

```gherkin
@smoke
# Critical path. Run on every deployment.
# Examples: login, checkout, API health check
Scenario: User successfully logs in with valid credentials
  ...

@regression
# Full test suite. Run on all major code changes.
# Examples: All happy paths + common error cases
Scenario: User account is created with valid data
  ...

@api
# Backend/API tests. Usually no UI.
Scenario: API returns 200 for valid request
  ...

@component
# UI component tests (not full page flows).
# Examples: Button behavior, form validation
Scenario: Select dropdown opens and shows options
  ...

@unit
# Isolated unit test. Minimal dependencies.
Scenario: Email validation rejects invalid format
  ...

@wip
# Work in progress. Not ready. Skip in CI.
Scenario: Feature not yet implemented
  ...

@accessibility
# Accessibility/WCAG compliance tests.
Scenario: Form labels are announced by screen reader
  ...

@performance
# Performance/load/stress tests.
Scenario: API responds under 500ms for 1000 concurrent requests
  ...

@security
# Security tests.
Scenario: SQL injection attempt is rejected
  ...

@integration
# Multi-system integration tests.
Scenario: Payment processor webhook updates order status
  ...
```

### How to Use Tags in Test Runs

```bash
# Run only smoke tests
npm test -- --tags @smoke

# Run regression suite (all tests except @wip)
npm test -- --tags "not @wip"

# Run API tests and integration tests
npm test -- --tags "@api or @integration"

# Run all tests except performance tests
npm test -- --tags "not @performance"
```

### Example Feature File with Tags

```gherkin
Feature: User Authentication
  @smoke @api
  Scenario: User successfully logs in
    ...

  @regression @api
  Scenario: Login fails with wrong password
    ...

  @accessibility
  Scenario: Login form labels are announced by screen reader
    ...

  @wip
  Scenario: Login with social media
    # Not yet implemented
    ...
```

---

## Background Guidelines

**Background** allows you to define shared preconditions that apply to all scenarios in the feature.

### When to Use Background

✓ **Use Background when**:
- 2+ scenarios need the same setup
- Setup is brief (1-3 steps)
- Setup is truly shared (not just sometimes)

✗ **Don't use Background when**:
- Only 1 scenario needs the setup
- Setup is complex or varies per scenario
- Different scenarios need different variations of setup

### Good Background Example

```gherkin
Feature: Shopping Cart
  Background:
    Given a user with email "alice@example.com" exists
    And the user is logged in
    And the user is viewing the product catalog

  Scenario: User adds item to cart
    When the user clicks "Add to Cart" on the hat
    Then the cart contains 1 item
    And the cart total is $25.00

  Scenario: User removes item from cart
    When the user adds a hat to the cart
    And the user clicks "Remove" on the hat
    Then the cart is empty
    And the cart total is $0.00
```

### Bad Background Example (Too Long)

```gherkin
# DON'T: Background is too complex
Feature: User Profiles
  Background:
    Given a user with email "alice@example.com" exists
    And the user's email has been verified
    And the user has set up 2FA
    And the user has a profile picture uploaded
    And the user has 3 addresses on file
    And the user has a subscription active
    And the user has 5 orders in history
    And the user has left 2 product reviews
    And the user has saved 10 items
    And the user's account was created 2 years ago
    And ...
```

This is too much. Either break scenarios or use Given steps specifically in scenarios that need it.

### Background Tips

1. **Keep it short**: 1-3 steps maximum
2. **Use simple, clear language**: Same as any Given step
3. **Test each precondition**: If Background sets up 3 things, test them independently
4. **Never put assertions in Background**: Assertions belong in Then

### Anti-Patterns in Background

```gherkin
# BAD: Assertions in Background
Background:
  Given a user is logged in
  Then the user ID is visible

# BAD: Too many steps
Background:
  Given ... (10 steps of setup)

# BAD: Setup varies per scenario
Background:
  Given a user exists
  # Some scenarios need admin user, some need regular user
  # Better: Put this in individual scenarios

# BETTER: Minimal, clear setup
Background:
  Given a user with email "alice@example.com" exists
  And the user is logged in
```

---

## Anti-Patterns to Avoid

### 1. Implementation Details in Scenarios

❌ **Bad**: Testing how, not what

```gherkin
Scenario: User updates profile
  Given the user's localStorage contains {"user_id": "123"}
  When the React component calls the /api/users/123 endpoint
  And the response resolves to {"name": "Alice"}
  Then the state variable "profileName" is set to "Alice"
  And the render method outputs <span>Alice</span>
```

✅ **Good**: Testing behavior, not implementation

```gherkin
Scenario: User updates their profile name
  Given a user with name "Alice" is logged in
  When the user changes their name to "Alicia"
  Then the profile displays the new name "Alicia"
  And the change persists after the page reloads
```

---

### 2. Vague Steps

❌ **Bad**: Too abstract

```gherkin
Scenario: The system works correctly
  Given the system is set up
  When the user does something
  Then the system responds
```

✅ **Good**: Specific and concrete

```gherkin
Scenario: User successfully completes purchase
  Given a user with valid payment method on file
  And a cart with $50 in items
  When the user submits the checkout form
  Then the order is created with status "completed"
  And a confirmation email is sent within 5 seconds
```

---

### 3. Too Many Steps per Scenario

❌ **Bad**: 10+ steps, hard to follow

```gherkin
Scenario: Complex workflow
  Given ...
  And ...
  And ...
  When ...
  And ...
  And ...
  And ...
  Then ...
  And ...
  And ...
  And ...
  And ...
```

✅ **Good**: 5-8 steps, clear focus

```gherkin
Scenario: User updates shipping address
  Given a user with a saved shipping address
  When the user changes the address to a new location
  Then the new address is saved
  And the old address is no longer selected

Scenario: System validates address format
  Given a shipping form is displayed
  When the user enters an incomplete address
  Then validation error "Street address is required" is shown
```

---

### 4. Conjunctive Steps (Multiple Actions in One Step)

❌ **Bad**: Multiple actions, hard to debug

```gherkin
When the user enters their email, password, and confirms their account
And the form is submitted, validated, and processed
Then the user is logged in, redirected, and sees the dashboard
```

✅ **Good**: One action per step

```gherkin
When the user enters their email
And the user enters their password
And the user clicks the login button
Then the user is logged in
And the user is redirected to the dashboard
And the dashboard is displayed
```

---

### 5. Testing UI Layout, Not Behavior

❌ **Bad**: Testing CSS, not functionality

```gherkin
Scenario: Button styling
  When the user hovers over the button
  Then the button background color changes to blue
  And the button width is 100px
  And the button height is 40px
  And the text is centered
```

✅ **Good**: Testing user interaction, not layout

```gherkin
Scenario: User can submit form
  Given a signup form with valid data
  When the user clicks the submit button
  Then the form is submitted
  And a success message is displayed
```

---

### 6. Ignoring Business Context

❌ **Bad**: Only technical details

```gherkin
Scenario: API endpoint
  When GET /api/users/123
  Then response code is 200
  And response contains {"id": 123}
```

✅ **Good**: Business behavior

```gherkin
Scenario: User can view their profile
  Given a user is logged in
  When the user navigates to their profile
  Then the profile page displays their name, email, and profile picture
```

---

### 7. Brittle Assertions

❌ **Bad**: Too specific to implementation

```gherkin
Then the error message div has class "error-message-red-bold-12px"
And the button HTML is "<button class='btn'>Submit</button>"
```

✅ **Good**: Testing the meaningful outcome

```gherkin
Then an error message is displayed with text "Email already in use"
And the submit button is disabled
```

---

## Complete Examples

### Example 1: E-Commerce Checkout

```gherkin
Feature: Customer Checkout
  As a customer
  I want to purchase items from my cart
  So that I can receive my order

  Background:
    Given a customer with email "customer@example.com" exists
    And the customer is logged in
    And the customer has a cart with 2 items ($50 total)

  Scenario: Customer completes checkout with valid payment
    When the customer clicks the checkout button
    And the customer selects their saved shipping address
    And the customer selects their saved payment method
    And the customer submits the order
    Then the order is created with status "pending_payment"
    And the payment processor is charged $50
    And a confirmation email is sent to the customer
    And the customer is redirected to the order confirmation page

  Scenario: Checkout fails when payment is declined
    When the customer clicks the checkout button
    And the customer selects a declined credit card
    And the customer submits the order
    Then the payment is rejected
    And an error message "Payment declined" is displayed
    And the order is NOT created
    And the cart contents are preserved

  Scenario Outline: Tax is calculated correctly by region
    Given the customer is in the <region>
    And the cart total (pre-tax) is <cart_amount>
    When the customer proceeds to checkout
    Then the tax amount shown is <expected_tax>
    And the total shown is <total_with_tax>

    Examples:
      | region        | cart_amount | expected_tax | total_with_tax |
      | California    | $100.00     | $8.25        | $108.25        |
      | New York      | $100.00     | $8.88        | $108.88        |
      | Oregon        | $100.00     | $0.00        | $100.00        |
      | International | $100.00     | $0.00        | $100.00        |
```

---

### Example 2: User Authentication

```gherkin
Feature: User Login
  As a user
  I want to log in with my email and password
  So that I can access my account

  Scenario: Successful login with valid credentials
    Given the login page is displayed
    And a user with email "alice@example.com" and password "SecurePass123" exists
    When the user enters their email "alice@example.com"
    And the user enters their password "SecurePass123"
    And the user clicks the login button
    Then the user is logged in
    And the user is redirected to the dashboard
    And the session token is stored securely

  Scenario: Login fails with incorrect password
    Given the login page is displayed
    And a user with email "alice@example.com" exists
    When the user enters their email "alice@example.com"
    And the user enters their password "WrongPassword"
    And the user clicks the login button
    Then the login fails
    And an error message "Invalid email or password" is displayed
    And the user remains on the login page

  Scenario: Login fails with non-existent email
    Given the login page is displayed
    When the user enters their email "nonexistent@example.com"
    And the user enters their password "SomePassword123"
    And the user clicks the login button
    Then the login fails
    And an error message "Invalid email or password" is displayed
    And the user remains on the login page

  Scenario Outline: Password entry masks characters
    Given the login page is displayed
    When the user enters password "<password>" in the password field
    Then the password field displays <visible_char_count> dots
    And the password is NOT visible in plain text

    Examples:
      | password      | visible_char_count |
      | abc123        | 6                  |
      | SecurePass    | 10                 |
      | P@ssw0rd!     | 10                 |
```

---

### Example 3: Form Validation

```gherkin
Feature: Email Signup Form
  Users must provide valid information to sign up

  @smoke
  Scenario: User successfully signs up with valid data
    Given the signup page is displayed
    When the user enters "alice@example.com" in the email field
    And the user enters "SecurePass123" in the password field
    And the user confirms the password "SecurePass123"
    And the user clicks the signup button
    Then the user account is created
    And a verification email is sent to "alice@example.com"
    And the user is redirected to a "Check your email" page

  @regression
  Scenario Outline: Email validation rejects invalid formats
    Given the signup page is displayed
    When the user enters "<email>" in the email field
    And the user clicks outside the email field
    Then the error message is "<error_message>"
    And the signup button is disabled

    Examples:
      | email                    | error_message              |
      | plainaddress             | "Enter a valid email"      |
      | @example.com             | "Enter a valid email"      |
      | alice@                   | "Enter a valid email"      |
      | alice @example.com       | "Enter a valid email"      |
      | alice+tag@example.co.uk  | ""                         |

  @regression
  Scenario Outline: Password validation enforces requirements
    Given the signup page is displayed
    When the user enters a password "<password>" in the password field
    And the user clicks outside the password field
    Then the password strength indicator shows "<strength>"

    Examples:
      | password      | strength |
      | abc           | Weak     |
      | Abcdef123     | Strong   |
      | pass1234      | Medium   |
      | P@ss123!xyzw  | Very Strong |

  @regression
  Scenario: Passwords must match
    Given the signup page is displayed
    When the user enters "SecurePass123" in the password field
    And the user enters "SecurePass456" in the confirm password field
    And the user clicks the signup button
    Then an error message "Passwords do not match" is displayed
    And the account is NOT created
```

---

### Example 4: REST API Testing

```gherkin
Feature: User API Endpoints
  REST API for user management

  @api @smoke
  Scenario: GET /users/{id} returns user by ID
    Given a user with ID "123" exists in the system
    When a GET request is made to "/users/123"
    Then the response status is 200
    And the response contains the user ID "123"
    And the response contains the user email "alice@example.com"

  @api @regression
  Scenario: POST /users creates a new user
    Given the user JSON payload:
      """
      {
        "email": "newuser@example.com",
        "password": "SecurePass123",
        "name": "New User"
      }
      """
    When a POST request is made to "/users"
    Then the response status is 201
    And the response contains the user ID
    And the response contains the created timestamp

  @api @regression
  Scenario: GET /users/{id} returns 404 when user not found
    When a GET request is made to "/users/nonexistent"
    Then the response status is 404
    And the response contains error message "User not found"

  @api
  Scenario Outline: API enforces rate limiting
    Given the API rate limit is <limit> requests per minute
    When <request_count> requests are made in 1 minute
    Then the response status for request #1 is 200
    And the response status for request #<request_count> is <expected_status>

    Examples:
      | limit | request_count | expected_status |
      | 100   | 50            | 200             |
      | 100   | 100           | 200             |
      | 100   | 101           | 429             |
```

---

## Quick Reference Checklist

When writing or reviewing a Gherkin scenario, verify:

### Naming
- [ ] Scenario name is specific and documents what's being tested
- [ ] Name doesn't start with test/should/validate
- [ ] Name describes the outcome, not the implementation

### Given (Setup)
- [ ] Given steps describe state, not actions
- [ ] Values are concrete, not vague ("alice@example.com" not "some email")
- [ ] Each Given is independent
- [ ] No assertions in Given

### When (Action)
- [ ] When steps describe user actions or system triggers
- [ ] One action per step (not "and then and then")
- [ ] Action is clear and unambiguous
- [ ] Present tense or imperative mood

### Then (Outcome)
- [ ] Then steps are observable and testable
- [ ] No implementation details (no "database query" or "session cookie")
- [ ] Outcomes are business-meaningful, not technical
- [ ] Multiple assertions use And to chain related outcomes

### Structure
- [ ] Feature has a clear purpose statement
- [ ] Scenario follows Given/When/Then structure
- [ ] Steps are 5-8 lines max
- [ ] Background (if used) is 1-3 shared steps
- [ ] Scenario Outline with Examples for parameterization

### Tags
- [ ] Appropriate tags assigned (@smoke, @api, etc.)
- [ ] Tags help identify test type and run strategy

### Language
- [ ] No implementation jargon unless business users understand it
- [ ] Consistent naming across scenarios
- [ ] Past tense for Given, imperative for When, present for Then
