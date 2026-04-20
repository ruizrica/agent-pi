Feature: Vuln Scanner Installer
  Module with 13 exported items

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

  Scenario: Handle error case — ,
		);
	}

	if (hasExpress || hasFastify) {
		result.instructions.push(
			
    When the request triggers ,
		);
	}

	if (hasExpress || hasFastify) {
		result.instructions.push(
			
    Then the response should indicate the error condition
    And the error message should describe ",
		);
	}

	if (hasExpress || hasFastify) {
		result.instructions.push(
			"

  Scenario: Handle error case — Rate limit exceeded
    When the request triggers Rate limit exceeded
    Then the response should indicate the error condition
    And the error message should describe "Rate limit exceeded"

