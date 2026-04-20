Feature: Claude Cli
  Module with 6 exported items

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

  Scenario: Handle error case — );
	if (config.noSessionPersistence !== false) {
		args.push(
    When the request triggers );
	if (config.noSessionPersistence !== false) {
		args.push(
    Then the response should indicate the error condition
    And the error message should describe ");
	if (config.noSessionPersistence !== false) {
		args.push("

  Scenario: Handle error case — , (err) => {
			const message = 
    When the request triggers , (err) => {
			const message = 
    Then the response should indicate the error condition
    And the error message should describe ", (err) => {
			const message = "

