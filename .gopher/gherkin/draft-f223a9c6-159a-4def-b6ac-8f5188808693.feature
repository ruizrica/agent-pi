Feature: Module Discovery.test
  Module with 13 exported items

  Background:
    Given the application is running

  Scenario: Create user with valid data
    When I send a POST request to "/users"
    Then the response status should be 201
    And the response should contain "id"

  Scenario: List all users
    When I send a GET request to "/users"
    Then the response status should be 200
    And the response should contain "users" array
    And the response should contain "total" count

  Scenario: Return 404 for non-existent resource
    When I send a GET request with a non-existent identifier
    Then the response status should be 404
    And the error should indicate the resource was not found

