// ABOUTME: Curated security news/advisory retrieval for trusted sources like CISA, NVD, OWASP, and CVE.
// ABOUTME: Registers a security_news tool that returns trust-ranked, freshness-aware advisory data.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Text } from "@earendil-works/pi-tui";

const SOURCE_IDS = ["cisa", "owasp", "nvd", "cve"] as const;
type SourceId = typeof SOURCE_IDS[number];

type SecurityNewsAction = "sources" | "latest" | "search" | "cve_lookup";

interface SecuritySource {
  id: SourceId;
  name: string;
  tier: 1 | 2;
  trustScore: number;
  category: string;
  description: string;
  homepage: string;
  fetchLatest?: (query?: string) => Promise<SecurityNewsItem[]>;
  lookupCve?: (cveId: string) => Promise<SecurityNewsItem[]>;
}

interface SecurityNewsItem {
  title: string;
  summary: string;
  url: string;
  source: SourceId;
  sourceName: string;
  category: string;
  publishedAt?: string;
  trustScore: number;
  tags: string[];
  cveIds?: string[];
}

const CISA_KEV_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";
const NVD_API_URL = "https://services.nvd.nist.gov/rest/json/cves/2.0";
const OWASP_NEWS_URL = "https://owasp.org/www-project-top-ten/";
const CVE_API_URL = "https://cveawg.mitre.org/api/cve/";

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function containsQuery(item: SecurityNewsItem, query?: string): boolean {
  if (!query) return true;
  const haystack = [item.title, item.summary, item.tags.join(" "), ...(item.cveIds || [])].join(" ").toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((term) => haystack.includes(term));
}

function dedupeItems(items: SecurityNewsItem[]): SecurityNewsItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.source}:${item.url}:${(item.cveIds || []).join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractCveIds(...values: string[]): string[] {
  const matches = new Set<string>();
  for (const value of values) {
    const found = value.match(/CVE-\d{4}-\d{4,7}/gi) || [];
    for (const id of found) matches.add(id.toUpperCase());
  }
  return [...matches];
}

async function fetchJson(url: string): Promise<any> {
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "pi-agent-security-news/1.0",
      "Accept": "application/json, text/plain;q=0.9, */*;q=0.8",
    },
  });
  if (!resp.ok) {
    throw new Error(`Fetch failed (${resp.status}) for ${url}`);
  }
  return resp.json();
}

async function fetchText(url: string): Promise<string> {
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "pi-agent-security-news/1.0",
      "Accept": "text/html, text/plain;q=0.9, */*;q=0.8",
    },
  });
  if (!resp.ok) {
    throw new Error(`Fetch failed (${resp.status}) for ${url}`);
  }
  return resp.text();
}

async function fetchCisaKev(query?: string): Promise<SecurityNewsItem[]> {
  const data = await fetchJson(CISA_KEV_URL);
  const vulns = safeArray<any>(data?.vulnerabilities).slice(0, 50);
  return vulns
    .map((item) => {
      const cveId = normalizeText(item.cveID).toUpperCase();
      const title = `${cveId} — ${normalizeText(item.vulnerabilityName) || "Known Exploited Vulnerability"}`;
      const summary = [
        normalizeText(item.vendorProject),
        normalizeText(item.product),
        normalizeText(item.shortDescription),
        normalizeText(item.requiredAction) ? `Required action: ${normalizeText(item.requiredAction)}` : "",
      ].filter(Boolean).join(" | ");
      return {
        title,
        summary,
        url: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog",
        source: "cisa" as const,
        sourceName: "CISA KEV",
        category: "known-exploited-vulnerability",
        publishedAt: normalizeText(item.dateAdded),
        trustScore: 10,
        tags: ["cisa", "kev", "vulnerability", "advisory"],
        cveIds: cveId ? [cveId] : [],
      } satisfies SecurityNewsItem;
    })
    .filter((item) => containsQuery(item, query));
}

async function fetchNvdLatest(query?: string): Promise<SecurityNewsItem[]> {
  const data = await fetchJson(`${NVD_API_URL}?resultsPerPage=20`);
  const vulns = safeArray<any>(data?.vulnerabilities);
  return vulns.map((entry) => {
    const cve = entry?.cve || {};
    const cveId = normalizeText(cve.id).toUpperCase();
    const descriptions = safeArray<any>(cve.descriptions);
    const desc = descriptions.find((d) => d?.lang === "en")?.value || descriptions[0]?.value || "";
    return {
      title: `${cveId} — ${desc.slice(0, 120) || "NVD Advisory"}`,
      summary: normalizeText(desc),
      url: cveId ? `https://nvd.nist.gov/vuln/detail/${cveId}` : "https://nvd.nist.gov/",
      source: "nvd" as const,
      sourceName: "NVD",
      category: "cve",
      publishedAt: normalizeText(cve.published),
      trustScore: 10,
      tags: ["nvd", "cve", "vulnerability"],
      cveIds: cveId ? [cveId] : [],
    } satisfies SecurityNewsItem;
  }).filter((item) => containsQuery(item, query));
}

async function fetchNvdByCve(cveId: string): Promise<SecurityNewsItem[]> {
  const data = await fetchJson(`${NVD_API_URL}?cveId=${encodeURIComponent(cveId)}`);
  const vulns = safeArray<any>(data?.vulnerabilities);
  return vulns.map((entry) => {
    const cve = entry?.cve || {};
    const descriptions = safeArray<any>(cve.descriptions);
    const desc = descriptions.find((d) => d?.lang === "en")?.value || descriptions[0]?.value || "";
    return {
      title: `${cveId.toUpperCase()} — ${desc.slice(0, 120) || "NVD Advisory"}`,
      summary: normalizeText(desc),
      url: `https://nvd.nist.gov/vuln/detail/${cveId.toUpperCase()}`,
      source: "nvd" as const,
      sourceName: "NVD",
      category: "cve",
      publishedAt: normalizeText(cve.published),
      trustScore: 10,
      tags: ["nvd", "cve", "vulnerability"],
      cveIds: [cveId.toUpperCase()],
    } satisfies SecurityNewsItem;
  });
}

async function fetchCveById(cveId: string): Promise<SecurityNewsItem[]> {
  const data = await fetchJson(`${CVE_API_URL}${encodeURIComponent(cveId)}`);
  const title = normalizeText(data?.cveMetadata?.cveId || cveId.toUpperCase());
  const descriptions = safeArray<any>(data?.containers?.cna?.descriptions);
  const desc = descriptions.find((d) => d?.lang === "en")?.value || descriptions[0]?.value || "";
  return [{
    title: `${title} — ${desc.slice(0, 120) || "CVE Record"}`,
    summary: normalizeText(desc),
    url: `https://www.cve.org/CVERecord?id=${title}`,
    source: "cve",
    sourceName: "CVE / MITRE",
    category: "cve-record",
    publishedAt: normalizeText(data?.cveMetadata?.datePublished),
    trustScore: 9,
    tags: ["cve", "mitre", "vulnerability"],
    cveIds: [title],
  }];
}

async function fetchOwaspLatest(query?: string): Promise<SecurityNewsItem[]> {
  const html = await fetchText(OWASP_NEWS_URL);
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const item: SecurityNewsItem = {
    title: "OWASP Top 10 Web Application Security Risks",
    summary: text.slice(0, 500),
    url: OWASP_NEWS_URL,
    source: "owasp",
    sourceName: "OWASP",
    category: "owasp-guidance",
    trustScore: 8,
    tags: ["owasp", "web-security", "guidance", ...extractCveIds(text)],
    cveIds: extractCveIds(text),
  };
  return containsQuery(item, query) ? [item] : [];
}

const SOURCES: SecuritySource[] = [
  {
    id: "cisa",
    name: "CISA KEV",
    tier: 1,
    trustScore: 10,
    category: "government",
    description: "Known Exploited Vulnerabilities catalog from CISA.",
    homepage: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog",
    fetchLatest: fetchCisaKev,
  },
  {
    id: "nvd",
    name: "NVD",
    tier: 1,
    trustScore: 10,
    category: "government",
    description: "National Vulnerability Database CVE feed and API.",
    homepage: "https://nvd.nist.gov/",
    fetchLatest: fetchNvdLatest,
    lookupCve: fetchNvdByCve,
  },
  {
    id: "owasp",
    name: "OWASP",
    tier: 2,
    trustScore: 8,
    category: "non-profit",
    description: "OWASP guidance and project advisories relevant to application and network security.",
    homepage: OWASP_NEWS_URL,
    fetchLatest: fetchOwaspLatest,
  },
  {
    id: "cve",
    name: "CVE / MITRE",
    tier: 2,
    trustScore: 9,
    category: "non-profit",
    description: "Canonical CVE record service operated by MITRE/CVE program.",
    homepage: "https://www.cve.org/",
    lookupCve: fetchCveById,
  },
];

function formatItem(item: SecurityNewsItem): string {
  const lines = [
    `- ${item.title}`,
    `  Source: ${item.sourceName} | Trust: ${item.trustScore}/10 | Category: ${item.category}`,
    item.publishedAt ? `  Published: ${item.publishedAt}` : "",
    item.cveIds?.length ? `  CVEs: ${item.cveIds.join(", ")}` : "",
    `  URL: ${item.url}`,
    `  Summary: ${item.summary}`,
  ].filter(Boolean);
  return lines.join("\n");
}

function formatSource(source: SecuritySource): string {
  return `- ${source.name} (${source.id}) — Tier ${source.tier}, Trust ${source.trustScore}/10\n  ${source.description}\n  ${source.homepage}`;
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "security_news",
    label: "Security News",
    description: "Curated security news and advisory retrieval from trusted sources such as CISA, NVD, OWASP, and CVE. Supports source listing, latest advisories, filtered search, and CVE lookup.",
    parameters: Type.Object({
      action: Type.String({ description: "Action to perform: sources, latest, search, cve_lookup" }),
      query: Type.Optional(Type.String({ description: "Optional search filter for latest/search actions" })),
      source: Type.Optional(Type.String({ description: "Optional source filter: cisa, owasp, nvd, cve" })),
      cve_id: Type.Optional(Type.String({ description: "Specific CVE ID for cve_lookup action" })),
      limit: Type.Optional(Type.Number({ description: "Maximum number of results to return (default 10)" })),
    }),
    async execute(_toolCallId, params) {
      const action = normalizeText((params as any).action) as SecurityNewsAction;
      const query = normalizeText((params as any).query) || undefined;
      const sourceId = normalizeText((params as any).source) as SourceId | "";
      const cveId = normalizeText((params as any).cve_id).toUpperCase();
      const limit = typeof (params as any).limit === "number" ? Math.max(1, Math.min(25, (params as any).limit)) : 10;

      if (!["sources", "latest", "search", "cve_lookup"].includes(action)) {
        return { content: [{ type: "text" as const, text: `Unknown action: ${action}` }], details: { error: "invalid_action" } };
      }

      if (action === "sources") {
        const text = ["Trusted security news/advisory sources:", "", ...SOURCES.map(formatSource)].join("\n");
        return { content: [{ type: "text" as const, text }], details: { action, count: SOURCES.length } };
      }

      const selectedSources = sourceId ? SOURCES.filter((s) => s.id === sourceId) : SOURCES;
      if (sourceId && selectedSources.length === 0) {
        return { content: [{ type: "text" as const, text: `Unknown source: ${sourceId}` }], details: { error: "invalid_source" } };
      }

      try {
        let items: SecurityNewsItem[] = [];
        if (action === "cve_lookup") {
          if (!/^CVE-\d{4}-\d{4,7}$/i.test(cveId)) {
            return { content: [{ type: "text" as const, text: "cve_lookup requires a valid CVE ID like CVE-2024-12345." }], details: { error: "invalid_cve" } };
          }
          for (const source of selectedSources.filter((s) => s.lookupCve)) {
            items.push(...await source.lookupCve!(cveId));
          }
        } else {
          for (const source of selectedSources.filter((s) => s.fetchLatest)) {
            items.push(...await source.fetchLatest!(query));
          }
        }

        items = dedupeItems(items)
          .filter((item) => action !== "search" || containsQuery(item, query))
          .sort((a, b) => b.trustScore - a.trustScore)
          .slice(0, limit);

        if (items.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No trusted security news results matched the request." }],
            details: { action, count: 0 },
          };
        }

        const heading = action === "cve_lookup"
          ? `Trusted advisory results for ${cveId}:`
          : action === "search"
            ? `Trusted security news results for \"${query || ""}\":`
            : "Latest trusted security advisories:";

        const text = [heading, "", ...items.map(formatItem)].join("\n\n");
        return {
          content: [{ type: "text" as const, text }],
          details: { action, count: items.length, items },
        };
      } catch (error: any) {
        return {
          content: [{ type: "text" as const, text: `security_news failed: ${error.message}` }],
          details: { action, error: error.message },
        };
      }
    },
    renderCall(args, theme) {
      const p = args as any;
      const label = `${p.action || "security_news"}${p.source ? `:${p.source}` : ""}`;
      return new Text(theme.fg("toolTitle", theme.bold("security_news ")) + theme.fg("accent", label), 0, 0);
    },
    renderResult(result, _options, theme) {
      const details = result.details as any;
      if (details?.error) return new Text(theme.fg("error", `security_news error: ${details.error}`), 0, 0);
      return new Text(theme.fg("success", `security_news ${details?.count ?? 0} result(s)`), 0, 0);
    },
  });
}
