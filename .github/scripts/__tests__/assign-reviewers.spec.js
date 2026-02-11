import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pickNextReviewers } from '../assign-reviewers.js';

const pool = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve'];

describe('pickNextReviewers', () => {
  it('picks the next N reviewers starting from index 0', () => {
    const { selected, nextIndex } = pickNextReviewers(pool, new Set(), 0, 2);
    assert.deepStrictEqual(selected, ['Alice', 'Bob']);
    assert.strictEqual(nextIndex, 2);
  });

  it('picks from the middle of the pool', () => {
    const { selected, nextIndex } = pickNextReviewers(pool, new Set(), 2, 2);
    assert.deepStrictEqual(selected, ['Charlie', 'Diana']);
    assert.strictEqual(nextIndex, 4);
  });

  it('wraps around the pool', () => {
    const { selected, nextIndex } = pickNextReviewers(pool, new Set(), 4, 2);
    assert.deepStrictEqual(selected, ['Eve', 'Alice']);
    assert.strictEqual(nextIndex, 1);
  });

  it('excludes specified users (case-insensitive)', () => {
    const exclude = new Set(['alice', 'charlie']);
    const { selected, nextIndex } = pickNextReviewers(pool, exclude, 0, 2);
    assert.deepStrictEqual(selected, ['Bob', 'Diana']);
    assert.strictEqual(nextIndex, 4);
  });

  it('assigns only 1 when 1 is already assigned (need 1 more)', () => {
    const exclude = new Set(['alice']);
    const { selected, nextIndex } = pickNextReviewers(pool, exclude, 0, 1);
    assert.deepStrictEqual(selected, ['Bob']);
    assert.strictEqual(nextIndex, 2);
  });

  it('returns fewer reviewers if not enough eligible in pool', () => {
    const exclude = new Set(['alice', 'bob', 'charlie', 'diana']);
    const { selected, nextIndex } = pickNextReviewers(pool, exclude, 0, 2);
    assert.deepStrictEqual(selected, ['Eve']);
    assert.strictEqual(nextIndex, 0);
  });

  it('returns empty array if all pool members are excluded', () => {
    const exclude = new Set(['alice', 'bob', 'charlie', 'diana', 'eve']);
    const { selected, nextIndex } = pickNextReviewers(pool, exclude, 0, 2);
    assert.deepStrictEqual(selected, []);
    assert.strictEqual(nextIndex, 0);
  });

  it('handles empty pool', () => {
    const { selected, nextIndex } = pickNextReviewers([], new Set(), 0, 2);
    assert.deepStrictEqual(selected, []);
    assert.strictEqual(nextIndex, 0);
  });

  it('normalizes index larger than pool size via modulo', () => {
    // 12 % 5 = 2, so starts at Charlie
    const { selected, nextIndex } = pickNextReviewers(pool, new Set(), 12, 2);
    assert.deepStrictEqual(selected, ['Charlie', 'Diana']);
    assert.strictEqual(nextIndex, 4);
  });

  it('returns empty selection when count is 0', () => {
    const { selected, nextIndex } = pickNextReviewers(pool, new Set(), 0, 0);
    assert.deepStrictEqual(selected, []);
    assert.strictEqual(nextIndex, 0);
  });

  it('distributes evenly across a full rotation cycle', () => {
    // Simulate 5 consecutive PRs, each by a different author
    const authors = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve'];
    const assignments = new Map(pool.map((p) => [p, 0]));
    let index = 0;

    for (const author of authors) {
      const exclude = new Set([author.toLowerCase()]);
      const { selected, nextIndex } = pickNextReviewers(pool, exclude, index, 2);
      selected.forEach((r) => assignments.set(r, assignments.get(r) + 1));
      index = nextIndex;
    }

    const counts = [...assignments.values()];
    assert.strictEqual(
      counts.reduce((a, b) => a + b, 0),
      10,
      'Total assignments should be 10 (5 PRs x 2 reviewers)',
    );

    assert.ok(
      counts.every((c) => c > 0),
      'Every pool member should have at least 1 assignment',
    );
  });
});
