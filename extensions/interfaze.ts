import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { INTERFAZE_BETA_MODEL } from "./lib/interfaze-models.ts";
import { streamInterfazeProvider } from "./lib/interfaze-provider.ts";

export default function interfazeExtension(pi: ExtensionAPI) {
	pi.registerProvider("interfaze", {
		baseUrl: "https://api.interfaze.ai/v1",
		apiKey: "INTERFAZE_API_KEY",
		api: "openai-completions",
		models: [INTERFAZE_BETA_MODEL],
		streamSimple: streamInterfazeProvider,
	});
}
