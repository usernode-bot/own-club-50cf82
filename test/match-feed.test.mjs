// The match view's timeline: the recorded result, real players, a quiet match
// that still reads, and the crowd and credits at full time.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInitialState, playMatchday, buildDemoState, homeCrowd, FAN_CAP, clubTier,
} from '../public/engine.js';
import { buildTimeline, matchCrowd, creditsLine } from '../public/match-feed.js';

test('the full-time score is the recorded result on every matchday', () => {
  for (const seed of [7, 41]) {
    const state = buildInitialState('harbourside', 'Alex Morgan', seed);
    for (let md = 0; md < state.fixtures.length; md++) {
      playMatchday(state);
      const r = state.lastReport;
      const events = buildTimeline(r);
      const last = events[events.length - 1];
      assert.equal(last.kind, 'full');
      assert.deepEqual(last.score, [r.homeGoals, r.awayGoals]);
      const row = state.results.find((x) => x.matchday === r.matchday
        && x.home.id === r.home.id && x.away.id === r.away.id);
      assert.ok(row, 'the result is in the Competition table');
      assert.deepEqual(last.score, [row.homeGoals, row.awayGoals]);
    }
  }
});

test('every event names a player from one of the two squads', () => {
  const state = buildInitialState('harbourside', 'Alex Morgan', 11);
  const names = new Set();
  for (let md = 0; md < 10; md++) {
    playMatchday(state);
    const r = state.lastReport;
    for (const side of ['home', 'away']) for (const p of state.squads[r[side].id]) names.add(p.name);
    for (const e of buildTimeline(r)) {
      if (e.player) assert.ok(names.has(e.player), e.player + ' is in a squad');
      if (e.replacement) assert.ok(names.has(e.replacement), e.replacement + ' is in a squad');
    }
  }
});

test('kick-off comes first, full time last, and half-time splits the match', () => {
  const state = buildInitialState('harbourside', 'Alex Morgan', 3);
  for (let md = 0; md < 8; md++) {
    playMatchday(state);
    const r = state.lastReport;
    const events = buildTimeline(r);
    assert.equal(events[0].kind, 'kickoff');
    assert.equal(events[0].minute, 0);
    assert.equal(events[events.length - 1].minute, 90);
    const half = events.findIndex((e) => e.kind === 'half');
    assert.ok(half > 0);
    for (let i = 1; i < events.length; i++) {
      assert.ok(events[i].minute >= events[i - 1].minute, 'minutes never go down');
      if (events[i].minute <= 45 && events[i].kind !== 'kickoff' && i !== half) assert.ok(i < half, 'nothing after half-time is early');
    }
  }
});

test('an injury and its replacement are one event', () => {
  const state = buildInitialState('harbourside', 'Alex Morgan', 5);
  for (let md = 0; md < 12; md++) {
    playMatchday(state);
    const r = state.lastReport;
    if (!r.moments.some((m) => m.type === 'injury')) continue;
    const events = buildTimeline(r);
    for (let i = 0; i < r.moments.length; i++) {
      const m = r.moments[i];
      if (m.type !== 'injury') continue;
      const next = r.moments[i + 1];
      if (next && next.type === 'sub' && next.playerOutName === m.playerName) {
        const e = events.find((x) => x.kind === 'injury'
          && x.player === m.playerName && x.replacement === next.playerName);
        assert.ok(e, 'the injury names the replacement');
        assert.equal(events.filter((x) => x.kind === 'sub' && x.minute === m.minute
          && x.side === e.side).length, 0);
      }
    }
  }
});

test('a match with no goals and no cards still reads as a match', () => {
  const report = {
    home: { id: 'harbourside', name: 'Harbourside FC', short: 'HF' },
    away: { id: 'redvale', name: 'Redvale Athletic', short: 'RA' },
    homeGoals: 0,
    awayGoals: 0,
    moments: [],
    stats: { shots: [5, 4] },
  };
  const events = buildTimeline(report);
  assert.equal(events.length, 3);
  assert.deepEqual(events.map((e) => e.kind), ['kickoff', 'half', 'full']);
  assert.match(events[2].text, /A quiet match: no goals, no cards and 9 shots/);
});

test('the same report always gives the same timeline', () => {
  const state = buildDemoState();
  for (let md = 0; md < 6; md++) playMatchday(state);
  const r = state.lastReport;
  assert.deepEqual(buildTimeline(r), buildTimeline(r));
});

test('attendance comes from the saved match, and a bigger stadium fills more seats', () => {
  const state = buildInitialState('harbourside', 'Alex Morgan', 7);
  state.fans = 30000;
  const before = homeCrowd({ ...state, facilities: { ...state.facilities, stadium: 1 } }, state.fans, FAN_CAP[1]).attendance;
  const after = homeCrowd({ ...state, facilities: { ...state.facilities, stadium: 5 } }, state.fans, FAN_CAP[1]).attendance;
  assert.ok(after > before);

  const report = {
    home: { id: 'harbourside', name: 'Harbourside FC', short: 'HF' },
    away: { id: 'redvale', name: 'Redvale Athletic', short: 'RA' },
    homeGoals: 1, awayGoals: 0, moments: [], stats: { shots: [1, 1] },
    finance: { attendance: 9876, result: 'win', net: 41 },
  };
  assert.deepEqual(matchCrowd(report, state), { attendance: 9876, estimate: false });
});

test('an away crowd is an estimate inside the division limit, growing with reputation', () => {
  const state = buildInitialState('harbourside', 'Alex Morgan', 7);
  const cap = FAN_CAP[clubTier(state)];
  const report = {
    home: { id: 'redvale', name: 'Redvale Athletic', short: 'RA' },
    away: { id: 'harbourside', name: 'Harbourside FC', short: 'HF' },
    homeGoals: 0, awayGoals: 0, moments: [], stats: { shots: [0, 0] },
    finance: { attendance: 0, result: 'draw', net: 0 },
  };
  const high = matchCrowd(report, state);
  const low = matchCrowd(report, state, { redvale: { rep: 1 } });
  assert.equal(high.estimate, true);
  assert.ok(high.attendance <= cap);
  assert.ok(high.attendance > low.attendance);
});

test('the credits line names the reward for the result, and is absent without finances', () => {
  assert.match(creditsLine({ result: 'win', net: 10 }), /A win: 50 Club credits/);
  assert.match(creditsLine({ result: 'draw', net: 0 }), /A draw: 25 Club credits/);
  assert.match(creditsLine({ result: 'loss', net: -3 }), /A loss: 10 Club credits/);
  assert.equal(creditsLine(null), null);
});
