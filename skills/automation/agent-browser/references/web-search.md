# Web Search with agent-browser

Use agent-browser to search the web when the user needs to find information, look up documentation, research topics, or gather data from search results.

## Quick Search (DuckDuckGo - Recommended)

DuckDuckGo works best with agent-browser because its results page is clean and accessible.

```bash
# 1. Navigate to DuckDuckGo
agent-browser open "https://duckduckgo.com"

# 2. Fill the search box and submit
agent-browser fill "#searchbox_input" "your search query here"
agent-browser press Enter

# 3. Wait for results
agent-browser wait "[data-testid='mainline']"

# 4. Get the accessibility snapshot of results
agent-browser snapshot -i

# 5. Extract text from specific results using refs
agent-browser get text @e1
```

## Google Search

```bash
# 1. Navigate to Google
agent-browser open "https://www.google.com"

# 2. Fill search and submit
agent-browser fill 'textarea[name="q"]' "your search query"
agent-browser press Enter

# 3. Wait for results page
agent-browser wait "#search"

# 4. Snapshot to see results with refs
agent-browser snapshot -i

# 5. Extract all search result text
agent-browser get text "#search"
```

## Extracting Search Results as Structured Data

```bash
# After searching, use eval to extract structured results
agent-browser eval "
  JSON.stringify(
    [...document.querySelectorAll('.result, [data-testid=\"result\"], .g')].map(el => ({
      title: (el.querySelector('h2, h3') || {}).textContent || '',
      url: (el.querySelector('a') || {}).href || '',
      snippet: (el.querySelector('.snippet, [data-content-feature=\"1\"], .VwiC3b') || {}).textContent || ''
    })).filter(r => r.title && r.url)
  )
"
```

## Clicking Through to a Result

```bash
# After snapshot, click a result link by ref
agent-browser click @e5          # Click the 5th interactive element
agent-browser wait --load networkidle

# Get the page content
agent-browser get text body

# Go back to results
agent-browser back
agent-browser wait --load networkidle
```

## Multi-Query Research Pattern

```bash
# Use a dedicated session for search
agent-browser --session search open "https://duckduckgo.com"
agent-browser --session search fill "#searchbox_input" "first query"
agent-browser --session search press Enter
agent-browser --session search wait "[data-testid='mainline']"
agent-browser --session search get text body > results1.txt

# Search again
agent-browser --session search open "https://duckduckgo.com"
agent-browser --session search fill "#searchbox_input" "second query"
agent-browser --session search press Enter
agent-browser --session search wait "[data-testid='mainline']"
agent-browser --session search get text body > results2.txt
```

## Handling CAPTCHAs and Bot Detection

Search engines may show CAPTCHAs for headless browsers. Workarounds:

```bash
# Use --headed mode to appear more human-like
agent-browser --headed open "https://duckduckgo.com"

# Or use a custom user-agent
agent-browser --user-agent "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" open "https://duckduckgo.com"

# Or use a persistent profile (retains cookies/state across runs)
agent-browser --profile ~/.agent-browser-profile open "https://duckduckgo.com"
```

If CAPTCHAs persist, try alternative search engines or use `eval` to extract page content from simpler sites.

## Tips

- **Use `snapshot -i`** after search loads to get clickable refs for result links
- **Use `eval`** for structured JSON extraction when you need title/URL/snippet separately
- **Use `--session search`** to isolate search browsing from other automation tasks
- **Always re-snapshot** after clicking a result and navigating back -- refs are invalidated on navigation
- **Headless detection** -- some search engines block headless browsers. Use `--headed` or `--profile` to reduce detection
- **DuckDuckGo** has the cleanest DOM for parsing but may CAPTCHA headless bots
- **Google** may show consent pages for EU users -- use `eval` to bypass or accept
