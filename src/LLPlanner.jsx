import { useState, useCallback, useEffect, useRef } from "react";
import { tripConfig } from "./trip.config";

const WORKER_URL = "https://disney-intinerary-app.45-reactor-puritan.workers.dev";

const PEOPLE = tripConfig.people;
const PEOPLE_IDS = PEOPLE.map((p) => p.id);

const PREF_SCORES = { must: 5, like: 2, neutral: 0, skip: -1 };
const PREF_KEYS   = ["must", "like", "neutral", "skip"];
const PREF_LABELS = { must: "Must Do", like: "Like To", neutral: "Neutral", skip: "Skip It" };
const PREF_NOTION = { must: "Must Do", like: "Like To", neutral: "Neutral", skip: "Skip It" };
const NOTION_PREF = { "Must Do": "must", "Like To": "like", "Neutral": "neutral", "Skip It": "skip" };

const LL_STATUS = {
  FIRST:    "Pre-Book (1st)",
  PREBOOK:  "Pre-Book",
  SECOND:   "2nd Round",
  LATER:    "Later",
  DONTBOOK: "Don't Book",
};

const LL_STATUS_COLORS = {
  [LL_STATUS.FIRST]:    "#0A4A2E",
  [LL_STATUS.PREBOOK]:  "#1A6B4A",
  [LL_STATUS.SECOND]:   "#B8860B",
  [LL_STATUS.LATER]:    "#6AAB7E",
  [LL_STATUS.DONTBOOK]: "#C0392B",
};

const PARK_META = {
  mk: { name: "Magic Kingdom",     color: "#2C5F8A", tiered: true  },
  ep: { name: "EPCOT",             color: "#4A2C6B", tiered: true  },
  hs: { name: "Hollywood Studios", color: "#8A3A2C", tiered: true  },
  ak: { name: "Animal Kingdom",    color: "#5C7A2E", tiered: false },
};

export const PARKS = tripConfig.parks.map(id => ({ id, ...PARK_META[id] }));

function toDisplayName(raw) {
  return raw.replace(/^(The|A|An) /i, (_, p) => `(${p}) `);
}
function sortKey(name) {
  return name.replace(/^\((?:The|A|An)\)\s*/i, "").toLowerCase();
}
function llText(ll, illPrice) {
  if (ll === "ill") return illPrice ? `Lightning Lane Single Pass · ${illPrice}` : "Lightning Lane Single Pass";
  if (ll === "mp1") return "Multipass Tier 1";
  if (ll === "mp2") return "Multipass Tier 2";
  return "No Lightning Lane";
}

// ── Sellout & Standby Data ────────────────────────────────────────────────────

const SELLOUT = {
  mk1:   { time: "~8:09 AM",  urgency: "red"   },
  mk10:  { time: "~8:56 AM",  urgency: "red"   },
  mk19:  { time: "~10:20 AM", urgency: "red"   },
  mk12b: { time: "~11:22 AM", urgency: "amber" },
  mk2:   { time: "~12:09 PM", urgency: "amber" },
  mk20:  { time: "~12:21 PM", urgency: "amber" },
  mk8:   { time: "~1:00 PM",  urgency: "amber" },
  mk11:  { time: "~4:52 PM",  urgency: "green" },
  mk9:   { time: "~6:35 PM",  urgency: "green" },
  mk18:  { time: "Rarely", urgency: "green" },
  mk30:  { time: "Rarely", urgency: "green" },
  mk7b:  { time: "Rarely", urgency: "green" },
  mk23:  { time: "Rarely", urgency: "green" },
  mk3:   { time: "Rarely", urgency: "green" },
  mk6:   { time: "Rarely", urgency: "green" },
  mk21:  { time: "Rarely", urgency: "green" },
  mk22:  { time: "Rarely", urgency: "green" },
  mk16:  { time: "Rarely", urgency: "green" },
  mk4:   { time: "Rarely", urgency: "green" },
  mk17:  { time: "Rarely", urgency: "green" },
  ep1:   { time: "~8:17 AM",  urgency: "red"   },
  ep2:   { time: "~8:33 AM",  urgency: "red"   },
  ep10:  { time: "~9:47 AM",  urgency: "red"   },
  ep11:  { time: "~9:57 AM",  urgency: "red"   },
  ep5:   { time: "~3:23 PM",  urgency: "amber" },
  ep3:   { time: "~6:23 PM",  urgency: "green" },
  ep4:   { time: "Rarely", urgency: "green" },
  ep6:   { time: "Rarely", urgency: "green" },
  ep7:   { time: "Rarely", urgency: "green" },
  ep8:   { time: "Rarely", urgency: "green" },
  ep13:  { time: "Rarely", urgency: "green" },
  ep14:  { time: "Rarely", urgency: "green" },
  hs3:   { time: "~7:27 AM",  urgency: "red"   },
  hs1:   { time: "~9:28 AM",  urgency: "red"   },
  hs4:   { time: "~9:46 AM",  urgency: "red"   },
  hs7:   { time: "~12:03 PM", urgency: "amber" },
  hs13:  { time: "~2:16 PM",  urgency: "amber" },
  hs11:  { time: "~2:34 PM",  urgency: "amber" },
  hs10:  { time: "~3:18 PM",  urgency: "amber" },
  hs8:   { time: "~4:17 PM",  urgency: "green" },
  hs12:  { time: "~5:53 PM",  urgency: "green" },
  hs2:   { time: "Rarely", urgency: "green" },
  hs9:   { time: "Rarely", urgency: "green" },
  hs7b:  { time: "Rarely", urgency: "green" },
};

const STANDBY = {
  mk1:   { avg: 75, difficulty: "red",   insight: "RD or LL only" },
  mk10:  { avg: 80, difficulty: "red",   insight: "RD or LL only" },
  mk19:  { avg: 60, difficulty: "red",   insight: "<30min or >8pm" },
  mk2:   { avg: 50, difficulty: "red",   insight: "<30min or >8pm" },
  mk20:  { avg: 35, difficulty: "amber", insight: "<10am or >7pm" },
  mk11:  { avg: 40, difficulty: "amber", insight: ">7pm" },
  mk18:  { avg: 30, difficulty: "amber", insight: ">6pm" },
  mk23:  { avg: 30, difficulty: "amber", insight: ">6pm" },
  mk12b: { avg: 20, difficulty: "green", insight: "Walk on most times" },
  mk8:   { avg: 20, difficulty: "green", insight: ">5pm" },
  mk22:  { avg: 15, difficulty: "green", insight: "Walk on most times" },
  mk30:  { avg: 15, difficulty: "green", insight: "Walk on most times" },
  mk3:   { avg: 15, difficulty: "green", insight: "Walk on most times" },
  mk7b:  { avg: 15, difficulty: "green", insight: "Walk on most times" },
  mk6:   { avg: 10, difficulty: "green", insight: "Walk on anytime" },
  mk9:   { avg: 10, difficulty: "green", insight: "Walk on anytime" },
  mk17:  { avg: 10, difficulty: "green", insight: "Walk on anytime" },
  mk21:  { avg: 10, difficulty: "green", insight: "Walk on anytime" },
  mk4:   { avg: 10, difficulty: "green", insight: "Walk on anytime" },
  mk16:  { avg: 10, difficulty: "green", insight: "Walk on anytime" },
  ep1:   { avg: 70, difficulty: "red",   insight: "RD or LL only" },
  ep10:  { avg: 55, difficulty: "red",   insight: "RD or >7pm" },
  ep11:  { avg: 50, difficulty: "red",   insight: "RD or >7pm" },
  ep2:   { avg: 40, difficulty: "amber", insight: ">7pm" },
  ep5:   { avg: 35, difficulty: "amber", insight: "<10am or >6pm" },
  ep3:   { avg: 20, difficulty: "green", insight: "Walk on most times" },
  ep6:   { avg: 15, difficulty: "green", insight: "Walk on anytime" },
  ep7:   { avg: 10, difficulty: "green", insight: "Walk on anytime" },
  ep4:   { avg: 10, difficulty: "green", insight: "Walk on anytime" },
  ep8:   { avg: 10, difficulty: "green", insight: "Walk on anytime" },
  ep13:  { avg: 10, difficulty: "green", insight: "Walk on anytime" },
  ep14:  { avg: 10, difficulty: "green", insight: "Walk on anytime" },
  hs1:   { avg: 75, difficulty: "red",   insight: "RD or LL only" },
  hs3:   { avg: 65, difficulty: "red",   insight: "RD or >8pm" },
  hs4:   { avg: 40, difficulty: "amber", insight: ">7pm" },
  hs7:   { avg: 35, difficulty: "amber", insight: ">6pm" },
  hs11:  { avg: 30, difficulty: "amber", insight: ">6pm" },
  hs2:   { avg: 25, difficulty: "amber", insight: "<10am or >6pm" },
  hs10:  { avg: 20, difficulty: "green", insight: "Walk on most times" },
  hs9:   { avg: 15, difficulty: "green", insight: "Walk on most times" },
  hs7b:  { avg: 15, difficulty: "green", insight: "Walk on most times" },
  hs8:   { avg: 10, difficulty: "green", insight: "Walk on anytime" },
  hs12:  { avg: 10, difficulty: "green", insight: "Walk on anytime" },
  hs13:  { avg: 10, difficulty: "green", insight: "Walk on anytime" },
};

const URGENCY_COLOR = {
  red:   { bg: "#FFEBEE", color: "#B71C1C", border: "#FFCDD2" },
  amber: { bg: "#FFF8E1", color: "#E65100", border: "#FFE082" },
  green: { bg: "#E8F5E9", color: "#1B5E20", border: "#A5D6A7" },
};
const DIFF_COLOR = {
  red:   { bg: "#FFEBEE", color: "#B71C1C", border: "#FFCDD2" },
  amber: { bg: "#FFF8E1", color: "#E65100", border: "#FFE082" },
  green: { bg: "#E8F5E9", color: "#1B5E20", border: "#A5D6A7" },
};

// ── Rides are now fetched from Notion and passed as a prop ────────────────────
// EARLY_ENTRY is determined by the earlyEntry field on each ride object

const LS_KEY = `dw-${tripConfig.tripId}-ll-v1`;
function loadStorage() {
  try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : {}; } catch (_) { return {}; }
}
function saveStorage(data) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch (_) {}
}

// ── Notion API ────────────────────────────────────────────────────────────────

async function fetchAllVotes() {
  const parks = tripConfig.parks;
  const [votesResults, metaData] = await Promise.all([
    Promise.all(parks.map((park) =>
      fetch(`${WORKER_URL}/votes?park=${park}`).then((r) => r.json())
    )),
    fetch(`${WORKER_URL}/meta`).then((r) => r.json()),
  ]);

  const prefs = {};

  votesResults.forEach((data) => {
    if (!data.results) return;
    data.results.forEach((page) => {
      const rideId    = page.properties["Ride ID"]?.rich_text?.[0]?.text?.content;
      const person    = page.properties["Person"]?.rich_text?.[0]?.text?.content;
      const prefLabel = page.properties["Preference"]?.select?.name;
      const prefKey   = NOTION_PREF[prefLabel];
      if (!rideId || !person || !prefKey) return;
      if (!prefs[rideId]) prefs[rideId] = { prefs: {}, pageIds: {} };
      prefs[rideId].prefs[person]   = prefKey;
      prefs[rideId].pageIds[person] = page.id;
    });
  });

  if (metaData.results) {
    metaData.results.forEach((page) => {
      const rideId      = page.properties["Ride ID"]?.rich_text?.[0]?.text?.content;
      const closed      = page.properties["Closed"]?.checkbox ?? false;
      const rdNom       = page.properties["Rope Drop Nominee"]?.checkbox ?? false;
      const rdConfirmed = page.properties["Rope Drop Confirmed"]?.checkbox ?? false;
      const llStatus    = (page.properties["LL Status"]?.select?.name ?? null)?.replace(/[\u2018\u2019\u201A\u201B]/g, "'") ?? null;
      const notes       = page.properties["Notes"]?.rich_text?.[0]?.text?.content ?? "";
      // park prefix determines park id
      const park        = tripConfig.parks.find((p) => rideId.startsWith(p));
      if (!rideId) return;
      if (!prefs[rideId]) prefs[rideId] = { prefs: {}, pageIds: {} };
      prefs[rideId].closed     = closed;
      prefs[rideId].rdNom      = rdNom;
      prefs[rideId].llStatus   = llStatus;
      prefs[rideId].notes      = notes;
      if (rdConfirmed && park) prefs[`rdc_${park}`] = rideId;
    });
  }

  return prefs;
}

async function saveVoteToNotion(rideId, rideName, park, person, preference) {
  const res = await fetch(`${WORKER_URL}/votes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rideId, rideName, park, person, preference: PREF_NOTION[preference] }),
  });
  return (await res.json()).id;
}

async function deleteVoteFromNotion(pageId) {
  await fetch(`${WORKER_URL}/votes`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pageId }),
  });
}

export async function saveMetaToNotion(rideId, rideName, park, meta, rdConfirmedId) {
  try {
    const res = await fetch(`${WORKER_URL}/meta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rideId, rideName, park,
        closed:      meta.closed    ?? false,
        rdNom:       meta.rdNom     ?? false,
        rdConfirmed: rdConfirmedId === rideId,
        notes:       meta.notes     ?? "",
        llStatus:    meta.llStatus  ?? null,
      }),
    });
    const data = await res.json();
    if (data.object === "error") console.error("Notion meta error:", data);
  } catch (e) { console.error("Meta sync failed:", e); }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcScore(rideId, prefs) {
  return PEOPLE.reduce((sum, p) => {
    const pf = prefs[rideId]?.prefs?.[p.id];
    return sum + (pf ? PREF_SCORES[pf] : 0);
  }, 0);
}
function totalVotes(rideId, prefs) {
  return PEOPLE.filter((p) => prefs[rideId]?.prefs?.[p.id]).length;
}
function scoreColorClass(s) {
  if (s >= 14) return "score-hi";
  if (s >= 6)  return "score-md";
  if (s >= 0)  return "score-lo";
  return "score-ng";
}
export function isClosed(rideId, prefs) {
  return prefs[rideId]?.closed ?? false;
}
function preBookCounts(parkId, prefs, excludeRideId, rides) {
  let t1 = 0, t2 = 0;
  rides.filter((r) => r.park === parkId).forEach((r) => {
    if (r.id === excludeRideId) return;
    const s = prefs[r.id]?.llStatus;
    if (s === LL_STATUS.PREBOOK || s === LL_STATUS.FIRST) {
      if (r.ll === "mp1") t1++;
      if (r.ll === "mp2") t2++;
    }
  });
  return { t1, t2 };
}
function isPreBookFull(parkId, prefs, rides) {
  const { t1, t2 } = preBookCounts(parkId, prefs, null, rides);
  const maxT2 = t1 === 0 ? 3 : 2;
  return t1 >= 1 && t2 >= maxT2 || t2 >= 3;
}

// ── Sort group for LL ranking ─────────────────────────────────────────────────

function sortTierGroup(group, parkId, prefs, rides = []) {
  const full = isPreBookFull(parkId, prefs, rides);
  const prebooked = (r) => prefs[r.id]?.llStatus === LL_STATUS.FIRST || prefs[r.id]?.llStatus === LL_STATUS.PREBOOK;
  const second    = (r) => prefs[r.id]?.llStatus === LL_STATUS.SECOND;
  const later     = (r) => prefs[r.id]?.llStatus === LL_STATUS.LATER;
  const unset     = (r) => !prefs[r.id]?.llStatus;
  const dontbook  = (r) => prefs[r.id]?.llStatus === LL_STATUS.DONTBOOK;

  if (full) {
    // Slots full: prebook → 2nd round → later → unset → don't book
    return [
      ...group.filter(prebooked),
      ...group.filter(second),
      ...group.filter(later),
      ...group.filter(unset),
      ...group.filter(dontbook),
    ];
  } else {
    // Still picking: unset → prebook → 2nd round → later → don't book
    return [
      ...group.filter(unset),
      ...group.filter(prebooked),
      ...group.filter(second),
      ...group.filter(later),
      ...group.filter(dontbook),
    ];
  }
}

// ── RideCard ──────────────────────────────────────────────────────────────────

function RideCard({ ride, prefs, onPref, onNotes, onClosed, onRdNom, syncing }) {
  const score  = calcScore(ride.id, prefs);
  const votes  = totalVotes(ride.id, prefs);
  const closed = isClosed(ride.id, prefs);
  const rdNom  = prefs[ride.id]?.rdNom ?? false;
  const pct    = Math.round((votes / PEOPLE.length) * 100);
  const notes  = prefs[ride.id]?.notes ?? "";

  const metaParts = [
    closed ? "Closed" : llText(ride.ll, ride.illPrice),
    ride.earlyEntry ? "Early Entry" : null,
    ride.visa ? "Disney Visa" : null,
    ride.type !== "Ride" ? ride.type : null,
    ride.hours ?? null,
  ].filter(Boolean).join(" · ");

  const renderPeople = (ids) =>
    ids.map((pid) => {
      const cur = prefs[ride.id]?.prefs?.[pid] ?? null;
      const isSyncing = syncing[`${ride.id}_${pid}`];
      return (
        <div className="p-row" key={pid}>
          <span className="p-lbl">{pid}{isSyncing ? <span className="sync-dot">…</span> : null}</span>
          <div className="pref-btns">
            {PREF_KEYS.map((k) => (
              <button key={k} className={`pb${cur === k ? ` sel-${k}` : ""}`} onClick={() => onPref(ride.id, pid, k)} disabled={isSyncing}>
                {PREF_LABELS[k]}
              </button>
            ))}
          </div>
        </div>
      );
    });

  return (
    <div className={`ride-card${closed ? " card-closed" : ""}`}>
      <div className="ride-header">
        <div className="name-row">
          <span className="ride-name">
            {ride.url ? <a href={ride.url} target="_blank" rel="noreferrer">{ride.displayName} ↗</a> : <span>{ride.displayName}</span>}
          </span>
          {!closed && <span className={`score-badge ${scoreColorClass(score)}`}>{score > 0 ? "+" : ""}{score}</span>}
        </div>
        <div className={`ride-meta${closed ? " meta-closed" : ""}`}>{metaParts}</div>
        {ride.location && <div className="ride-location">📍 {ride.location}</div>}
        <div className="controls-row">
          <button className="btn-sm" onClick={() => onClosed(ride.id)}>{closed ? "Mark Ride Open" : "Mark Ride Closed"}</button>
          {!closed && <button className={`rd-btn${rdNom ? " on" : ""}`} onClick={() => onRdNom(ride.id)}>🌅 Rope Drop Candidate</button>}
        </div>
        {!closed && <div className="prog"><div className="prog-fill" style={{ width: `${pct}%`, background: pct === 100 ? "#1A6B4A" : "#2C5F8A" }} /></div>}
      </div>
      <div className={`prefs${closed ? " section-closed" : ""}`}>
        <div className="fam-blk">{renderPeople(PEOPLE_IDS)}</div>
      </div>
      <div className={`notes-sec${closed ? " section-closed" : ""}`}>
        <textarea className="notes-inp" placeholder="Notes..." rows={2} defaultValue={notes} onBlur={(e) => onNotes(ride.id, e.target.value)} />
      </div>
    </div>
  );
}

// ── LL Status Menu ────────────────────────────────────────────────────────────

function LLStatusMenu({ ride, prefs, parkId, onLLStatus, rides: allRides = [] }) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const btnRef = useRef(null);
  const current = prefs[ride.id]?.llStatus ?? null;
  const { t1, t2 } = preBookCounts(parkId, prefs, ride.id, allRides);
  const maxT2 = t1 === 0 ? 3 : 2;
  const canPreBook = !((ride.ll === "mp1" && t1 >= 1) || (ride.ll === "mp2" && t2 >= maxT2));
  const isPreBookSelected = current === LL_STATUS.FIRST || current === LL_STATUS.PREBOOK;

  const options = [
    { key: LL_STATUS.FIRST,    label: "Pre-Book (1st)", disabled: !canPreBook && !isPreBookSelected },
    { key: LL_STATUS.PREBOOK,  label: "Pre-Book",       disabled: !canPreBook && !isPreBookSelected },
    { key: LL_STATUS.SECOND,   label: "2nd Round",      disabled: false },
    { key: LL_STATUS.LATER,    label: "Book Later",     disabled: false },
    { key: LL_STATUS.DONTBOOK, label: "Don't Book",     disabled: false },
  ];

  const color = current ? LL_STATUS_COLORS[current] : null;
  const btnStyle = color ? { background: color, borderColor: color, color: "#FFF" } : {};

  const handleOpen = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setOpenUp(rect.bottom > window.innerHeight - 200);
    }
    setOpen((o) => !o);
  };

  return (
    <div style={{ position: "relative", flexShrink: 0 }} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }} tabIndex={-1}>
      <button ref={btnRef} className="ll-menu-btn" style={btnStyle} onClick={handleOpen}>
        {current ?? "— Set LL"} ▾
      </button>
      {open && (
        <div className="ll-menu-popup" style={openUp ? { bottom: 28, top: "auto" } : { top: 28 }}>
          {options.map(({ key, label, disabled }) => (
            <div key={key} className={`ll-menu-item${disabled ? " ll-menu-disabled" : ""}${current === key ? " ll-menu-active" : ""}`}
              onClick={() => {
                if (disabled) return;
                if (key === LL_STATUS.FIRST) {
                  allRides.filter((r) => r.park === ride.park && r.id !== ride.id && prefs[r.id]?.llStatus === LL_STATUS.FIRST)
                    .forEach((r) => onLLStatus(r.id, LL_STATUS.PREBOOK));
                }
                onLLStatus(ride.id, current === key ? null : key);
                setOpen(false);
              }}>
              <span className="ll-menu-dot" style={{ background: LL_STATUS_COLORS[key] }} />
              {label}
              {current === key && <span className="ll-menu-check">✓</span>}
            </div>
          ))}
          {current && (
            <div className="ll-menu-item ll-menu-clear" onClick={() => { onLLStatus(ride.id, null); setOpen(false); }}>
              <span className="ll-menu-dot" style={{ background: "#CCC" }} />
              Clear
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Rank Item ─────────────────────────────────────────────────────────────────

function RankItem({ r, num, prefs, parkId, onLLStatus, rides = [] }) {
  const llStatus  = prefs[r.id]?.llStatus ?? null;
  const isDemoted = llStatus === LL_STATUS.DONTBOOK;
  const isRD      = r.isRD ?? false;
  const isEE      = r.earlyEntry ?? false;
  const isFirst   = llStatus === LL_STATUS.FIRST;
  const sellout   = SELLOUT[r.id];
  const standby   = STANDBY[r.id];
  const urgStyle  = sellout ? URGENCY_COLOR[sellout.urgency] : null;
  const diffStyle = standby ? DIFF_COLOR[standby.difficulty] : null;

  return (
    <div className={`r-item${isDemoted ? " r-skipped" : ""}`}>
      <div className="r-item-top">
        <span className="r-num">{isDemoted ? "—" : num}</span>
        <span className={`score-badge ${scoreColorClass(r.score)}`} style={isDemoted ? { opacity: 0.4 } : {}}>
          {r.score > 0 ? "+" : ""}{r.score}
        </span>
        <span className={`r-name${isDemoted ? " r-name-skip" : ""}`}>
          {r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="r-link">{r.displayName} ↗</a> : <span className="r-link">{r.displayName}</span>}
          {r.illPrice && !isDemoted && <span className="ill-price">({r.illPrice})</span>}
        </span>
        {isRD && <span className="r-pill rd-tag">RD ✓</span>}
        {isEE && !isDemoted && <span className="r-pill ee-tag">EE</span>}
        {r.visa && !isDemoted && <span className="r-pill visa-tag">Visa</span>}
        <LLStatusMenu ride={r} prefs={prefs} parkId={parkId} onLLStatus={onLLStatus} rides={rides} />
      </div>
      {!isDemoted && (sellout || standby) && (
        <div className="r-item-meta">
          {sellout && (
            <span className="r-meta-badge r-meta-badge-ll" style={{ background: urgStyle.bg, color: urgStyle.color, border: `1px solid ${urgStyle.border}` }}>
              LL Sell Out: {sellout.time}
            </span>
          )}
          {standby && (
            <span className="r-meta-badge r-meta-badge-sb" style={{ background: diffStyle.bg, color: diffStyle.color, border: `1px solid ${diffStyle.border}` }}>
              Av SB: ~{standby.avg} min · {standby.insight}
            </span>
          )}
        </div>
      )}
      {isFirst && isEE && !isDemoted && (
        <div className="conflict" style={{ marginTop: "6px", marginBottom: 0 }}>
          ⚠ Available during early entry — you may be able to walk it instead of using a LL slot.
        </div>
      )}
    </div>
  );
}

// ── Rankings ──────────────────────────────────────────────────────────────────

function Rankings({ parkId, prefs, onRdConfirm, onLLStatus, rides: allRides, onSwitchToPrefs }) {
  const park        = PARKS.find((p) => p.id === parkId);
  const rides       = allRides.filter((r) => r.park === parkId);
  const activeRides = rides.filter((r) => !isClosed(r.id, prefs));
  const scored      = activeRides.map((r) => ({ ...r, score: calcScore(r.id, prefs) })).filter((r) => r.score !== 0).sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;

  const anyLLSelected = rides.some((r) => prefs[r.id]?.llStatus);
  const [overallOpen, setOverallOpen]     = useState(!anyLLSelected);
  const [llOpen, setLlOpen]               = useState(anyLLSelected);


  const rdConfirmed  = prefs[`rdc_${parkId}`] ?? null;
  const rdNominees   = activeRides.filter((r) => prefs[r.id]?.rdNom);
  const multiPending = rdNominees.length > 1 && !rdConfirmed;
  const tier1Conflict = activeRides.filter((r) => r.ll === "mp1" && r.id !== rdConfirmed && PEOPLE.some((p) => prefs[r.id]?.prefs?.[p.id] === "must"));

  const renderOverall = () => {
    const allLLScored = activeRides.filter(r => r.ll !== "noll")
      .map((r) => ({ ...r, score: calcScore(r.id, prefs) }))
      .sort((a, b) => b.score - a.score);
    const mpRides  = allLLScored.filter((r) => r.ll === "mp1" || r.ll === "mp2").slice(0, 6);
    const cutoff   = mpRides.length === 6 ? mpRides[5].score : -Infinity;
    const illRides = allLLScored.filter((r) => r.ll === "ill" && r.score >= cutoff);
    const topRides = [...mpRides, ...illRides].sort((a, b) => b.score - a.score);

    if (!topRides.length) return <div style={{ fontSize:12, color:"#AAA", fontFamily:"'DM Sans',sans-serif" }}>Rate some rides to see Top Rides.</div>;

    return topRides.map((r, i) => {
      const isConfRD = rdConfirmed === r.id;
      const isRDNom  = prefs[r.id]?.rdNom && !isConfRD;
      const pill = r.ll === "ill" ? <span className="r-pill b-sp">SP</span> : r.ll === "mp1" ? <span className="r-pill b-mp1">T1</span> : r.ll === "mp2" ? <span className="r-pill b-mp2">T2</span> : null;
      return (
        <div className="r-item" key={r.id}>
          <div className="r-item-top">
            <span className="r-num">{i + 1}</span>
            <span className={`score-badge ${scoreColorClass(r.score)}`}>{r.score > 0 ? "+" : ""}{r.score}</span>
            <span className="r-name">{r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="r-link">{r.displayName} ↗</a> : <span className="r-link">{r.displayName}</span>}</span>
            {isConfRD && <span className="r-pill rd-tag">RD ✓</span>}
            {isRDNom  && <span className="r-pill rd-tag">RD?</span>}
            {pill}
          </div>
        </div>
      );
    });
  };

  const renderLL = () => {
    const allLLRides  = activeRides.filter((r) => r.ll !== "noll");
    const allLLScored = allLLRides.map((r) => ({ ...r, score: calcScore(r.id, prefs) })).sort((a, b) => b.score - a.score);

    const t1PreBooked = activeRides.find((r) => r.ll === "mp1" && (prefs[r.id]?.llStatus === LL_STATUS.FIRST || prefs[r.id]?.llStatus === LL_STATUS.PREBOOK));
    const t1Skipped   = activeRides.filter((r) => r.ll === "mp1").every((r) => prefs[r.id]?.llStatus === LL_STATUS.LATER || prefs[r.id]?.llStatus === LL_STATUS.DONTBOOK || prefs[r.id]?.llStatus === LL_STATUS.SECOND);
    const { t1: t1Count, t2: t2Count } = preBookCounts(parkId, prefs, null, allRides);
    const maxT2 = t1Count === 0 ? 3 : 2;
    const t2Filled = t2Count >= maxT2;

    // Build set of ride IDs that get pushed to Later Round Options
    const laterRoundIds = new Set();
    if (t1PreBooked) {
      activeRides.filter((r) => r.ll === "mp1" && r.id !== t1PreBooked.id).forEach((r) => laterRoundIds.add(r.id));
    }
    if (t2Filled) {
      activeRides.filter((r) => r.ll === "mp2" && prefs[r.id]?.llStatus !== LL_STATUS.FIRST && prefs[r.id]?.llStatus !== LL_STATUS.PREBOOK).forEach((r) => laterRoundIds.add(r.id));
    }

    const rdHeader = () => {
      if (rdConfirmed) { const ride = activeRides.find((r) => r.id === rdConfirmed); return `Rope Drop — ${ride?.displayName ?? ""} ✓`; }
      if (rdNominees.length > 0) return "Rope Drop — Select One ↓";
      return "Rope Drop — None Nominated";
    };
    const t1Header = () => {
      const prefix = park?.tiered ? "Tier 1 — " : "";
      if (t1PreBooked) return `${prefix}${t1PreBooked.displayName} ✓`;
      if (t1Skipped)   return `${prefix}Skipping · ${maxT2} T2 slots available`;
      return `${prefix}Select up to 1 ↓`;
    };
    const t2Header = () => {
      const prefix = park?.tiered ? "Tier 2 — " : "";
      if (t2Filled) return `${prefix}${t2Count} of ${maxT2} slots filled ✓`;
      return `${prefix}${t2Count} of ${maxT2} slots filled`;
    };

    const renderRideItem = (r, num) => {
      const isRD = r.id === rdConfirmed;
      return (
        <div key={r.id} style={{ position: "relative" }}>
          <RankItem r={{ ...r, isRD }} num={num} prefs={prefs} parkId={parkId} onLLStatus={onLLStatus} rides={allRides} />
        </div>
      );
    };

    const laterRound = allLLScored.filter((r) => laterRoundIds.has(r.id));

    return (
      <>
        {/* Rope Drop */}
        {rdNominees.length > 0 && (
          <div>
            <div className={`tier-lbl-row ${rdConfirmed ? "complete" : "incomplete"}`}>
              <span className="tier-lbl">{rdHeader()}</span>
            </div>
            <>
              {multiPending && <div className="rd-pend">Select a Rope Drop Ride</div>}
              {(rdConfirmed ? rdNominees.filter((r) => r.id === rdConfirmed) : rdNominees).map((r) => {
                const isConf = rdConfirmed === r.id;
                const s = calcScore(r.id, prefs);
                return (
                  <div className="r-item" key={r.id}>
                    <div className="r-item-top">
                      <span className="r-num">·</span>
                      <span className={`score-badge ${scoreColorClass(s)}`}>{s > 0 ? "+" : ""}{s}</span>
                      <span className="r-name">{r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="r-link">{r.displayName} ↗</a> : <span className="r-link">{r.displayName}</span>}</span>
                      <div className={`rd-chk${isConf ? " on" : ""}`} onClick={() => onRdConfirm(parkId, r.id)}>{isConf ? "✓" : ""}</div>
                    </div>
                  </div>
                );
              })}
            </>
          </div>
        )}

        {/* Warnings */}
        {rdConfirmed && !(allRides.find(r => r.id === rdConfirmed)?.earlyEntry) && (
          <div className="conflict">⚠ Rope Drop ride is not available during early entry — you'll be competing with the full crowd at park open.</div>
        )}

        {/* Tier 1 */}
        {(() => {
          const t1Rides = allLLScored.filter((r) => r.ll === "mp1" && !laterRoundIds.has(r.id));
          if (!t1Rides.length) return null;
          const isSelecting = !t1PreBooked && !t1Skipped;
          const locked = !!t1PreBooked;
          const sorted  = sortTierGroup(t1Rides, parkId, prefs, allRides);
          const display = locked
            ? t1Rides.filter((r) => r.id === t1PreBooked.id)
            : sorted;
          let num = 0;
          return (
            <div>
              {(() => {
                const t1AllMarked = t1Rides.every((r) => prefs[r.id]?.llStatus);
                const t1Complete  = !!t1PreBooked || t1AllMarked;
                return (
                  <div className={`tier-lbl-row ${t1Complete ? "complete" : "incomplete"}`}>
                    <span className="tier-lbl">{t1Header()}</span>
                  </div>
                );
              })()}
              {!t1PreBooked && t1Rides.length > 1 && <div className="rd-pend">Select one Tier 1 Ride</div>}
              {display.map((r) => { num++; return renderRideItem(r, num); })}
            </div>
          );
        })()}

        {/* Tier 2 */}
        {(() => {
          const t2Rides = allLLScored.filter((r) => r.ll === "mp2" && !laterRoundIds.has(r.id));
          if (!t2Rides.length) return null;
          const locked   = t2Filled;
          const sorted   = sortTierGroup(t2Rides, parkId, prefs, allRides);
          const nonDont  = sorted.filter((r) => prefs[r.id]?.llStatus !== LL_STATUS.DONTBOOK);
          const dontBook = sorted.filter((r) => prefs[r.id]?.llStatus === LL_STATUS.DONTBOOK);
          const display  = locked
            ? sorted.filter((r) => prefs[r.id]?.llStatus === LL_STATUS.FIRST || prefs[r.id]?.llStatus === LL_STATUS.PREBOOK)
            : [...nonDont, ...dontBook];
          if (!display.length) return null;
          let num = 0;
          return (
            <div>
              {(() => {
                const t2AllMarked = t2Rides.every((r) => prefs[r.id]?.llStatus);
                const t2Complete  = t2Filled || t2AllMarked;
                return (
                  <div className={`tier-lbl-row ${t2Complete ? "complete" : "incomplete"}`}>
                    <span className="tier-lbl">{t2Header()}</span>
                  </div>
                );
              })()}
              {display.map((r) => {
                const isDemoted = prefs[r.id]?.llStatus === LL_STATUS.DONTBOOK;
                if (!isDemoted) num++;
                return renderRideItem(r, isDemoted ? null : num);
              })}
            </div>
          );
        })()}

        {/* Single Pass */}
        {(() => {
          const illRides = allLLScored.filter((r) => r.ll === "ill");
          if (!illRides.length) return null;
          let num = 0;
          return (
            <div>
              {(() => {
                const illAllMarked = illRides.every((r) => prefs[r.id]?.llStatus);
                return (
                  <div className={`tier-lbl-row ${illAllMarked ? "complete" : "neutral"}`}>
                    <span className="tier-lbl">Lightning Lane Single Pass</span>
                  </div>
                );
              })()}
              {illRides.map((r) => { num++; return renderRideItem(r, num); })}
            </div>
          );
        })()}

        {/* Later Round Options */}
        {laterRound.length > 0 && (
          <div>
            <div className="tier-lbl-row neutral">
              <span className="tier-lbl">Later Round Options</span>
            </div>
            {(() => {
              const sorted = [
                ...laterRound.filter((r) => prefs[r.id]?.llStatus !== LL_STATUS.DONTBOOK),
                ...laterRound.filter((r) => prefs[r.id]?.llStatus === LL_STATUS.DONTBOOK),
              ];
              let num = 0;
              return sorted.map((r) => {
                const isDemoted = prefs[r.id]?.llStatus === LL_STATUS.DONTBOOK;
                if (!isDemoted) num++;
                return renderRideItem(r, isDemoted ? null : num);
              });
            })()}
          </div>
        )}
      </>
    );
  };

  const prefsComplete = activeRides.every((r) => PEOPLE.every((p) => prefs[r.id]?.prefs?.[p.id]));

  return (
    <>
      <div className="rank-sec">
        <div className="rank-hdr" onClick={() => setOverallOpen((o) => !o)}>
          <span className="rank-title">Top Rides</span>
          <span className={`chev${overallOpen ? " open" : ""}`}>▼</span>
        </div>
        {overallOpen && <div className="rank-body">{renderOverall()}</div>}
      </div>
      <div className="rank-sec">
        <div className="rank-hdr" onClick={() => setLlOpen((o) => !o)}>
          <span className="rank-title">Lightning Lane Plan</span>
          <span className={`chev${llOpen ? " open" : ""}`}>▼</span>
        </div>
        {llOpen && <div className="rank-body">{renderLL()}</div>}
      </div>
      <div className="rank-sec" onClick={() => onSwitchToPrefs && onSwitchToPrefs(parkId)} style={{ cursor: "pointer" }}>
        <div className="rank-hdr">
          <span className="rank-title" style={{ color: prefsComplete ? "#2C5F8A" : "#C0392B" }}>
            {prefsComplete ? "See Ride Preferences Here →" : "Complete Ride Preferences Here →"}
          </span>
        </div>
      </div>
    </>
  );
}

// ── Summary ───────────────────────────────────────────────────────────────────

const TRIP_START = new Date(tripConfig.startDate + "T00:00:00");

// Parse "~8:09 AM" → minutes since midnight for sorting (Rarely = very large number)
function selloutMinutes(rideId) {
  const s = SELLOUT[rideId];
  if (!s || s.time === "Rarely") return 9999;
  const m = s.time.replace("~","").trim().match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return 9999;
  let h = parseInt(m[1]), min = parseInt(m[2]);
  if (m[3].toUpperCase() === "PM" && h !== 12) h += 12;
  if (m[3].toUpperCase() === "AM" && h === 12) h = 0;
  return h * 60 + min;
}

export function Summary({ prefs, syncing, onPref, onNotes, onClosed, onRdNom, onRdConfirm, onLLStatus, rides: allRides = [], onSwitchToPrefs, confirmedParks }) {
  const [collapsed, setCollapsed] = useState({});
  const isBeforeTrip = new Date() < TRIP_START;
  const [summaryMode, setSummaryModeRaw] = useState(() => {
    try { return localStorage.getItem("dw2026-summaryMode") || "llselection"; } catch (e) { return "llselection"; }
  });
  const setSummaryMode = (m) => { setSummaryModeRaw(m); try { localStorage.setItem("dw2026-summaryMode", m); } catch (e) {} };
  const [llSelPark, setLLSelParkRaw] = useState(() => {
    try { return localStorage.getItem("dw2026-llSelPark") || "mk"; } catch (e) { return "mk"; }
  });
  const setLLSelPark = (p) => { setLLSelParkRaw(p); try { localStorage.setItem("dw2026-llSelPark", p); } catch (e) {} };

  // Build ranked LL list for a park
  function buildRankedLLs(parkId) {
    const rides = allRides.filter((r) => r.park === parkId);
    const preBookStatuses = [LL_STATUS.FIRST, LL_STATUS.PREBOOK];
    const secondStatuses  = [LL_STATUS.SECOND];

    const prebook = rides.filter((r) => preBookStatuses.includes(prefs[r.id]?.llStatus));
    const second  = rides.filter((r) => secondStatuses.includes(prefs[r.id]?.llStatus));

    // Rank prebook rides: sort by sellout time asc, tiebreak by score desc
    const ranked = [...prebook]
      .map((r) => ({ ...r, selloutMins: selloutMinutes(r.id), score: calcScore(r.id, prefs) }))
      .sort((a, b) => a.selloutMins !== b.selloutMins ? a.selloutMins - b.selloutMins : b.score - a.score);

    // Assign labels: track separate counters for Single Pass and Multipass
    let spCount = 0, mpCount = 0;
    const labeled = ranked.map((r) => {
      const isSingle = r.ll === "ill";
      if (isSingle) { spCount++; return { ...r, label: `Single Pass${spCount > 1 ? ` ${spCount}` : ""}`, isSingle: true }; }
      else           { mpCount++; return { ...r, label: `Multipass ${mpCount}`, isSingle: false }; }
    });

    // Rank second-round rides similarly
    const rankedSecond = [...second]
      .map((r) => ({ ...r, selloutMins: selloutMinutes(r.id), score: calcScore(r.id, prefs) }))
      .sort((a, b) => a.selloutMins !== b.selloutMins ? a.selloutMins - b.selloutMins : b.score - a.score);

    return { labeled, rankedSecond };
  }

  // Get people who rated a ride Must Do or Like To
  function bookers(rideId) {
    return PEOPLE
      .filter((p) => {
        const pref = prefs[rideId]?.prefs?.[p.id];
        return pref === "must" || pref === "like";
      })
      .map((p) => p.id);
  }

  function bookersDisplay(rideId) {
    const who = bookers(rideId);
    if (who.length === PEOPLE.length) return "All";
    return who.join(" · ");
  }

  const SummaryRideItem = ({ label, isSingle, r, backup }) => {
    const bg     = isSingle ? "#FFF3E0" : "#E8F5E9";
    const color  = isSingle ? "#BF360C" : "#0A4A2E";
    const border = isSingle ? "#FFCC80" : "#A5D6A7";
    const who    = bookersDisplay(r.id);
    const backupWho = backup ? bookersDisplay(backup.id) : null;
    return (
      <div className="summary-item">
        <div className="summary-item-top">
          <span className="summary-badge" style={{ background: bg, color, border: `1px solid ${border}` }}>{label}</span>
          <div className="summary-ride-info">
            {r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="summary-ride-name">{r.displayName} ↗</a> : <span className="summary-ride-name">{r.displayName}</span>}
            {who && (
              <div style={{ fontSize: 10, color: "#888", fontFamily: "'DM Sans', sans-serif", marginTop: 2 }}>
                Book for: <span style={{ fontWeight: 600, color: "#555" }}>{who}</span>
              </div>
            )}
          </div>
        </div>
        {backup && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 6, paddingLeft: 8, borderLeft: "2px solid #EDE8E1" }}>
            <span style={{ fontSize: 9, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, padding: "2px 6px", borderRadius: 6, background: "#F5F5F5", color: "#888", border: "1px solid #DDD", flexShrink: 0, marginTop: 1 }}>Backup</span>
            <div>
              <a href={backup.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#555", fontFamily: "'DM Sans', sans-serif", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 2 }}>{backup.displayName} ↗</a>
              {backupWho && (
                <div style={{ fontSize: 10, color: "#AAA", fontFamily: "'DM Sans', sans-serif", marginTop: 1 }}>
                  Book for: <span style={{ fontWeight: 600, color: "#888" }}>{backupWho}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* LL Selection / Pre-Book / Full Plan toggle */}
      <div style={{ display: "flex", background: "#EDE8E1", borderRadius: 20, padding: 3, marginBottom: 16 }}>
        {[
          { id: "llselection", label: "LL Selection" },
          { id: "prebook",     label: "Pre-Book Only" },
          { id: "all",         label: "Full Plan" },
        ].map(({ id, label }) => (
          <button key={id} onClick={() => setSummaryMode(id)} style={{
            flex: 1, padding: "7px 0", border: "none", borderRadius: 17,
            fontSize: 12, fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
            cursor: "pointer", transition: "background 0.15s, color 0.15s",
            background: summaryMode === id ? "#FFF" : "transparent",
            color: summaryMode === id ? "#1A1A1A" : "#999",
            boxShadow: summaryMode === id ? "0 1px 4px rgba(0,0,0,0.12)" : "none",
          }}>{label}</button>
        ))}
      </div>
      {/* LL Selection sub-view — park selector + ParkRides */}
      {summaryMode === "llselection" && (
        <div>
          <div style={{ display:"flex", background:"#EDE8E1", borderRadius:20, padding:3, marginBottom:16 }}>
            {PARKS.map(p => (
              <button key={p.id} onClick={() => setLLSelPark(p.id)} style={{
                flex:1, padding:"7px 0", border:"none", borderRadius:17,
                fontSize:12, fontFamily:"'DM Sans',sans-serif", fontWeight:600,
                cursor:"pointer", transition:"background 0.15s, color 0.15s",
                background: llSelPark === p.id ? "#FFF" : "transparent",
                color: llSelPark === p.id ? "#1A1A1A" : "#999",
                boxShadow: llSelPark === p.id ? "0 1px 4px rgba(0,0,0,0.12)" : "none",
              }}>{p.name}</button>
            ))}
          </div>
          <ParkRides
            parkId={llSelPark}
            prefs={prefs}
            syncing={syncing}
            onPref={onPref}
            onNotes={onNotes}
            onClosed={onClosed}
            onRdNom={onRdNom}
            onRdConfirm={onRdConfirm}
            onLLStatus={onLLStatus}
            rides={allRides}
            onSwitchToPrefs={onSwitchToPrefs}
          />
        </div>
      )}
      {(summaryMode === "prebook" || summaryMode === "all") && (confirmedParks ? PARKS.filter(p => confirmedParks.includes(p.id)) : PARKS).map((park) => {
        const rdConf  = prefs[`rdc_${park.id}`] ?? null;
        const rdRide  = rdConf ? allRides.find((r) => r.id === rdConf) : null;
        const { labeled, rankedSecond } = buildRankedLLs(park.id);

        const showRD     = summaryMode === "all" && !!rdRide;
        const showSecond = summaryMode === "all" && rankedSecond.length > 0;
        const hasAnything = showRD || labeled.length > 0 || showSecond;
        const isCollapsed = collapsed[park.id];

        return (
          <div className="summary-park" key={park.id}>
            <div className="summary-park-hdr" onClick={() => setCollapsed((c) => ({ ...c, [park.id]: !c[park.id] }))}>
              <span className="summary-park-name" style={{ color: park.color }}>{park.name}</span>
              <span className={`chev${!isCollapsed ? " open" : ""}`}>▼</span>
            </div>
            {!isCollapsed && (
              <div className="summary-body">
                {!hasAnything && <div className="summary-empty">No selections yet</div>}
                {showRD && (
                  <div className="summary-item">
                    <div className="summary-item-top">
                      <span className="summary-badge" style={{ background: "#F1F8F4", color: "#1A6B4A", border: "1px solid #A5D6A7" }}>🏃 Rope Drop</span>
                      <div className="summary-ride-info">
                        <a href={rdRide.url} target="_blank" rel="noreferrer" className="summary-ride-name">{rdRide.displayName} ↗</a>
                      </div>
                    </div>
                  </div>
                )}
                {labeled.map((r, i) => {
                  // Backups: match same Multipass tier (mp1/mp2), Single Pass → none
                  let backup = null;
                  if (!r.isSingle) {
                    const rideTier = r.ll; // "mp1" or "mp2"
                    backup = rankedSecond.find((s) => s.ll === rideTier) ?? null;
                  }
                  return <SummaryRideItem key={r.id} label={r.label} isSingle={r.isSingle} r={r} backup={backup} />;
                })}
                {showSecond && (
                  <>
                    <div className="summary-section-lbl">2nd Round — book after first tap-in</div>
                    {rankedSecond.map((r, i) => (
                      <div key={r.id} className="summary-item">
                        <div className="summary-item-top">
                          <span className="summary-badge" style={{ background: "#FFFDE7", color: "#B8860B", border: "1px solid #FFE082" }}>{`2nd Round ${i + 1}`}</span>
                          <div className="summary-ride-info">
                            {r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="summary-ride-name">{r.displayName} ↗</a> : <span className="summary-ride-name">{r.displayName}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── ParkRides ─────────────────────────────────────────────────────────────────

export function ParkRides({ parkId, prefs, onPref, onNotes, onClosed, onRdNom, syncing, onRdConfirm, onLLStatus, showRankings = true, rides: allRides = [], onSwitchToPrefs }) {
  const [ratedOpen, setRatedOpen] = useState(false);

  const parkRides = allRides.filter((r) => r.park === parkId);

  const needsRating = parkRides.filter((r) =>
    !isClosed(r.id, prefs) && totalVotes(r.id, prefs) < PEOPLE.length
  );
  const ratedAndClosed = parkRides.filter((r) =>
    isClosed(r.id, prefs) || totalVotes(r.id, prefs) === PEOPLE.length
  );
  const allRated = needsRating.length === 0;

  const cardProps = { prefs, onPref, onNotes, onClosed, onRdNom, syncing };

  return (
    <>
      {needsRating.map((ride) => (
        <RideCard key={ride.id} ride={ride} {...cardProps} />
      ))}
      {!showRankings && ratedAndClosed.length > 0 && (
        <div className="rank-sec" style={{marginTop: '0', marginBottom: '10px'}}>
          <div className="rank-hdr" onClick={() => !allRated && setRatedOpen((o) => !o)} style={{ cursor: allRated ? "default" : "pointer" }}>
            <span className="rank-title">Rated (or Closed) Rides ({ratedAndClosed.length})</span>
            {!allRated && <span className={`chev${ratedOpen ? " open" : ""}`}>▼</span>}
          </div>
          {(allRated || ratedOpen) && ratedAndClosed.map((ride) => (
            <RideCard key={ride.id} ride={ride} {...cardProps} />
          ))}
        </div>
      )}
      {showRankings && <Rankings parkId={parkId} prefs={prefs} onRdConfirm={onRdConfirm} onLLStatus={onLLStatus} rides={allRides} onSwitchToPrefs={onSwitchToPrefs} />}
    </>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
