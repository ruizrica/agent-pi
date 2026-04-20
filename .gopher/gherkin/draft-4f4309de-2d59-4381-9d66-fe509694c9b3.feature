Feature: Report Index
  Module with 11 exported items

  Background:
    Given the application is running
    And I have valid request payload

  Scenario: Function call with valid inputs
    And I have valid values for "updatedAt", "createdAt"
    When I send a request to function call with valid inputs
    Then the response status should be 200
    And the response body should match the expected schema

  Scenario: Function call with invalid inputs
    And I have valid values for "updatedAt", "createdAt"
    When I send a request to function call with invalid inputs
    Then the response status should be 200
    And the response body should match the expected schema

  Scenario: Return value validation
    And I have valid values for "updatedAt", "createdAt"
    When I send a request to return value validation
    Then the response status should be 200
    And the response body should match the expected schema

  Scenario: Side effects verification
    And I have valid values for "updatedAt", "createdAt"
    When I send a request to side effects verification
    Then the response status should be 200
    And the response body should match the expected schema

