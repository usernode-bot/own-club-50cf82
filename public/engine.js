// Own Club's football engine: everything that decides how a season and a
// match play out, with no DOM and no network. The app (public/app.js) runs it
// and saves the state it returns; the server (server.js) uses it to build the
// first version of a career and the staging demo.
//
// Everything here is deterministic: the same state and the same seed produce
// the same match, every time. Randomness comes only from mulberry32 streams
// seeded from the career seed.

// All fictional. `rep` is the board's 1 to 5 star standing, which sets the
// quality of the squad it is dealt. The pyramid itself is built below, after
// the formations, because a generated club is dealt one of them.
const COASTAL_CLUBS = [
  { id: 'harbourside', name: 'Harbourside FC', short: 'HF', color: 'rgb(var(--pitch))', rep: 4, formation: '4-3-3', objective: 'Finish in the top half', ground: 'The Quay' },
  { id: 'redvale', name: 'Redvale Athletic', short: 'RA', color: '#7a3b8f', rep: 5, formation: '4-2-3-1', objective: 'Win the league', ground: 'Redvale Park' },
  { id: 'kingsmoor', name: 'Kingsmoor United', short: 'KU', color: '#1e4fa3', rep: 5, formation: '4-3-3', objective: 'Win the league', ground: 'Kingsmoor Road' },
  { id: 'northmoor', name: 'Northmoor Town', short: 'NT', color: '#146b5a', rep: 4, formation: '4-4-2', objective: 'Finish in the top half', ground: 'Moor Lane' },
  { id: 'baymouth', name: 'Baymouth Rovers', short: 'BR', color: '#a03d1c', rep: 3, formation: '4-4-2', objective: 'Finish in the top half', ground: 'The Harbour End' },
  { id: 'saltmarsh', name: 'Saltmarsh City', short: 'SM', color: '#4a3a8a', rep: 3, formation: '3-5-2', objective: 'Finish in the top half', ground: 'Marsh Field' },
  { id: 'cliffton', name: 'Cliffton Wanderers', short: 'CW', color: '#2f4858', rep: 3, formation: '5-3-2', objective: 'Avoid finishing bottom', ground: 'Cliff Top' },
  { id: 'marrow', name: 'Marrow Bay', short: 'MB', color: '#7c2d5d', rep: 2, formation: '4-3-3', objective: 'Avoid finishing bottom', ground: 'Bay Side' },
  { id: 'gullport', name: 'Gullport United', short: 'GU', color: '#3f5a1d', rep: 2, formation: '4-4-2', objective: 'Avoid finishing bottom', ground: 'The Nest' },
  { id: 'kestrel', name: 'Kestrel Park', short: 'KP', color: '#8a4a1f', rep: 1, formation: '5-3-2', objective: 'Avoid finishing bottom', ground: 'Kestrel Lane' },
];

// ── Formations, mentalities, pressing, roles ─────────────────────────────
// A slot's coordinates are 0..1 on the drawn pitch: x across, y down from the
// opponent's goal line (the goalkeeper sits near the bottom).
export const FORMATIONS = {
  '4-4-2': {
    att: 1.0, mid: 1.0, def: 1.0,
    slots: [
      { pos: 'GK', x: 0.5, y: 0.89 },
      { pos: 'LB', x: 0.13, y: 0.71 }, { pos: 'CB', x: 0.38, y: 0.74 }, { pos: 'CB', x: 0.62, y: 0.74 }, { pos: 'RB', x: 0.87, y: 0.71 },
      { pos: 'LM', x: 0.13, y: 0.45 }, { pos: 'CM', x: 0.38, y: 0.47 }, { pos: 'CM', x: 0.62, y: 0.47 }, { pos: 'RM', x: 0.87, y: 0.45 },
      { pos: 'ST', x: 0.36, y: 0.18 }, { pos: 'ST', x: 0.64, y: 0.18 },
    ],
  },
  '4-3-3': {
    att: 1.08, mid: 1.02, def: 0.96,
    slots: [
      { pos: 'GK', x: 0.5, y: 0.89 },
      { pos: 'LB', x: 0.14, y: 0.71 }, { pos: 'CB', x: 0.38, y: 0.74 }, { pos: 'CB', x: 0.62, y: 0.74 }, { pos: 'RB', x: 0.86, y: 0.71 },
      { pos: 'CM', x: 0.28, y: 0.45 }, { pos: 'CM', x: 0.5, y: 0.47 }, { pos: 'CM', x: 0.72, y: 0.45 },
      { pos: 'LW', x: 0.17, y: 0.19 }, { pos: 'ST', x: 0.5, y: 0.15 }, { pos: 'RW', x: 0.83, y: 0.19 },
    ],
  },
  '4-2-3-1': {
    att: 1.04, mid: 1.06, def: 0.98,
    slots: [
      { pos: 'GK', x: 0.5, y: 0.89 },
      { pos: 'LB', x: 0.14, y: 0.71 }, { pos: 'CB', x: 0.38, y: 0.74 }, { pos: 'CB', x: 0.62, y: 0.74 }, { pos: 'RB', x: 0.86, y: 0.71 },
      { pos: 'DM', x: 0.37, y: 0.54 }, { pos: 'DM', x: 0.63, y: 0.54 },
      { pos: 'LW', x: 0.15, y: 0.31 }, { pos: 'AM', x: 0.5, y: 0.33 }, { pos: 'RW', x: 0.85, y: 0.31 },
      { pos: 'ST', x: 0.5, y: 0.14 },
    ],
  },
  '3-5-2': {
    att: 1.02, mid: 1.1, def: 0.92,
    slots: [
      { pos: 'GK', x: 0.5, y: 0.89 },
      { pos: 'CB', x: 0.25, y: 0.74 }, { pos: 'CB', x: 0.5, y: 0.76 }, { pos: 'CB', x: 0.75, y: 0.74 },
      { pos: 'LM', x: 0.1, y: 0.45 }, { pos: 'CM', x: 0.31, y: 0.47 }, { pos: 'CM', x: 0.5, y: 0.43 }, { pos: 'CM', x: 0.69, y: 0.47 }, { pos: 'RM', x: 0.9, y: 0.45 },
      { pos: 'ST', x: 0.36, y: 0.18 }, { pos: 'ST', x: 0.64, y: 0.18 },
    ],
  },
  '5-3-2': {
    att: 0.94, mid: 1.0, def: 1.1,
    slots: [
      { pos: 'GK', x: 0.5, y: 0.89 },
      { pos: 'LB', x: 0.09, y: 0.68 }, { pos: 'CB', x: 0.3, y: 0.75 }, { pos: 'CB', x: 0.5, y: 0.77 }, { pos: 'CB', x: 0.7, y: 0.75 }, { pos: 'RB', x: 0.91, y: 0.68 },
      { pos: 'CM', x: 0.27, y: 0.44 }, { pos: 'CM', x: 0.5, y: 0.46 }, { pos: 'CM', x: 0.73, y: 0.44 },
      { pos: 'ST', x: 0.36, y: 0.17 }, { pos: 'ST', x: 0.64, y: 0.17 },
    ],
  },
};

export const FORMATION_NAMES = Object.keys(FORMATIONS);

// ── The pyramid ──────────────────────────────────────────────────────────
// The Coastal League has three tiers and 162 clubs. Division 1 is one group
// of 18; Divisions 2 and 3 have four groups each, A to D. The ten original
// clubs form most of Division 1; the other 152 are generated from a fixed
// seed, so every career meets the same clubs by the same names. A club's tier
// sets the strength of its squad (see attrRange): Division 1 is the strongest.
export const LEAGUE_NAME = 'The Coastal League';
export const TIER_COUNT = 3;
export const GROUP_LETTERS = ['A', 'B', 'C', 'D'];
export const DIVISION_SIZE = 18;
export const MATCHDAYS = (DIVISION_SIZE - 1) * 2;
// The eight flat divisions a version 2 career was saved in.
export const LEGACY_DIVISION_COUNT = 8;
export const CLUB_COUNT = 162;

const PYRAMID_SEED = 50731;
const PYRAMID_CLUBS = CLUB_COUNT - COASTAL_CLUBS.length;

const PLACE_POOL = [
  'Ashcombe', 'Bracken', 'Fenwick', 'Lowmere', 'Ostrey', 'Pellow', 'Marwick', 'Tarnbrook',
  'Wexley', 'Hollins', 'Ivybridge', 'Jarrow', 'Kelbrook', 'Larkspur', 'Mossley', 'Netherby',
  'Oakhurst', 'Penrose', 'Quarrydale', 'Rosemarket', 'Stonebury', 'Thornleigh', 'Underhill',
  'Valebrook', 'Westhaven', 'Yarrow', 'Aldermere', 'Briarwood', 'Coldharbour', 'Dunmore',
  'Eastgate', 'Fairholt', 'Glenross', 'Hartwell', 'Ingleby', 'Kirkstone', 'Longmarsh',
  'Millbrook', 'Northgate', 'Overton', 'Pinewood', 'Redmoss', 'Saltby', 'Torcross',
  'Uppermill', 'Wrenfield', 'Yewdale', 'Barrowden',
];
const CLUB_SUFFIXES = ['FC', 'Athletic', 'Town', 'United', 'Rovers', 'City', 'Wanderers'];
const GROUND_WORDS = ['Road', 'Lane', 'Park', 'Field', 'End', 'Green', 'Way', 'Quay'];
// Dark enough for the white initials on the badge in both looks.
const BADGE_COLORS = [
  '#5a4632', '#7a2f3a', '#2f5d62', '#4b3f72', '#6b4a1f', '#2d5340', '#7a5a1e', '#274b78',
  '#5c2d4a', '#3a4a2a', '#6f3a24', '#334d5c', '#6a2f5a', '#3f4770', '#59421c', '#2b5a4f',
];
// The reputation a generated club is dealt, by its place in its division. The
// whole pattern drops a rung in the bottom half of the pyramid.
const GENERATED_REPS = [3, 2, 3, 2, 1, 2, 3, 2, 1, 2, 3, 2, 1, 2, 3, 2, 1, 2];

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function objectiveForRep(rep) {
  if (rep >= 5) return 'Win the league';
  if (rep >= 3) return 'Finish in the top half';
  return 'Avoid finishing bottom';
}

function uniqueShort(name, used) {
  const [place, suffix] = name.split(' ');
  const p = place.toUpperCase();
  const candidates = [p[0] + suffix[0].toUpperCase(), p.slice(0, 2)];
  for (const ch of p.slice(1)) candidates.push(p[0] + ch);
  for (let i = 0; i < 26; i++) candidates.push(p[0] + String.fromCharCode(65 + i));
  for (const c of candidates) if (!used.has(c)) return c;
  return p.slice(0, 2);
}

function generateClubs() {
  const rng = mulberry32(hash(PYRAMID_SEED, 'clubs'));
  const combos = [];
  for (const place of PLACE_POOL) for (const suffix of CLUB_SUFFIXES) combos.push({ place, suffix });
  for (let i = combos.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [combos[i], combos[j]] = [combos[j], combos[i]];
  }
  const names = new Set(COASTAL_CLUBS.map((c) => c.name));
  const shorts = new Set(COASTAL_CLUBS.map((c) => c.short));
  const out = [];
  for (const { place, suffix } of combos) {
    if (out.length === PYRAMID_CLUBS) break;
    const name = place + ' ' + suffix;
    if (names.has(name)) continue;
    names.add(name);
    const short = uniqueShort(name, shorts);
    shorts.add(short);
    const n = out.length;
    // The reputation block, one per 18 generated clubs: the first club of
    // each block is the strongest. The whole pattern drops a rung from the
    // sixth block down, which is Division 3.
    const block = n < 8 ? 1 : 2 + Math.floor((n - 8) / DIVISION_SIZE);
    const pos = n < 8 ? n : (n - 8) % DIVISION_SIZE;
    const rep = Math.max(1, GENERATED_REPS[pos] - (block >= 5 ? 1 : 0));
    out.push({
      id: slugify(name),
      name,
      short,
      color: BADGE_COLORS[n % BADGE_COLORS.length],
      rep,
      formation: FORMATION_NAMES[Math.floor(rng() * FORMATION_NAMES.length)],
      objective: objectiveForRep(rep),
      ground: place + ' ' + GROUND_WORDS[Math.floor(rng() * GROUND_WORDS.length)],
    });
  }
  return out;
}

export const CLUBS = COASTAL_CLUBS.concat(generateClubs());
export const CLUB_BY_ID = Object.fromEntries(CLUBS.map((c) => [c.id, c]));
const CLUB_INDEX = Object.fromEntries(CLUBS.map((c, i) => [c.id, i]));
export const COASTAL_IDS = COASTAL_CLUBS.map((c) => c.id);

// A place's name: "Division 1", "Division 2 Group B".
export function groupName(tier, group) {
  return 'Division ' + tier + (group ? ' Group ' + group : '');
}

// The nine groups of the pyramid in order: Division 1, then Division 2 A to
// D and Division 3 A to D. A club's place in the CLUBS list decides its
// starting group: every 18 clubs is one group.
export const GROUPS = [];
for (let i = 0; i < 1 + GROUP_LETTERS.length * 2; i++) {
  const tier = i === 0 ? 1 : 1 + Math.ceil(i / GROUP_LETTERS.length);
  const group = i === 0 ? null : GROUP_LETTERS[(i - 1) % GROUP_LETTERS.length];
  GROUPS.push({ tier, group, name: groupName(tier, group), clubIds: [] });
}
CLUBS.forEach((c, i) => GROUPS[Math.floor(i / DIVISION_SIZE)].clubIds.push(c.id));
export const clubToGroup = Object.fromEntries(
  GROUPS.flatMap((g, i) => g.clubIds.map((id) => [id, i]))
);

// Every club in the pyramid is for sale; the server holds the price by tier.
// Why a purchase is refused, or null when it can go ahead.
export function purchaseError(clubId, balance, price) {
  if (!CLUB_BY_ID[clubId]) return 'club';
  if (!(typeof balance === 'number' && balance >= price)) return 'balance';
  return null;
}

// The tier the manager's club plays in today, which sets what a sale pays.
// A version 3 career knows the division it is in; a version 2 career's old
// division maps the way its rollover maps it (Division 1 stays, Division 2
// stays, every other division becomes Division 3). A version 1 career is the
// old ten-club league, which became Division 1.
export function clubTier(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return 1;
  if (state.version >= 3) {
    const known = Array.isArray(state.groups) && state.groups[state.groupIndex];
    const division = state.division;
    return known && Number.isInteger(division) && division >= 1 && division <= TIER_COUNT
      ? division : 1;
  }
  if (state.version >= 2) {
    if (state.division === 1) return 1;
    if (state.division === 2) return 2;
    return 3;
  }
  return 1;
}

// What selling the club pays, by the tier it is in when it is sold. The
// values are the server's; a tier with no value pays nothing.
export function saleValue(state, values) {
  const value = values ? values[clubTier(state)] : null;
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

// Club credits: the club's own in-game currency, earned by result, by the
// home gate and by what the crowd spends at the shop, food stand and hotel,
// less ground upkeep, and kept with the career. Facility upgrades spend them;
// the training ground will spend them too.
export const CREDIT_REWARDS = { win: 50, draw: 25, loss: 10 };

// How many matchdays of Club credits in and out the Finance tab keeps: this
// season's most recent ones, newest first.
export const FINANCE_HISTORY_MAX = 10;

export function creditsForResult(goalsFor, goalsAgainst) {
  if (goalsFor > goalsAgainst) return CREDIT_REWARDS.win;
  if (goalsFor < goalsAgainst) return CREDIT_REWARDS.loss;
  return CREDIT_REWARDS.draw;
}

// Fans and the ground they come to. Fans are per career, start at a figure set
// by the division and carry across seasons; the ground's capacity sets how
// many of them can buy a seat.
export const FAN_SEED = { 1: 15000, 2: 6000, 3: 2500 };
// The most fans a division holds; a stadium seats no more than that, and a
// club never grows past it however well it plays.
export const FAN_CAP = { 1: 30000, 2: 12000, 3: 5000 };
export const GROUND_CAPACITY = FAN_CAP;
export const TICKET_PRICE = 5;
export const FAN_CHANGE = { win: 0.05, draw: 0.02, loss: -0.03 };
// Flat ground upkeep; facilities above level 1 add maintenance on top.
export const GROUND_UPKEEP = 250;

// The stadium's seats, matching the facility text. A home gate is the smaller
// of the fans, these seats and the division's fan limit.
export const STADIUM_SEATS = [2000, 5000, 10000, 20000, 40000];

export function stadiumSeats(state) {
  return STADIUM_SEATS[facilityLevels(state).stadium - 1];
}

// Facilities that bring extra fans through the gate on a home matchday: each
// level above 1 adds a share of the fan base to the crowd.
export const CROWD_FACILITIES = ['toilets', 'parking', 'vip'];
export const CROWD_BONUS = { 1: 0, 2: 0.02, 3: 0.04, 4: 0.06, 5: 0.08 };

export function crowdBonus(state) {
  const levels = facilityLevels(state);
  return CROWD_FACILITIES.reduce((sum, key) => sum + (CROWD_BONUS[levels[key]] || 0), 0);
}

// The crowd a home match draws: the fans, plus the crowd facilities' share,
// never more than the stadium's seats or the division's fan limit. The bonus
// never changes the fan total itself.
export function homeCrowd(state, fans, cap) {
  const seats = stadiumSeats(state);
  const base = Math.min(fans, seats, cap);
  const attendance = Math.min(fans + Math.round(fans * crowdBonus(state)), seats, cap);
  return { attendance, extra: attendance - base };
}

// What every facility above level 1 costs to run each matchday.
export const MAINTENANCE = { 1: 0, 2: 150, 3: 500, 4: 1500, 5: 4000 };

export function maintenanceDue(state) {
  const levels = facilityLevels(state);
  return FACILITIES.reduce((sum, f) => sum + (MAINTENANCE[levels[f.key]] || 0), 0);
}

// What the crowd spends at the shop, the food stand and the hotel on a home
// matchday: Club credits for every 10 fans in the ground, by facility level.
export const MATCHDAY_SALES = {
  shop: [4, 6, 10, 15, 22],
  food: [3, 5, 8, 12, 18],
  hotel: [1, 2, 4, 7, 12],
};

export function matchdaySales(state, attendance) {
  const levels = facilityLevels(state);
  const crowd = Number.isInteger(attendance) && attendance > 0 ? attendance : 0;
  const earned = (key) => Math.floor(crowd * MATCHDAY_SALES[key][levels[key] - 1] / 10);
  return { shop: earned('shop'), food: earned('food'), hotel: earned('hotel') };
}

// Every player earns a wage each matchday, worked out from the squad and the
// division rather than stored, so promotion makes the squad dearer.
export const WAGE_RATE = { 1: 45, 2: 24, 3: 14 };

export function playerWage(player, tier) {
  const rate = WAGE_RATE[tier] || WAGE_RATE[3];
  return rate * Math.max(5, (player && player.overall ? player.overall : 0) - 40);
}

export function wageBill(state) {
  const squad = state && state.squads && state.squads[state.clubId];
  const tier = clubTier(state);
  return Array.isArray(squad) ? squad.reduce((sum, p) => sum + playerWage(p, tier), 0) : 0;
}

// The staff a club can hire. Each has a one-off fee and a wage every
// matchday until released; there is one of each.
export const STAFF_ROLES = [
  { key: 'coach', name: 'Coach', fee: 2000, wage: 300 },
  { key: 'scout', name: 'Scout', fee: 1000, wage: 150 },
  { key: 'doctor', name: 'Doctor', fee: 1000, wage: 150 },
  { key: 'physio', name: 'Physio', fee: 800, wage: 120 },
  { key: 'club', name: 'Club staff', fee: 500, wage: 80 },
];

export const STAFF_BY_KEY = Object.fromEntries(STAFF_ROLES.map((s) => [s.key, s]));

function validStaffMember(m) {
  return !!m && typeof m === 'object' && !Array.isArray(m)
    && typeof m.name === 'string' && m.name
    && Number.isInteger(m.season) && Number.isInteger(m.matchday);
}

// Each staff role, hired or null, filling anything unusable with null.
export function staffFields(state) {
  const given = state && state.staff && typeof state.staff === 'object' && !Array.isArray(state.staff)
    ? state.staff : {};
  const out = {};
  for (const s of STAFF_ROLES) out[s.key] = validStaffMember(given[s.key]) ? given[s.key] : null;
  return out;
}

export function staffWagesDue(state) {
  const staff = staffFields(state);
  return STAFF_ROLES.reduce((sum, s) => sum + (staff[s.key] ? s.wage : 0), 0);
}

// Hire a role for its fee, or release it (no refund). Never mutates its input.
export function hireStaff(state, key) {
  const role = STAFF_BY_KEY[key];
  if (!role) return { error: 'role' };
  const staff = staffFields(state);
  if (staff[key]) return { error: 'hired' };
  const held = Number.isInteger(state.credits) && state.credits >= 0 ? state.credits : 0;
  if (held < role.fee) return { error: 'credits' };
  const h = hash(state.seed, 'staff', key, state.season || 1, state.matchday || 0);
  const name = FIRST_NAMES[h % FIRST_NAMES.length] + ' ' + LAST_NAMES[(h >>> 8) % LAST_NAMES.length];
  return {
    state: {
      ...state,
      credits: held - role.fee,
      staff: { ...staff, [key]: { name, season: state.season || 1, matchday: state.matchday || 0 } },
    },
  };
}

export function releaseStaff(state, key) {
  if (!STAFF_BY_KEY[key]) return { error: 'role' };
  const staff = staffFields(state);
  if (!staff[key]) return { error: 'not_hired' };
  return { state: { ...state, staff: { ...staff, [key]: null } } };
}

// The academy: young players it took in, newest first, up to what the
// academy facility says it can coach.
export const ACADEMY_CAPACITY = [10, 20, 30, 45, 60];
export const ACADEMY_INTAKE = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3 };

export function academyCapacity(state) {
  return ACADEMY_CAPACITY[facilityLevels(state).academy - 1];
}

// Today's prospects, keeping only the entries today's screen can read.
export function youthFields(state) {
  const list = state && Array.isArray(state.youth) ? state.youth : [];
  const good = list.filter((p) => p && typeof p.id === 'string' && POS_GROUP[p.pos]
    && Number.isInteger(p.overall) && p.attrs && typeof p.attrs === 'object');
  // A downgrade can leave more prospects than the academy's new places, and
  // they all stay; 60 still bounds a malformed list.
  return good.slice(0, ACADEMY_CAPACITY[ACADEMY_CAPACITY.length - 1]);
}

// The players the academy takes in after a matchday: more and better at a
// higher level, the longest waiting leaving when it is full.
export function academyIntake(state, matchday) {
  const level = facilityLevels(state).academy;
  const season = state.season || 1;
  const cap = ACADEMY_CAPACITY[level - 1];
  const kept = (Array.isArray(state.youth) ? state.youth : []).slice();
  // Over its places after a downgrade: keep everyone and take in nobody.
  if (kept.length > cap) return state;
  const rng = mulberry32(hash(state.seed, 'youth', season, matchday));
  const used = new Set([
    ...(state.squads[state.clubId] || []).map((p) => p.name),
    ...(Array.isArray(state.youth) ? state.youth.map((p) => p.name) : []),
  ]);
  const fresh = [];
  const count = ACADEMY_INTAKE[level] || 1;
  for (let k = 0; k < count; k++) {
    const pos = SQUAD_SHAPE[Math.floor(rng() * SQUAD_SHAPE.length) % SQUAD_SHAPE.length];
    const centre = 38 + 4 * level;
    const attrs = rollAttrs(rng, pos, centre - 8, centre + 8);
    let name;
    do {
      name = pick(rng, FIRST_NAMES) + ' ' + pick(rng, LAST_NAMES);
    } while (used.has(name));
    used.add(name);
    const id = 'y' + season + '-' + matchday + '-' + k;
    fresh.push({
      id: id,
      name,
      pos,
      peak: peakStyleFor(state.seed, id),
      age: 16 + Math.floor(rng() * 2),
      attrs,
      overall: overallOf(attrs, pos),
      fitness: 100,
      morale: 60,
      injury: 0,
      goals: 0,
      assists: 0,
      apps: 0,
      yellow: 0,
      red: 0,
      captain: false,
      joined: { season, matchday },
    });
  }
  state.youth = fresh.concat(kept).slice(0, cap);
  return state;
}

// Promote a prospect into the senior squad. Never mutates its input.
export function promoteYouth(state, id) {
  const youth = Array.isArray(state.youth) ? state.youth : [];
  const player = youth.find((p) => p && p.id === id);
  if (!player) return { error: 'youth' };
  const squad = (state.squads && state.squads[state.clubId]) || [];
  if (squad.length >= SQUAD_MAX) return { error: 'squad_full' };
  const player2 = { ...player, captain: false };
  delete player2.joined;
  return {
    state: {
      ...state,
      squads: { ...state.squads, [state.clubId]: squad.concat(player2) },
      youth: youth.filter((p) => p !== player),
      roles: { ...(state.roles || {}), [id]: defaultRole(player.pos) },
    },
  };
}

// One sponsor a season, paid at the rollover when its target was met. The fee
// follows the division, about a quarter of a season's gate at its starting
// fans.
export const SPONSOR_FEES = { 1: 300000, 2: 120000, 3: 50000 };
export const SPONSOR_NAMES = [
  'Harbour Lights Bakery', 'Tidewater Ferries', 'Gull Rock Cycles',
  'Saltmarsh Print Works', 'Lighthouse Radio', 'Pebble Bay Dairy',
  'Driftwood Joinery', 'Seaglass Opticians',
];
export const SPONSOR_TARGETS = ['Win the league', 'Finish in the top half', 'Avoid finishing bottom'];

export function sponsorFor(seed, season, tier) {
  const h = hash(seed, 'sponsor', season);
  return {
    name: SPONSOR_NAMES[h % SPONSOR_NAMES.length],
    target: SPONSOR_TARGETS[(h >>> 3) % SPONSOR_TARGETS.length],
    fee: SPONSOR_FEES[tier] || SPONSOR_FEES[3],
    season,
    paid: false,
  };
}

function validSponsor(s) {
  return !!s && typeof s === 'object' && !Array.isArray(s)
    && typeof s.name === 'string'
    && typeof s.target === 'string'
    && Number.isInteger(s.fee) && s.fee >= 0
    && typeof s.paid === 'boolean';
}

// This season's matchday history: the Club credits in and out of the club's
// own fixtures, newest first and capped. Anything malformed, or written by
// another season, is dropped so a forged save cannot show it.
function financeHistoryFields(state, season) {
  const given = state && Array.isArray(state.financeHistory) ? state.financeHistory : [];
  const okInt = (v) => Number.isInteger(v) && v >= 0;
  return given.filter((h) => {
    if (!h || typeof h !== 'object' || Array.isArray(h)) return false;
    if (h.season !== season) return false;
    if (!Number.isInteger(h.matchday) || h.matchday < 1) return false;
    if (h.venue !== 'Home' && h.venue !== 'Away') return false;
    if (typeof h.opponentId !== 'string' || !CLUB_BY_ID[h.opponentId]) return false;
    if (!h.income || typeof h.income !== 'object' || Array.isArray(h.income)) return false;
    if (!h.expenses || typeof h.expenses !== 'object' || Array.isArray(h.expenses)) return false;
    if (!['result', 'gate', 'shop', 'food', 'hotel'].every((k) => okInt(h.income[k]))) return false;
    if (!['upkeep', 'maintenance', 'wages', 'staffWages'].every((k) => okInt(h.expenses[k]))) return false;
    if (!Number.isInteger(h.net)) return false;
    return okInt(h.balanceAfter);
  }).slice(0, FINANCE_HISTORY_MAX).map((h) => ({
    season: h.season,
    matchday: h.matchday,
    venue: h.venue,
    opponentId: h.opponentId,
    income: {
      result: h.income.result,
      gate: h.income.gate,
      shop: h.income.shop,
      food: h.income.food,
      hotel: h.income.hotel,
    },
    expenses: {
      upkeep: h.expenses.upkeep,
      maintenance: h.expenses.maintenance,
      wages: h.expenses.wages,
      staffWages: h.expenses.staffWages,
    },
    net: h.net,
    balanceAfter: h.balanceAfter,
  }));
}

// The career's money fields, filling only what is missing or unusable, so a
// career saved before fans and sponsors existed still plays. Kept in one place
// because the server and the page both read and settle them.
export function moneyFields(state) {
  const tier = clubTier(state);
  const season = (state && state.season) || 1;
  const credits = Number.isInteger(state.credits) && state.credits >= 0 ? state.credits : 0;
  const givenFans = Number.isInteger(state.fans) && state.fans >= 0 ? state.fans : FAN_SEED[tier];
  const fans = Math.min(givenFans, FAN_CAP[tier] || FAN_CAP[3]);
  const sponsor = validSponsor(state.sponsor) ? state.sponsor : sponsorFor(state.seed, season, tier);
  const lastSponsor = validSponsor(state.lastSponsor) ? state.lastSponsor : null;
  const f = state.finance;
  const financeOk = !!f && typeof f === 'object'
    && f.season === season
    && Number.isInteger(f.gate) && f.gate >= 0
    && Number.isInteger(f.upkeep) && f.upkeep >= 0
    && Number.isInteger(f.homeGames) && f.homeGames >= 0;
  const zeroTotal = (k) => (Number.isInteger(f[k]) && f[k] >= 0 ? f[k] : 0);
  const finance = financeOk
    ? {
      season: f.season,
      gate: f.gate,
      upkeep: f.upkeep,
      homeGames: f.homeGames,
      maintenance: zeroTotal('maintenance'),
      wages: zeroTotal('wages'),
      staffWages: zeroTotal('staffWages'),
      shop: zeroTotal('shop'),
      food: zeroTotal('food'),
      hotel: zeroTotal('hotel'),
    }
    : { season, gate: 0, upkeep: 0, homeGames: 0, maintenance: 0, wages: 0, staffWages: 0, shop: 0, food: 0, hotel: 0 };
  return { credits, fans, sponsor, lastSponsor, finance, financeHistory: financeHistoryFields(state, season) };
}

// Where the club's Club credits stand this season, as the Finance tab shows
// it: what came in from results, gates and the home crowd's spending, what
// went out on upkeep, maintenance and wages, and the net. Facility upgrades,
// staff fees, transfers and the sponsor's fee are left out, so the net can
// differ from the balance.
export function seasonMoney(state) {
  const m = moneyFields(state);
  const me = state.clubId;
  let results = 0;
  let won = 0;
  let drawn = 0;
  let lost = 0;
  for (const r of Array.isArray(state.results) ? state.results : []) {
    if (!r || !r.home || !r.away) continue;
    const home = r.home.id === me;
    const away = r.away.id === me;
    if (!home && !away) continue;
    const goalsFor = home ? r.homeGoals : r.awayGoals;
    const goalsAgainst = home ? r.awayGoals : r.homeGoals;
    results += creditsForResult(goalsFor, goalsAgainst);
    if (goalsFor > goalsAgainst) won++;
    else if (goalsFor < goalsAgainst) lost++;
    else drawn++;
  }
  const income = {
    results,
    gate: m.finance.gate,
    shop: m.finance.shop,
    food: m.finance.food,
    hotel: m.finance.hotel,
  };
  income.total = income.results + income.gate + income.shop + income.food + income.hotel;
  const expenses = {
    upkeep: m.finance.upkeep,
    maintenance: m.finance.maintenance,
    wages: m.finance.wages,
    staffWages: m.finance.staffWages,
  };
  expenses.total = expenses.upkeep + expenses.maintenance + expenses.wages + expenses.staffWages;
  return { income, expenses, net: income.total - expenses.total, record: { won, drawn, lost } };
}

export function fanChange(fans, goalsFor, goalsAgainst, cap) {
  const rate = goalsFor > goalsAgainst ? FAN_CHANGE.win
    : goalsFor < goalsAgainst ? FAN_CHANGE.loss
      : FAN_CHANGE.draw;
  const next = Math.max(0, Math.round(fans * (1 + rate)));
  return Number.isInteger(cap) ? Math.min(cap, next) : next;
}

// The club's facilities, each from level 1 to level 5. Upgrading one changes
// what it says it has; the toilets, parking and VIP room add fans at home, the
// shop, food stand and hotel also earn from a home crowd, and every level above
// the first costs maintenance.
export const FACILITY_MAX_LEVEL = 5;

export const FACILITIES = [
  {
    key: 'stadium',
    name: 'Stadium',
    levels: ['2,000 seats', '5,000 seats', '10,000 seats', '20,000 seats', '40,000 seats'],
  },
  {
    key: 'training',
    name: 'Training ground',
    levels: [
      '1 grass pitch',
      '2 grass pitches',
      '3 pitches and a gym',
      '4 pitches, a gym and a physio room',
      '6 pitches, a gym, a physio room and a recovery pool',
    ],
  },
  {
    key: 'academy',
    name: 'Academy',
    levels: [
      'coaching for 10 young players',
      'coaching for 20 young players',
      'coaching for 30 young players',
      'coaching for 45 young players',
      'coaching for 60 young players',
    ],
  },
  {
    key: 'shop',
    name: 'Shop',
    levels: ['a kiosk on match days', 'a small club shop', 'a club shop open all week', 'a large club shop', 'a megastore'],
  },
  {
    key: 'food',
    name: 'Food stand',
    levels: ['1 food stand', '3 food stands', '6 food stands', '10 food stands', '16 food stands'],
  },
  {
    key: 'hotel',
    name: 'Hotel',
    levels: ['10 rooms', '25 rooms', '50 rooms', '100 rooms', '200 rooms'],
  },
  {
    key: 'toilets',
    name: 'Toilets',
    levels: [
      'portable toilets',
      '2 toilet blocks, 2% more fans at home',
      '4 toilet blocks, 4% more fans at home',
      '6 toilet blocks, 6% more fans at home',
      '10 toilet blocks, 8% more fans at home',
    ],
  },
  {
    key: 'parking',
    name: 'Parking',
    levels: [
      'a gravel car park',
      '200 parking spaces, 2% more fans at home',
      '500 parking spaces, 4% more fans at home',
      '1,000 parking spaces, 6% more fans at home',
      '2,500 parking spaces and a shuttle bus, 8% more fans at home',
    ],
  },
  {
    key: 'vip',
    name: 'VIP room',
    levels: [
      'no VIP seating',
      'a VIP box, 2% more fans at home',
      '3 VIP boxes, 4% more fans at home',
      'a VIP room, 6% more fans at home',
      'a VIP room and 10 boxes, 8% more fans at home',
    ],
  },
];

export const FACILITY_BY_KEY = Object.fromEntries(FACILITIES.map((f) => [f.key, f]));

// What it costs to reach a level: the same for every facility.
export const UPGRADE_COSTS = { 2: 100, 3: 250, 4: 500, 5: 1000 };

export function upgradeCost(toLevel) {
  return Number.isInteger(toLevel) && UPGRADE_COSTS[toLevel] != null ? UPGRADE_COSTS[toLevel] : null;
}

// Every facility's level, filling a missing or unusable one with 1.
export function facilityLevels(state) {
  const given = state && state.facilities && typeof state.facilities === 'object' && !Array.isArray(state.facilities)
    ? state.facilities : {};
  const out = {};
  for (const f of FACILITIES) {
    const n = given[f.key];
    out[f.key] = Number.isInteger(n) && n >= 1 && n <= FACILITY_MAX_LEVEL ? n : 1;
  }
  return out;
}

// Raise one facility by one level in return for its cost in Club credits. The
// level asked for must be the current one plus one. Never mutates its input.
export function upgradeFacility(state, key, toLevel) {
  if (!FACILITY_BY_KEY[key]) return { error: 'facility' };
  const cost = upgradeCost(toLevel);
  if (cost == null) return { error: 'level' };
  const levels = facilityLevels(state);
  if (levels[key] + 1 !== toLevel) return { error: 'level' };
  const held = Number.isInteger(state.credits) && state.credits >= 0 ? state.credits : 0;
  if (held < cost) return { error: 'credits' };
  return { state: { ...state, facilities: { ...levels, [key]: toLevel }, credits: held - cost } };
}

// Lower one facility by one level. Free, and nothing is refunded. The level
// asked for must be the current one minus one, never below 1. Never mutates
// its input.
export function downgradeFacility(state, key, toLevel) {
  if (!FACILITY_BY_KEY[key]) return { error: 'facility' };
  if (!Number.isInteger(toLevel) || toLevel < 1) return { error: 'level' };
  const levels = facilityLevels(state);
  if (levels[key] - 1 !== toLevel) return { error: 'level' };
  return { state: { ...state, facilities: { ...levels, [key]: toLevel } } };
}

// ── Transfers, wages, ageing ─────────────────────────────────────────────
// A squad holds at most 40 and at least 11, one of them a goalkeeper.
export const SQUAD_MAX = 40;
export const SQUAD_MIN = 11;
export const MARKET_PRICE_MAX = 1000000;

// What the league pays for a player sold straight to it: a quarter of the
// player's overall, at least 5.
export function systemSaleValue(p) {
  const overall = Number.isFinite(p && p.overall) ? p.overall : 0;
  return Math.max(5, Math.round(overall / 4));
}

function ownSquad(state) {
  return (state && state.squads && Array.isArray(state.squads[state.clubId]))
    ? state.squads[state.clubId] : [];
}

// Why a player cannot leave the squad, or null when they can.
export function leaveError(state, playerId) {
  const squad = ownSquad(state);
  const player = squad.find((p) => p.id === playerId);
  if (!player) return 'player';
  if (squad.length <= SQUAD_MIN) return 'min';
  if (POS_GROUP[player.pos] === 'GK' && squad.filter((p) => POS_GROUP[p.pos] === 'GK').length <= 1) {
    return 'goalkeeper';
  }
  return null;
}

// What signing a player costs: the price, one matchday of wages with him and
// the ground's upkeep.
export function signCost(state, player, price) {
  const squads = { ...(state.squads || {}), [state.clubId]: ownSquad(state).concat([player]) };
  return price + wageBill({ ...state, squads }) + GROUND_UPKEEP;
}

// Why a player cannot be signed, or null when they can.
export function signError(state, player, price) {
  if (ownSquad(state).length >= SQUAD_MAX) return 'full';
  const held = Number.isInteger(state.credits) && state.credits >= 0 ? state.credits : 0;
  if (held < signCost(state, player, price)) return 'credits';
  return null;
}

// The state without a player: the roles entry goes, the armband passes to the
// best midfielder when the captain leaves, and the eleven is repaired. Never
// mutates its input.
export function removePlayer(state, id) {
  const squad = ownSquad(state);
  const leaving = squad.find((p) => p.id === id);
  const kept = squad.filter((p) => p.id !== id).map((p) => ({ ...p }));
  const roles = { ...(state.roles || {}) };
  delete roles[id];
  if (leaving && leaving.captain) {
    const mids = kept.filter((p) => POS_GROUP[p.pos] === 'MF');
    if (mids.length) {
      const cap = mids.reduce((a, b) => (b.overall > a.overall ? b : a));
      cap.captain = true;
    }
  }
  const next = {
    ...state,
    squads: { ...state.squads, [state.clubId]: kept },
    roles,
    lineup: (state.lineup || []).filter((x) => x !== id),
  };
  if (next.lineup.length < SQUAD_MIN) {
    next.lineup = autoLineup(kept, next.tactics.formation, roles);
  } else {
    fixLineup(next);
  }
  return next;
}

// The state with a new player in the squad: a new id, no armband, no last
// rating, and their default role.
export function addPlayer(state, player, newId) {
  const added = { ...player, id: newId, captain: false };
  delete added.lastRating;
  delete added.lastMinutes;
  const kept = ownSquad(state).map((p) => ({ ...p }));
  return {
    ...state,
    squads: { ...state.squads, [state.clubId]: kept.concat([added]) },
    roles: { ...(state.roles || {}), [newId]: defaultRole(player.pos) },
  };
}

// Sell a player to the league for its small fixed fee, or release them for
// nothing. Both return { state, price } or { error }.
export function sellToLeague(state, id) {
  const err = leaveError(state, id);
  if (err) return { error: err };
  const player = ownSquad(state).find((p) => p.id === id);
  const price = systemSaleValue(player);
  const next = removePlayer(state, id);
  next.credits = (Number.isInteger(state.credits) && state.credits >= 0 ? state.credits : 0) + price;
  return { state: next, price };
}

export function releasePlayer(state, id) {
  const err = leaveError(state, id);
  if (err) return { error: err };
  return { state: removePlayer(state, id), price: 0 };
}

// Put a player on the market: they leave the squad now and the snapshot is
// what other managers see.
export function listPlayer(state, id, price) {
  if (!Number.isInteger(price) || price < 1 || price > MARKET_PRICE_MAX) return { error: 'price' };
  const err = leaveError(state, id);
  if (err) return { error: err };
  const player = ownSquad(state).find((p) => p.id === id);
  // The buyer sees the peak style the seller saw, even under a new market id.
  return { state: removePlayer(state, id), snapshot: { ...player, peak: playerPeak(state, player) } };
}

// Sign a listed player: the price leaves the credits and the player joins.
export function buyPlayer(state, listing) {
  const err = signError(state, listing.player, listing.price);
  if (err) return { error: err };
  const withPlayer = addPlayer(state, listing.player, 't' + listing.id);
  withPlayer.credits = state.credits - listing.price;
  return { state: withPlayer };
}

// Withdraw a listing: the player comes back, if the squad has room.
export function returnListing(state, listing) {
  if (ownSquad(state).length >= SQUAD_MAX) return { error: 'full' };
  return { state: addPlayer(state, listing.player, 't' + listing.id) };
}

// Each player peaks at one of three ages. Until the peak every attribute
// rises a little each summer, for two summers it holds, and from the decline
// age it slips again.
export const PEAK_STYLES = {
  early: { peak: 23, decline: 26 },
  mid: { peak: 27, decline: 30 },
  late: { peak: 30, decline: 33 },
};
export const PEAK_NAMES = ['early', 'mid', 'late'];

// A player's peak style from the career's seed, so a stored player without one
// still reads the same every time it is looked at.
export function peakStyleFor(seed, id) {
  return PEAK_NAMES[hash(seed, 'peak', id) % 3];
}

export function playerPeak(state, p) {
  const stored = p && typeof p.peak === 'string' && Object.prototype.hasOwnProperty.call(PEAK_STYLES, p.peak)
    ? p.peak : null;
  return stored || peakStyleFor(state && state.seed, p && p.id);
}

// The peak style, the age it comes at, and how the coming summer changes the
// player: 'improving', 'steady' or 'declining'.
export function growthOutlook(state, p) {
  const style = playerPeak(state, p);
  const { peak, decline } = PEAK_STYLES[style];
  const nextAge = (Number.isInteger(p && p.age) ? p.age : 20) + 1;
  const next = nextAge <= peak ? 'improving' : nextAge >= decline ? 'declining' : 'steady';
  return { style, peakAge: peak, next };
}

// The summer: everyone a year older, attributes rising to their peak and
// slipping afterwards, retirement possible from 34 and certain at 39. Fixed
// by the career's seed, so the season card can name the retirees before the
// rollover.
export function ageingFor(state) {
  const season = (state && state.season) || 1;
  const retiring = [];
  const players = ownSquad(state).map((p) => {
    const peak = playerPeak(state, p);
    const style = PEAK_STYLES[peak];
    const newAge = (Number.isInteger(p.age) ? p.age : 20) + 1;
    const attrs = { ...p.attrs };
    const overall = Number.isFinite(p.overall) ? p.overall : overallOf(attrs, p.pos);
    const out = { ...p, age: newAge, attrs, overall, peak };
    if (newAge <= style.peak) {
      for (const k of Object.keys(attrs)) {
        const gain = 1 + (hash(state.seed, 'grow', season, p.id, k) % 3);
        attrs[k] = Math.min(92, attrs[k] + gain);
      }
      out.overall = overallOf(attrs, p.pos);
    } else if (newAge >= style.decline) {
      for (const k of Object.keys(attrs)) {
        const drop = 1 + (hash(state.seed, 'age', season, p.id, k) % 3);
        attrs[k] = Math.max(20, attrs[k] - drop);
      }
      out.overall = overallOf(attrs, p.pos);
    }
    if (newAge >= 34 && hash(state.seed, 'retire', season, p.id) % 6 < newAge - 33) {
      retiring.push({ id: p.id, name: p.name, pos: p.pos, age: newAge });
    }
    return out;
  });
  return { players, retiring };
}

// A 17-year-old from the academy, dealt at the Academy level asked for.
export function academyGraduate(seed, season, index, pos, academyLevel, tier) {
  const rng = mulberry32(hash(seed, 'graduate', season, index));
  const rep = Math.max(1, Math.min(5, Number.isInteger(academyLevel) ? academyLevel : 1) - 1) || 1;
  const p = makePlayer(rng, pos, rep, 0, tier);
  const used = new Set();
  let name;
  do {
    name = pick(rng, FIRST_NAMES) + ' ' + pick(rng, LAST_NAMES);
  } while (used.has(name));
  used.add(name);
  return {
    ...p,
    id: 'y' + season + '-' + index,
    name,
    age: 17,
    peak: peakStyleFor(seed, 'y' + season + '-' + index),
    fitness: 100,
    morale: 70,
    overall: overallOf(p.attrs, pos),
    academy: season,
  };
}

// The money a person brings to the shop: the wallet already stored for them,
// or the starting balance a first-time manager is given.
export function openingBalance(stored, startingBalance) {
  return Number.isInteger(stored) && stored >= 0 ? stored : startingBalance;
}

export const MENTALITIES = {
  Defensive: { att: 0.86, mid: 0.98, def: 1.12 },
  Balanced: { att: 1.0, mid: 1.0, def: 1.0 },
  Positive: { att: 1.06, mid: 1.02, def: 0.96 },
  Attacking: { att: 1.14, mid: 1.04, def: 0.87 },
};
export const MENTALITY_NAMES = Object.keys(MENTALITIES);

export const PRESSING = {
  Low: { mid: 0.94, def: 1.03, stamina: 0.7, foul: 0.78 },
  Medium: { mid: 1.0, def: 1.0, stamina: 1.0, foul: 1.0 },
  High: { mid: 1.08, def: 0.95, stamina: 1.55, foul: 1.35 },
};
export const PRESSING_NAMES = Object.keys(PRESSING);

export const POS_GROUP = {
  GK: 'GK',
  RB: 'DF', LB: 'DF', CB: 'DF',
  DM: 'MF', CM: 'MF', AM: 'MF', RM: 'MF', LM: 'MF',
  RW: 'FW', LW: 'FW', ST: 'FW',
};

export const ROLES = {
  GK: ['Goalkeeper', 'Sweeper keeper'],
  DF: ['Full-back', 'Centre-back', 'Wing-back'],
  MF: ['Ball-winner', 'Playmaker', 'Box-to-box'],
  FW: ['Poacher', 'Target forward', 'Inside forward'],
};

export const ROLE_WEIGHTS = {
  Goalkeeper: { gk: 1 },
  'Sweeper keeper': { gk: 0.7, pas: 0.3 },
  'Full-back': { def: 0.4, pac: 0.5, pas: 0.1 },
  'Centre-back': { def: 0.7, pac: 0.15, pas: 0.15 },
  'Wing-back': { def: 0.35, pac: 0.4, pas: 0.25 },
  'Ball-winner': { def: 0.5, pas: 0.2, pac: 0.3 },
  Playmaker: { pas: 0.65, sho: 0.1, def: 0.1, pac: 0.15 },
  'Box-to-box': { pas: 0.3, def: 0.3, pac: 0.25, sho: 0.15 },
  Poacher: { sho: 0.6, pac: 0.35, pas: 0.05 },
  'Target forward': { sho: 0.55, def: 0.15, pas: 0.15, pac: 0.15 },
  'Inside forward': { sho: 0.45, pac: 0.35, pas: 0.2 },
};

export const OVERALL_WEIGHTS = {
  GK: { gk: 0.85, pas: 0.1, def: 0.05 },
  DF: { def: 0.5, pac: 0.2, pas: 0.2, sho: 0.1 },
  MF: { pas: 0.4, def: 0.2, pac: 0.2, sho: 0.2 },
  FW: { sho: 0.5, pac: 0.3, pas: 0.2 },
};

export function defaultRole(pos) {
  const g = POS_GROUP[pos];
  if (g === 'GK') return 'Goalkeeper';
  if (g === 'DF') return pos === 'RB' || pos === 'LB' ? 'Full-back' : 'Centre-back';
  if (g === 'MF') return pos === 'DM' ? 'Ball-winner' : 'Playmaker';
  return pos === 'ST' ? 'Poacher' : 'Inside forward';
}

export function overallOf(attrs, pos) {
  const w = OVERALL_WEIGHTS[POS_GROUP[pos]] || OVERALL_WEIGHTS.MF;
  let v = 0;
  for (const k in w) v += attrs[k] * w[k];
  return Math.round(v);
}

function roleScore(player, role) {
  const w = ROLE_WEIGHTS[role] || { pas: 1 };
  let v = 0;
  for (const k in w) v += player.attrs[k] * w[k];
  return v / 100; // roughly 0.4..0.9
}

// ── Randomness ───────────────────────────────────────────────────────────
export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(...parts) {
  let h = 2166136261;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= 0x9e3779b9;
  }
  return h >>> 0;
}

export function matchSeed(careerSeed, matchday, index) {
  return hash(careerSeed, 'match', matchday, index);
}

// The seed a match view's ball choreography draws from: a stream of its own,
// so it never shares draws with the simulation's matchSeed.
export function watchSeed(careerSeed, matchday, index) {
  return hash(careerSeed, 'watch', matchday, index);
}

function poisson(rng, lambda) {
  const l = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > l);
  return k - 1;
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

function weighted(rng, items, weightOf) {
  let total = 0;
  for (const it of items) total += Math.max(0.001, weightOf(it));
  let r = rng() * total;
  for (const it of items) {
    r -= Math.max(0.001, weightOf(it));
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

// ── Squads ───────────────────────────────────────────────────────────────
const FIRST_NAMES = ['Tomas', 'Dunn', 'Marco', 'Sam', 'Eli', 'Kofi', 'Lee', 'Theo', 'Jonas', 'Pia', 'Ansel', 'Ruben', 'Ismail', 'Noah', 'Hugo', 'Felix', 'Otto', 'Arun', 'Miles', 'Ivan', 'Kai', 'Luca', 'Nico', 'Owen', 'Reece', 'Silas', 'Tariq', 'Umar', 'Victor', 'Yusuf', 'Ade', 'Bram', 'Cato', 'Dario', 'Emeka', 'Finn', 'Gus', 'Hal', 'Ines', 'Jae', 'Kian', 'Levi', 'Milo', 'Nils', 'Osian', 'Pablo', 'Quinn', 'Rory', 'Sven', 'Teo', 'Anders', 'Beto', 'Cyrus', 'Dane', 'Ewan', 'Femi', 'Gil', 'Hadi', 'Idris', 'Jude'];
const LAST_NAMES = ['Brandt', 'Okafor', 'Voss', 'Ruiz', 'Kerr', 'Mensah', 'Ode', 'Bell', 'Ito', 'Lam', 'Hale', 'Pike', 'Grey', 'Lund', 'Fenn', 'Ash', 'Marsh', 'Tate', 'Rowe', 'Wade', 'Ellis', 'Vaughn', 'Nash', 'Cobb', 'Dean', 'Falk', 'Gorse', 'Hobb', 'Ives', 'Jarr', 'Kemp', 'Lunn', 'Moor', 'Nunn', 'Orr', 'Pace', 'Quay', 'Rest', 'Sand', 'Tarn', 'Ull', 'Veil', 'Wren', 'Yeo', 'Zell', 'Bowen', 'Crane', 'Dove', 'Eade', 'Frost', 'Gill', 'Holt', 'Irwin', 'Jett', 'Kerr', 'Lowe', 'Mays', 'Neal', 'Oakes', 'Pryce'];

const SQUAD_SHAPE = [
  'GK', 'GK',
  'CB', 'CB', 'CB', 'RB', 'LB',
  'CM', 'CM', 'CM', 'DM', 'AM', 'RM', 'LM',
  'ST', 'ST', 'RW', 'LW',
];

// The club's reputation decides where its players' attributes sit, and each
// division down is three points weaker.
function attrRange(rep, division = 1) {
  const centre = 48 + rep * 5.2 - (division - 1) * 3; // rep 1, Division 1 -> 53
  return { lo: centre - 11, hi: centre + 13 };
}

// Five attribute rolls in a fixed order, then the same position adjustments.
// The draw order is part of a seed: changing it changes every squad.
function rollAttrs(rng, pos, lo, hi) {
  const roll = () => Math.round(lo + rng() * (hi - lo));
  const g = POS_GROUP[pos];
  const attrs = {
    pac: roll(), pas: roll(), sho: roll(), def: roll(), gk: roll(),
  };
  if (g === 'GK') { attrs.gk = Math.min(92, attrs.gk + 9); attrs.sho = Math.max(20, attrs.sho - 18); }
  if (g === 'DF') { attrs.def = Math.min(92, attrs.def + 6); attrs.sho = Math.max(20, attrs.sho - 12); }
  if (g === 'FW') { attrs.sho = Math.min(92, attrs.sho + 7); attrs.def = Math.max(20, attrs.def - 10); }
  return attrs;
}

function makePlayer(rng, pos, rep, n, division) {
  const { lo, hi } = attrRange(rep, division);
  const attrs = rollAttrs(rng, pos, lo, hi);
  const overall = overallOf(attrs, pos);
  return {
    id: 'p' + n,
    name: '',
    pos,
    age: 18 + Math.floor(rng() * 16),
    attrs,
    overall,
    fitness: 78 + Math.floor(rng() * 23),
    morale: 55 + Math.floor(rng() * 40),
    injury: 0,
    goals: 0,
    assists: 0,
    apps: 0,
    yellow: 0,
    red: 0,
    captain: false,
  };
}

export function buildSquad(seed, clubIndex, rep, division = 1) {
  const rng = mulberry32(hash(seed, 'squad', clubIndex));
  const used = new Set();
  const players = SQUAD_SHAPE.map((pos, i) => {
    const p = makePlayer(rng, pos, rep, clubIndex * 100 + i, division);
    let name;
    do {
      name = pick(rng, FIRST_NAMES) + ' ' + pick(rng, LAST_NAMES);
    } while (used.has(name));
    used.add(name);
    p.name = name;
    // From the hash, not the squad's rng: one more draw would change every
    // generated squad, name and fixture for a seed.
    p.peak = peakStyleFor(seed, p.id);
    return p;
  });
  // The best outfield player in the middle of the park wears the armband.
  const mids = players.filter((p) => POS_GROUP[p.pos] === 'MF');
  const cap = mids.reduce((a, b) => (b.overall > a.overall ? b : a), mids[0]);
  if (cap) cap.captain = true;
  return players;
}

// ── Fixtures ─────────────────────────────────────────────────────────────
// A double round robin: everyone plays everyone home and away. A division of
// 18 gives 34 matchdays; the ten-club season of a version 1 career gives 18.
export function buildFixtures(seed, clubIds = COASTAL_IDS) {
  const ids = clubIds.slice();
  // Seeded shuffle so a career's league order differs but repeats for a seed.
  const rng = mulberry32(hash(seed, 'fixtures'));
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const n = ids.length;
  const round = [];
  const half = n / 2;
  const fixed = ids[0];
  const rest = ids.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const pairs = [{ home: fixed, away: rest[r] }];
    for (let i = 1; i < half; i++) {
      const a = rest[(r + i) % (n - 1)];
      const b = rest[(r - i + (n - 1) * 2) % (n - 1)];
      pairs.push(r % 2 === 0 ? { home: a, away: b } : { home: b, away: a });
    }
    round.push(pairs);
  }
  const second = round.map((pairs) => pairs.map((p) => ({ home: p.away, away: p.home })));
  return round.concat(second);
}

// ── Team selection ───────────────────────────────────────────────────────
export function familiarity(pos, slotPos) {
  if (pos === slotPos) return 1;
  const a = POS_GROUP[pos];
  const b = POS_GROUP[slotPos];
  if (!a || !b) return 0.6;
  if (a === b) return 0.9;
  if (a === 'GK' || b === 'GK') return 0.35;
  const dist = Math.abs(['DF', 'MF', 'FW'].indexOf(a) - ['DF', 'MF', 'FW'].indexOf(b));
  return dist === 1 ? 0.7 : 0.55;
}

export function playerValue(player, slotPos, role, tactics) {
  const fam = familiarity(player.pos, slotPos);
  const fit = 0.72 + 0.28 * (player.fitness / 100);
  const mor = 0.95 + 0.1 * (player.morale / 100);
  const rs = role ? roleScore(player, role) : 0.7;
  const roleMul = role ? 0.96 + 0.09 * rs : 1;
  return player.overall * fam * fit * mor * roleMul;
}

// Fill the formation's slots from a pool: players whose own position is in
// the slot's group first, then anyone left, each at their best fit.
function assignSlots(pool, slots, roles) {
  const value = (p, slot) => playerValue(p, slot.pos, roles && roles[p.id]);
  const chosen = new Array(slots.length).fill(null);
  const poolLeft = pool.slice();
  const gkPool = poolLeft.filter((p) => POS_GROUP[p.pos] === 'GK');
  const gk = gkPool.length ? gkPool.reduce((a, b) => (value(b, slots[0]) > value(a, slots[0]) ? b : a)) : null;
  if (gk) {
    chosen[0] = gk;
    poolLeft.splice(poolLeft.indexOf(gk), 1);
  }
  const order = slots.map((_, i) => i).filter((i) => i > 0);
  for (const i of order) {
    const group = POS_GROUP[slots[i].pos];
    const cands = poolLeft.filter((p) => POS_GROUP[p.pos] === group);
    if (!cands.length) continue;
    const best = cands.reduce((a, b) => (value(b, slots[i]) > value(a, slots[i]) ? b : a));
    chosen[i] = best;
    poolLeft.splice(poolLeft.indexOf(best), 1);
  }
  for (const i of order) {
    if (chosen[i] || !poolLeft.length) continue;
    const best = poolLeft.reduce((a, b) => (value(b, slots[i]) > value(a, slots[i]) ? b : a));
    chosen[i] = best;
    poolLeft.splice(poolLeft.indexOf(best), 1);
  }
  if (!chosen[0] && poolLeft.length) chosen[0] = poolLeft[0];
  return chosen;
}

export function autoLineup(players, formation, roles, excludeInjured = true) {
  const slots = FORMATIONS[formation].slots;
  const available = players.filter((p) => !excludeInjured || p.injury <= 0);
  const pool = available.length >= 11 ? available : players.slice();
  return assignSlots(pool, slots, roles).filter(Boolean).map((p) => p.id);
}

// Put a set of eleven players into a formation's slots, keeping the best fit.
export function arrangeLineup(players, lineup, formation) {
  const slots = FORMATIONS[formation].slots;
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const pool = lineup.map((id) => byId[id]).filter(Boolean);
  if (pool.length !== slots.length) return lineup.slice(0, slots.length);
  return assignSlots(pool, slots, {}).filter(Boolean).map((p) => p.id);
}

export function fixLineup(state) {
  const squad = state.squads[state.clubId];
  const byId = Object.fromEntries(squad.map((p) => [p.id, p]));
  const slots = FORMATIONS[state.tactics.formation].slots;
  const used = new Set();
  let rebuilt = false;
  const lineup = (state.lineup || []).slice(0, 11).map((id, i) => {
    const p = byId[id];
    const slot = slots[i] || slots[0];
    if (p && p.injury <= 0 && !used.has(id)) {
      used.add(id);
      return id;
    }
    // Replace an injured or missing starter with the best fit still free.
    const candidates = squad
      .filter((q) => q.injury <= 0 && !used.has(q.id) && (slot.pos !== 'GK' || POS_GROUP[q.pos] === 'GK'))
      .sort((a, b) => playerValue(b, slot.pos, state.roles[b.id]) - playerValue(a, slot.pos, state.roles[a.id]));
    const pick = candidates[0];
    if (pick) { used.add(pick.id); rebuilt = true; return pick.id; }
    return id;
  });
  if (lineup.length < 11 || POS_GROUP[(byId[lineup[0]] || {}).pos] !== 'GK') {
    state.lineup = autoLineup(squad, state.tactics.formation, state.roles);
    return state.lineup;
  }
  if (rebuilt) state.lineup = lineup;
  return state.lineup;
}

// A career saved by an earlier version of the app, made ready for today's club
// screen: only what is missing or unusable is filled in, from the career's own
// squad. A valid career comes back equal; null means it cannot be shown. It
// never touches the version, the divisions, the season, the seed, the results
// or the squads.
export function repairCareer(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  const club = CLUB_BY_ID[state.clubId];
  if (!club) return null;
  if (!state.squads || !Array.isArray(state.squads[state.clubId])) return null;
  if (!Array.isArray(state.fixtures) || !Array.isArray(state.results)) return null;
  // A three-tier career must know its group, and be in it.
  if (state.version >= 3) {
    const group = Array.isArray(state.groups) ? state.groups[state.groupIndex] : null;
    if (!group || !Array.isArray(group.clubIds) || !group.clubIds.includes(state.clubId)) return null;
  }

  const squad = state.squads[state.clubId];
  const roles = state.roles && typeof state.roles === 'object' && !Array.isArray(state.roles)
    ? state.roles : {};
  const given = state.tactics && typeof state.tactics === 'object' ? state.tactics : {};
  const formation = FORMATION_NAMES.includes(given.formation) ? given.formation : club.formation;
  const tactics = {
    ...given,
    formation,
    mentality: MENTALITY_NAMES.includes(given.mentality) ? given.mentality : 'Balanced',
    pressing: PRESSING_NAMES.includes(given.pressing) ? given.pressing : 'Medium',
  };

  const ids = new Set(squad.map((p) => p && p.id));
  const givenLineup = state.lineup;
  const lineupOk = Array.isArray(givenLineup) && givenLineup.length === 11
    && new Set(givenLineup).size === 11 && givenLineup.every((id) => ids.has(id));
  const lineup = lineupOk ? givenLineup : autoLineup(squad, formation, roles);

  const total = state.fixtures.length;
  let matchday = state.matchday;
  if (!Number.isInteger(matchday) || matchday < 0 || matchday > total) {
    matchday = Number.isInteger(matchday) ? Math.min(Math.max(matchday, 0), total) : 0;
  }

  const report = state.lastReport;
  const reportOk = !!report && typeof report === 'object'
    && report.home && report.home.id
    && report.away && report.away.id
    && report.stats && typeof report.stats === 'object'
    && report.ratings && typeof report.ratings === 'object'
    && Array.isArray(report.moments);

  const out = {
    ...state,
    tactics,
    roles,
    lineup,
    matchday,
    // Today's match times, kept by the server. A career saved before this
    // field existed counts as none played today. The zone is the page's to
    // send: the engine cannot know the manager's clock.
    plays: Array.isArray(state.plays) ? state.plays.filter(isIsoString).slice(-MATCHES_PER_DAY) : [],
    finished: Boolean(state.finished),
    // The server owns the schedule; a career saved before it existed gets one
    // stamped by the server, not invented here.
    lastReport: reportOk ? report : null,
    // A career saved before Club credits, fans or sponsors existed gets them
    // now: credits 0, the division's starting fans and this season's sponsor.
    ...moneyFields(state),
    // A career saved before facilities existed has every one at level 1.
    facilities: facilityLevels(state),
    // Staff, and the academy's prospects, for a career saved before them.
    staff: staffFields(state),
    youth: youthFields(state),
  };
  if (typeof state.nextMatchAt === 'string' && !Number.isNaN(Date.parse(state.nextMatchAt))) {
    out.nextMatchAt = state.nextMatchAt;
  } else if (state.nextMatchAt === null) {
    out.nextMatchAt = null;
  } else {
    delete out.nextMatchAt;
  }
  return out;
}

// ── Validation ───────────────────────────────────────────────────────────
export function validateLineup(state) {
  const squad = state.squads[state.clubId];
  const byId = Object.fromEntries(squad.map((p) => [p.id, p]));
  if (!state.lineup || state.lineup.length !== 11) {
    return { ok: false, message: 'Pick eleven starters before you play.' };
  }
  if (new Set(state.lineup).size !== 11) {
    return { ok: false, message: 'The same player is in the lineup twice. Pick eleven different players.' };
  }
  for (const id of state.lineup) {
    if (!byId[id]) return { ok: false, message: 'A starter is no longer in your squad. Pick eleven starters again.' };
  }
  const injured = state.lineup.filter((id) => byId[id].injury > 0);
  if (injured.length) {
    const names = injured.map((id) => byId[id].name);
    return { ok: false, message: 'Injured: ' + names.join(', ') + '. Bring a fit player on in their place.' };
  }
  const slots = FORMATIONS[state.tactics.formation].slots;
  const gkId = state.lineup[0];
  if (POS_GROUP[byId[gkId].pos] !== 'GK') {
    return { ok: false, message: 'Your eleven needs a goalkeeper in goal. Pick one in the goalkeeper slot.' };
  }
  const otherGk = state.lineup.filter((id) => POS_GROUP[byId[id].pos] === 'GK' && id !== gkId);
  if (otherGk.length && slots[0].pos !== 'GK') {
    return { ok: false, message: 'Your eleven needs a goalkeeper in goal.' };
  }
  return { ok: true, message: '' };
}

// ── Club form, table, fixtures ───────────────────────────────────────────
export function allResults(state) {
  return state.results || [];
}

// The 18 clubs of the manager's group. A version 2 career keeps the flat
// divisions it was saved in; a version 1 career is the old ten-club season.
export function divisionClubIds(state) {
  if (state && state.version >= 3 && Array.isArray(state.groups)
    && state.groups[state.groupIndex] && Array.isArray(state.groups[state.groupIndex].clubIds)) {
    return state.groups[state.groupIndex].clubIds;
  }
  if (state && state.version >= 2 && Array.isArray(state.divisions) && state.divisions[state.division - 1]) {
    return state.divisions[state.division - 1];
  }
  return COASTAL_IDS;
}

// What a career's place is called: "Division 2 Group B", "Division 1", or the
// old ten-club league's name.
export function placeName(state) {
  if (state && state.version >= 3 && Array.isArray(state.groups) && state.groups[state.groupIndex]) {
    return groupName(state.division, state.group);
  }
  if (state && state.version >= 2 && Array.isArray(state.divisions)) return 'Division ' + state.division;
  return LEAGUE_NAME;
}

// The seed a season's matches and squads come from. Season 1 is the career
// seed itself, so a version 1 career's matches stay exactly as they were.
export function seasonSeed(state) {
  const season = state.season || 1;
  return season <= 1 ? state.seed : hash(state.seed, 'season', season);
}

export function leagueTable(state) {
  const rows = {};
  for (const id of divisionClubIds(state)) {
    const c = CLUB_BY_ID[id];
    rows[c.id] = { id: c.id, name: c.name, short: c.short, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 };
  }
  for (const r of state.results) {
    const h = rows[r.home.id];
    const a = rows[r.away.id];
    if (!h || !a) continue;
    h.played++; a.played++;
    h.gf += r.homeGoals; h.ga += r.awayGoals;
    a.gf += r.awayGoals; a.ga += r.homeGoals;
    if (r.homeGoals > r.awayGoals) { h.won++; a.lost++; h.points += 3; }
    else if (r.homeGoals < r.awayGoals) { a.won++; h.lost++; a.points += 3; }
    else { h.drawn++; a.drawn++; h.points++; a.points++; }
  }
  const list = Object.values(rows);
  for (const r of list) r.gd = r.gf - r.ga;
  list.sort((x, y) => y.points - x.points || y.gd - x.gd || y.gf - x.gf || x.name.localeCompare(y.name));
  list.forEach((r, i) => { r.rank = i + 1; });
  return list;
}

export function formOf(state, clubId, count = 5) {
  const played = [];
  for (const r of state.results) {
    if (r.home.id === clubId) played.push(r.homeGoals > r.awayGoals ? 'W' : r.homeGoals < r.awayGoals ? 'L' : 'D');
    else if (r.away.id === clubId) played.push(r.awayGoals > r.homeGoals ? 'W' : r.awayGoals < r.homeGoals ? 'L' : 'D');
  }
  return played.slice(-count);
}

export function nextFixture(state) {
  if (state.matchday >= state.fixtures.length) return null;
  const fixtures = state.fixtures[state.matchday];
  for (let i = 0; i < fixtures.length; i++) {
    const f = fixtures[i];
    if (f.home === state.clubId || f.away === state.clubId) {
      const home = f.home === state.clubId;
      return {
        index: i,
        home: f.home,
        away: f.away,
        venue: home ? 'Home' : 'Away',
        opponentId: home ? f.away : f.home,
        matchday: state.matchday + 1,
      };
    }
  }
  return null;
}

// `size` is the number of clubs in the division the rank is in.
export function objectiveMet(rank, objective, size = DIVISION_SIZE) {
  if (objective === 'Win the league') return rank === 1;
  if (objective === 'Finish in the top half') return rank <= Math.ceil(size / 2);
  if (objective === 'Avoid finishing bottom') return rank < size;
  return rank <= Math.ceil(size / 2) - 1;
}

// ── Preparing a side for the simulation ──────────────────────────────────
function teamFor(state, clubId) {
  const club = CLUB_BY_ID[clubId];
  const squad = state.squads[clubId];
  const isUser = clubId === state.clubId;
  const tactics = isUser ? state.tactics : { formation: club.formation, mentality: 'Balanced', pressing: 'Medium' };
  const roles = isUser ? state.roles || {} : {};
  const lineup = isUser ? state.lineup : autoLineup(squad, tactics.formation, roles);
  return { club, squad, lineup, tactics, roles };
}

// The two sides of one played fixture, read-only, for the match view. The
// same teams teamFor builds for the simulation, with each lineup guaranteed
// usable (11 unique ids in the squad) so a saved one that has drifted can
// never crash the view. Returns null when the matchday is out of range or
// the club has no fixture in it.
export function matchSides(state, md) {
  if (!Number.isInteger(md) || md < 0 || md >= state.fixtures.length) return null;
  const fixtures = state.fixtures[md];
  const index = fixtures.findIndex((f) => f.home === state.clubId || f.away === state.clubId);
  if (index < 0) return null;
  const f = fixtures[index];
  const usable = (team) => {
    const ids = new Set(team.squad.map((p) => p.id));
    const ok = Array.isArray(team.lineup) && team.lineup.length === 11
      && new Set(team.lineup).size === 11
      && team.lineup.every((id) => ids.has(id));
    return ok ? team : { ...team, lineup: autoLineup(team.squad, team.tactics.formation, team.roles) };
  };
  return {
    index,
    home: usable(teamFor(state, f.home)),
    away: usable(teamFor(state, f.away)),
  };
}

function sidePower(team) {
  const byId = Object.fromEntries(team.squad.map((p) => [p.id, p]));
  const slots = FORMATIONS[team.tactics.formation].slots;
  let att = 0; let mid = 0; let def = 0;
  const starters = [];
  team.lineup.forEach((id, i) => {
    const p = byId[id];
    const slot = slots[i] || slots[slots.length - 1];
    if (!p) return;
    const role = team.roles[id];
    const v = playerValue(p, slot.pos, role);
    starters.push({ player: p, slot, v });
    const g = POS_GROUP[slot.pos];
    if (g === 'GK') def += v * 1.4;
    else if (g === 'DF') def += v;
    else if (g === 'MF') mid += v;
    else att += v;
  });
  const f = FORMATIONS[team.tactics.formation];
  const m = MENTALITIES[team.tactics.mentality] || MENTALITIES.Balanced;
  const pr = PRESSING[team.tactics.pressing] || PRESSING.Medium;
  att = (att / 3) * f.att * m.att;
  mid = (mid / 3.4) * f.mid * m.mid * pr.mid;
  def = (def / 5.4) * f.def * m.def;
  return { att, mid, def, starters, press: pr, mentality: m };
}

// ── The match ────────────────────────────────────────────────────────────
// home/away: { club, squad, lineup, tactics, roles }. Returns a report and the
// effects on each player (fitness, injuries, goals, cards) for the caller to
// apply to the saved state.
export function simulateMatch(home, away, seed) {
  const rng = mulberry32(seed >>> 0);
  const h = sidePower(home);
  const a = sidePower(away);
  const homeAdv = 1.06;

  const hAtt = h.att * homeAdv;
  const aAtt = a.att;
  const hDef = h.def * 1.02;

  const hLambda = Math.max(0.22, Math.min(4.6, 1.38 * Math.pow(hAtt / Math.max(1, a.def), 1.7)));
  const aLambda = Math.max(0.18, Math.min(4.2, 1.26 * Math.pow(aAtt / Math.max(1, hDef), 1.7)));

  const homeGoals = Math.min(7, poisson(rng, hLambda));
  const awayGoals = Math.min(7, poisson(rng, aLambda));

  // Possession from the midfield battle.
  const hMid = h.mid + hAtt * 0.25;
  const aMid = a.mid + aAtt * 0.25;
  let share = hMid / (hMid + aMid);
  share = Math.max(0.3, Math.min(0.7, share + (rng() - 0.5) * 0.06));
  const poss = [Math.round(share * 100), 100 - Math.round(share * 100)];

  const sides = {
    home: { team: home, power: h, goals: homeGoals, att: hAtt, def: a.def, label: home.club.name },
    away: { team: away, power: a, goals: awayGoals, att: aAtt, def: hDef, label: away.club.name },
  };

  // Who is on the pitch for each side, and who is on the bench.
  for (const key of ['home', 'away']) {
    const s = sides[key];
    const byId = Object.fromEntries(s.team.squad.map((p) => [p.id, p]));
    s.onPitch = s.team.lineup.map((id, i) => ({
      player: byId[id],
      slot: FORMATIONS[s.team.tactics.formation].slots[i],
      minutes: 0,
      on: 0,
      off: null,
    })).filter((x) => x.player);
    const ids = new Set(s.team.lineup);
    s.bench = s.team.squad.filter((p) => !ids.has(p.id) && p.injury <= 0);
    s.subs = 0;
    s.effects = {};
    s.goalsScored = [];
    s.cards = { yellow: 0, red: 0 };
    s.fouls = 0;
  }

  const moments = [];

  function ensureEffect(s, player) {
    if (!s.effects[player.id]) {
      s.effects[player.id] = { goals: 0, assists: 0, yellow: 0, red: 0, injury: 0, minutes: 0, fitness: 0, started: false, subOn: null, subOff: null };
    }
    return s.effects[player.id];
  }
  for (const key of ['home', 'away']) {
    const s = sides[key];
    for (const entry of s.onPitch) {
      const e = ensureEffect(s, entry.player);
      e.started = true;
    }
  }

  // Goal times, then everything else.
  const goalEvents = [];
  for (const key of ['home', 'away']) {
    for (let i = 0; i < sides[key].goals; i++) {
      goalEvents.push({ minute: 2 + Math.floor(rng() * 88), side: key });
    }
  }
  goalEvents.sort((x, y) => x.minute - y.minute);

  // Shots: every goal is a shot on target, plus the misses.
  const shots = {};
  const onTarget = {};
  for (const key of ['home', 'away']) {
    const g = sides[key].goals;
    const attempts = Math.min(30, g + poisson(rng, key === 'home' ? 9.6 : 8.4));
    const accurate = Math.min(attempts, g + poisson(rng, key === 'home' ? 3.6 : 3.0));
    shots[key] = attempts;
    onTarget[key] = accurate;
  }

  // Injuries and substitutions, in the last third of the match.
  for (const key of ['home', 'away']) {
    const s = sides[key];
    const injuryRng = rng;
    if (injuryRng() < 0.3) {
      const healthy = s.onPitch.filter((e) => !e.off);
      const injuredEntry = healthy.length ? pick(rng, healthy) : null;
      if (injuredEntry) {
        const se = ensureEffect(s, injuredEntry.player);
        const weeks = 1 + Math.floor(rng() * 3);
        se.injury = weeks;
        const minute = 10 + Math.floor(rng() * 70);
        injuredEntry.off = minute;
        se.subOff = minute;
        moments.push({ minute, type: 'injury', side: key, playerId: injuredEntry.player.id, playerName: injuredEntry.player.name, detail: 'Injured, out for ' + weeks + (weeks === 1 ? ' match' : ' matches'), teamName: s.team.club.name });
        // An injured player comes off straight away when there is a bench.
        if (s.subs < 3 && s.bench.length) {
          let best = null;
          let bestV = -1;
          for (const p of s.bench) {
            const v = playerValue(p, injuredEntry.slot.pos, s.team.roles[p.id]);
            if (v > bestV) { bestV = v; best = p; }
          }
          if (best) {
            s.bench = s.bench.filter((p) => p !== best);
            s.onPitch.push({ player: best, slot: injuredEntry.slot, minutes: 0, on: minute, off: null });
            const seIn = ensureEffect(s, best);
            seIn.subOn = minute;
            s.subs++;
            moments.push({ minute, type: 'sub', side: key, playerId: best.id, playerName: best.name, playerOutName: injuredEntry.player.name, detail: 'Injured, replaced', teamName: s.team.club.name });
          }
        }
      }
    }
    // Up to three substitutions, made when a starter is tiring or injured.
    const subMinutes = [58, 67, 76, 84];
    for (const m of subMinutes) {
      if (s.subs >= 3) break;
      if (rng() > 0.62) continue;
      const tired = s.onPitch.filter((e) => !e.off && e.player.fitness - m * 0.28 * s.power.press.stamina < 52);
      const out = tired.sort((x, y) => x.player.fitness - y.player.fitness)[0];
      if (!out) continue;
      // A bench player who fits the vacated slot best.
      let best = null;
      let bestV = -1;
      for (const p of s.bench) {
        if (s.onPitch.some((e) => e.player.id === p.id)) continue;
        const v = playerValue(p, out.slot.pos, s.team.roles[p.id]);
        if (v > bestV) { bestV = v; best = p; }
      }
      if (!best) continue;
      s.bench = s.bench.filter((p) => p !== best);
      const seOut = ensureEffect(s, out.player);
      seOut.subOff = m;
      out.off = m;
      const onEntry = { player: best, slot: out.slot, minutes: 0, on: m, off: null };
      s.onPitch.push(onEntry);
      const seIn = ensureEffect(s, best);
      seIn.subOn = m;
      s.subs++;
      const outFit = Math.max(12, Math.round(out.player.fitness - m * 0.28 * s.power.press.stamina));
      moments.push({
        minute: m,
        type: 'sub',
        side: key,
        playerId: best.id,
        playerName: best.name,
        playerOutName: out.player.name,
        detail: out.player.name + ' tired, fitness ' + outFit + '%',
        teamName: s.team.club.name,
      });
    }
  }

  // Fouls and cards.
  for (const key of ['home', 'away']) {
    const s = sides[key];
    const lambda = 10.4 * s.power.press.foul;
    const fouls = Math.min(26, poisson(rng, lambda));
    s.fouls = fouls;
    for (let i = 0; i < fouls; i++) {
      const chance = 0.115 * (key === 'away' ? 1.06 : 1);
      if (rng() < chance) {
        const cardMinute = 5 + Math.floor(rng() * 85);
        const candidates = s.onPitch.filter((e) => e.on <= cardMinute && (!e.off || e.off > cardMinute) && (POS_GROUP[e.slot.pos] !== 'GK' || rng() < 0.1));
        const offender = weighted(rng, candidates, (e) => 0.5 + e.player.attrs.def / 150);
        const se = ensureEffect(s, offender.player);
        const straight = rng() < 0.004;
        if (straight) {
          se.red++;
          s.cards.red++;
          moments.push({ minute: cardMinute, type: 'red', side: key, playerId: offender.player.id, playerName: offender.player.name, detail: 'Straight red card', teamName: s.team.club.name });
        } else {
          se.yellow++;
          s.cards.yellow++;
          moments.push({ minute: cardMinute, type: 'yellow', side: key, playerId: offender.player.id, playerName: offender.player.name, detail: 'Foul on ' + pick(rng, sides[key === 'home' ? 'away' : 'home'].onPitch).player.name, teamName: s.team.club.name });
        }
      }
    }
    // A second yellow is a red.
  }
  // Any player with two yellows is off.
  for (const key of ['home', 'away']) {
    const s = sides[key];
    for (const id in s.effects) {
      const e = s.effects[id];
      if (e.yellow >= 2 && e.red === 0) {
        e.red = 1;
        s.cards.red++;
        const entry = s.onPitch.find((x) => x.player.id === id);
        if (entry) entry.off = 80;
        const yms = moments.filter((m) => m.type === 'yellow' && m.playerId === id);
        const lastY = yms[yms.length - 1];
        moments.push({ minute: lastY ? lastY.minute : 80, type: 'red', side: key, playerId: id, playerName: entry ? entry.player.name : '', detail: 'Second yellow card', teamName: s.team.club.name });
      }
      if (e.red) {
        const entry = s.onPitch.find((x) => x.player.id === id);
        if (entry) entry.off = 80;
      }
    }
  }

  // Goals and their makers.
  for (const ev of goalEvents) {
    const s = sides[ev.side];
    const outfield = s.onPitch.filter((e) => e.on <= ev.minute && (!e.off || e.off > ev.minute) && POS_GROUP[e.slot.pos] !== 'GK');
    const scorer = weighted(rng, outfield, (e) => {
      const p = e.player;
      const g = POS_GROUP[e.slot.pos];
      const posW = g === 'FW' ? 3 : g === 'MF' ? 1.2 : 0.35;
      return posW * (0.5 + p.attrs.sho / 100) * (0.8 + e.player.fitness / 250);
    });
    const mates = outfield.filter((e) => e !== scorer);
    const hasAssist = rng() < 0.74;
    const assist = hasAssist ? weighted(rng, mates, (e) => 0.4 + e.player.attrs.pas / 100) : null;
    const se = ensureEffect(s, scorer.player);
    se.goals++;
    if (assist) ensureEffect(s, assist.player).assists++;
    moments.push({
      minute: ev.minute,
      type: 'goal',
      side: ev.side,
      playerId: scorer.player.id,
      playerName: scorer.player.name,
      assistName: assist ? assist.player.name : null,
      teamName: s.team.club.name,
    });
  }

  moments.sort((x, y) => x.minute - y.minute || (x.type === 'goal' ? -1 : 0));

  // Minutes played and fitness drain.
  for (const key of ['home', 'away']) {
    const s = sides[key];
    for (const id in s.effects) {
      const e = s.effects[id];
      const entry = s.onPitch.find((x) => x.player.id === id);
      const start = e.started ? 0 : (e.subOn || 0);
      const end = e.subOff || (e.red ? 70 : 90);
      e.minutes = Math.max(0, end - start);
    }
  }

  // Ratings for the user's side, and stats for the report.
  const ratingsFor = (s) => {
    const out = {};
    const conceded = s === sides.home ? sides.away.goals : sides.home.goals;
    const result = s.goals - conceded;
    for (const id in s.effects) {
      const e = s.effects[id];
      if (!e.minutes) continue;
      const entry = s.onPitch.find((x) => x.player.id === id);
      const pos = entry ? POS_GROUP[entry.slot.pos] : 'MF';
      let r = 6.1 + e.goals * 1.15 + e.assists * 0.65;
      r += result > 0 ? 0.3 : result < 0 ? -0.25 : 0;
      if (pos === 'GK' || pos === 'DF') r += conceded === 0 ? 0.55 : 0;
      if (pos === 'GK') r += 0.15;
      r -= e.yellow * 0.3 + e.red * 1.4;
      if (e.injury) r -= 0.3;
      out[id] = Math.round(Math.max(3, Math.min(9.8, r)) * 10) / 10;
    }
    return out;
  };

  const report = {
    matchday: null,
    home: { id: home.club.id, name: home.club.name, short: home.club.short, color: home.club.color },
    away: { id: away.club.id, name: away.club.name, short: away.club.short, color: away.club.color },
    homeGoals,
    awayGoals,
    moments,
    stats: {
      possession: poss,
      shots: [shots.home, shots.away],
      onTarget: [onTarget.home, onTarget.away],
      passes: [Math.round(poss[0] * 5.6), Math.round(poss[1] * 5.4)],
      fouls: [sides.home.fouls, sides.away.fouls],
      yellow: [sides.home.cards.yellow, sides.away.cards.yellow],
      red: [sides.home.cards.red, sides.away.cards.red],
    },
    ratings: { home: ratingsFor(sides.home), away: ratingsFor(sides.away) },
    effects: { home: sides.home.effects, away: sides.away.effects },
  };
  return report;
}

// ── Applying a match to the career ───────────────────────────────────────
export function applyReport(state, report) {
  const sides = { home: report.home.id, away: report.away.id };
  for (const key of ['home', 'away']) {
    const clubId = sides[key];
    const squad = state.squads[clubId];
    const byId = Object.fromEntries(squad.map((p) => [p.id, p]));
    const effects = report.effects[key];
    const gf = key === 'home' ? report.homeGoals : report.awayGoals;
    const ga = key === 'home' ? report.awayGoals : report.homeGoals;
    const result = gf > ga ? 1 : gf < ga ? -1 : 0;
    const tacticalPress = key === 'home' || clubId === state.clubId
      ? (PRESSING[(clubId === state.clubId ? state.tactics : { pressing: 'Medium' }).pressing] || PRESSING.Medium).stamina
      : 1;
    for (const p of squad) {
      const e = effects[p.id];
      if (e) {
        p.apps++;
        p.goals += e.goals;
        p.assists += e.assists;
        p.yellow += e.yellow;
        p.red += e.red;
        p.fitness = Math.round(Math.max(30, Math.min(100, p.fitness - e.minutes * 0.19 * tacticalPress + 15)));
        if (e.injury) p.injury = Math.max(p.injury, e.injury);
        p.morale = Math.round(Math.max(20, Math.min(100, p.morale + (result > 0 ? 5 : result < 0 ? -5 : 1))));
        p.lastRating = report.ratings[key][p.id] || null;
        p.lastMinutes = e.minutes;
      } else {
        // Rested players recover.
        p.fitness = Math.round(Math.min(100, p.fitness + 15));
        if (p.injury > 0) p.injury = Math.max(0, p.injury - 1);
        p.morale = Math.round(Math.min(100, Math.max(20, p.morale + 1)));
      }
    }
  }
  // Keep the user's eleven fit where injuries took a starter out.
  if (state.clubId === report.home.id || state.clubId === report.away.id) fixLineup(state);
}

export function playMatchday(state) {
  const md = state.matchday;
  if (md >= state.fixtures.length) return [];
  const reports = [];
  state.fixtures[md].forEach((f, i) => {
    const home = teamFor(state, f.home);
    const away = teamFor(state, f.away);
    const report = simulateMatch(home, away, matchSeed(seasonSeed(state), md, i));
    report.matchday = md + 1;
    report.fixtureIndex = i;
    reports.push(report);
  });
  for (const report of reports) applyReport(state, report);
  for (const r of reports) {
    state.results.push({
      matchday: r.matchday,
      home: r.home,
      away: r.away,
      homeGoals: r.homeGoals,
      awayGoals: r.awayGoals,
    });
  }
  const own = reports.find((r) => r.home.id === state.clubId || r.away.id === state.clubId) || null;
  state.lastReport = own;
  // Only the manager's own fixture earns or pays Club credits, from the
  // manager's side: the result, the home gate and what the home crowd spends
  // at the shop, food stand and hotel, less ground upkeep, maintenance, player
  // wages and staff wages, each paid only as far as the balance reaches.
  if (own) {
    const atHome = own.home.id === state.clubId;
    const goalsFor = atHome ? own.homeGoals : own.awayGoals;
    const goalsAgainst = atHome ? own.awayGoals : own.homeGoals;
    const tier = clubTier(state);
    const fanCap = FAN_CAP[tier] || FAN_CAP[3];
    const m = moneyFields(state);
    const result = creditsForResult(goalsFor, goalsAgainst);
    const seats = stadiumSeats(state);
    const attendance = atHome ? homeCrowd(state, m.fans, fanCap).attendance : 0;
    const gate = attendance * TICKET_PRICE;
    const sales = matchdaySales(state, attendance);
    const levels = facilityLevels(state);
    let left = m.credits + result + gate + sales.shop + sales.food + sales.hotel;
    const pay = (due) => { const paid = Math.min(due, left); left -= paid; return paid; };
    const upkeep = pay(GROUND_UPKEEP);
    const maintenanceDueNow = maintenanceDue(state);
    const maintenance = pay(maintenanceDueNow);
    const wagesDue = wageBill(state);
    const wages = pay(wagesDue);
    const staffDue = staffWagesDue(state);
    const staffWages = pay(staffDue);
    state.credits = left;
    state.fans = fanChange(m.fans, goalsFor, goalsAgainst, fanCap);
    state.sponsor = m.sponsor;
    state.lastSponsor = m.lastSponsor;
    state.finance = {
      ...m.finance,
      gate: m.finance.gate + gate,
      upkeep: m.finance.upkeep + upkeep,
      maintenance: m.finance.maintenance + maintenance,
      wages: m.finance.wages + wages,
      staffWages: m.finance.staffWages + staffWages,
      shop: m.finance.shop + sales.shop,
      food: m.finance.food + sales.food,
      hotel: m.finance.hotel + sales.hotel,
      homeGames: m.finance.homeGames + (atHome ? 1 : 0),
    };
    own.finance = {
      venue: atHome ? 'Home' : 'Away',
      result: goalsFor > goalsAgainst ? 'win' : goalsFor < goalsAgainst ? 'loss' : 'draw',
      attendance,
      price: TICKET_PRICE,
      gate,
      seats,
      fanCap,
      shop: sales.shop,
      food: sales.food,
      hotel: sales.hotel,
      levels: { shop: levels.shop, food: levels.food, hotel: levels.hotel },
      salesRates: {
        shop: MATCHDAY_SALES.shop[levels.shop - 1],
        food: MATCHDAY_SALES.food[levels.food - 1],
        hotel: MATCHDAY_SALES.hotel[levels.hotel - 1],
      },
      upkeep,
      upkeepDue: GROUND_UPKEEP,
      maintenance,
      maintenanceDue: maintenanceDueNow,
      wages,
      wagesDue,
      staffWages,
      staffDue,
      net: result + gate + sales.shop + sales.food + sales.hotel
        - upkeep - maintenance - wages - staffWages,
      balanceAfter: state.credits,
      fansBefore: m.fans,
      fansAfter: state.fans,
    };
    // The Finance tab's matchday history: this matchday's Club credits in and
    // out, newest first, up to the last ten of the season.
    state.financeHistory = [{
      season: state.season || 1,
      matchday: md + 1,
      venue: atHome ? 'Home' : 'Away',
      opponentId: atHome ? own.away.id : own.home.id,
      income: { result, gate, shop: sales.shop, food: sales.food, hotel: sales.hotel },
      expenses: { upkeep, maintenance, wages, staffWages },
      net: own.finance.net,
      balanceAfter: state.credits,
    }, ...m.financeHistory].slice(0, FINANCE_HISTORY_MAX);
    // The academy takes in young players after every matchday.
    academyIntake(state, md + 1);
  }
  state.matchday = md + 1;
  state.finished = state.matchday >= state.fixtures.length;
  return reports;
}

// ── The match schedule ───────────────────────────────────────────────────
// Four matchdays a day, every six hours, open on the manager's own clock. The
// server plays every slot that has passed since the career's nextMatchAt, so
// no button is pressed. Times are wall-clock times in the career's saved IANA
// zone, so 6 am stays 6 am through a daylight-saving change. Nothing here
// reads the clock itself: `now` and `zone` are arguments.
export const MATCH_SLOTS = [0, 6, 12, 18];
export const MATCHES_PER_DAY = 4;

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

function isIsoString(value) {
  return typeof value === 'string' && ISO_INSTANT.test(value) && !Number.isNaN(Date.parse(value));
}

export function validTimeZone(zone) {
  if (typeof zone !== 'string' || !zone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch (_) {
    return false;
  }
}

// The wall clock in `zone`: the local day as YYYY-MM-DD, and the hour and
// minute (h23, so midnight is 0). An unusable zone reads as UTC.
export function localClock(date, zone) {
  const tz = validTimeZone(zone) ? zone : 'UTC';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);
  const get = (type) => (parts.find((p) => p.type === type) || {}).value;
  return {
    day: get('year') + '-' + get('month') + '-' + get('day'),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
  };
}

// '12 am', '6 am', '12 pm', '6 pm'.
export function slotLabel(hour) {
  if (hour === 0) return '12 am';
  if (hour < 12) return hour + ' am';
  if (hour === 12) return '12 pm';
  return (hour - 12) + ' pm';
}

// How far `zone` is ahead of UTC at `date`, in milliseconds.
function zoneOffset(date, zone) {
  const tz = validTimeZone(zone) ? zone : 'UTC';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type) => Number((parts.find((p) => p.type === type) || {}).value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

// A wall-clock time on a local day, as the UTC instant it happens at. The
// offset is looked up at that instant, so a daylight-saving change is kept.
function wallClock(day, hour, zone) {
  const [y, m, d] = day.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d, hour, 0, 0);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const next = target - zoneOffset(new Date(guess), zone);
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess);
}

function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.getUTCFullYear() + '-' + String(t.getUTCMonth() + 1).padStart(2, '0') + '-' + String(t.getUTCDate()).padStart(2, '0');
}

function slotOnDay(day, zone) {
  return MATCH_SLOTS.map((hour) => wallClock(day, hour, zone));
}

// The first kick-off strictly after `instant`.
export function slotAfter(instant, zone) {
  const at = instant instanceof Date ? instant : new Date(instant);
  const day = localClock(at, zone).day;
  for (const slot of slotOnDay(day, zone)) if (slot.getTime() > at.getTime()) return slot;
  return slotOnDay(addDays(day, 1), zone)[0];
}

// 12 am local on `now`'s local day.
export function firstSlotOfDay(now, zone) {
  const at = now instanceof Date ? now : new Date(now);
  return wallClock(localClock(at, zone).day, MATCH_SLOTS[0], zone);
}

// `count` kick-offs in a row, starting with `fromIso`.
export function upcomingSlots(fromIso, count, zone) {
  const out = [];
  let at = fromIso ? new Date(fromIso) : null;
  for (let i = 0; i < count && at && !Number.isNaN(at.getTime()); i++) {
    out.push(at);
    at = slotAfter(at, zone);
  }
  return out;
}

// Play every kick-off that has fallen due, with the lineup and tactics saved
// at the time. A lineup that cannot be used is replaced by the best eleven the
// club can field, so no match is skipped. Returns how many were played.
export function playDueMatches(state, now, zone) {
  const at = now instanceof Date ? now : new Date(now);
  let played = 0;
  while (!state.finished && state.nextMatchAt && Date.parse(state.nextMatchAt) <= at.getTime()) {
    const slot = new Date(state.nextMatchAt);
    if (!validateLineup(state).ok) {
      state.lineup = autoLineup(state.squads[state.clubId], state.tactics.formation, state.roles);
      fixLineup(state);
    }
    playMatchday(state);
    state.plays = (Array.isArray(state.plays) ? state.plays : []).concat(slot.toISOString()).slice(-MATCHES_PER_DAY);
    state.nextMatchAt = state.finished ? null : slotAfter(slot, zone).toISOString();
    played++;
  }
  if (state.finished && state.nextMatchAt) state.nextMatchAt = null;
  return played;
}

// What a save changes: the same season and matchday ('same'), the rollover to
// the next season's first matchday ('rollover'), or anything else ('stale').
export function saveCheck(stored, incoming) {
  const s = stored || {};
  const i = incoming || {};
  const sameSeason = (i.season || 1) === (s.season || 1);
  if (sameSeason && (i.matchday || 0) === (s.matchday || 0)) return 'same';
  if (s.finished && sameSeason === false && (i.season || 1) === (s.season || 1) + 1 && (i.matchday || 0) === 0) return 'rollover';
  return 'stale';
}

// Every group in the pyramid, each with the clubs nobody owns yet.
export function freeShopClubs(taken) {
  const set = new Set(Array.isArray(taken) ? taken : []);
  return GROUPS.map((g) => ({
    tier: g.tier,
    group: g.group,
    name: g.name,
    clubIds: g.clubIds.slice(),
    free: g.clubIds.filter((id) => !set.has(id)),
  }));
}

// Who runs a club, in the grey line under its name: the manager's own name for
// their club, another manager's for a club they own, and "Run by a bot" for a
// club nobody has bought. A club a person owns with no stored name reads
// "Manager" alone, never "Run by a bot".
export function managerLine(clubId, owners, ownClubId, ownName) {
  if (clubId === ownClubId && typeof ownName === 'string' && ownName) return 'Manager ' + ownName;
  if (owners && typeof owners === 'object' && !Array.isArray(owners)
    && Object.prototype.hasOwnProperty.call(owners, clubId)) {
    const name = owners[clubId];
    return typeof name === 'string' && name ? 'Manager ' + name : 'Manager';
  }
  return 'Run by a bot';
}

const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

// Why a division has the groups it has. Division 1 is one group of 18, and
// Divisions 2 and 3 hold four each, which with 162 clubs is all the league can
// fill. The counts come from the pyramid, so the sentence cannot drift from it.
export function groupsNote(tier) {
  if (!Number.isInteger(tier) || tier < 2 || tier > TIER_COUNT) return '';
  const count = GROUPS.filter((g) => g.tier === tier).length;
  const word = COUNT_WORDS[count] || String(count);
  return 'Division ' + tier + ' has ' + word + ' groups of ' + DIVISION_SIZE
    + ': the Coastal League holds ' + CLUBS.length + ' clubs.';
}

// The New career screen's shop: all nine groups, each club with its live
// squad average and whether another manager runs it.
export function shopGroups(taken) {
  const set = new Set(Array.isArray(taken) ? taken : []);
  return GROUPS.map((g, index) => ({
    index,
    tier: g.tier,
    group: g.group,
    name: g.name,
    clubs: g.clubIds.map((id) => ({
      id,
      avg: clubSummary(1, CLUB_BY_ID[id], g.tier).avg,
      taken: set.has(id),
    })),
  }));
}

// ── A career ─────────────────────────────────────────────────────────────
function squadsFor(seed, clubIds, division) {
  const squads = {};
  for (const id of clubIds) {
    squads[id] = buildSquad(seed, CLUB_INDEX[id], CLUB_BY_ID[id].rep, division);
  }
  return squads;
}

function rolesFor(squads) {
  const roles = {};
  for (const id in squads) {
    for (const p of squads[id]) roles[p.id] = defaultRole(p.pos);
  }
  return roles;
}

export function buildInitialState(clubId, managerName, seed) {
  const club = CLUB_BY_ID[clubId];
  if (!club) throw new Error('Unknown club');
  const groups = GROUPS.map((g) => ({ tier: g.tier, group: g.group, clubIds: g.clubIds.slice() }));
  const groupIndex = clubToGroup[clubId] || 0;
  const tier = groups[groupIndex].tier;
  const group = groups[groupIndex].group;
  const ids = groups[groupIndex].clubIds;
  const squads = squadsFor(seed, ids, tier);
  const state = {
    version: 3,
    season: 1,
    division: tier,
    group,
    groups,
    groupIndex,
    managerName,
    clubId,
    seed,
    squads,
    fixtures: buildFixtures(seed, ids),
    results: [],
    tactics: { formation: club.formation, mentality: 'Balanced', pressing: 'Medium' },
    roles: rolesFor(squads),
    lineup: [],
    matchday: 0,
    // No match played yet today, on the manager's clock (the server saves
    // the zone the first time the page sends one).
    plays: [],
    finished: false,
    lastReport: null,
    credits: 0,
    fans: FAN_SEED[tier],
    sponsor: sponsorFor(seed, 1, tier),
    lastSponsor: null,
    finance: { season: 1, gate: 0, upkeep: 0, homeGames: 0, maintenance: 0, wages: 0, staffWages: 0, shop: 0, food: 0, hotel: 0 },
    financeHistory: [],
    facilities: facilityLevels({}),
    staff: staffFields({}),
    youth: [],
  };
  state.lineup = autoLineup(squads[clubId], state.tactics.formation, state.roles);
  return state;
}

export function clubSummary(seed, club, division = 1) {
  const squad = buildSquad(seed, CLUB_INDEX[club.id], club.rep, division);
  const avg = squad.reduce((s, p) => s + p.overall, 0) / squad.length;
  return { avg: Math.round(avg) };
}

// Where a finished season leaves the manager: how they finished, and the tier
// and group they play in next. In the three-tier league the bottom 8 of
// Division 1 go down; the top 2 of each Division 2 and Division 3 group go up,
// the bottom 2 of each Division 2 group go down, and nobody leaves Division 3.
export function nextPlacement(state) {
  const table = leagueTable(state);
  const size = divisionClubIds(state).length;
  const me = table.find((r) => r.id === state.clubId);
  const rank = me ? me.rank : size;

  if (state && state.version >= 3 && Array.isArray(state.groups) && state.groups[state.groupIndex]) {
    const tier = state.division;
    const letter = state.group || null;
    if (tier === 1) {
      if (rank === 1) return { kind: 'champions', rank, size, tier: 1, group: null };
      if (rank >= 11) {
        return { kind: 'relegated', rank, size, tier: 2, group: GROUP_LETTERS[(rank - 11) % GROUP_LETTERS.length] };
      }
      return { kind: 'stayed', rank, size, tier: 1, group: null };
    }
    if (tier === 2) {
      if (rank <= 2) return { kind: 'promoted', rank, size, tier: 1, group: null };
      if (rank >= size - 1) return { kind: 'relegated', rank, size, tier: 3, group: letter };
      return { kind: 'stayed', rank, size, tier: 2, group: letter };
    }
    if (rank <= 2) return { kind: 'promoted', rank, size, tier: 2, group: letter };
    return { kind: 'stayed', rank, size, tier: 3, group: letter };
  }

  // A career saved before the three tiers: today's rule decides its next
  // division, then the division maps onto a tier.
  const isV1 = !(state.version >= 2) || !Array.isArray(state.divisions);
  if (isV1) return { kind: 'stayed', rank, size, tier: 1, group: null, joinsNewLeague: true };
  const division = state.division;
  let kind = 'stayed';
  let next = division;
  if (division === 1 && rank === 1) kind = 'champions';
  else if (division > 1 && rank <= 3) { kind = 'promoted'; next = division - 1; }
  else if (division < LEGACY_DIVISION_COUNT && rank > size - 3) { kind = 'relegated'; next = division + 1; }
  const tier = next === 1 ? 1 : next === 2 ? 2 : 3;
  const own = GROUPS[clubToGroup[state.clubId]];
  const group = tier === 1 ? null : own && own.tier === tier ? own.group : 'A';
  return { kind, rank, size, tier, group, joinsNewLeague: true };
}

// How a finished season ended for the manager: where they finished, and the
// tier and group they move to.
export function seasonOutcome(state) {
  const placement = nextPlacement(state);
  return { ...placement, toDivision: placement.tier, toGroup: placement.group };
}

// Summer: the manager's own players stay and start again from zero; everyone
// else in the new division is dealt a squad at that division's strength.
function playerForNewSeason(p) {
  return {
    id: p.id,
    name: p.name,
    pos: p.pos,
    age: p.age,
    peak: p.peak,
    attrs: p.attrs,
    overall: p.overall,
    fitness: 100,
    morale: p.morale,
    injury: 0,
    goals: 0,
    assists: 0,
    apps: 0,
    yellow: 0,
    red: 0,
    captain: p.captain,
    ...(p.academy ? { academy: p.academy } : {}),
  };
}

// One of the groups the manager is not in, played out from the season's seed
// so the same career always gives the same final table.
function simulateGroup(seed, index, tier, clubIds) {
  const squads = squadsFor(seed, clubIds, tier);
  const state = {
    version: 3,
    season: 1, // season 1 means seasonSeed(state) is the seed handed in
    division: tier,
    group: null,
    groups: [{ tier, group: null, clubIds: clubIds.slice() }],
    groupIndex: 0,
    managerName: '',
    clubId: null,
    seed,
    squads,
    fixtures: buildFixtures(hash(seed, 'group', index), clubIds),
    results: [],
    tactics: { formation: '4-4-2', mentality: 'Balanced', pressing: 'Medium' },
    roles: rolesFor(squads),
    lineup: [],
    matchday: 0,
    finished: false,
    lastReport: null,
  };
  while (!state.finished) playMatchday(state);
  return leagueTable(state);
}

// Apply promotion and relegation, then start the next season with the same
// club and players in its new group. Only a finished season rolls over.
export function startNextSeason(state) {
  if (!state || !state.finished) return state;
  const isV1 = !(state.version >= 2);
  const isV3 = state.version >= 3 && Array.isArray(state.groups) && !!state.groups[state.groupIndex];
  const season = (state.season || 1) + 1;
  let groups;
  let groupIndex;
  if (isV3) {
    groups = state.groups.map((g) => ({ tier: g.tier, group: g.group, clubIds: g.clubIds.slice() }));
    const seed = seasonSeed(state);
    const tables = groups.map((g, i) => (i === state.groupIndex
      ? leagueTable(state)
      : simulateGroup(seed, i, g.tier, g.clubIds)));
    // Division 1 loses its bottom 8, two into each Division 2 group in order
    // of finish, and gains the top 2 of each Division 2 group.
    const relegated = tables[0].slice(10, 18).map((r) => r.id);
    groups[0].clubIds = groups[0].clubIds.filter((id) => !relegated.includes(id));
    relegated.forEach((id, k) => { groups[1 + (k % GROUP_LETTERS.length)].clubIds.push(id); });
    for (let gi = 1; gi <= GROUP_LETTERS.length; gi++) {
      const up = tables[gi].slice(0, 2).map((r) => r.id);
      groups[gi].clubIds = groups[gi].clubIds.filter((id) => !up.includes(id));
      groups[0].clubIds.push(...up);
    }
    // Each Division 2 group's bottom 2 swap with the same-letter Division 3
    // group's top 2. Nobody leaves Division 3.
    for (let gi = 1; gi <= GROUP_LETTERS.length; gi++) {
      const down = tables[gi].slice(-2).map((r) => r.id);
      const up = tables[gi + GROUP_LETTERS.length].slice(0, 2).map((r) => r.id);
      groups[gi].clubIds = groups[gi].clubIds.filter((id) => !down.includes(id)).concat(up);
      groups[gi + GROUP_LETTERS.length].clubIds = groups[gi + GROUP_LETTERS.length].clubIds
        .filter((id) => !up.includes(id)).concat(down);
    }
    groupIndex = groups.findIndex((g) => g.clubIds.includes(state.clubId));
    if (groupIndex < 0) groupIndex = 0;
  } else {
    // A career from before the three tiers joins the new league: it keeps the
    // season it was in, and starts next season in the tier it lands in. If its
    // club is not already there it swaps with the weakest club of that tier's
    // first group.
    const placement = nextPlacement(state);
    groups = GROUPS.map((g) => ({ tier: g.tier, group: g.group, clubIds: g.clubIds.slice() }));
    const own = clubToGroup[state.clubId];
    if (!isV1 && groups[own] && groups[own].tier === placement.tier) {
      groupIndex = own;
    } else {
      groupIndex = groups.findIndex((g) => g.tier === placement.tier);
      // If the club is not already in the target group, it swaps with that
      // group's weakest club, which takes its place in its starting group.
      let victim = null;
      if (!groups[groupIndex].clubIds.includes(state.clubId)) {
        for (const id of groups[groupIndex].clubIds) {
          if (!victim || CLUB_BY_ID[id].rep < CLUB_BY_ID[victim].rep) victim = id;
        }
      }
      if (victim) {
        groups[groupIndex].clubIds = groups[groupIndex].clubIds.filter((id) => id !== victim).concat(state.clubId);
        if (groups[own] && own !== groupIndex) {
          groups[own].clubIds = groups[own].clubIds.filter((id) => id !== state.clubId).concat(victim);
        }
      }
    }
  }
  const newDivision = groups[groupIndex].tier;
  const seed = seasonSeed({ seed: state.seed, season });
  const ids = groups[groupIndex].clubIds;
  // The manager's players get a year older; the ones who retire are replaced
  // one for one by an academy graduate in the same position, so the squad
  // keeps its size and its goalkeepers.
  const aged = ageingFor(state);
  const leaving = new Set(aged.retiring.map((r) => r.id));
  const academy = facilityLevels(state).academy;
  const own = aged.players.filter((p) => !leaving.has(p.id)).map(playerForNewSeason);
  aged.retiring.forEach((r, i) => {
    own.push(playerForNewSeason(academyGraduate(state.seed, season, i, r.pos, academy, newDivision)));
  });
  const squads = { [state.clubId]: own };
  for (const id of ids) {
    if (id === state.clubId) continue;
    squads[id] = buildSquad(seed, CLUB_INDEX[id], CLUB_BY_ID[id].rep, newDivision);
  }
  const next = {
    version: 3,
    season,
    division: newDivision,
    group: groups[groupIndex].group,
    groups,
    groupIndex,
    managerName: state.managerName,
    clubId: state.clubId,
    seed: state.seed,
    squads,
    fixtures: buildFixtures(seed, ids),
    results: [],
    tactics: { ...state.tactics },
    roles: rolesFor(squads),
    lineup: [],
    matchday: 0,
    finished: false,
    lastReport: null,
    // The money fields the finished season leaves: the sponsor fee if its
    // target was met, the fans carried over, and a fresh season's totals.
    ...seasonEndMoney(state),
    // The facilities stay with the club into the next season, and so do the
    // staff and the academy's prospects.
    facilities: facilityLevels(state),
    staff: staffFields(state),
    youth: youthFields(state),
  };
  // The manager's players keep the roles they were given.
  for (const p of next.squads[next.clubId]) {
    if (state.roles && state.roles[p.id]) next.roles[p.id] = state.roles[p.id];
  }
  next.lineup = autoLineup(next.squads[next.clubId], next.tactics.formation, next.roles);
  // The wallet, the purchase, the day's matches and the manager's clock
  // belong to the career, not the season.
  if (state.wallet) next.wallet = { ...state.wallet };
  if (state.purchase) next.purchase = { ...state.purchase };
  next.plays = Array.isArray(state.plays) ? state.plays.slice(-MATCHES_PER_DAY) : [];
  if (state.timeZone) next.timeZone = state.timeZone;
  // The server stamps the next kick-off on the rollover save.
  next.nextMatchAt = null;
  return next;
}

// The money a finished season leaves for the next one: the sponsor's fee paid
// if its target was met, fans carried over, and this season's totals reset.
// The server settles a rollover save from the stored season with this, so the
// page cannot award itself the fee.
export function seasonEndMoney(state) {
  const m = moneyFields(state);
  const season = state.season || 1;
  const table = leagueTable(state);
  const size = divisionClubIds(state).length;
  const me = table.find((r) => r.id === state.clubId);
  const rank = me ? me.rank : size;
  const met = objectiveMet(rank, m.sponsor.target, size);
  const next = season + 1;
  const nextTier = nextPlacement(state).tier;
  const fanCap = FAN_CAP[nextTier] || FAN_CAP[3];
  return {
    credits: m.credits + (met ? m.sponsor.fee : 0),
    fans: Math.min(m.fans, fanCap),
    sponsor: sponsorFor(state.seed, next, nextTier),
    lastSponsor: { ...m.sponsor, paid: met },
    finance: { season: next, gate: 0, upkeep: 0, homeGames: 0, maintenance: 0, wages: 0, staffWages: 0, shop: 0, food: 0, hotel: 0 },
    financeHistory: [],
  };
}

// The staging demo: Harbourside seventeen matchdays into a Division 1 season,
// with one injury and one booking to show, the last result and the table
// already filled in.
export function buildDemoState(seed) {
  const state = buildInitialState('harbourside', 'Demo Manager', seed);
  // A partly built club, with a coach and a physio, so the money lines and
  // the academy have something from the first matchday on.
  state.facilities = { ...facilityLevels(state), stadium: 4, training: 2, toilets: 3 };
  state.staff = staffFields({
    staff: {
      coach: { name: 'Theo Marsh', season: 1, matchday: 0 },
      physio: { name: 'Pia Lund', season: 1, matchday: 0 },
    },
  });
  for (let i = 0; i < 17; i++) playMatchday(state);
  // The demo shows exactly one injured player and one booked player.
  const squad = state.squads.harbourside;
  for (const p of squad) { p.injury = 0; p.yellow = 0; p.red = 0; }
  const benchPick = squad.filter((p) => !state.lineup.includes(p.id) && POS_GROUP[p.pos] !== 'GK')
    .sort((a, b) => b.overall - a.overall)[0] || squad[squad.length - 1];
  if (benchPick) benchPick.injury = 2;
  const booked = squad.find((p) => POS_GROUP[p.pos] === 'DF' && p !== benchPick) || squad[1];
  if (booked) booked.yellow = 1;
  state.lineup = autoLineup(squad, state.tactics.formation, state.roles);
  fixLineup(state);
  state.managerName = 'Demo Manager';
  // The demo bought its club, so the Wallet section has something to show.
  state.wallet = { currency: 'Dummy USDC', balance: 900 };
  state.purchase = { clubId: 'harbourside', price: 100, at: '2026-01-15T12:00:00.000Z', demo: true };
  return state;
}

// Find a seed whose demo puts Harbourside third after seventeen matchdays in
// Division 1. Done once, offline, and the answer is written into server.js as
// DEMO_SEED.
export function findDemoSeed(max = 400) {
  for (let seed = 1; seed <= max; seed++) {
    const state = buildDemoState(seed);
    const table = leagueTable(state);
    const me = table.find((r) => r.id === 'harbourside');
    if (me && me.rank === 3 && me.played === 17) return { seed, points: me.points, table: table.map((r) => [r.rank, r.name, r.points]) };
  }
  return null;
}
