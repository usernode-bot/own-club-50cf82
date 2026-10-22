// Checks for the club's running costs: player wages, hireable staff,
// facility maintenance, the division's fan limit and the academy intake.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GROUPS, buildInitialState, playMatchday, startNextSeason, seasonEndMoney,
  moneyFields, repairCareer, clubTier, creditsForResult,
  FAN_CAP, GROUND_CAPACITY, STADIUM_SEATS, MAINTENANCE, WAGE_RATE, STAFF_ROLES,
  STAFF_BY_KEY, ACADEMY_CAPACITY, ACADEMY_INTAKE, SQUAD_MAX,
  stadiumSeats, maintenanceDue, playerWage, wageBill, staffWagesDue,
  staffFields, hireStaff, releaseStaff, promoteYouth, youthFields, academyIntake, defaultRole,
} from '../public/engine.js';

const CLUB = GROUPS[8].clubIds[5]; // a Division 3 club

function career(seed = 5) {
  return buildInitialState(CLUB, 'Test manager', seed);
}

function careerBefore(clubId, seed, venue) {
  const state = buildInitialState(clubId, 'Test manager', seed);
  while (state.matchday < state.fixtures.length) {
    const f = state.fixtures[state.matchday].find((x) => x.home === clubId || x.away === clubId);
    if ((f.home === clubId) === (venue === 'Home')) return state;
    playMatchday(state);
  }
  return null;
}

test('the balance never goes below zero when the costs are due', () => {
  const state = careerBefore(CLUB, 31, 'Away');
  state.credits = 0;
  state.facilities = { ...state.facilities, stadium: 4, training: 3 };
  const hired = hireStaff({ ...state, credits: 5000 }, 'coach');
  assert.ok(hired.state);
  state.staff = hired.state.staff;
  state.credits = 0;
  playMatchday(state);
  const f = state.lastReport.finance;
  assert.equal(state.credits, 0);
  const paid = f.upkeep + f.maintenance + f.wages + f.staffWages;
  assert.ok(paid < f.upkeepDue + f.maintenanceDue + f.wagesDue + f.staffDue);
  assert.equal(f.net, creditsForResult(
    f.result === 'win' ? 1 : 0, f.result === 'loss' ? 1 : 0) + f.gate - paid);
});

test('fans never grow past the division limit', () => {
  assert.deepEqual(FAN_CAP, GROUND_CAPACITY);
  const state = careerBefore(CLUB, 41, 'Home');
  state.fans = FAN_CAP[3];
  playMatchday(state);
  assert.ok(state.fans <= FAN_CAP[3]);
  assert.equal(moneyFields({ ...state, fans: FAN_CAP[3] + 500 }).fans, FAN_CAP[3]);
  const over = { ...state, fans: FAN_CAP[2] + 500 };
  assert.equal(moneyFields(over).fans, FAN_CAP[3]);
  assert.equal(seasonEndMoney({ ...state, fans: FAN_CAP[1] }).fans, FAN_CAP[3]);
});

test('a stadium bigger than the fans earns nothing extra and costs more', () => {
  const home = (stadium) => {
    const state = careerBefore(CLUB, 51, 'Home');
    state.fans = 6000;
    state.facilities = { ...state.facilities, stadium };
    state.credits = 0;
    playMatchday(state);
    return state.lastReport.finance;
  };
  const small = home(2);
  const big = home(5);
  assert.equal(stadiumSeats({ facilities: { stadium: 2 } }), STADIUM_SEATS[1]);
  assert.equal(small.gate, big.gate);
  assert.ok(big.maintenance > small.maintenance);
});

test('hiring and releasing staff: the fee, the wage and the refusals', () => {
  const state = career();
  assert.equal(hireStaff(state, 'nobody').error, 'role');
  assert.equal(releaseStaff(state, 'nobody').error, 'role');
  assert.equal(releaseStaff(state, 'coach').error, 'not_hired');
  assert.equal(hireStaff({ ...state, credits: 10 }, 'coach').error, 'credits');

  const withCredits = { ...state, credits: STAFF_BY_KEY.scout.fee };
  const hired = hireStaff(withCredits, 'scout');
  assert.ok(hired.state);
  assert.equal(hired.state.credits, 0);
  assert.equal(hired.state.staff.scout.name.length > 0, true);
  assert.equal(withCredits.staff.scout, null, 'the input is not mutated');
  assert.equal(hireStaff(hired.state, 'scout').error, 'hired');
  assert.equal(staffWagesDue(hired.state), STAFF_BY_KEY.scout.wage);

  const released = releaseStaff(hired.state, 'scout');
  assert.equal(released.state.staff.scout, null);
  assert.equal(staffWagesDue(released.state), 0);
  assert.equal(released.state.credits, 0, 'no refund');

  // The wage is charged every matchday while hired, and stops when released.
  const playing = careerBefore(CLUB, 61, 'Away');
  playing.credits = 100000;
  playing.staff = hired.state.staff;
  playMatchday(playing);
  assert.equal(playing.lastReport.finance.staffWages, STAFF_BY_KEY.scout.wage);
  playing.staff = released.state.staff;
  playMatchday(playing);
  assert.equal(playing.lastReport.finance.staffWages, 0);
});

test('wages follow the squad and the division', () => {
  const state = career();
  const p = state.squads[state.clubId][0];
  assert.equal(playerWage(p, 3), WAGE_RATE[3] * Math.max(5, p.overall - 40));
  assert.ok(playerWage(p, 1) > playerWage(p, 3));
  assert.equal(wageBill(state), state.squads[state.clubId]
    .reduce((sum, x) => sum + playerWage(x, clubTier(state)), 0));
});

test('the academy takes in the same prospects for the same seed and trims the oldest', () => {
  const a = career(7);
  const b = career(7);
  academyIntake(a, 1);
  academyIntake(b, 1);
  assert.deepEqual(a.youth, b.youth);
  assert.equal(a.youth.length, ACADEMY_INTAKE[1]);
  assert.equal(a.youth[0].joined.matchday, 1);
  assert.equal(new Set(a.youth.map((p) => p.id)).size, a.youth.length);

  const high = { ...career(7), facilities: { ...career(7).facilities, academy: 5 } };
  academyIntake(high, 2);
  assert.equal(high.youth.length, ACADEMY_INTAKE[5]);
  assert.ok(Math.min(...high.youth.map((p) => p.overall)) > 30);

  // Fill it past its capacity: the newest stay, the longest waiting leave.
  const full = { ...career(7), facilities: { ...career(7).facilities, academy: 1 } };
  full.youth = [];
  for (let md = 1; md <= ACADEMY_CAPACITY[0] + 3; md++) academyIntake(full, md);
  assert.equal(full.youth.length, ACADEMY_CAPACITY[0]);
  assert.equal(full.youth[0].joined.matchday, ACADEMY_CAPACITY[0] + 3);
  assert.equal(youthFields(full).length, ACADEMY_CAPACITY[0]);
});

test('promoting a prospect moves them into the squad on a wage', () => {
  const state = career(9);
  const withYoung = { ...state, facilities: { ...state.facilities, academy: 3 } };
  academyIntake(withYoung, 1);
  const prospect = withYoung.youth[0];
  const before = wageBill(withYoung);
  const out = promoteYouth(withYoung, prospect.id);
  assert.ok(out.state);
  assert.equal(out.state.youth.length, withYoung.youth.length - 1);
  const moved = out.state.squads[out.state.clubId].find((p) => p.id === prospect.id);
  assert.ok(moved);
  assert.equal(moved.joined, undefined);
  assert.equal(out.state.roles[prospect.id], defaultRole(prospect.pos));
  assert.ok(wageBill(out.state) > before);
  assert.equal(promoteYouth(out.state, prospect.id).error, 'youth');

  const packed = { ...withYoung, squads: { ...withYoung.squads, [withYoung.clubId]: new Array(SQUAD_MAX).fill({ id: 'x' }) } };
  assert.equal(promoteYouth(packed, prospect.id).error, 'squad_full');
});

test('a level 1 Division 3 club still makes a modest profit over a season', () => {
  for (const seed of [3, 5, 7, 11]) {
    const state = buildInitialState(GROUPS[8].clubIds[seed], 'Test manager', seed);
    while (!state.finished) playMatchday(state);
    // Before the sponsor fee, which seasonEndMoney adds.
    assert.ok(state.credits > 0, 'seed ' + seed + ' ended on ' + state.credits);
  }
});

test('a career saved before staff, youth and the new finance keys repairs', () => {
  const state = career(13);
  playMatchday(state);
  const old = JSON.parse(JSON.stringify(state));
  delete old.staff;
  delete old.youth;
  delete old.finance.maintenance;
  delete old.finance.wages;
  delete old.finance.staffWages;
  const repaired = repairCareer(old);
  assert.deepEqual(repaired.staff, staffFields({}));
  assert.deepEqual(repaired.youth, []);
  assert.equal(repaired.finance.gate, old.finance.gate);
  assert.equal(repaired.finance.maintenance, 0);

  // Staff and prospects carry into the next season.
  const hiring = { ...state, credits: 100000 };
  const hired = hireStaff(hiring, 'physio');
  academyIntake(hired.state, 1);
  const next = startNextSeason({ ...hired.state, finished: true });
  assert.equal(next.staff.physio.name, hired.state.staff.physio.name);
  assert.equal(next.youth.length, hired.state.youth.length);
  assert.equal(next.finance.maintenance, 0);
});

test('maintenance is per facility above level 1', () => {
  const state = career();
  assert.equal(maintenanceDue(state), 0);
  state.facilities = { ...state.facilities, stadium: 4, training: 2 };
  assert.equal(maintenanceDue(state), MAINTENANCE[4] + MAINTENANCE[2]);
  assert.equal(STAFF_ROLES.length, 5);
});
