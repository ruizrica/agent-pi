# Security Report — agent-pi

**Scan Date:** Apr 6, 2026 at 08:09 AM  
**Total Findings:** 153  

## Summary

The scan of **agent-pi** identified **29 findings requiring action**, including **11 critical** issues that should be addressed immediately. Of the 153 total findings, 124 were automatically triaged (74 false positives, 50 accepted risk), leaving 29 for review. The most common issues are **SQL Injection via String Concatenation** (9), **CORS Wildcard with Credentials** (8), **innerHTML Assignment** (4). **Immediate actions:** patch critical vulnerabilities; parameterize SQL queries; restrict CORS origins; sanitize HTML output with DOMPurify.

| Category | Count |
|----------|-------|
| Critical | 11 |
| High | 127 |
| Medium | 13 |
| Low | 2 |
| **Total** | **153** |

| Triage | Count |
|--------|-------|
| Action Required | **29** |
| Likely False Positive | 74 |
| Accepted Risk | 50 |

## Action Required (29)

These findings require review and remediation:

### [!] CRITICAL (2)

#### eval() Usage

**File:** `/Users/ricardo/Workshop/GitHub/agent-pi/extensions/tool-caller.ts:242`  
**Rule:** [`SAST-INJ-006`](https://owasp.org/Top10/A03_2021-Injection/)  
**CWE:** [CWE-95](https://cwe.mitre.org/data/definitions/95.html)  

> eval() executes arbitrary code and should never be used with user input

**Source Context:**
```
   237 | 			if (!command) return { content: [{ type: "text", text: "Error: 'command' parameter required" }] };
   238 | 			const timeout = (args.timeout as number) || undefined;
   239 | 			try {
   240 | 				// pi.exec takes (binary, args[], options) like child_process.spawn
   241 | 				// For shell commands, we need to invoke bash -c "command"
►  242 | 				const result = await pi.exec("bash", ["-c", command], {
   243 | 					signal,
   244 | 					timeout: timeout ? timeout * 1000 : undefined,
   245 | 					cwd,
   246 | 				});
   247 | 				const output = result.stdout + (result.stderr ? `\nSTDERR: ${result.stderr}` : "");
```

**Remediation:**
Avoid exec(). Use ast.literal_eval() for safe evaluation

---

#### Insecure Deserialization

**File:** `/Users/ricardo/Workshop/GitHub/agent-pi/skills/expo-cicd-workflows/scripts/validate.js:32`  
**Rule:** [`SAST-INJ-008`](https://owasp.org/Top10/A03_2021-Injection/)  
**CWE:** [CWE-502](https://cwe.mitre.org/data/definitions/502.html)  
**OWASP:** [A08:2021](https://owasp.org/Top10/A08_2021-Software_and_Data_Integrity_Failures/)  

> Deserializing untrusted data can lead to remote code execution

**Source Context:**
```
    27 | async function validateFile(validator, filePath) {
    28 |   const content = await readFile(filePath, 'utf-8');
    29 | 
    30 |   let doc;
    31 |   try {
►   32 |     doc = yaml.load(content);
    33 |   } catch (e) {
    34 |     return { valid: false, error: `YAML parse error: ${e.message}` };
    35 |   }
    36 | 
    37 |   const valid = validator(doc);
```

**Remediation:**
Use yaml.safe_load() instead of yaml.load()

---

### [H] HIGH (25)

#### innerHTML Assignment

**File:** `/Users/ricardo/Workshop/GitHub/agent-pi/tex/history.js:185`  
**Rule:** [`SAST-XSS-001`](https://owasp.org/www-community/attacks/xss/)  
**CWE:** [CWE-79](https://cwe.mitre.org/data/definitions/79.html)  
**OWASP:** [A03:2021 Injection](https://owasp.org/Top10/)  

> Assigning to innerHTML with user input enables XSS attacks

**Source Context:**
```
   180 |    * Render the history entries into a container element.
   181 |    * @param {HTMLElement} containerEl - The DOM element to render into
   182 |    * @param {object} callbacks - { onSelect(entry), onRestore(entry) }
   183 |    */
   184 |   function renderPanel(containerEl, callbacks) {
►  185 |     containerEl.innerHTML = '';
   186 | 
   187 |     var displayEntries = getEntries();
   188 | 
   189 |     if (displayEntries.length === 0) {
   190 |       var empty = document.createElement('div');
```

**Remediation:**
Use textContent instead, or sanitize with DOMPurify before setting innerHTML

---

#### Regular Expression Denial of Service (ReDoS)

**File:** `/Users/ricardo/Workshop/GitHub/agent-pi/tex/operations.js:170`  
**Rule:** [`SAST-ADV-003`](https://owasp.org/Top10/A09_2021-Security_Logging_and_Monitoring_Failures/)  
**CWE:** [CWE-1333](https://cwe.mitre.org/data/definitions/1333.html)  
**OWASP:** [A06:2021](https://owasp.org/Top10/A06_2021-Vulnerable_and_Outdated_Components/)  

> Unsanitized input used in regular expression constructors can cause catastrophic backtracking and denial of service

**Source Context:**
```
   165 | 
   166 |     let flags = 'g';
   167 |     if (!caseSensitive) flags += 'i';
   168 | 
   169 |     try {
►  170 |       const pattern = useRegex ? new RegExp(find, flags) : new RegExp(escapeRegex(find), flags);
   171 |       return text.replace(pattern, replace);
   172 |     } catch {
   173 |       return text; // Return original if regex is invalid
   174 |     }
   175 |   },
```

**Remediation:**
Never construct regex from user input. Use string methods or escape special characters with escape-string-regexp

---

#### innerHTML Assignment

**File:** `/Users/ricardo/Workshop/GitHub/agent-pi/tex/app.js:183`  
**Rule:** [`SAST-XSS-001`](https://owasp.org/www-community/attacks/xss/)  
**CWE:** [CWE-79](https://cwe.mitre.org/data/definitions/79.html)  
**OWASP:** [A03:2021 Injection](https://owasp.org/Top10/)  

> Assigning to innerHTML with user input enables XSS attacks

**Source Context:**
```
   178 |       els.effectsBar.hidden = true;
   179 |       return;
   180 |     }
   181 | 
   182 |     els.effectsBar.hidden = false;
►  183 |     els.effectsList.innerHTML = '';
   184 | 
   185 |     state.pipeline.forEach(function (item, idx) {
   186 |       var pill = document.createElement('button');
   187 |       pill.className = 'effect-pill' + (item.enabled ? '' : ' disabled');
   188 |       pill.dataset.idx = idx;
```

**Remediation:**
Use textContent instead, or sanitize with DOMPurify before setting innerHTML

---

#### innerHTML Assignment

**File:** `/Users/ricardo/Workshop/GitHub/agent-pi/tex/app.js:196`  
**Rule:** [`SAST-XSS-001`](https://owasp.org/www-community/attacks/xss/)  
**CWE:** [CWE-79](https://cwe.mitre.org/data/definitions/79.html)  
**OWASP:** [A03:2021 Injection](https://owasp.org/Top10/)  

> Assigning to innerHTML with user input enables XSS attacks

**Source Context:**
```
   191 |       var label = OP_LABELS[item.op] || item.op;
   192 |       if (item.op === 'findAndReplace' && item.params) {
   193 |         label = '"' + item.params.find + '" → "' + item.params.replace + '"';
   194 |       }
   195 | 
►  196 |       pill.innerHTML = '<span class="pill-label">' + escapeHTML(label) + '</span>'
   197 |         + '<span class="pill-remove">'
   198 |         + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"'
   199 |         + ' stroke-linecap="round" stroke-linejoin="round">'
   200 |         + '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'
   201 |         + '</svg></span>';
```

**Remediation:**
Use textContent instead, or sanitize with DOMPurify before setting innerHTML

---

#### innerHTML Assignment

**File:** `/Users/ricardo/Workshop/GitHub/agent-pi/tex/app.js:463`  
**Rule:** [`SAST-XSS-001`](https://owasp.org/www-community/attacks/xss/)  
**CWE:** [CWE-79](https://cwe.mitre.org/data/definitions/79.html)  
**OWASP:** [A03:2021 Injection](https://owasp.org/Top10/)  

> Assigning to innerHTML with user input enables XSS attacks

**Source Context:**
```
   458 |     var result = els.inputResult.value;
   459 | 
   460 |     if (!original && !result) { hideDiff(); return; }
   461 | 
   462 |     var segments = DiffEngine.computeDiff(original, result);
►  463 |     els.diffOverlay.innerHTML = DiffEngine.renderHTML(segments);
   464 |     els.diffOverlay.hidden = false;
   465 |     els.inputResult.style.visibility = 'hidden';
   466 |   }
   467 | 
   468 |   function hideDiff() {
```

**Remediation:**
Use textContent instead, or sanitize with DOMPurify before setting innerHTML

---

#### Directory Traversal Pattern

**File:** `/Users/ricardo/Workshop/GitHub/agent-pi/extensions/web-chat.ts:124`  
**Rule:** [`SAST-PT-002`](https://owasp.org/www-community/attacks/Path_Traversal)  
**CWE:** [CWE-23](https://cwe.mitre.org/data/definitions/23.html)  
**OWASP:** [A01:2021](https://owasp.org/Top10/A01_2021-Broken_Access_Control/)  

> Path containing ../ patterns used in file operations may allow directory traversal attacks

**Source Context:**
```
   119 | // ── Logo Loading ─────────────────────────────────────────────────────
   120 | 
   121 | function loadLogoBase64(): string {
   122 | 	try {
   123 | 		const extDir = dirname(fileURLToPath(import.meta.url));
►  124 | 		const logoPath = `${extDir}/../agent-logo.png`;
   125 | 		if (existsSync(logoPath)) {
   126 | 			const buf = readFileSync(logoPath);
   127 | 			return `data:image/png;base64,${buf.toString("base64")}`;
   128 | 		}
   129 | 	} catch {}
```

**Remediation:**
Reject paths containing "../". Use path.resolve() and verify the resolved path is within allowed directories

---

#### CORS Wildcard with Credentials

**File:** `/Users/ricardo/Workshop/GitHub/agent-pi/extensions/web-chat.ts:462`  
**Rule:** [`SAST-CFG-001`](https://owasp.org/Top10/A05_2021-Security_Misconfiguration/)  
**CWE:** [CWE-942](https://cwe.mitre.org/data/definitions/942.html)  

> CORS with origin: * and credentials: true allows any origin to make authenticated requests

**Source Context:**
```
   457 | 				}
   458 | 			}, 120_000);
   459 | 		}
   460 | 
   461 | 		const server = createServer((req: IncomingMessage, res: ServerResponse) => {
►  462 | 			res.setHeader("Access-Control-Allow-Origin", "*");
   463 | 			res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
   464 | 			res.setHeader("Access-Control-Allow-Headers", "Content-Type");
   465 | 
   466 | 			if (req.method === "OPTIONS") {
   467 | 				res.writeHead(204);
```

**Remediation:**
Specify explicit origins for CORS instead of using wildcard (*)

---

#### SQL Injection via String Concatenation

**File:** `/Users/ricardo/Workshop/GitHub/agent-pi/extensions/learn.ts:297`  
**Rule:** [`SAST-INJ-001`](https://owasp.org/Top10/A03_2021-Injection/)  
**CWE:** [CWE-89](https://cwe.mitre.org/data/definitions/89.html)  
**OWASP:** [A03:2021 Injection](https://owasp.org/Top10/)  

> SQL query built with string concatenation and variables may be vulnerable to injection

**Source Context:**
```
   292 | 	lines.push("");
   293 | 
   294 | 	// Summary line
   295 | 	const parts: string[] = [];
   296 | 	if (delta.created.length > 0) parts.push(`${delta.created.length} created`);
►  297 | 	if (delta.updated.length > 0) parts.push(`${delta.updated.length} updated`);
   298 | 	if (delta.unchanged.length > 0) parts.push(`${delta.unchanged.length} unchanged`);
   299 | 	lines.push(`**Summary:** ${parts.join(", ")}`);
   300 | 	lines.push(`**Target:** ${target.resolvedPath}`);
   301 | 	lines.push("");
   302 | 
```

**Remediation:**
Use parameterized queries with placeholders ($1, ?, :param) instead of string interpolation

---

#### SQL Injection via String Concatenation

**File:** `/Users/ricardo/Workshop/GitHub/agent-pi/extensions/learn.ts:311`  
**Rule:** [`SAST-INJ-001`](https://owasp.org/Top10/A03_2021-Injection/)  
**CWE:** [CWE-89](https://cwe.mitre.org/data/definitions/89.html)  
**OWASP:** [A03:2021 Injection](https://owasp.org/Top10/)  

> SQL query built with string concatenation and variables may be vulnerable to injection

**Source Context:**
```
   306 | 		lines.push("");
   307 | 	}
   308 | 
   309 | 	if (delta.updated.length > 0) {
   310 | 		lines.push("### Updated");
►  311 | 		for (const name of delta.updated) lines.push(`- ${name}`);
   312 | 		lines.push("");
   313 | 	}
   314 | 
   315 | 	if (delta.unchanged.length > 0) {
   316 | 		lines.push("### Unchanged");
```

**Remediation:**
Use parameterized queries with placeholders ($1, ?, :param) instead of string interpolation

---

#### Regular Expression Denial of Service (ReDoS)

**File:** `/Users/ricardo/Workshop/GitHub/agent-pi/extensions/learn.ts:358`  
**Rule:** [`SAST-ADV-003`](https://owasp.org/Top10/A09_2021-Security_Logging_and_Monitoring_Failures/)  
**CWE:** [CWE-1333](https://cwe.mitre.org/data/definitions/1333.html)  
**OWASP:** [A06:2021](https://owasp.org/Top10/A06_2021-Vulnerable_and_Outdated_Components/)  

> Unsanitized input used in regular expression constructors can cause catastrophic backtracking and denial of service

**Source Context:**
```
   353 | 	const newEntry = `- [[wiki/${target.wikiSlug}/_index|${target.displayName}]] — validated codebase learn snapshot (${sections.length} articles)`;
   354 | 
   355 | 	const existing = await obsidianExec("read", { path: masterIndexPath() });
   356 | 	if (existing.success && existing.stdout.trim()) {
   357 | 		const lines = existing.stdout.split("\n");
►  358 | 		const entryPattern = new RegExp(`^- \\[\\[wiki/${target.wikiSlug}/`);
   359 | 		let replaced = false;
   360 | 		const merged = lines.map((line) => {
   361 | 			if (entryPattern.test(line)) {
   362 | 				replaced = true;
   363 | 				return newEntry;
```

**Remediation:**
Never construct regex from user input. Use string methods or escape special characters with escape-string-regexp

---

#### SQL Injection via String Concatenation

**File:** `/Users/ricardo/Workshop/GitHub/agent-pi/extensions/learn.ts:704`  
**Rule:** [`SAST-INJ-001`](https://owasp.org/Top10/A03_2021-Injection/)  
**CWE:** [CWE-89](https://cwe.mitre.org/data/definitions/89.html)  
**OWASP:** [A03:2021 Injection](https://owasp.org/Top10/)  

> SQL query built with string concatenation and variables may be vulnerable to injection

**Source Context:**
```
   699 | 	const delta = await writeWikiWithDelta(target, sections);
   700 | 
   701 | 	// Build delta-aware notification
   702 | 	const deltaParts: string[] = [];
   703 | 	if (delta.created.length > 0) deltaParts.push(`${delta.created.length} created`);
►  704 | 	if (delta.updated.length > 0) deltaParts.push(`${delta.updated.length} updated`);
   705 | 	if (delta.unchanged.length > 0) deltaParts.push(`${delta.unchanged.length} unchanged`);
   706 | 	const deltaLine = deltaParts.length > 0 ? deltaParts.join(", ") : "no changes detected";
   707 | 
   708 | 	notify(
   709 | 		`Learned ${target.displayName} → wiki/${target.wikiSlug}\n${deltaLine}`,
```

**Remediation:**
Use parameterized queries with placeholders ($1, ?, :param) instead of string interpolation

---

#### SQL Injection via String Concatenation

**File:** `/Users/ricardo/Workshop/GitHub/agent-pi/extensions/learn.ts:728`  
**Rule:** [`SAST-INJ-001`](https://owasp.org/Top10/A03_2021-Injection/)  
**CWE:** [CWE-89](https://cwe.mitre.org/data/definitions/89.html)  
**OWASP:** [A03:2021 Injection](https://owasp.org/Top10/)  

> SQL query built with string concatenation and variables may be vulnerable to injection

**Source Context:**
```
   723 | 	await writeRawNote(target, sections);
   724 | 	const delta = await writeWikiWithDelta(target, sections);
   725 | 
   726 | 	const deltaParts: string[] = [];
   727 | 	if (delta.created.length > 0) deltaParts.push(`${delta.created.length} created`);
►  728 | 	if (delta.updated.length > 0) deltaParts.push(`${delta.updated.length} updated`);
   729 | 	if (delta.unchanged.length > 0) deltaParts.push(`${delta.unchanged.length} unchanged`);
   730 | 	const deltaLine = deltaParts.length > 0 ? deltaParts.join(", ") : "no changes detected";
   731 | 
   732 | 	ctx.ui.notify(`Learned ${target.displayName} → wiki/${target.wikiSlug}\n${deltaLine}; ${aggregation.summary}`, aggregation.coverage.validated ? "success" : "warning");
   733 | }
```

**Remediation:**
Use parameterized queries with placeholders ($1, ?, :param) instead of string interpolation

---

#### CORS Wildcard with Credentials

**File:** `/Users/ricardo/Workshop/GitHub/agent-pi/extensions/private/extensions/pr-review-viewer.ts:68`  
**Rule:** [`SAST-CFG-001`](https://owasp.org/Top10/A05_2021-Security_Misconfiguration/)  
**CWE:** [CWE-942](https://cwe.mitre.org/data/definitions/942.html)  

> CORS with origin: * and credentials: true allows any origin to make authenticated requests

**Source Context:**
```
    63 | 	return new Promise((resolveSetup) => {
    64 | 		let resolveResult: (result: ViewerResult) => void;
    65 | 		const resultPromise = new Promise<ViewerResult>((res) => { resolveResult = res; });
    66 | 
    67 | 		const server = createServer((req: IncomingMessage, res: ServerResponse) => {
►   68 | 			res.setHeader("Access-Control-Allow-Origin", "*");
    69 | 			res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    70 | 			res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    71 | 			if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
    72 | 
    73 | 			const url = new URL(req.url || "/", "http://localhost");
```

**Remediation:**
Specify explicit origins for CORS instead of using wildcard (*)

---

#### CORS Wildcard with Credentials

**File:** `/Users/ricardo/Workshop/GitHub/agent-pi/extensions/private/extensions/qa-rico-viewer.ts:103`  
**Rule:** [`SAST-CFG-001`](https://owasp.org/Top10/A05_2021-Security_Misconfiguration/)  
**CWE:** [CWE-942](https://cwe.mitre.org/data/definitions/942.html)  

> CORS with origin: * and credentials: true allows any origin to make authenticated requests

**Source Context:**
```
    98 | 		const resultPromise = new Promise<SetupResult>((res) => {
    99 | 			resolveResult = res;
   100 | 		});
   101 | 
   102 | 		const server = createServer((req: IncomingMessage, res: ServerResponse) => {
►  103 | 			res.setHeader("Access-Control-Allow-Origin", "*");
   104 | 			res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
   105 | 			res.setHeader("Access-Control-Allow-Headers", "Content-Type");
   106 | 
   107 | 			if (req.method === "OPTIONS") {
   108 | 				res.writeHead(204);
```

**Remediation:**
Specify explicit origins for CORS instead of using wildcard (*)

---

#### CORS Wildcard with Credentials

**File:** `/Users/ricardo/Workshop/GitHub/agent-pi/extensions/private/extensions/qa-rico-viewer.ts:201`  
**Rule:** [`SAST-CFG-001`](https://owasp.org/Top10/A05_2021-Security_Misconfiguration/)  
**CWE:** [CWE-942](https://cwe.mitre.org/data/definitions/942.html)  

> CORS with origin: * and credentials: true allows any origin to make authenticated requests

**Source Context:**
```
   196 | 				screenshotDirs.push(suite.screenshotDir);
   197 | 			}
   198 | 		}
   199 | 
   200 | 		const server = createServer((req: IncomingMessage, res: ServerResponse) => {
►  201 | 			res.setHeader("Access-Control-Allow-Origin", "*");
   202 | 			res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
   203 | 			res.setHeader("Access-Control-Allow-Headers", "Content-Type");
   204 | 
   205 | 			if (req.method === "OPTIONS") {
   206 | 				res.writeHead(204);
```

**Remediation:**
Specify explicit origins for CORS instead of using wildcard (*)

---

#### CORS Wildcard with Credentials

**File:** `/Users/ricardo/Workshop/GitHub/agent-pi/extensions/private/extensions/swagbucks-viewer.ts:56`  
**Rule:** [`SAST-CFG-001`](https://owasp.org/Top10/A05_2021-Security_Misconfiguration/)  
**CWE:** [CWE-942](https://cwe.mitre.org/data/definitions/942.html)  

> CORS with origin: * and credentials: true allows any origin to make authenticated requests

**Source Context:**
```
    51 | 		const resultPromise = new Promise<SetupResult>((res) => {
    52 | 			resolveResult = res;
    53 | 		});
    54 | 
    55 | 		const server = createServer((req: IncomingMessage, res: ServerResponse) => {
►   56 | 			res.setHeader("Access-Control-Allow-Origin", "*");
    57 | 			res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    58 | 			res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    59 | 
    60 | 			if (req.method === "OPTIONS") {
    61 | 				res.writeHead(204);
```

**Remediation:**
Specify explicit origins for CORS instead of using wildcard (*)

---

#### CORS Wildcard with Credentials

**File:** `/Users/ricardo/Workshop/GitHub/agent-pi/extensions/private/extensions/swagbucks-viewer.ts:139`  
**Rule:** [`SAST-CFG-001`](https://owasp.org/Top10/A05_2021-Security_Misconfiguration/)  
**CWE:** [CWE-942](https://cwe.mitre.org/data/definitions/942.html)  

> CORS with origin: * and credentials: true allows any origin to make authenticated requests

**Source Context:**
```
   134 | 		const resultPromise = new Promise<ReportResult>((res) => {
   135 | 			resolveResult = res;
   136 | 		});
   137 | 
   138 | 		const server = createServer((req: IncomingMessage, res: ServerResponse) => {
►  139 | 			res.setHeader("Access-Control-Allow-Origin", "*");
   140 | 			res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
   141 | 			res.setHeader("Access-Control-Allow-Headers", "Content-Type");
   142 | 
   143 | 			if (req.method === "OPTIONS") {
   144 | 				res.writeHead(204);
```

**Remediation:**
Specify explicit origins for CORS instead of using wildcard (*)

---

#### CORS Wildcard with Credentials

**File:** `/Users/ricardo/Workshop/GitHub/agent-pi/extensions/private/extensions/pr-review-report.ts:38`  
**Rule:** [`SAST-CFG-001`](https://owasp.org/Top10/A05_2021-Security_Misconfiguration/)  
**CWE:** [CWE-942](https://cwe.mitre.org/data/definitions/942.html)  

> CORS with origin: * and credentials: true allows any origin to make authenticated requests

**Source Context:**
```
    33 | 	return new Promise((resolveSetup) => {
    34 | 		let resolveResult: () => void;
    35 | 		const resultPromise = new Promise<void>((res) => { resolveResult = res; });
    36 | 
    37 | 		const server = createServer((req: IncomingMessage, res: ServerResponse) => {
►   38 | 			res.setHeader("Access-Control-Allow-Origin", "*");
    39 | 			res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    40 | 			res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    41 | 			if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
    42 | 
    43 | 			const url = new URL(req.url || "/", "http://localhost");
```

**Remediation:**
Specify explicit origins for CORS instead of using wildcard (*)

---

#### Regular Expression Denial of Service (ReDoS)

**File:** `/Users/ricardo/Workshop/GitHub/agent-pi/extensions/complex-problem-loop.ts:52`  
**Rule:** [`SAST-ADV-003`](https://owasp.org/Top10/A09_2021-Security_Logging_and_Monitoring_Failures/)  
**CWE:** [CWE-1333](https://cwe.mitre.org/data/definitions/1333.html)  
**OWASP:** [A06:2021](https://owasp.org/Top10/A06_2021-Vulnerable_and_Outdated_Components/)  

> Unsanitized input used in regular expression constructors can cause catastrophic backtracking and denial of service

**Source Context:**
```
    47 |   return items.map((item) => `- ${item}`).join("\n");
    48 | }
    49 | 
    50 | function upsertSection(markdown: string, title: string, content: string): string {
    51 |   const header = `## ${title}`;
►   52 |   const pattern = new RegExp(`(^## ${title}\\n)([\\s\\S]*?)(?=\\n## [^\\n]+|$)`, "m");
    53 |   if (pattern.test(markdown)) {
    54 |     return markdown.replace(pattern, `${header}\n${content.trim()}\n`);
    55 |   }
    56 |   const trimmed = markdown.trimEnd();
    57 |   return `${trimmed}\n\n${header}\n${content.trim()}\n`;
```

**Remediation:**
Never construct regex from user input. Use string methods or escape special characters with escape-string-regexp

---

#### SQL Injection via String Concatenation

**File:** `/Users/ricardo/Workshop/GitHub/agent-pi/extensions/complex-problem-loop.ts:118`  
**Rule:** [`SAST-INJ-001`](https://owasp.org/Top10/A03_2021-Injection/)  
**CWE:** [CWE-89](https://cwe.mitre.org/data/definitions/89.html)  
**OWASP:** [A03:2021 Injection](https://owasp.org/Top10/)  

> SQL query built with string concatenation and variables may be vulnerable to injection

**Source Context:**
```
   113 |       let updated = existing;
   114 |       if (current_understanding) {
   115 |         updated = upsertSection(updated, "Current Understanding", bulletLines(current_understanding));
   116 |       }
   117 |       if (active_hypothesis) {
►  118 |         updated = upsertSection(updated, "Active Hypothesis", `- ${active_hypothesis}`);
   119 |       }
   120 |       if (open_questions) {
   121 |         updated = upsertSection(updated, "Open Questions", bulletLines(open_questions));
   122 |       }
   123 |       if (risks) {
```

**Remediation:**
Use parameterized queries with placeholders ($1, ?, :param) instead of string interpolation

---

#### SQL Injection via String Concatenation

**File:** `/Users/ricardo/Workshop/GitHub/agent-pi/extensions/complex-problem-loop.ts:127`  
**Rule:** [`SAST-INJ-001`](https://owasp.org/Top10/A03_2021-Injection/)  
**CWE:** [CWE-89](https://cwe.mitre.org/data/definitions/89.html)  
**OWASP:** [A03:2021 Injection](https://owasp.org/Top10/)  

> SQL query built with string concatenation and variables may be vulnerable to injection

**Source Context:**
```
   122 |       }
   123 |       if (risks) {
   124 |         updated = upsertSection(updated, "Risks", bulletLines(risks));
   125 |       }
   126 |       if (last_slice) {
►  127 |         updated = upsertSection(updated, "Last Slice", `- ${last_slice}`);
   128 |       }
   129 |       updated = upsertSection(updated, "Next Slice", `- ${next_slice}`);
   130 |       writeFileSync(filePath, updated, "utf-8");
   131 |       return { content: [{ type: "text" as const, text: `Updated complex problem session at ${filePath}` }] };
   132 |     },
```

**Remediation:**
Use parameterized queries with placeholders ($1, ?, :param) instead of string interpolation

---

#### SQL Injection via String Concatenation

**File:** `/Users/ricardo/Workshop/GitHub/agent-pi/extensions/complex-problem-loop.ts:129`  
**Rule:** [`SAST-INJ-001`](https://owasp.org/Top10/A03_2021-Injection/)  
**CWE:** [CWE-89](https://cwe.mitre.org/data/definitions/89.html)  
**OWASP:** [A03:2021 Injection](https://owasp.org/Top10/)  

> SQL query built with string concatenation and variables may be vulnerable to injection

**Source Context:**
```
   124 |         updated = upsertSection(updated, "Risks", bulletLines(risks));
   125 |       }
   126 |       if (last_slice) {
   127 |         updated = upsertSection(updated, "Last Slice", `- ${last_slice}`);
   128 |       }
►  129 |       updated = upsertSection(updated, "Next Slice", `- ${next_slice}`);
   130 |       writeFileSync(filePath, updated, "utf-8");
   131 |       return { content: [{ type: "text" as const, text: `Updated complex problem session at ${filePath}` }] };
   132 |     },
   133 |   });
   134 | }
```

**Remediation:**
Use parameterized queries with placeholders ($1, ?, :param) instead of string interpolation

---

#### CORS Wildcard with Credentials

**File:** `/Users/ricardo/Workshop/GitHub/agent-pi/extensions/sounds.ts:84`  
**Rule:** [`SAST-CFG-001`](https://owasp.org/Top10/A05_2021-Security_Misconfiguration/)  
**CWE:** [CWE-942](https://cwe.mitre.org/data/definitions/942.html)  

> CORS with origin: * and credentials: true allows any origin to make authenticated requests

**Source Context:**
```
    79 | 				resolveResult!({ action: "cancelled" });
    80 | 			}
    81 | 		}, 5_000);
    82 | 
    83 | 		const server = createServer((req: IncomingMessage, res: ServerResponse) => {
►   84 | 			res.setHeader("Access-Control-Allow-Origin", "*");
    85 | 			res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    86 | 			res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    87 | 
    88 | 			if (req.method === "OPTIONS") {
    89 | 				res.writeHead(204);
```

**Remediation:**
Specify explicit origins for CORS instead of using wildcard (*)

---

#### SQL Injection via String Concatenation

**File:** `/Users/ricardo/Workshop/GitHub/agent-pi/extensions/tasks.ts:735`  
**Rule:** [`SAST-INJ-001`](https://owasp.org/Top10/A03_2021-Injection/)  
**CWE:** [CWE-89](https://cwe.mitre.org/data/definitions/89.html)  
**OWASP:** [A03:2021 Injection](https://owasp.org/Top10/)  

> SQL query built with string concatenation and variables may be vulnerable to injection

**Source Context:**
```
   730 | 					}
   731 | 					const toUpdate = tasks.find((t) => t.id === params.id);
   732 | 					if (!toUpdate) {
   733 | 						return {
   734 | 							content: [{ type: "text" as const, text: `Task #${params.id} not found` }],
►  735 | 							details: makeDetails("update", `#${params.id} not found`),
   736 | 						};
   737 | 					}
   738 | 					const oldText = toUpdate.text;
   739 | 					toUpdate.text = params.text;
   740 | 					toUpdate.lastUpdatedAt = nowIso();
```

**Remediation:**
Use parameterized queries with placeholders ($1, ?, :param) instead of string interpolation

---

#### SQL Injection via String Concatenation

**File:** `/Users/ricardo/Workshop/GitHub/agent-pi/extensions/tasks.ts:742`  
**Rule:** [`SAST-INJ-001`](https://owasp.org/Top10/A03_2021-Injection/)  
**CWE:** [CWE-89](https://cwe.mitre.org/data/definitions/89.html)  
**OWASP:** [A03:2021 Injection](https://owasp.org/Top10/)  

> SQL query built with string concatenation and variables may be vulnerable to injection

**Source Context:**
```
   737 | 					}
   738 | 					const oldText = toUpdate.text;
   739 | 					toUpdate.text = params.text;
   740 | 					toUpdate.lastUpdatedAt = nowIso();
   741 | 					toUpdate.lastUpdatedBy = currentActor();
►  742 | 					saveSharedStateIfNeeded("update", `Updated task #${toUpdate.id}.`);
   743 | 					const result = {
   744 | 						content: [{ type: "text" as const, text: `Updated #${toUpdate.id}: "${oldText}" → "${toUpdate.text}"` }],
   745 | 						details: makeDetails("update"),
   746 | 					};
   747 | 					refreshUI(ctx);
```

**Remediation:**
Use parameterized queries with placeholders ($1, ?, :param) instead of string interpolation

---

### [M] MEDIUM (1)

#### High-Entropy String

**File:** `/Users/ricardo/Workshop/GitHub/agent-pi/extensions/debug-capture.ts:204`  
**Rule:** [`ENTROPY-DETECT`](https://owasp.org/Top10/)  

> Potential secret detected with entropy 4.79

**Source Context:**
```
   199 | FG_WHITE="\\033[1;97m"
   200 | RST="\\033[0m"
   201 | PAD="                                                            "
   202 | 
   203 | echo ""
►  204 | echo -e "\${FG_WHITE}Mode: NORMAL (no banner)\${RST}"
   205 | echo ""
   206 | echo -e "\${BG_BLUE}\${FG_WHITE} PLAN \${PAD}\${RST}"
   207 | echo ""
   208 | echo -e "\${BG_BLUE}\${FG_WHITE} SPEC \${PAD}\${RST}"
   209 | echo ""
```

**Remediation:**
Review if this string is a secret. If so, move to environment variables.

---

### [L] LOW (1)

#### Insecure HTTP Connection

**File:** `/Users/ricardo/Workshop/GitHub/agent-pi/extensions/security-guard.ts:394`  
**Rule:** [`SAST-CFG-005`](https://owasp.org/Top10/A05_2021-Security_Misconfiguration/)  

> Using unencrypted HTTP for communication instead of HTTPS

**Source Context:**
```
   389 | 			for (const s of strings) {
   390 | 				// Check for injection patterns in params
   391 | 				const threats = scanContent(s, policy);
   392 | 				allThreats.push(...threats);
   393 | 				// Check for exfiltration URLs in params
►  394 | 				if (s.startsWith("http://") || s.startsWith("https://")) {
   395 | 					const urlThreats = scanUrl(s, policy);
   396 | 					allThreats.push(...urlThreats);
   397 | 				}
   398 | 			}
   399 | 		}
```

**Remediation:**
Use HTTPS for all external connections

---

---

## Likely False Positives (74)

These findings were automatically triaged as likely false positives. No action needed unless noted.

| Severity | Title | File | Reason |
|----------|-------|------|--------|
| critical | Unsafe LLM Output Rendering | `...agent-pi/extensions/__tests__/vuln-scanner-engine.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| critical | Dynamic Code Execution from LLM Output | `...agent-pi/extensions/__tests__/vuln-scanner-engine.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| critical | LLM Output Used in SQL or Shell Commands | `...agent-pi/extensions/__tests__/vuln-scanner-engine.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| critical | Hardcoded LLM API Key | `...agent-pi/extensions/__tests__/vuln-scanner-engine.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| critical | Hardcoded OAuth Token | `...agent-pi/extensions/__tests__/vuln-scanner-engine.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| critical | Unsafe LLM Output Rendering | `...agent-pi/extensions/__tests__/vuln-scanner-engine.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| critical | Dynamic Code Execution from LLM Output | `...agent-pi/extensions/__tests__/vuln-scanner-engine.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| critical | Unsafe LLM Output Rendering | `...agent-pi/extensions/__tests__/vuln-scanner-engine.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| critical | Dynamic Code Execution from LLM Output | `...agent-pi/extensions/__tests__/vuln-scanner-engine.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Data Exfiltration via LLM Context | `...nt-pi/extensions/__tests__/vuln-scanner-installer.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Data Exfiltration via LLM Context | `...nt-pi/extensions/__tests__/vuln-scanner-installer.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Data Exfiltration via LLM Context | `...nt-pi/extensions/__tests__/vuln-scanner-installer.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Data Exfiltration via LLM Context | `...nt-pi/extensions/__tests__/vuln-scanner-installer.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Data Exfiltration via LLM Context | `...nt-pi/extensions/__tests__/vuln-scanner-installer.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Data Exfiltration via LLM Context | `...nt-pi/extensions/__tests__/vuln-scanner-installer.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Data Exfiltration via LLM Context | `...nt-pi/extensions/__tests__/vuln-scanner-installer.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Data Exfiltration via LLM Context | `...nt-pi/extensions/__tests__/vuln-scanner-installer.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Data Exfiltration via LLM Context | `...nt-pi/extensions/__tests__/vuln-scanner-installer.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Data Exfiltration via LLM Context | `...nt-pi/extensions/__tests__/vuln-scanner-installer.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Data Exfiltration via LLM Context | `...nt-pi/extensions/__tests__/vuln-scanner-installer.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Excessive Agent Permissions | `...tHub/agent-pi/extensions/__tests__/session-replay.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Excessive Agent Permissions | `...tHub/agent-pi/extensions/__tests__/session-replay.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Excessive Agent Permissions | `...tHub/agent-pi/extensions/__tests__/session-replay.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Data Exfiltration via LLM Context | `...tHub/agent-pi/extensions/__tests__/session-replay.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Excessive Agent Permissions | `...tHub/agent-pi/extensions/__tests__/session-replay.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Excessive Agent Permissions | `...tHub/agent-pi/extensions/__tests__/safe-port-scan.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Excessive Agent Permissions | `...tHub/agent-pi/extensions/__tests__/safe-port-scan.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Excessive Agent Permissions | `...tHub/agent-pi/extensions/__tests__/safe-port-scan.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Directory Traversal Pattern | `.../GitHub/agent-pi/extensions/__tests__/file-viewer.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Excessive Agent Permissions | `...p/GitHub/agent-pi/extensions/__tests__/send-email.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Excessive Agent Permissions | `...p/GitHub/agent-pi/extensions/__tests__/send-email.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Excessive Agent Permissions | `...p/GitHub/agent-pi/extensions/__tests__/send-email.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Excessive Agent Permissions | `...p/GitHub/agent-pi/extensions/__tests__/send-email.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Excessive Agent Permissions | `...p/GitHub/agent-pi/extensions/__tests__/send-email.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Excessive Agent Permissions | `...p/GitHub/agent-pi/extensions/__tests__/send-email.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Excessive Agent Permissions | `...p/GitHub/agent-pi/extensions/__tests__/send-email.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Excessive Agent Permissions | `...p/GitHub/agent-pi/extensions/__tests__/send-email.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Excessive Agent Permissions | `...p/GitHub/agent-pi/extensions/__tests__/send-email.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Excessive Agent Permissions | `...p/GitHub/agent-pi/extensions/__tests__/send-email.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Excessive Agent Permissions | `...p/GitHub/agent-pi/extensions/__tests__/send-email.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Excessive Agent Permissions | `...p/GitHub/agent-pi/extensions/__tests__/send-email.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Excessive Agent Permissions | `...p/GitHub/agent-pi/extensions/__tests__/send-email.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Directory Traversal Pattern | `...Hub/agent-pi/extensions/__tests__/commander-ready.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Excessive Agent Permissions | `...itHub/agent-pi/extensions/__tests__/commander-mcp.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Excessive Agent Permissions | `...itHub/agent-pi/extensions/__tests__/commander-mcp.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Excessive Agent Permissions | `...itHub/agent-pi/extensions/__tests__/commander-mcp.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Excessive Agent Permissions | `...itHub/agent-pi/extensions/__tests__/commander-mcp.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Excessive Agent Permissions | `...itHub/agent-pi/extensions/__tests__/commander-mcp.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Directory Traversal Pattern | `...ub/agent-pi/extensions/__tests__/toolkit-commands.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Directory Traversal Pattern | `...ub/agent-pi/extensions/__tests__/toolkit-commands.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Directory Traversal Pattern | `...ub/agent-pi/extensions/__tests__/toolkit-commands.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Directory Traversal Pattern | `...ub/agent-pi/extensions/__tests__/toolkit-commands.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Directory Traversal Pattern | `...ub/agent-pi/extensions/__tests__/toolkit-commands.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Directory Traversal Pattern | `...ub/agent-pi/extensions/__tests__/toolkit-commands.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Excessive Agent Permissions | `...Hub/agent-pi/extensions/__tests__/network-inspect.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Excessive Agent Permissions | `...Hub/agent-pi/extensions/__tests__/network-inspect.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Excessive Agent Permissions | `...gent-pi/extensions/__tests__/obsidian-integration-test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Excessive Agent Permissions | `...gent-pi/extensions/__tests__/obsidian-integration-test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Excessive Agent Permissions | `...gent-pi/extensions/__tests__/obsidian-integration-test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Excessive Agent Permissions | `...itHub/agent-pi/extensions/__tests__/security-news.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Excessive Agent Permissions | `...itHub/agent-pi/extensions/__tests__/security-news.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| high | Directory Traversal Pattern | `...hop/GitHub/agent-pi/extensions/__tests__/vitest.config.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| medium | High-Entropy String | `...GitHub/agent-pi/extensions/__tests__/mode-prompts.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| medium | High-Entropy String | `...ub/agent-pi/extensions/__tests__/commander-prompt.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| medium | High-Entropy String | `...ub/agent-pi/extensions/__tests__/commander-prompt.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| medium | High-Entropy String | `...b/agent-pi/extensions/__tests__/chain-yaml-parser.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| medium | High-Entropy String | `...b/agent-pi/extensions/__tests__/chain-yaml-parser.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| medium | Missing Token or Rate Limits on LLM Calls | `...agent-pi/extensions/__tests__/vuln-scanner-engine.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| medium | Missing Token or Rate Limits on LLM Calls | `...agent-pi/extensions/__tests__/vuln-scanner-engine.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| medium | Missing Output Guardrails | `...agent-pi/extensions/__tests__/vuln-scanner-engine.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| medium | Missing Token or Rate Limits on LLM Calls | `...agent-pi/extensions/__tests__/vuln-scanner-engine.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| medium | Missing Output Guardrails | `...agent-pi/extensions/__tests__/vuln-scanner-engine.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| medium | Missing Output Guardrails | `...agent-pi/extensions/__tests__/vuln-scanner-engine.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |
| low | Hardcoded IP Address | `...tHub/agent-pi/extensions/__tests__/safe-port-scan.test.ts` | Finding in test/fixture/example file. These use placeholder data, not real credentials. |

---

## Accepted Risk (50)

These findings have been classified as accepted risk:

| Severity | Title | File | Reason |
|----------|-------|------|--------|
| high | Excessive Agent Permissions | `...ricardo/Workshop/GitHub/agent-pi/extensions/agent-team.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Excessive Agent Permissions | `...ricardo/Workshop/GitHub/agent-pi/extensions/agent-team.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Excessive Agent Permissions | `...ricardo/Workshop/GitHub/agent-pi/extensions/agent-team.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Excessive Agent Permissions | `...ricardo/Workshop/GitHub/agent-pi/extensions/agent-team.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Data Exfiltration via LLM Context | `...cardo/Workshop/GitHub/agent-pi/extensions/vuln-scanner.ts` | AI agent definition file — file/prompt access is by design. |
| high | Data Exfiltration via LLM Context | `.../Workshop/GitHub/agent-pi/extensions/completion-report.ts` | AI agent definition file — file/prompt access is by design. |
| high | Data Exfiltration via LLM Context | `...icardo/Workshop/GitHub/agent-pi/extensions/file-viewer.ts` | AI agent definition file — file/prompt access is by design. |
| high | Excessive Agent Permissions | `...s/ricardo/Workshop/GitHub/agent-pi/extensions/web-chat.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Excessive Agent Permissions | `...s/ricardo/Workshop/GitHub/agent-pi/extensions/web-chat.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Excessive Agent Permissions | `...s/ricardo/Workshop/GitHub/agent-pi/extensions/web-chat.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Excessive Agent Permissions | `...s/ricardo/Workshop/GitHub/agent-pi/extensions/web-chat.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Excessive Agent Permissions | `...s/ricardo/Workshop/GitHub/agent-pi/extensions/web-chat.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Excessive Agent Permissions | `...s/ricardo/Workshop/GitHub/agent-pi/extensions/web-chat.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Excessive Agent Permissions | `...s/ricardo/Workshop/GitHub/agent-pi/extensions/web-chat.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Excessive Agent Permissions | `...ardo/Workshop/GitHub/agent-pi/extensions/tool-registry.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Excessive Agent Permissions | `...icardo/Workshop/GitHub/agent-pi/extensions/tool-caller.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Excessive Agent Permissions | `...icardo/Workshop/GitHub/agent-pi/extensions/tool-caller.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Excessive Agent Permissions | `...icardo/Workshop/GitHub/agent-pi/extensions/tool-caller.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Excessive Agent Permissions | `...icardo/Workshop/GitHub/agent-pi/extensions/tool-caller.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Excessive Agent Permissions | `...icardo/Workshop/GitHub/agent-pi/extensions/tool-caller.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Excessive Agent Permissions | `...icardo/Workshop/GitHub/agent-pi/extensions/tool-caller.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Excessive Agent Permissions | `...icardo/Workshop/GitHub/agent-pi/extensions/tool-caller.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Excessive Agent Permissions | `...icardo/Workshop/GitHub/agent-pi/extensions/tool-caller.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Data Exfiltration via LLM Context | `...icardo/Workshop/GitHub/agent-pi/extensions/tool-caller.ts` | AI agent definition file — file/prompt access is by design. |
| high | Data Exfiltration via LLM Context | `...ardo/Workshop/GitHub/agent-pi/extensions/system-select.ts` | Agent tool definition or system prompt — by-design LLM context. |
| high | Excessive Agent Permissions | `...ardo/Workshop/GitHub/agent-pi/extensions/system-select.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Excessive Agent Permissions | `...icardo/Workshop/GitHub/agent-pi/extensions/agent-chain.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Excessive Agent Permissions | `...icardo/Workshop/GitHub/agent-pi/extensions/agent-chain.ts` | Agent tool schema definition, not an excessive permission grant. |
| high | Excessive Agent Permissions | `...icardo/Workshop/GitHub/agent-pi/extensions/agent-chain.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Excessive Agent Permissions | `...icardo/Workshop/GitHub/agent-pi/extensions/agent-chain.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Excessive Agent Permissions | `...ardo/Workshop/GitHub/agent-pi/extensions/commander-mcp.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Excessive Agent Permissions | `...ardo/Workshop/GitHub/agent-pi/extensions/pipeline-team.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Excessive Agent Permissions | `...ardo/Workshop/GitHub/agent-pi/extensions/pipeline-team.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Excessive Agent Permissions | `...ardo/Workshop/GitHub/agent-pi/extensions/pipeline-team.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Excessive Agent Permissions | `...ardo/Workshop/GitHub/agent-pi/extensions/pipeline-team.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Excessive Agent Permissions | `...ardo/Workshop/GitHub/agent-pi/extensions/pipeline-team.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Data Exfiltration via LLM Context | `...rdo/Workshop/GitHub/agent-pi/extensions/security-guard.ts` | AI agent definition file — file/prompt access is by design. |
| high | Excessive Agent Permissions | `...rdo/Workshop/GitHub/agent-pi/extensions/security-guard.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Excessive Agent Permissions | `/Users/ricardo/Workshop/GitHub/agent-pi/extensions/sounds.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Excessive Agent Permissions | `/Users/ricardo/Workshop/GitHub/agent-pi/extensions/sounds.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Excessive Agent Permissions | `/Users/ricardo/Workshop/GitHub/agent-pi/extensions/sounds.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Excessive Agent Permissions | `/Users/ricardo/Workshop/GitHub/agent-pi/extensions/sounds.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Data Exfiltration via LLM Context | `...s/ricardo/Workshop/GitHub/agent-pi/extensions/web-test.ts` | AI agent definition file — file/prompt access is by design. |
| high | Excessive Agent Permissions | `...do/Workshop/GitHub/agent-pi/extensions/subagent-widget.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Data Exfiltration via LLM Context | `...do/Workshop/GitHub/agent-pi/extensions/subagent-widget.ts` | AI agent definition file — file/prompt access is by design. |
| high | Excessive Agent Permissions | `...do/Workshop/GitHub/agent-pi/extensions/subagent-widget.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Excessive Agent Permissions | `...do/Workshop/GitHub/agent-pi/extensions/subagent-widget.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Excessive Agent Permissions | `...do/Workshop/GitHub/agent-pi/extensions/subagent-widget.ts` | AI agent code — tool/file access is architectural, not a vulnerability. |
| high | Data Exfiltration via LLM Context | `...b/agent-pi/skills/expo-cicd-workflows/scripts/validate.js` | AI agent definition file — file/prompt access is by design. |
| medium | Missing Output Guardrails | `...cardo/Workshop/GitHub/agent-pi/extensions/board-viewer.ts` | Agent infrastructure code — output handling is managed at the orchestration layer. |
