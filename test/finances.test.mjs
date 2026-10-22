// Checks for the club's finances: fans, the home gate, ground upkeep and the
// seasonal sponsor. Run with `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GROUPS, DIVISION_SIZE,
  buildInitialState, playMatchday, startNextSeason, seasonEndMoney,
  moneyFields, fanChange, sponsorFor, creditsForResult, objectiveMet,
  leagueTable, divisionClubIds, nextPlacement, repairCareer, clubTier,
  FAN_SEED, GROUND_CAPACITY, TICKET_PRICE, GROUND_UPKEEP, FAN_CHANGE,
  SPONSOR_FEES, SPONSOR_TARGETS,
} from '../public/engine.js';

const CLUB = GROUPS[8].clubIds[5]; // a Division 3 club

function finishedCareer(clubId, seed) {
  const state = buildInitialState(clubId, 'Test manager', seed);
  while (!state.finished) playMatchday(state);
  return state;
}

// A career up to the first matchday where its club plays at `venue`.
function careerBefore(clubId, seed, venue, matchdays = 0) {
  const state = buildInitialState(clubId, 'Test manager', seed);
  for (let played = 0; played < matchdays; played++) playMatchday(state);
  while (state.matchday < state.fixtures.length) {
    const f = state.fixtures[state.matchday].find((x) => x.home === clubId || x.away === clubId);
    const atHome = f.home === clubId;
    if (atHome === (venue === 'Home')) return state;
    playMatchday(state);
  }
  return null;
}

test('an away match earns no gate', () => {
  const state = careerBefore(CLUB, 7, 'Away');
  assert.ok(state, 'the career has an away matchday');
  state.credits = 1000;
  playMatchday(state);
  const f = state.lastReport.finance;
  assert.equal(f.venue, 'Away');
  assert.equal(f.attendance, 0);
  assert.equal(f.gate, 0);
  assert.equal(state.credits, 1000 + creditsForResult(
    f.result === 'win' ? 1 : 0, f.result === 'loss' ? 1 : 0) - f.upkeep);
  assert.equal(f.net, creditsForResult(
    f.result === 'win' ? 1 : 0, f.result === 'loss' ? 1 : 0) - f.upkeep);
});

test('a home gate is the smaller of the fans and the seats, at 5 each', () => {
  const state = careerBefore(CLUB, 9, 'Home');
  assert.ok(state, 'the career has a home matchday');
  state.fans = 2700;
  state.credits = 0;
  playMatchday(state);
  const f = state.lastReport.finance;
  assert.equal(f.venue, 'Home');
  assert.equal(f.attendance, 2700);
  assert.equal(f.gate, 2700 * TICKET_PRICE);
  assert.equal(f.price, TICKET_PRICE);

  // More fans than seats: the ground's capacity is what pays.
  const packed = careerBefore(CLUB, 9, 'Home');
  packed.fans = GROUND_CAPACITY[3] + 20000;
  playMatchday(packed);
  assert.equal(packed.lastReport.finance.attendance, GROUND_CAPACITY[3]);
  assert.equal(packed.lastReport.finance.gate, GROUND_CAPACITY[3] * TICKET_PRICE);
});

test('fans move with the result and never go below zero', () => {
  assert.equal(fanChange(2500, 2, 0), 2625);
  assert.equal(fanChange(2500, 1, 1), 2550);
  assert.equal(fanChange(2500, 0, 2), 2425);
  assert.equal(fanChange(0, 0, 3), 0);
  assert.equal(FAN_CHANGE.win, 0.05);
  assert.equal(FAN_CHANGE.loss, -0.03);

  const state = careerBefore(CLUB, 11, 'Home');
  state.fans = 3000;
  playMatchday(state);
  const f = state.lastReport.finance;
  const rate = f.result === 'win' ? 0.05 : f.result === 'draw' ? 0.02 : -0.03;
  assert.equal(f.fansBefore, 3000);
  assert.equal(f.fansAfter, Math.max(0, Math.round(3000 * (1 + rate))));
  assert.equal(state.fans, f.fansAfter);
});

test('ground upkeep is paid every matchday and never takes more than the balance', () => {
  const state = buildInitialState(CLUB, 'Test manager', 13);
  let paid = 0;
  let homes = 0;
  for (let i = 0; i < 3; i++) {
    playMatchday(state);
    paid += state.lastReport.finance.upkeep;
    if (state.lastReport.finance.venue === 'Home') homes++;
  }
  assert.equal(state.finance.upkeep, paid);
  assert.equal(state.finance.homeGames, homes);

  // Away from home with an empty balance: only what the result earned is taken.
  const broke = careerBefore(CLUB, 15, 'Away');
  broke.credits = 0;
  playMatchday(broke);
  const f = broke.lastReport.finance;
  const result = creditsForResult(f.result === 'win' ? 1 : 0, f.result === 'loss' ? 1 : 0);
  assert.equal(f.upkeepDue, GROUND_UPKEEP);
  assert.equal(f.upkeep, Math.min(GROUND_UPKEEP, result));
  assert.equal(broke.credits, 0);
});

test('only the manager\'s own fixture earns or pays anything', () => {
  const state = buildInitialState(CLUB, 'Test manager', 17);
  const reports = playMatchday(state);
  const own = reports.find((r) => r.home.id === CLUB || r.away.id === CLUB);
  for (const r of reports) {
    if (r === own) assert.ok(r.finance);
    else assert.equal(r.finance, undefined);
  }
  // The other clubs keep no money fields.
  for (const id of divisionClubIds(state)) {
    if (id !== CLUB) assert.equal(state.squads[id].fans, undefined);
  }
});

test('the sponsor is deterministic, and its fee follows the division', () => {
  const a = sponsorFor(4242, 2, 3);
  const b = sponsorFor(4242, 2, 3);
  assert.deepEqual(a, b);
  assert.equal(a.fee, SPONSOR_FEES[3]);
  assert.equal(a.season, 2);
  assert.equal(a.paid, false);
  assert.ok(SPONSOR_TARGETS.includes(a.target));
  assert.equal(sponsorFor(4242, 2, 1).fee, SPONSOR_FEES[1]);
  assert.notDeepEqual(sponsorFor(4242, 2, 3), sponsorFor(4242, 3, 3));
});

test('a sponsor pays once at the rollover when its target was met', () => {
  const state = finishedCareer(CLUB, 21);
  const size = divisionClubIds(state).length;
  const me = leagueTable(state).find((r) => r.id === state.clubId);

  // A target that is met, whatever this career's finish.
  const met = JSON.parse(JSON.stringify(state));
  met.sponsor.target = me.rank < size ? 'Avoid finishing bottom' : 'Win the league';
  assert.equal(objectiveMet(me.rank, met.sponsor.target, size), true);
  met.sponsor.fee = 12345;
  const next = startNextSeason(met);
  assert.equal(next.credits, met.credits + 12345);
  assert.equal(next.lastSponsor.paid, true);
  assert.equal(next.lastSponsor.name, met.sponsor.name);
  assert.equal(next.sponsor.season, met.season + 1);
  assert.equal(next.sponsor.fee, SPONSOR_FEES[nextPlacement(met).tier]);
  assert.deepEqual(next.finance, { season: met.season + 1, gate: 0, upkeep: 0, homeGames: 0 });
  assert.deepEqual(seasonEndMoney(met), {
    credits: next.credits,
    fans: next.fans,
    sponsor: next.sponsor,
    lastSponsor: next.lastSponsor,
    finance: next.finance,
  });
  // The new season is not finished, so it cannot pay a second fee.
  assert.equal(startNextSeason(next), next);

  // A target that is missed pays nothing.
  const missed = JSON.parse(JSON.stringify(state));
  missed.sponsor.target = me.rank === 1 ? 'Avoid finishing bottom' : 'Win the league';
  assert.equal(objectiveMet(me.rank, missed.sponsor.target, size), false);
  const capped = missed.credits;
  const after = startNextSeason(missed);
  assert.equal(after.credits, capped);
  assert.equal(after.lastSponsor.paid, false);
});

test('fans carry into the next season', () => {
  const state = finishedCareer(CLUB, 23);
  const fans = state.fans;
  const next = startNextSeason(state);
  assert.equal(next.fans, fans);
});

test('moneyFields fills what a saved career is missing, and leaves a filled one alone', () => {
  const state = buildInitialState(CLUB, 'Test manager', 25);
  assert.equal(state.fans, FAN_SEED[3]);
  assert.equal(state.sponsor.fee, SPONSOR_FEES[3]);

  const old = JSON.parse(JSON.stringify(state));
  delete old.fans;
  delete old.sponsor;
  delete old.lastSponsor;
  delete old.finance;
  delete old.credits;
  const filled = moneyFields(old);
  assert.equal(filled.credits, 0);
  assert.equal(filled.fans, FAN_SEED[clubTier(old)]);
  assert.equal(filled.sponsor.season, old.season);
  assert.equal(filled.lastSponsor, null);
  assert.deepEqual(filled.finance, { season: old.season, gate: 0, upkeep: 0, homeGames: 0 });
  const repaired = repairCareer(old);
  assert.deepEqual(moneyFields(repaired), filled);

  // A valid career comes back equal.
  assert.deepEqual(moneyFields(state), {
    credits: state.credits,
    fans: state.fans,
    sponsor: state.sponsor,
    lastSponsor: state.lastSponsor,
    finance: state.finance,
  });
  assert.equal(repairCareer(state).fans, state.fans);
});
