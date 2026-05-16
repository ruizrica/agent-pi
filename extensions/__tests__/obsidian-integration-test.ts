// Integration test for obsidian-memory extension
import { obsidianExec, wikiPath, indexPath, masterIndexPath, buildFrontmatter } from '../lib/obsidian-cli.ts';

async function test() {
  console.log('=== OBSIDIAN MEMORY INTEGRATION TEST ===\n');

  // 1. Ingest raw articles
  console.log('1. Ingesting raw articles...');
  const fm1 = buildFrontmatter({ title: 'AI Agents Overview', date: '2025-04-05', status: 'raw', tags: ['ai', 'agents'] });
  const content1 = [fm1, '', '# AI Agents Overview', '', 'AI agents are autonomous systems.', '', '## Key Concepts', '', '- Tool use', '- Chain-of-thought reasoning', '- Memory management', '', 'See also: [[RAG Systems]] for knowledge retrieval.'].join('\n');
  const r1 = await obsidianExec('create', { path: 'raw/AI Agents Overview.md', content: content1 });
  console.log('  Raw 1:', r1.stdout);

  const fm2 = buildFrontmatter({ title: 'RAG Systems', date: '2025-04-05', status: 'raw', tags: ['ai', 'rag'] });
  const content2 = [fm2, '', '# RAG Systems', '', 'RAG combines LLMs with external knowledge.', '', '## Approaches', '', '- Vector RAG', '- Graph RAG', '- Wiki Navigation (Karpathy)', '', 'Related to [[AI Agents Overview]].'].join('\n');
  const r2 = await obsidianExec('create', { path: 'raw/RAG Systems.md', content: content2 });
  console.log('  Raw 2:', r2.stdout);

  // 2. Create wiki articles (with titles matching filenames for wiki link resolution)
  console.log('\n2. Creating wiki articles...');
  const a1 = ['---', 'title: AI Agents', 'wiki: ai-research', 'date: 2025-04-05', 'status: wiki', '---', '', '# AI Agents', '', 'Autonomous LLM systems.', '', '## See Also', '', '- [[Knowledge Retrieval]] - how agents access knowledge'].join('\n');
  const r3 = await obsidianExec('create', { path: 'wiki/ai-research/AI Agents.md', content: a1 });
  console.log('  Article 1:', r3.stdout);

  const a2 = ['---', 'title: Knowledge Retrieval', 'wiki: ai-research', 'date: 2025-04-05', 'status: wiki', '---', '', '# Knowledge Retrieval', '', 'Methods for LLMs to access knowledge.', '', '## The Karpathy Approach', '', 'Structured markdown instead of vector DBs.', '', '## See Also', '', '- [[AI Agents]] - agents that use retrieval'].join('\n');
  const r4 = await obsidianExec('create', { path: 'wiki/ai-research/Knowledge Retrieval.md', content: a2 });
  console.log('  Article 2:', r4.stdout);

  // 3. Create indexes
  console.log('\n3. Creating indexes...');
  const idx = ['# AI Research Wiki', '', '## Articles', '', '- [[AI Agents]] - Autonomous LLM-powered systems', '- [[Knowledge Retrieval]] - Methods for accessing knowledge'].join('\n');
  const r5 = await obsidianExec('create', { path: 'wiki/ai-research/_index.md', content: idx, overwrite: true });
  console.log('  Wiki index:', r5.stdout);

  const master = ['# Knowledge Base - Master Index', '', '## Wiki Topics', '', '- [[wiki/ai-research/_index|AI Research]] - 2 articles'].join('\n');
  const r6 = await obsidianExec('create', { path: masterIndexPath(), content: master, overwrite: true });
  console.log('  Master index:', r6.stdout);

  // 4. Test file= resolution (should work now with space-preserved filenames)
  console.log('\n4. Testing file= resolution...');
  const rd1 = await obsidianExec('read', { file: 'AI Agents' });
  console.log('  read file="AI Agents":', rd1.success ? 'OK (' + rd1.stdout.length + ' chars)' : 'FAIL: ' + rd1.stderr);

  const rd2 = await obsidianExec('read', { path: 'wiki/ai-research/AI Agents.md' });
  console.log('  read path="wiki/ai-research/AI Agents.md":', rd2.success ? 'OK (' + rd2.stdout.length + ' chars)' : 'FAIL: ' + rd2.stderr);

  // 5. Backlinks
  console.log('\n5. Testing backlinks...');
  const b1 = await obsidianExec('backlinks', { file: 'AI Agents' });
  console.log('  Backlinks to "AI Agents":', b1.stdout || '(none)');

  const b2 = await obsidianExec('backlinks', { file: 'Knowledge Retrieval' });
  console.log('  Backlinks to "Knowledge Retrieval":', b2.stdout || '(none)');

  // 6. Outgoing links
  console.log('\n6. Testing outgoing links...');
  const l1 = await obsidianExec('links', { file: 'AI Agents' });
  console.log('  Links from "AI Agents":', l1.stdout || '(none)');

  const l2 = await obsidianExec('links', { file: 'Knowledge Retrieval' });
  console.log('  Links from "Knowledge Retrieval":', l2.stdout || '(none)');

  // 7. Search
  console.log('\n7. Testing search...');
  const s1 = await obsidianExec('search:context', { query: 'Karpathy' });
  console.log('  "Karpathy":', (s1.stdout || '').split('\n').length, 'lines');

  const s2 = await obsidianExec('search', { query: 'agents', format: 'json' });
  console.log('  "agents" (json):', s2.stdout || '(none)');

  // 8. Health checks
  console.log('\n8. Health checks...');
  const o1 = await obsidianExec('orphans');
  console.log('  Orphans:', o1.stdout || '(none)');

  const u1 = await obsidianExec('unresolved');
  console.log('  Unresolved:', u1.stdout || '(none)');

  // 9. Tags + outline + wordcount
  console.log('\n9. Tags, outline, wordcount...');
  const t1 = await obsidianExec('tags', { counts: true });
  console.log('  Tags:', t1.stdout || '(none)');

  const ol1 = await obsidianExec('outline', { file: 'AI Agents' });
  console.log('  Outline:', ol1.stdout || '(none)');

  const wc1 = await obsidianExec('wordcount', { file: 'AI Agents' });
  console.log('  Wordcount:', wc1.stdout || '(none)');

  // 10. Vault stats
  console.log('\n10. Vault stats...');
  const v1 = await obsidianExec('vault');
  console.log('  Vault:', v1.stdout);

  // 11. Files
  console.log('\n11. File listing...');
  const fl = await obsidianExec('files');
  console.log('  All files:', fl.stdout);

  console.log('\n=== ALL TESTS COMPLETED ===');

  // Cleanup
  console.log('\n--- Cleaning up ---');
  await obsidianExec('delete', { path: 'raw/AI Agents Overview.md', permanent: true });
  await obsidianExec('delete', { path: 'raw/RAG Systems.md', permanent: true });
  await obsidianExec('delete', { path: 'wiki/ai-research/AI Agents.md', permanent: true });
  await obsidianExec('delete', { path: 'wiki/ai-research/Knowledge Retrieval.md', permanent: true });
  await obsidianExec('delete', { path: 'wiki/ai-research/_index.md', permanent: true });
  const orig = ['# Knowledge Base - Master Index', '', '_No wikis yet._'].join('\n');
  await obsidianExec('create', { path: masterIndexPath(), content: orig, overwrite: true });
  console.log('Done.');
}

test().catch(e => console.error('FAILED:', e));
