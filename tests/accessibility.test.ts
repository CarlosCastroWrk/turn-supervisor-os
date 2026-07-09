import assert from 'node:assert/strict';
import test from 'node:test';
import { scrollBehaviorForMotionPreference } from '../src/lib/accessibility.ts';

test('scroll behavior respects reduced-motion preference', () => {
  assert.equal(scrollBehaviorForMotionPreference(true), 'auto');
  assert.equal(scrollBehaviorForMotionPreference(false), 'smooth');
});
