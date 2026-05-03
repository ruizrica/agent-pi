# Requirements

## Overview
This smoke test spec exists to validate the spec viewer after the `projectContext` browser-script fix.

## Context
The viewer should render this section and inject project metadata above it when project context is available.

## Requirements

### Requirement 1
**User Story:** As a developer, I want a minimal spec that includes a Context section, so that I can confirm the viewer no longer crashes.

#### Acceptance Criteria
1. WHEN the spec viewer opens `requirements.md` THEN it SHALL render the document without a JavaScript ReferenceError.
2. IF project context is available THEN the viewer SHALL show project metadata above the Context heading.
