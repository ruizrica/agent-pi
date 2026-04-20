Feature: Pipeline Render
  Module with 8 exported items

  Background:
    Given the application is running

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

  Scenario: Handle error case — :
			return inv(theme.fg(
    When the request triggers :
			return inv(theme.fg(
    Then the response should indicate the error condition
    And the error message should describe ":
			return inv(theme.fg("

  Scenario: Handle error case — , theme.bold(
    When the request triggers , theme.bold(
    Then the response should indicate the error condition
    And the error message should describe ", theme.bold("

