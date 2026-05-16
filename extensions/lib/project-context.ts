import { randomUUID } from "node:crypto";
import { basename } from "node:path";

export interface ProjectContext {
	projectName: string;
	workingDirectoryName: string;
	fullPath: string;
	uuid: string;
	revision: number;
	timestamp: string;
}

function formatTimestamp(date: Date): string {
	const hours24 = date.getHours();
	const hours12 = hours24 % 12 || 12;
	const minutes = String(date.getMinutes()).padStart(2, "0");
	const meridiem = hours24 >= 12 ? "pm" : "am";
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	const year = date.getFullYear();
	return `${hours12}:${minutes}${meridiem} @ ${month}/${day}/${year}`;
}

export function getProjectContext(cwd: string, revision = 1): ProjectContext {
	const leaf = basename(cwd);
	return {
		projectName: leaf,
		workingDirectoryName: leaf,
		fullPath: cwd,
		uuid: randomUUID(),
		revision,
		timestamp: formatTimestamp(new Date()),
	};
}
