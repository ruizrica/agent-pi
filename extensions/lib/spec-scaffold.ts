// ABOUTME: Kiro-style spec scaffolding helpers for the spec viewer.
// ABOUTME: Creates requirements.md, design.md, tasks.md, and supporting files when a spec folder is empty or partially initialized.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

export interface SpecScaffoldResult {
	createdFiles: string[];
	createdFolder: boolean;
	createdVisualsDir: boolean;
	skippedLegacyLayout: boolean;
}

interface FeatureSeed {
	title: string;
	summary: string;
	actor: string;
	capabilities: string[];
	businessValues: string[];
	scopeItems: string[];
	existingCodeFocus: string;
}

function fileExists(folderPath: string, relativePath: string): boolean {
	return existsSync(join(folderPath, relativePath));
}

function titleFromFolder(folderPath: string, title?: string): string {
	if (title && title.trim()) {
		return title.trim();
	}

	const folderName = basename(folderPath).trim();
	if (!folderName) {
		return "New Feature";
	}

	return folderName
		.replace(/[-_]+/g, " ")
		.replace(/\s+/g, " ")
		.replace(/\b\w/g, (character) => character.toUpperCase());
}

function briefIdea(featureIdea: string | undefined, title: string): string {
	const trimmedIdea = featureIdea?.trim();
	if (trimmedIdea) {
		return trimmedIdea;
	}

	return `Implement ${title}.`;
}

function toSentence(value: string): string {
	const trimmedValue = value.trim().replace(/\s+/g, " ");
	if (!trimmedValue) {
		return "";
	}

	if (/[.!?]$/.test(trimmedValue)) {
		return trimmedValue;
	}

	return `${trimmedValue}.`;
}

function toTitleCase(value: string): string {
	return value.replace(/\b\w/g, (character) => character.toUpperCase());
}

function sanitizePhrase(value: string): string {
	return value
		.replace(/^to\s+/i, "")
		.replace(/^(we need|we want|please|let'?s|add|build|create|make|implement|update|refactor)\s+/i, "")
		.replace(/\s+/g, " ")
		.trim();
}

function splitFeatureIdea(featureIdea: string): string[] {
	const normalizedIdea = featureIdea
		.replace(/\r/g, " ")
		.replace(/\n+/g, ". ")
		.replace(/\bso that\b/gi, ". ")
		.replace(/\bwhile\b/gi, ". ")
		.replace(/\band then\b/gi, ". ")
		.replace(/[;:]+/g, ". ");

	const parts = normalizedIdea
		.split(/\.(?:\s+|$)|,(?:\s+|$)|\band\b/gi)
		.map(sanitizePhrase)
		.filter((part) => part.length >= 8);

	const uniqueParts: string[] = [];
	for (const part of parts) {
		const lowerPart = part.toLowerCase();
		if (uniqueParts.some((existingPart) => existingPart.toLowerCase() === lowerPart)) {
			continue;
		}
		uniqueParts.push(part);
	}

	return uniqueParts.slice(0, 4);
}

function inferActor(featureIdea: string): string {
	const lowerIdea = featureIdea.toLowerCase();
	if (lowerIdea.includes("developer") || lowerIdea.includes("engineer")) {
		return "developer";
	}
	if (lowerIdea.includes("admin") || lowerIdea.includes("administrator")) {
		return "administrator";
	}
	if (lowerIdea.includes("operator") || lowerIdea.includes("analyst")) {
		return "operator";
	}
	if (lowerIdea.includes("customer") || lowerIdea.includes("buyer") || lowerIdea.includes("shopper")) {
		return "customer";
	}
	return "user";
}

function buildFeatureSeed(title: string, featureIdea?: string): FeatureSeed {
	const summary = toSentence(briefIdea(featureIdea, title));
	const actor = inferActor(summary);
	const rawCapabilities = splitFeatureIdea(summary);
	const capabilities = rawCapabilities.length > 0
		? rawCapabilities
		: [
			`deliver ${title.toLowerCase()}`,
			`reuse the existing architecture for ${title.toLowerCase()}`,
			`validate the final behavior before implementation`,
		];

	const businessValues = [
		`Reduce ambiguity by translating the idea into concrete requirements for ${title}.`,
		`Speed up implementation by seeding the design and task breakdown from the original request.`,
		`Keep the final implementation aligned with existing code paths and project conventions.`,
	];

	const scopeItems = capabilities.map((capability) => toSentence(toTitleCase(capability)));
	const existingCodeFocus = capabilities[1] || `reuse existing components related to ${title.toLowerCase()}`;

	return {
		title,
		summary,
		actor,
		capabilities,
		businessValues,
		scopeItems,
		existingCodeFocus,
	};
}

function initializationContent(seed: FeatureSeed): string {
	return `# Initialization\n\n## Feature Name\n${seed.title}\n\n## Raw Idea\n${seed.summary}\n\n## Seeded Focus Areas\n${seed.capabilities.map((capability) => `- ${toSentence(capability)}`).join("\n")}\n\n## Notes\n- This spec was scaffolded using the Kiro three-document workflow.\n- The generated documents were seeded from the provided feature idea and should be refined before implementation.\n- Fill in requirements.md, design.md, and tasks.md before implementation.\n`;
}

function requirementsTemplate(seed: FeatureSeed): string {
	const primaryCapability = seed.capabilities[0] || `deliver ${seed.title.toLowerCase()}`;
	const secondaryCapability = seed.capabilities[1] || `integrate ${seed.title.toLowerCase()} with existing flows`;

	return `# Requirements Document\n\n## Document Information\n\n- **Feature Name**: ${seed.title}\n- **Version**: 1.0\n- **Date**: ${new Date().toISOString().slice(0, 10)}\n- **Author**: TBD\n- **Stakeholders**: TBD\n\n## Introduction\n\n${seed.summary}\n\n### Feature Summary\n${seed.summary}\n\n### Business Value\n${seed.businessValues.map((value) => `- ${value}`).join("\n")}\n\n### Scope\n${seed.scopeItems.map((item) => `- ${item}`).join("\n")}\n- Explicitly out of scope items should be added once the feature boundaries are confirmed.\n\n## Requirements\n\n### Requirement 1: ${toTitleCase(primaryCapability)}\n\n**User Story:** As a ${seed.actor}, I want to ${primaryCapability}, so that I can complete the intended outcome successfully.\n\n#### Acceptance Criteria\n\n1. WHEN the ${seed.actor} starts the primary flow for ${seed.title} THEN the system SHALL support ${primaryCapability}.\n2. IF required information, state, or dependencies for ${seed.title} are missing THEN the system SHALL show a clear validation or error response.\n3. WHEN ${primaryCapability} completes successfully THEN the system SHALL confirm the successful outcome and preserve the expected state.\n\n#### Additional Details\n- **Priority**: High\n- **Complexity**: Medium\n- **Dependencies**: Existing entry points, shared state, or related services touched by ${seed.title}\n- **Assumptions**: TBD\n\n### Requirement 2: ${toTitleCase(secondaryCapability)}\n\n**User Story:** As a ${seed.actor}, I want the system to ${secondaryCapability}, so that the feature works consistently within the existing product.\n\n#### Acceptance Criteria\n\n1. WHEN ${seed.title} runs inside the existing product flow THEN the system SHALL ${secondaryCapability}.\n2. IF an existing component, service, or template already supports part of the feature THEN the system SHALL reuse that implementation path instead of duplicating it.\n3. WHEN reuse or integration affects adjacent behavior THEN the system SHALL preserve current functionality unless the approved requirements explicitly change it.\n\n#### Additional Details\n- **Priority**: Medium\n- **Complexity**: Medium\n- **Dependencies**: Existing code discovery and architecture review\n- **Assumptions**: TBD\n\n### Requirement 3: Implementation Readiness\n\n**User Story:** As a developer, I want ${seed.title} to be clearly specified before coding starts, so that implementation can proceed with minimal rework.\n\n#### Acceptance Criteria\n\n1. WHEN the requirements are approved THEN the system SHALL provide a matching design.md and tasks.md aligned to these requirements.\n2. IF open questions remain after the initial scaffold THEN the system SHALL capture follow-up clarifications before implementation begins.\n\n#### Additional Details\n- **Priority**: Medium\n- **Complexity**: Low\n- **Dependencies**: Stakeholder review and approval\n- **Assumptions**: TBD\n\n## Non-Functional Requirements\n\n### Performance Requirements\n- WHEN users execute the primary flow for ${seed.title} THEN the system SHALL respond within acceptable application limits for the existing product.\n\n### Security Requirements\n- IF ${seed.title} handles protected data or actions THEN the system SHALL enforce the existing authorization, validation, and data-handling model.\n\n### Usability Requirements\n- WHEN users interact with ${seed.title} THEN the system SHALL provide clear labels, status feedback, and recoverable error states.\n\n### Reliability Requirements\n- WHEN failures occur during ${seed.title} THEN the system SHALL fail safely and preserve consistent state.\n\n## Constraints and Assumptions\n\n### Technical Constraints\n- Follow existing repository conventions and architecture.\n- Preserve existing behavior unless requirements explicitly change it.\n- Prefer reusing current components, templates, and workflow primitives before adding new abstractions.\n\n### Business Constraints\n- Keep scope limited to this feature iteration.\n- Treat the current feature/spec name as stable once approved.\n\n### Assumptions\n- Visual assets, if needed, will be placed in \`visuals/\`.\n- Additional clarifications can be captured in questions.md if needed.\n- Existing code review should focus on: ${toSentence(seed.existingCodeFocus)}\n\n## Success Criteria\n\n### Definition of Done\n- [ ] All acceptance criteria are met\n- [ ] Non-functional requirements are satisfied\n- [ ] design.md includes architecture and implementation details aligned to the seeded feature idea\n- [ ] tasks.md covers implementation-ready work items tied back to these requirements\n\n### Acceptance Metrics\n- Requirement coverage is complete and unambiguous.\n- Stakeholders can approve the feature scope without restructuring the document set.\n- The seeded documents still reflect the original idea: ${seed.summary}\n\n## Glossary\n\n| Term | Definition |\n|------|------------|\n| ${seed.title} | The feature described by this spec |\n| Primary flow | The main user or system path needed to achieve the intended feature outcome |\n`;
}

function designTemplate(seed: FeatureSeed): string {
	const primaryCapability = seed.capabilities[0] || `deliver ${seed.title.toLowerCase()}`;
	const secondaryCapability = seed.capabilities[1] || `integrate ${seed.title.toLowerCase()} with the existing system`;
	const tertiaryCapability = seed.capabilities[2] || `verify the final behavior before implementation`;

	return `# Design Document\n\n## Document Information\n\n- **Feature Name**: ${seed.title}\n- **Version**: 1.0\n- **Date**: ${new Date().toISOString().slice(0, 10)}\n- **Author**: TBD\n- **Reviewers**: TBD\n- **Related Documents**: requirements.md\n\n## Overview\n\n${seed.summary}\n\n### Design Goals\n- ${toSentence(primaryCapability)}\n- ${toSentence(secondaryCapability)}\n- ${toSentence(tertiaryCapability)}\n\n### Key Design Decisions\n- Use the existing project architecture and conventions as the default approach for ${seed.title}.\n- Prefer extension of current components, templates, and services over parallel duplicate implementations.\n- Represent the implementation plan in tasks.md after the design is reviewed and approved.\n\n## Architecture\n\n### System Context\n\nThis feature begins with the original request, passes through the existing product entry points, and ends in a user-visible or system-visible outcome tied to ${seed.title}.\n\n\`\`\`mermaid\ngraph LR\n    A[Feature Idea] --> B[${seed.title}]\n    B --> C[Existing Entry Points]\n    C --> D[Reused Components]\n    D --> E[User or System Outcome]\n\`\`\`\n\n### High-Level Architecture\n\nThe implementation should keep orchestration thin, push business rules into focused feature logic, and route updates through existing integration points.\n\n\`\`\`mermaid\ngraph TD\n    A[Requirements] --> B[Feature Entry Point]\n    B --> C[Core Feature Logic]\n    C --> D[Existing Components]\n    D --> E[Verification]\n\`\`\`\n\n### Technology Stack\n\n| Layer | Technology | Rationale |\n|-------|------------|-----------|\n| UI / Entry | Existing project stack | Follow established patterns already used by the product |\n| Business Logic | Existing project stack | Minimize architectural drift while implementing ${seed.title} |\n| Data / Persistence | Existing project stack | Preserve compatibility with adjacent features |\n| Testing | Existing project test stack | Keep verification aligned with the rest of the repository |\n\n## Components and Interfaces\n\n### Component 1: Feature Entry Point\n\n**Purpose**: Accept the primary user or system action that begins ${seed.title}.\n\n**Responsibilities**:\n- Validate or normalize incoming input for ${primaryCapability}\n- Route work to the correct internal component or reused template\n- Surface errors or completion state appropriately\n\n**Interfaces**:\n- **Input**: User action, API request, or tool invocation tied to ${seed.title}\n- **Output**: Updated state, response, or rendered result\n- **Dependencies**: Existing entry points, shared services, and UI components\n\n**Implementation Notes**:\n- Reuse existing entry points when possible\n- Avoid introducing duplicate orchestration layers\n\n### Component 2: Core Feature Logic\n\n**Purpose**: Execute the business logic required to ${primaryCapability}.\n\n**Responsibilities**:\n- Enforce requirements and business rules for ${seed.title}\n- Coordinate ${secondaryCapability}\n- Return predictable success and failure states\n\n**Interfaces**:\n- **Input**: Structured data from the entry point\n- **Output**: Result object or persisted update\n- **Dependencies**: Existing domain logic and configuration\n\n**Implementation Notes**:\n- Keep responsibilities focused and explicit\n- Document any new interface contracts here before coding\n\n### Component 3: Verification Layer\n\n**Purpose**: Confirm that ${seed.title} behaves as described in requirements.md and tasks.md.\n\n**Responsibilities**:\n- Validate the primary success path and the main failure conditions\n- Confirm the feature still follows repository conventions and reuse expectations\n- Capture any manual or automated verification needed before implementation approval\n\n**Interfaces**:\n- **Input**: Feature outputs and observable side effects\n- **Output**: Test results, review notes, or approval feedback\n- **Dependencies**: Existing test utilities, viewer flows, and manual QA checks\n\n## Data Models\n\n### Entity 1: Feature Context\n\n\`\`\`typescript\ninterface FeatureContext {\n  featureName: string;\n  summary: string;\n  primaryCapability: string;\n  integrationFocus: string;\n  createdAt: string;\n}\n\`\`\`\n\n**Validation Rules**:\n- featureName must stay consistent with the chosen spec name\n- summary should reflect the approved feature intent\n- primaryCapability should match the main seeded requirement\n\n**Relationships**:\n- requirements.md defines expected behavior\n- tasks.md defines execution order\n\n## Error Handling\n\n### Error Categories\n\n| Category | Description | User Action |\n|----------|-------------|-------------|\n| Validation | Missing or invalid inputs needed for ${seed.title} | Update the input and retry |\n| Integration | Existing dependency mismatch while trying to ${secondaryCapability} | Review architecture and adjust integration |\n| Rendering | UI/viewer or output rendering issue | Inspect generated markdown, visuals, or templates |\n| System Error | Unexpected internal failure | Retry and inspect logs |\n\n### Logging Strategy\n- Log integration and validation failures with enough context to debug them\n- Preserve clear user-facing error states instead of silent failure\n- Track whether implementation still reflects the seeded feature idea: ${seed.summary}\n\n## Testing Strategy\n\n### Unit Testing\n- Cover new helpers and document-generation logic\n- Validate the critical branching needed to ${primaryCapability}\n\n### Integration Testing\n- Verify the feature works with the existing entry points and viewer flow\n- Confirm generated documents are discovered and rendered correctly\n- Confirm adjacent integrations still work after ${secondaryCapability}\n\n### End-to-End Testing\n- Open the spec viewer and confirm the requirements, spec, and tasks documents appear in order\n- Review Mermaid rendering and markdown editing on the generated files\n- Validate that the final seeded tasks still map back to the original idea\n`;
}

function tasksTemplate(seed: FeatureSeed): string {
	const primaryCapability = seed.capabilities[0] || `deliver ${seed.title.toLowerCase()}`;
	const secondaryCapability = seed.capabilities[1] || `integrate ${seed.title.toLowerCase()} with existing flows`;
	const tertiaryCapability = seed.capabilities[2] || `verify the final behavior before implementation`;

	return `# Tasks Document\n\n## Document Information\n\n- **Feature Name**: ${seed.title}\n- **Version**: 1.0\n- **Date**: ${new Date().toISOString().slice(0, 10)}\n- **Author**: TBD\n- **Related Documents**:\n  - Requirements: requirements.md\n  - Design: design.md\n\n## Implementation Overview\n\nTranslate the approved requirements and design into implementation-ready work for this feature request: ${seed.summary}\n\n### Implementation Strategy\n- Start with the smallest working path needed to ${primaryCapability}\n- Reuse existing project structures before creating new ones\n- Validate behavior with focused tests as each phase lands\n\n### Development Approach\n- **Testing Strategy**: Add or update targeted tests alongside implementation\n- **Integration Strategy**: Wire the feature into existing entry points and flows incrementally\n- **Deployment Strategy**: Keep the change set small and reversible\n\n## Implementation Plan\n\n### Phase 1: Foundation and Setup\n\n- [ ] 1. Confirm the implementation scope against requirements.md and design.md\n  - Review the seeded idea, open questions, and assumptions\n  - Identify the exact files and components needed to ${primaryCapability}\n  - _Requirements: Requirement 1, Requirement 2_\n\n- [ ] 2. Prepare the feature entry points\n  - Update or create the minimum set of files needed to expose ${seed.title}\n  - Add any required types, configuration, or wiring for ${secondaryCapability}\n  - _Requirements: Requirement 1, Requirement 2_\n\n### Phase 2: Core Business Logic\n\n- [ ] 3. Implement the core feature behavior\n  - Add the main business rules described in design.md\n  - Make the core path work for ${primaryCapability}\n  - _Requirements: Requirement 1_\n\n- [ ] 4. Reuse and integrate existing components\n  - Connect the feature to existing services, models, UI primitives, or templates\n  - Ensure the implementation can ${secondaryCapability}\n  - _Requirements: Requirement 2_\n\n### Phase 3: Verification and Polish\n\n- [ ] 5. Add verification coverage\n  - Create or update tests for the generated implementation\n  - Validate the primary success path, the main failure path, and regressions related to ${seed.title}\n  - _Requirements: Requirement 1, Requirement 2_\n\n- [ ] 6. Validate final behavior and documentation\n  - Confirm the implementation matches requirements.md and design.md\n  - Verify the final result still reflects ${tertiaryCapability}\n  - Update tasks.md progress and any supporting notes\n  - _Requirements: Requirement 1, Requirement 2, Requirement 3_\n`;
}

export function ensureKiroSpecScaffold(options: {
	folderPath: string;
	title?: string;
	featureIdea?: string;
}): SpecScaffoldResult {
	const { folderPath, title, featureIdea } = options;
	const resolvedTitle = titleFromFolder(folderPath, title);
	const seed = buildFeatureSeed(resolvedTitle, featureIdea);
	const result: SpecScaffoldResult = {
		createdFiles: [],
		createdFolder: false,
		createdVisualsDir: false,
		skippedLegacyLayout: false,
	};

	if (!existsSync(folderPath)) {
		mkdirSync(folderPath, { recursive: true });
		result.createdFolder = true;
	}

	const hasLegacyLayout = fileExists(folderPath, "spec.md") || fileExists(folderPath, "planning/requirements.md") || fileExists(folderPath, "planning/tasks.md");
	if (hasLegacyLayout) {
		result.skippedLegacyLayout = true;
		return result;
	}

	if (!fileExists(folderPath, "visuals")) {
		mkdirSync(join(folderPath, "visuals"), { recursive: true });
		result.createdVisualsDir = true;
	}

	const documents: Array<{ path: string; content: string }> = [
		{ path: "initialization.md", content: initializationContent(seed) },
		{ path: "requirements.md", content: requirementsTemplate(seed) },
		{ path: "design.md", content: designTemplate(seed) },
		{ path: "tasks.md", content: tasksTemplate(seed) },
	];

	for (const document of documents) {
		if (fileExists(folderPath, document.path)) {
			continue;
		}

		writeFileSync(join(folderPath, document.path), document.content, "utf-8");
		result.createdFiles.push(document.path);
	}

	return result;
}
