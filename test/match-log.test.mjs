// Checks for the match view's log: the events follow the clock, every kind
// has an icon, and the open/closed choice round-trips through storage.
// Run with `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CLUB_BY_ID, buildInitialState, playMatchday } from '../public/engine.js';
import { buildTimeline as buildFeed } from '../public/match-feed.js';
import { atBottom, logRowHtml, readLogOpen, revealedCount, writeLogOpen } from '../public/matchview.js';

const SEED = 4242;
const CLUB = 'harbourside';

function playedReport() {
  const state = buildInitialState(CLUB, 'Manager', SEED);
  playMatchday(state);
  return state.lastReport;
}

function quietReport() {
  return {
    home: { id: 'harbourside', name: 'Harbourside FC', short: 'HF' },
    away: { id: 'redvale', name: 'Redvale Athletic', short: 'RA' },
    homeGoals: 0,
    awayGoals: 0,
    moments: [],
    stats: { shots: [0, 0] },
  };
}

test('revealedCount follows the clock through a played match', () => {
  const events = buildFeed(playedReport(), CLUB_BY_ID);
  assert.ok(events.length > 0);
  assert.equal(revealedCount(events, 0), 1, 'kick-off only at minute 0');

  const minutes = events.map((e) => e.minute);
  for (let i = 1; i < minutes.length; i++) {
    assert.ok(minutes[i] >= minutes[i - 1], 'the feed is in match order');
  }

  let prev = 0;
  for (let t = 0; t <= 90; t += 0.5) {
    const n = revealedCount(events, t);
    assert.ok(n >= prev, 'never reveals fewer as the clock moves forward at ' + t);
    prev = n;
  }
  assert.equal(revealedCount(events, 90), events.length, 'full time reveals every event');
});

test('a quiet match is a short feed, not an empty one', () => {
  const events = buildFeed(quietReport(), CLUB_BY_ID);
  assert.equal(events.length, 3);
  assert.deepEqual(events.map((e) => e.kind), ['kickoff', 'half', 'full']);
  assert.equal(revealedCount(events, 90), 3);
});

test('logRowHtml carries the minute, kind, player, code and escaped copy', () => {
  const row = logRowHtml({
    minute: 12,
    kind: 'goal',
    label: 'Goal <shot>',
    player: 'A & B',
    code: 'H<F',
    text: 'a < b & c',
  });
  assert.match(row, /class="list-row log-row"/);
  assert.match(row, /data-kind="goal"/);
  assert.match(row, />12'</);
  assert.match(row, /Goal &lt;shot&gt;/);
  assert.match(row, /A &amp; B/);
  assert.match(row, /H&lt;F/);
  assert.match(row, /a &lt; b &amp; c/);
  assert.match(row, /class="log-icon"/);
});

test('every kind the feed emits has its own icon', () => {
  const report = playedReport();
  const events = buildFeed(report, CLUB_BY_ID);
  for (const e of events) {
    const html = logRowHtml(e);
    assert.match(html, /class="log-icon" aria-hidden="true"><svg /, e.kind + ' has an icon');
  }
  // A quiet match's kick-off, half-time and full time have icons too.
  for (const e of buildFeed(quietReport(), CLUB_BY_ID)) {
    assert.match(logRowHtml(e), /<svg /, e.kind + ' has an icon');
  }
});

test('atBottom allows the programmatic scroll and catches a real scroll up', () => {
  assert.equal(atBottom(1000, 300, 1300), true, 'at the end');
  assert.equal(atBottom(984, 300, 1300), true, 'within the slack of the end');
  assert.equal(atBottom(900, 300, 1300), false, 'more than 24px from the end');
  assert.equal(atBottom(0, 300, 1300), false, 'at the top of a long list');
});

function fakeStorage(initial) {
  const map = new Map(initial ? Object.entries(initial) : []);
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
  };
}

test('the open or closed choice round-trips through storage', () => {
  const storage = fakeStorage();
  assert.equal(readLogOpen(storage, true), true, 'no choice yet: wide opens');
  assert.equal(readLogOpen(fakeStorage(), false), false, 'no choice yet: narrow closes');

  writeLogOpen(storage, false);
  assert.equal(readLogOpen(storage, true), false, 'a closed choice wins over wide');
  writeLogOpen(storage, true);
  assert.equal(readLogOpen(storage, false), true, 'an open choice wins over narrow');

  assert.equal(readLogOpen(fakeStorage({ 'ownclub.matchLog': 'sideways' }), true), true, 'invalid falls back');
  assert.equal(readLogOpen(null, false), false, 'no storage falls back');
});

test('a storage that throws does not break the view', () => {
  const broken = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  };
  assert.equal(readLogOpen(broken, true), true);
  assert.doesNotThrow(() => writeLogOpen(broken, false));
  assert.doesNotThrow(() => writeLogOpen(null, false));
});
