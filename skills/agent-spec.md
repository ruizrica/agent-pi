---
description: "Interactive spec-driven development (Kiro pattern): requirements → design → tasks with agent-viewer gate, then execute"
argument-hint: "[feature idea] [--project PATH] [--name SPEC_NAME] [--agent cursor|haiku]"
allowed-tools: ["Task", "Read", "Write", "Glob", "Grep", "Bash", "AskUserQuestion", "Edit"]
---

# Agent Spec (Kiro pattern)

You are orchestrating the spec-driven development workflow. This is an interactive, phased approach that generates professional requirements, design, and task documentation before execution. It follows the Kiro methodology end-to-end and is the sibling of `/agent-plan` (single-document plans).

## User's Feature Request

$ARGUMENTS

## Workflow Overview

The workflow has **4 phases**:
1. **Requirements** - Generate EARS-format requirements with clarifying questions
2. **Design** - Generate architecture and API design with clarifying questions
3. **Tasks** - Generate implementation task breakdown with clarifying questions
4. **Execution** - Execute tasks with parallel agents (Cursor default, Haiku optional)

Each phase pauses for user Q&A to refine scope and approach.

## Mandatory Spec Review Rule

Before moving from generated spec documents to execution, you must present them through the `agent-viewer` CLI and treat its result as binding.

Full rules live in `skills/agent-viewer.md`. In short:

```bash
agent-viewer spec --folder ~/.claude/plans/{spec_name} --json
```

- `approved` — continue
- `changes_requested` — revise spec files and re-run the CLI
- `declined` — do not continue; revise and re-run

Do not proceed to implementation until the spec viewer returns `approved`. If `agent-viewer` is not installed, run `bash plugins/toolkit/scripts/install-agent-viewer.sh` (or `/setup`) first.

## Parse Arguments

Extract from `$ARGUMENTS`:
- **feature_idea**: The main feature description (required)
- **project_path**: `--project PATH` or use current working directory
- **spec_name**: `--name NAME` or generate from feature_idea + date
- **agent_type**: `--agent cursor|haiku` (default: cursor)

Generate spec_name format: `YYYY-MM-DD-feature-name` (e.g., `2026-02-01-user-authentication`)

## Storage Location

All documents are saved to: `~/.claude/plans/{spec_name}/`

Structure:
```
~/.claude/plans/{spec_name}/
├── 1-requirements.md    # EARS format requirements
├── 2-design.md          # Architecture, components, APIs
├── 3-tasks.md           # Implementation task breakdown
├── qa-log.md            # Clarifying questions and answers
└── metadata.json        # Spec metadata, phase status
```

---

## PHASE 1: Requirements Generation

### Step 1.1: Gather Context

Spawn 2 Haiku agents IN PARALLEL to explore the codebase:

```
Agent 1 - Domain Explorer:
- Identify existing patterns related to the feature
- Find similar implementations to reference
- Map relevant domain concepts and terminology
- Return: domain_concepts, existing_patterns, reference_implementations

Agent 2 - Constraints Discoverer:
- Identify technical constraints (frameworks, dependencies)
- Find integration points and boundaries
- Note existing conventions and standards
- Return: technical_constraints, integration_points, conventions
```

### Step 1.2: Generate Requirements Document

Using the context gathered, create `1-requirements.md` following EARS format:

**EARS (Easy Approach to Requirements Syntax) Patterns:**
- WHEN [event] THEN [system] SHALL [response]
- IF [condition] THEN [system] SHALL [behavior]
- WHILE [state] [system] SHALL [behavior]
- WHERE [context] [system] SHALL [behavior]

**Document Structure:**
```markdown
# Requirements Document: {Feature Name}

## Introduction
[Overview of the feature, problem it solves, why it's needed]

## Glossary
[Define key terms used in requirements]

## Requirements

### Requirement 1: {Title}
**User Story:** As a [role], I want [functionality], so that [benefit].

#### Acceptance Criteria
1. WHEN [event] THEN [system] SHALL [response]
2. IF [condition] THEN [system] SHALL [behavior]

#### Additional Details
- Priority: High/Medium/Low
- Complexity: High/Medium/Low
- Dependencies: [list]

### Requirement 2: {Title}
...

## Non-Functional Requirements
[Performance, Security, Usability, Reliability]

## Constraints and Assumptions
[Technical constraints, business constraints, assumptions]

## Success Criteria
[Definition of done, acceptance metrics]
```

### Step 1.3: Q&A Pause

Use AskUserQuestion to clarify:
- **Scope**: "Are there any features explicitly out of scope?"
- **Users**: "Who are the primary users/personas?"
- **Constraints**: "Any specific technical or business constraints?"
- **Priority**: "Which requirements are most critical?"

Update the requirements document based on answers. Log Q&A to `qa-log.md`.

---

## PHASE 2: Design Generation

### Step 2.1: Analyze Requirements

Read the generated requirements document and identify:
- Key components needed
- Data models required
- API endpoints
- Integration points

### Step 2.2: Generate Design Document

Spawn 2 Haiku agents IN PARALLEL:

```
Agent 1 - Architecture Designer:
- Propose system architecture
- Define component relationships
- Create data flow diagrams
- Return: architecture_overview, component_diagram, data_flow

Agent 2 - API/Interface Designer:
- Design API endpoints and contracts
- Define data models and schemas
- Specify error handling patterns
- Return: api_endpoints, data_models, error_handling
```

Create `2-design.md` with structure:
```markdown
# Design Document: {Feature Name}

## Overview
[High-level design approach and goals]

## Architecture
### System Context
[How this fits in the broader system]

### High-Level Architecture
[Component diagram, technology stack]

## Components and Interfaces
### Component 1: {Name}
- Purpose
- Responsibilities
- Interfaces (Input/Output/Dependencies)
- Implementation Notes

## Data Models
[TypeScript interfaces, validation rules, relationships]

## API Design
[Endpoints, request/response formats, error responses]

## Security Considerations
[Authentication, authorization, data protection]

## Error Handling
[Error categories, response format, logging strategy]

## Testing Strategy
[Unit, integration, E2E testing approach]
```

### Step 2.3: Q&A Pause

Use AskUserQuestion to clarify:
- **Architecture**: "Does this architecture align with your expectations?"
- **Technology**: "Any preferred technologies or libraries?"
- **Trade-offs**: "Any concerns about the proposed approach?"

Update design document based on answers. Log Q&A to `qa-log.md`.

---

## PHASE 3: Tasks Generation

### Step 3.1: Decompose Design into Tasks

Spawn 2 Haiku agents IN PARALLEL:

```
Agent 1 - Task Decomposer:
- Break design into implementation phases
- Create granular, actionable tasks
- Estimate complexity and dependencies
- Return: phases, tasks_per_phase, dependencies

Agent 2 - Test Planner:
- Define test requirements per task
- Identify testing approach (TDD)
- Plan integration test scenarios
- Return: test_requirements, tdd_approach, integration_scenarios
```

Create `3-tasks.md` with structure:
```markdown
# Tasks Document: {Feature Name}

## Implementation Overview
[Strategy, approach, development methodology]

## Implementation Plan

### Phase 1: Foundation and Setup
- [ ] 1. Task title
  - Subtask details
  - Test requirements
  - _Requirements: [ref]_

### Phase 2: Core Business Logic
- [ ] 2. Task title
  ...

### Phase 3: API Layer
...

### Phase 4: User Interface (if applicable)
...

### Phase 5: Integration and Testing
...

### Phase 6: Deployment and Documentation
...

## Task Dependencies
[Dependency graph or list]

## Quality Gates
[Code quality, testing quality, documentation quality]
```

### Step 3.2: Mandatory Spec Viewer Review

After generating or updating `1-requirements.md`, `2-design.md`, and `3-tasks.md`, run:

```bash
agent-viewer spec --folder ~/.claude/plans/{spec_name} --json
```

Follow the review rules defined in `skills/agent-viewer.md`:
- If `approved`, continue to execution
- If `changes_requested` or `declined`, update the relevant spec files based on the returned comments/edits and run the viewer again
- Repeat until approval

If `agent-viewer` is not on PATH, run `bash plugins/toolkit/scripts/install-agent-viewer.sh` (or `/setup`) first.

### Step 3.3: Q&A Pause

Use AskUserQuestion to clarify:
- **Granularity**: "Should any tasks be broken down further?"
- **Order**: "Any preference on implementation order?"
- **Scope**: "Should we exclude any phases for now?"

Update tasks document based on answers. Log Q&A to `qa-log.md`.

---

## PHASE 4: Execution

### Step 4.1: Prepare for Execution

Create `metadata.json`:
```json
{
  "spec_name": "{spec_name}",
  "feature_idea": "{feature_idea}",
  "created_at": "{ISO timestamp}",
  "project_path": "{project_path}",
  "phases_completed": ["requirements", "design", "tasks"],
  "execution_started": "{ISO timestamp}",
  "agent_type": "cursor|haiku"
}
```

### Step 4.2: Parse Tasks into Waves

Read `3-tasks.md` and organize tasks into execution waves:
- **Wave 1**: Foundation tasks (no dependencies)
- **Wave 2**: Tasks depending on Wave 1
- **Wave 3**: Tasks depending on Wave 2
- Continue until all tasks assigned

### Step 4.3: Execute with Agent Team

**Default: Cursor Agents (4 parallel)**
- Faster execution
- State-of-the-art code generation

**Alternative: Haiku Agents (4 parallel)**
- Use if `--agent haiku` specified
- Cost-effective for simpler tasks

For each wave, spawn agents IN PARALLEL:

```
Wave Execution Pattern:
1. Read all tasks for current wave
2. Spawn 4 agents in SINGLE message with Task tool
3. Each agent receives:
   - Task description from tasks.md
   - Relevant design context from design.md
   - Requirement references
   - TDD instructions (write test first)
4. Wait for all agents to complete
5. Validate outputs
6. Proceed to next wave
```

### Step 4.4: Completion Summary

After all waves complete:
1. Summarize what was implemented
2. List files created/modified
3. Report any issues or TODOs
4. Suggest next steps (testing, review, deployment)

---

## Execution Instructions

**BEGIN NOW by:**

1. Parsing `$ARGUMENTS` for feature_idea, project_path, spec_name, agent_type
2. Creating the spec directory at `~/.claude/plans/{spec_name}/`
3. Starting Phase 1: Spawn 2 Haiku agents for context gathering
4. Generate requirements document
5. Pause for Q&A with AskUserQuestion
6. Continue through each phase

**CRITICAL RULES:**

1. **PAUSE after each document phase** - Use AskUserQuestion for clarification
2. **LOG all Q&A** - Append to qa-log.md
3. **PARALLEL agents** - Always spawn multiple agents in single messages
4. **USE HAIKU for research** - Use `model: "haiku"` for exploration agents
5. **FOLLOW TDD** - All implementation tasks must include test-first approach
6. **STORE everything** - All documents go to ~/.claude/plans/{spec_name}/

Start execution now with Phase 1.
