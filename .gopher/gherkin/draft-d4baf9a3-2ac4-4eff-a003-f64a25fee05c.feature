Feature: Openrouter Routing Api
  endpoint for Openrouter Routing Api

  Background:
    Given the application is running
    And I have a valid bearer token

  Scenario: Successfully call openrouter routing api endpoint
    When I send a request to successfully call openrouter routing api endpoint
    Then the response status should be 200
    And the response body should match the expected schema

  Scenario: openrouter routing api with invalid input returns error
    When I send a request to openrouter routing api with invalid input returns error
    Then the response status should be 200
    And the response body should match the expected schema

  Scenario: openrouter routing api with missing auth returns 401
    When I send a request to openrouter routing api with missing auth returns 401
    Then the response status should be 200
    And the response body should match the expected schema

  Scenario: openrouter routing api resource not found returns 404
    When I send a request to openrouter routing api resource not found returns 404
    Then the response status should be 200
    And the response body should match the expected schema

  Scenario: Reject request without authentication token
    Given I do not have an authentication token
    When I send a request without the Authorization header
    Then the response status should be 401
    And the response body should contain "error"
    And the error message should indicate "unauthorized" or "authentication required"

