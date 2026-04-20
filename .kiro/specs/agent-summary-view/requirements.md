# Requirements Document

## Feature Overview
Add a toggleable summary view for the main session that replaces the normal terminal output area with a single-page status summary of the task at hand. The primary command `/toggle-summary` shall toggle this work-summary view on and off for the current session. The feature should summarize overall work in progress, recent tool activity, current task status, and optionally active agents involved in the work, while remaining terminal-first.

## Reuse and Existing Code
- Reuse existing terminal UI and command-registration patterns from current extensions
- Reuse existing session, widget, and rendering concepts where they help assemble a single-page status view
- Reuse subagent/orchestration state only as input data for the main session summary, not as independent targets for this feature
- Reuse shared viewer/session patterns only when useful for shared state or future extensibility, not as the primary UX surface
- Avoid duplicating status derivation logic where current task, tool usage, or orchestration state already exists

## Visual Assets
- Primary visual reference: `/Users/ricardo/Desktop/snapshots/snapshot_2026-04-17_094828.png`
- Additional optional assets may be added under `.kiro/specs/agent-summary-view/visuals/`

## Functional Requirements

### Requirement 1: Toggleable summary mode for the current session
**User Story:** As a user, I want to toggle a single-page summary for the current session so that I can quickly inspect the overall work in progress without the normal output view.

#### Acceptance Criteria
1. WHEN the user runs `/toggle-summary`, THEN the system SHALL toggle the summary view for the current session.
2. WHEN the summary view is currently off and the user runs `/toggle-summary`, THEN the system SHALL replace the normal terminal output area with the work-summary page.
3. WHEN the summary view is currently on and the user runs `/toggle-summary` again, THEN the system SHALL restore the normal terminal output area.

### Requirement 2: Summary content and layout
**User Story:** As a user, I want the summary page to show the most important live work information first so that I can understand status at a glance.

#### Acceptance Criteria
1. WHEN a summary view is shown, THEN the system SHALL display at minimum the overall status, current task, elapsed time, tool count, and latest output summary.
2. WHEN recent tool calls are available, THEN the system SHALL include a concise summary of tool activity in the page.
3. WHEN active orchestration context is available, THEN the system SHALL optionally show which agents are currently being used as part of the work.
4. WHEN the summary view is rendered, THEN the system SHALL use a single-page terminal-oriented layout inspired by the provided snapshot.
5. IF any summary field is unavailable, THEN the system SHALL render a stable placeholder rather than omitting the overall layout.

### Requirement 3: Unavailable session summary data
**User Story:** As a user, I want clear feedback when summary data is incomplete so that I know why the view is missing information.

#### Acceptance Criteria
1. IF the session cannot provide one or more expected summary fields, THEN the system SHALL show explicit placeholders or an empty-state message in the summary view area.
2. IF recent tool activity is unavailable, THEN the system SHALL show a stable no-activity or unavailable message rather than failing the view.
3. WHEN an unavailable or empty-state message is shown, THEN the system SHALL preserve the same toggle command behavior so the user can exit the summary view predictably.

### Requirement 4: Main-session scope and aggregation
**User Story:** As a user, I want this view to summarize the task at hand across the session so that I can understand all work being done from one place.

#### Acceptance Criteria
1. WHEN the summary view is shown, THEN the system SHALL represent the main session’s work summary rather than a per-subagent inspection view.
2. IF subagents or orchestration helpers are active, THEN the system SHALL treat them as supporting context inside the main summary rather than as independent summary targets.
3. WHEN the implementation gathers status from multiple sources, THEN the system SHALL aggregate them into one unified session summary model.

### Requirement 5: Command discoverability and aliasing
**User Story:** As a user, I want the summary toggle command to be discoverable and consistent so that I can remember how to open and close the view.

#### Acceptance Criteria
1. WHEN slash commands are registered, THEN the system SHALL expose `/toggle-summary` as the command for this feature.
2. WHEN the user requests command help or completion for this command, THEN the system SHALL describe that the command toggles a main-session work summary view.
