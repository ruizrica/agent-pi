Feature: Pi Coding Agent
  Module with 4 exported items

  Background:
    Given the application is running

  Scenario: Object construction
    When I send a request to object construction
    Then the response status should be 200
    And the response body should match the expected schema

  Scenario: Method invocation
    When I send a request to method invocation
    Then the response status should be 200
    And the response body should match the expected schema

  Scenario: State mutation
    When I send a request to state mutation
    Then the response status should be 200
    And the response body should match the expected schema

  Scenario: Error handling
    When I send a request to error handling
    Then the response status should be 200
    And the response body should match the expected schema

