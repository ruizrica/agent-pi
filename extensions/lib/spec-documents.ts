// ABOUTME: Spec document discovery for the spec viewer.
// ABOUTME: Supports both Kiro-style requirements/design/tasks specs and the legacy spec/planning layout.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, basename } from "node:path";
import type { SpecDocument } from "./viewers/spec-viewer-html.ts";

function readMarkdownDocument(
	folderPath: string,
	filePath: string,
	key: string,
	label: string,
): SpecDocument | null {
	const absolutePath = join(folderPath, filePath);
	if (!existsSync(absolutePath)) {
		return null;
	}

	return {
		key,
		label,
		markdown: readFileSync(absolutePath, "utf-8"),
		filePath,
	};
}

function discoverVisualFiles(folderPath: string, visualsPath: string): string[] {
	const absolutePath = join(folderPath, visualsPath);
	if (!existsSync(absolutePath)) {
		return [];
	}

	try {
		return readdirSync(absolutePath)
			.filter((fileName) => {
				const extension = extname(fileName).toLowerCase();
				return [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".html", ".htm"].includes(extension);
			})
			.map((fileName) => join(visualsPath, fileName));
	} catch {
		return [];
	}
}

function discoverLegacyPlanningDocuments(folderPath: string): SpecDocument[] {
	const planningDirectory = join(folderPath, "planning");
	if (!existsSync(planningDirectory)) {
		return [];
	}

	try {
		const knownFiles = new Set(["requirements.md", "tasks.md", "initialization.md", "questions.md"]);
		const planningFiles = readdirSync(planningDirectory)
			.filter((fileName) => fileName.endsWith(".md") && !knownFiles.has(fileName))
			.sort();

		return planningFiles.map((fileName) => ({
			key: "other-" + fileName.replace(".md", ""),
			label: basename(fileName, ".md").replace(/-/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()),
			markdown: readFileSync(join(planningDirectory, fileName), "utf-8"),
			filePath: join("planning", fileName),
		}));
	} catch {
		return [];
	}
}

export function discoverSpecDocuments(folderPath: string): SpecDocument[] {
	const documents: SpecDocument[] = [];

	const requirementsDocument =
		readMarkdownDocument(folderPath, "requirements.md", "requirements", "Requirements")
		?? readMarkdownDocument(folderPath, "planning/requirements.md", "requirements", "Requirements");
	if (requirementsDocument) {
		documents.push(requirementsDocument);
	}

	const specDocument =
		readMarkdownDocument(folderPath, "design.md", "spec", "Spec")
		?? readMarkdownDocument(folderPath, "spec.md", "spec", "Spec");
	if (specDocument) {
		documents.push(specDocument);
	}

	const tasksDocument =
		readMarkdownDocument(folderPath, "tasks.md", "tasks", "Tasks")
		?? readMarkdownDocument(folderPath, "planning/tasks.md", "tasks", "Tasks");
	if (tasksDocument) {
		documents.push(tasksDocument);
	}

	const rootVisualFiles = discoverVisualFiles(folderPath, "visuals");
	const planningVisualFiles = rootVisualFiles.length > 0 ? [] : discoverVisualFiles(folderPath, "planning/visuals");
	const visualFiles = rootVisualFiles.length > 0 ? rootVisualFiles : planningVisualFiles;
	if (visualFiles.length > 0) {
		documents.push({
			key: "visuals",
			label: "Visuals",
			markdown: "",
			filePath: rootVisualFiles.length > 0 ? "visuals/" : "planning/visuals/",
			isVisuals: true,
			visualFiles,
		});
	}

	documents.push(...discoverLegacyPlanningDocuments(folderPath));

	return documents;
}
