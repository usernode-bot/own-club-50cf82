// Checks for the 2D match view: the re-simulated replay matches the recorded
// match, the timeline is deterministic, and matchSides always hands the view
// a usable pair of sides. Run with `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLUB_BY_ID,
  buildInitialState, buildDemoState, playMatchday, autoLineup, defaultRole,
  simulateMatch, matchSeed, matchSides, seasonSeed, watchSeed,
} from '../public/engine.js';
import { buildTimeline, scoreAt, currentMoment } from '../public/matchview.js';

const SEED = 4242;
const CLUB = 'harbourside';

// A fresh career that has played exactly one matchday.
function playedState() {
  const state = buildInitialState(CLUB, 'Manager', SEED);
  playMatchday(state);
  return state;
}

test('the replay of a played matchday reproduces the recorded report', () => {
  const state = playedState();
  const snapshot = structuredClone(state);
  snapshot.matchday = 0;
  snapshot.lastReport = null;
  const sides = matchSides(snapshot, 0);
  assert.ok(sides, 'matchSides finds the matchday 0 fixture');
  const again = simulateMatch(sides.home, sides.away, matchSeed(seasonSeed(snapshot), 0, sides.index));
  assert.equal(again.homeGoals, state.lastReport.homeGoals);
  assert.equal(again.awayGoals, state.lastReport.awayGoals);
  assert.deepEqual(again.moments, state.lastReport.moments);
});

test('the timeline is deterministic: same report and seed, same timeline', () => {
  const state = playedState();
  const sides = matchSides(state, 0);
  const report = state.lastReport;
  const seed = watchSeed(seasonSeed(state), 0, sides.index);
  const a = buildTimeline(report, sides, CLUB, seed);
  const b = buildTimeline(report, sides, CLUB, seed);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  // A different stream from the simulation's seed, so the choreography never
  // shares draws with the match itself.
  assert.notEqual(seed, matchSeed(seasonSeed(state), 0, sides.index));
});

test('scoreAt counts the goals up to each minute, and never moves backwards', () => {
  const report = playedState().lastReport;
  const full = scoreAt(report, 90);
  assert.equal(full.home, report.homeGoals);
  assert.equal(full.away, report.awayGoals);
  let prev = { home: 0, away: 0 };
  for (let t = 0; t <= 90; t += 0.5) {
    const s = scoreAt(report, t);
    assert.ok(s.home >= prev.home && s.away >= prev.away, 'score never decreases at ' + t);
    prev = s;
  }
  // At 0 nothing has happened; the first goal only counts from its minute.
  const zero = scoreAt(report, 0);
  assert.deepEqual(zero, { home: 0, away: 0 });
  const first = report.moments.find((m) => m.type === 'goal');
  if (first) assert.deepEqual(scoreAt(report, first.minute).home + scoreAt(report, first.minute).away >= 1, true);
});

test('currentMoment picks the moment in force at a minute', () => {
  const report = playedState().lastReport;
  assert.equal(currentMoment(report, 0), null);
  const last = report.moments[report.moments.length - 1];
  if (last) assert.equal(currentMoment(report, 90), last);
});

test('the timeline keeps every player inside the pitch and the moments in the 90', () => {
  const state = playedState();
  const sides = matchSides(state, 0);
  const tl = buildTimeline(state.lastReport, sides, CLUB, watchSeed(seasonSeed(state), 0, sides.index));
  assert.ok(tl.frames.length >= 2, 'the timeline has frames');
  for (const f of tl.frames) {
    assert.equal(f.pos.length, 44, '22 players, x and y each');
    for (const v of f.pos) assert.ok(v >= 0 && v <= 1, 'a player stands on the pitch');
    for (const v of f.ball) assert.ok(v >= 0 && v <= 1, 'the ball is on the pitch');
  }
  for (const m of tl.moments) {
    assert.ok(m.minute >= 0 && m.minute <= 90, 'moments stay inside the match');
    assert.ok(['near', 'far'].includes(m.side), 'moments are near or far');
  }
  // Everyone visible at kickoff belongs to one of the two squads.
  const ids = new Set([...sides.home.squad, ...sides.away.squad].map((p) => p.id));
  for (const mk of tl.markers) assert.ok(ids.has(mk.player.id), 'a marker names a squad player');
  // The kickoff frame shows both elevens.
  const kickoff = tl.markers.filter((mk) => mk.from === 0).length;
  assert.equal(kickoff, 22);
});

test('matchSides covers every played matchday of the demo career', () => {
  const demo = buildDemoState(1);
  for (let md = 0; md < demo.matchday; md++) {
    const sides = matchSides(demo, md);
    assert.ok(sides, 'matchday ' + md + ' has a fixture');
    assert.equal(sides.home.lineup.length, 11);
    assert.equal(sides.away.lineup.length, 11);
    assert.ok(new Set(sides.home.lineup).size === 11);
    // A re-simulation of an old matchday does not throw, even when it drifts.
    const report = simulateMatch(sides.home, sides.away, matchSeed(seasonSeed(demo), md, sides.index));
    assert.ok(Number.isInteger(report.homeGoals));
  }
  assert.equal(matchSides(demo, -1), null);
  assert.equal(matchSides(demo, demo.matchday + 40), null);
});

test('a saved lineup that cannot play is replaced by the auto lineup', () => {
  const state = playedState();
  state.lineup = state.lineup.slice(0, 6); // broken on purpose
  const sides = matchSides(state, 0);
  assert.equal(sides.home.lineup.length, 11);
  assert.ok(new Set(sides.home.lineup).size === 11);
  const report = simulateMatch(sides.home, sides.away, matchSeed(seasonSeed(state), 0, sides.index));
  assert.ok(Number.isInteger(report.homeGoals) && Number.isInteger(report.awayGoals));
});

test('a state with no lineup at all still replays through the fallback', () => {
  const state = buildInitialState(CLUB, 'Manager', SEED);
  state.roles = {};
  for (const p of state.squads[CLUB]) state.roles[p.id] = defaultRole(p.pos);
  state.lineup = [];
  const sides = matchSides(state, 0);
  assert.equal(sides.home.lineup.length, 11);
  const report = simulateMatch(sides.home, sides.away, matchSeed(seasonSeed(state), 0, sides.index));
  assert.ok(Number.isInteger(report.homeGoals));
  const tl = buildTimeline(report, sides, CLUB, watchSeed(seasonSeed(state), 0, sides.index));
  assert.ok(tl.frames.length >= 2);
  assert.equal(tl.markers.filter((mk) => mk.from === 0).length, 22);
});

test('the demo career replays its newest matchday from the saved report', () => {
  const demo = buildDemoState(1);
  const md = demo.matchday - 1;
  const sides = matchSides(demo, md);
  const recorded = demo.lastReport;
  assert.equal(recorded.matchday, md + 1);
  const tl = buildTimeline(recorded, sides, demo.clubId, watchSeed(seasonSeed(demo), md, sides.index));
  const full = scoreAt(recorded, 90);
  assert.equal(full.home, recorded.homeGoals);
  assert.equal(full.away, recorded.awayGoals);
  assert.ok(tl.moments.length === recorded.moments.length);
});
// ── The match view's keyboard, log and live region ──────────────────────

import {
  scrubKeyTarget, shownCount, liveAnnouncement,
} from '../public/matchview.js';

test('scrubKeyTarget moves by whole minutes', () => {
  assert.equal(scrubKeyTarget('ArrowRight', 37.4), 38);
  assert.equal(scrubKeyTarget('ArrowLeft', 37.4), 37);
  assert.equal(scrubKeyTarget('PageUp', 37.4), 47);
  assert.equal(scrubKeyTarget('PageDown', 37.4), 27);
  assert.equal(scrubKeyTarget('Home', 37.4), 0);
  assert.equal(scrubKeyTarget('End', 37.4), 90);
  assert.equal(scrubKeyTarget('ArrowRight', 90), 90);
  assert.equal(scrubKeyTarget('ArrowLeft', 0), 0);
  assert.equal(scrubKeyTarget('PageUp', 85), 90);
  assert.equal(scrubKeyTarget('PageDown', 5), 0);
  assert.equal(scrubKeyTarget('a', 37.4), null);
});

test('shownCount follows the clock', () => {
  const minutes = [0, 22, 31, 45, 90];
  assert.equal(shownCount(minutes, -1), 0);
  assert.equal(shownCount(minutes, 0), 1);
  assert.equal(shownCount(minutes, 31), 3);
  assert.equal(shownCount(minutes, 90), 5);
  let prev = 0;
  for (let t = -1; t <= 90; t += 0.5) {
    const n = shownCount(minutes, t);
    assert.ok(n >= prev, 'the log never loses a row as the clock rises');
    prev = n;
  }
});

test('liveAnnouncement changes only at moments', () => {
  const report = buildDemoState(1).lastReport;
  const keys = [];
  for (let i = 0; i <= 900; i++) {
    const a = liveAnnouncement(report, i / 10);
    if (keys[keys.length - 1] !== a.key) keys.push(a.key);
  }
  // A goal and the card that followed it can share a minute, so count the
  // distinct minutes rather than the moments.
  const before90 = new Set(report.moments.filter((m) => m.minute < 90).map((m) => m.minute)).size;
  assert.equal(keys.length, before90 + 2, 'one key per moment, plus none and full');
  assert.equal(keys[0], 'none');
  assert.equal(keys[keys.length - 1], 'full');
  for (const m of report.moments) {
    if (m.type !== 'goal' || m.minute >= 90) continue;
    const a = liveAnnouncement(report, m.minute);
    const s = scoreAt(report, m.minute);
    assert.ok(a.text.endsWith(s.home + '–' + s.away), 'a goal says the score it left');
  }
  assert.match(liveAnnouncement(report, 90).text, /^Full time, \d+–\d+$/);
});
