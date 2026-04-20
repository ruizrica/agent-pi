Feature: Vuln Scanner Engine.test
  Module with 2 exported items

  Background:
    Given the application is running
    And I have a valid api-key token

  Scenario: Function call with valid inputs
    When I send a request to function call with valid inputs
    Then the response status should be 200
    And the response body should match the expected schema

  Scenario: Function call with invalid inputs
    When I send a request to function call with invalid inputs
    Then the response status should be 200
    And the response body should match the expected schema

  Scenario: Return value validation
    When I send a request to return value validation
    Then the response status should be 200
    And the response body should match the expected schema

  Scenario: Side effects verification
    When I send a request to side effects verification
    Then the response status should be 200
    And the response body should match the expected schema

  Scenario: Reject request without authentication token
    Given I do not have an authentication token
    When I send a request without the Authorization header
    Then the response status should be 401
    And the response body should contain "error"
    And the error message should indicate "unauthorized" or "authentication required"

