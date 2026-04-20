Feature: Obsidian Types
  Module with 12 exported items

  Background:
    Given the application is running

  Scenario: Type definition validation
    When I send a request to type definition validation
    Then the response status should be 200
    And the response body should match the expected schema

  Scenario: Default exports
    When I send a request to default exports
    Then the response status should be 200
    And the response body should match the expected schema

  Scenario: Named exports
    When I send a request to named exports
    Then the response status should be 200
    And the response body should match the expected schema

