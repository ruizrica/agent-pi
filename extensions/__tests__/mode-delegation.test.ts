// ABOUTME: Regression tests for tool-aware parent mode and scout guidance.
// ABOUTME: Ensures restricted child sessions retain their assigned role.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { buildNormalPrompt, shouldInjectParentMode } from '../lib/mode-prompts.ts';

const base = { commanderAvailable: false, activeChain: null, activePipeline: null, scoutId: 1 };
test('parent with continuation tool retains scout guidance', () => {
  assert.match(buildNormalPrompt({ ...base, canContinueScout: true }), /subagent_continue/);
});
test('missing continuation capability never mandates scout delegation', () => {
  for (const canContinueScout of [false, undefined]) {
    const prompt = buildNormalPrompt({ ...base, canContinueScout });
    assert.doesNotMatch(prompt, /subagent_continue|delegate to the scout|ALWAYS delegate context-gathering/);
  }
});
test('no scout ID does not invent a scout', () => {
  assert.doesNotMatch(buildNormalPrompt({ ...base, scoutId: null, canContinueScout: true }), /subagent_continue/);
});
test('native and legacy children never get parent mode prompts', () => {
  for (const env of [{ PI_SUBAGENT_CHILD: '1' }, { PI_SUBAGENT: '1' }]) {
    assert.equal(shouldInjectParentMode(env, ['set_mode', 'subagent_continue']), false);
  }
});
test('restricted SDK children without process marker do not get parent prompts', () => {
  assert.equal(shouldInjectParentMode({}, ['read', 'bash', 'grep']), false);
});
test('parent with mode control retains mode prompts', () => {
  assert.equal(shouldInjectParentMode({}, ['set_mode']), true);
  assert.equal(shouldInjectParentMode({ PI_SUBAGENT_CHILD: '0' }, ['set_mode']), true);
});
