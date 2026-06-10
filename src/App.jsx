import { useState, useEffect, useCallback } from "react";
import { tripConfig } from "./trip.config";
import { Itinerary } from "./Itinerary";

const WORKER_URL = "https://disney-intinerary-app.45-reactor-puritan.workers.dev";

export const LL_STATUS = {
  FIRST:    "Pre-Book (1st)",
  PREBOOK:  "Pre-Book",
  SECOND:   "2nd Round",
  LATER:    "Later",
  DONTBOOK: "Don't Book",
};

export const PEOPLE = tripConfig.people;

const PREF_NOTION = { must: "Must Do", like: "Like To", neutral: "Neutral", skip: "Skip It" };
const NOTION_PREF = { "Must Do": "must", "Like To": "like", "Neutral": "neutral", "Skip It": "skip" };

const LL_MAP = {
  "Individual LL (Single Pass)": "ill",
  "Multipass Tier 1":            "mp1",
  "Multipass Tier 2":            "mp2",
  "No Lightning Lane":           "noll",
};

// ── Storage ───────────────────────────────────────────────────────────────────
const LS_KEY = `dw-${tripConfig.tripId}-ll-v1`;
function loadStorage() {
  try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : {}; } catch (_) { return {}; }
}
function saveStorage(data) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch (_) {}
}

// ── Fetch rides from Notion ───────────────────────────────────────────────────
function toDisplayName(raw) {
  return raw.replace(/^(The|A|An) /i, (_, p) => `(${p}) `);
}
function sortKey(name) {
  return name.replace(/^\((?:The|A|An)\)\s*/i, "").toLowerCase();
}

async function fetchRides() {
  const res = await fetch(`${WORKER_URL}/rides`);
  if (!res.ok) return [];
  const data = await res.json();
  if (!data.results) return [];
  const parkMap = {
    "Magic Kingdom":     "mk",
    "EPCOT":             "ep",
    "Hollywood Studios": "hs",
    "Animal Kingdom":    "ak",
  };
  return data.results
    .map(page => {
      const props = page.properties;
      const name     = props["Ride Name"]?.rich_text?.[0]?.text?.content ?? "";
      const id       = props["Ride ID"]?.title?.[0]?.text?.content ?? "";
      const parkName = props["Park"]?.select?.name ?? "";
      const park     = parkMap[parkName] ?? parkName.toLowerCase().slice(0, 2);
      const llLabel  = props["Lightning Lane"]?.select?.name ?? "No Lightning Lane";
      const ll       = LL_MAP[llLabel] ?? "noll";
      const illPrice = props["ILL Price"]?.select?.name ?? null;
      const type     = props["Type"]?.select?.name ?? "Ride";
      const url      = props["userDefined:URL"]?.url ?? props["URL"]?.url ?? props["url"]?.url ?? null;
      const visa     = props["Visa Only"]?.checkbox ?? false;
      const hours    = props["Hours"]?.rich_text?.[0]?.text?.content ?? null;
      const location = props["Location"]?.rich_text?.[0]?.text?.content ?? null;
      const earlyEntry = props["Early Entry"]?.checkbox ?? false;
      const llSellout  = props["LL Sellout Time"]?.rich_text?.[0]?.text?.content ?? null;
      const avgStandby = props["Avg Standby Wait"]?.rich_text?.[0]?.text?.content ?? null;
      const waitInsight= props["Wait Insight"]?.rich_text?.[0]?.text?.content ?? null;
      if (!id || !name) return null;
      return { id, park, name, displayName: toDisplayName(name), ll, illPrice, type, url, visa, hours, location, earlyEntry, llSellout, avgStandby, waitInsight };
    })
    .filter(Boolean)
    .sort((a, b) => sortKey(a.displayName).localeCompare(sortKey(b.displayName)));
}

// ── Fetch votes from Notion ───────────────────────────────────────────────────
async function fetchAllVotes() {
  const [votesData, metaData] = await Promise.all([
    fetch(`${WORKER_URL}/votes`).then((r) => r.json()),
    fetch(`${WORKER_URL}/meta`).then((r) => r.json()),
  ]);

  const prefs = {};

  if (votesData.results) {
    votesData.results.forEach((page) => {
      const rideId    = page.properties["Ride ID"]?.rich_text?.[0]?.text?.content;
      const person    = page.properties["Person"]?.rich_text?.[0]?.text?.content;
      const prefLabel = page.properties["Preference"]?.select?.name;
      const prefKey   = NOTION_PREF[prefLabel];
      if (!rideId || !person || !prefKey) return;
      if (!prefs[rideId]) prefs[rideId] = { prefs: {}, pageIds: {} };
      prefs[rideId].prefs[person]   = prefKey;
      prefs[rideId].pageIds[person] = page.id;
    });
  }

  if (metaData.results) {
    metaData.results.forEach((page) => {
      const rideId      = page.properties["Ride ID"]?.rich_text?.[0]?.text?.content;
      const closed      = page.properties["Closed"]?.checkbox ?? false;
      const rdNom       = page.properties["Rope Drop Nominee"]?.checkbox ?? false;
      const rdConfirmed = page.properties["Rope Drop Confirmed"]?.checkbox ?? false;
      const llStatus    = (page.properties["LL Status"]?.select?.name ?? null)?.replace(/[\u2018\u2019\u201A\u201B]/g, "'") ?? null;
      const notes       = page.properties["Notes"]?.rich_text?.[0]?.text?.content ?? "";
      if (!rideId) return;
      if (!prefs[rideId]) prefs[rideId] = { prefs: {}, pageIds: {} };
      prefs[rideId].closed   = closed;
      prefs[rideId].rdNom    = rdNom;
      prefs[rideId].llStatus = llStatus;
      prefs[rideId].notes    = notes;
      if (rdConfirmed) {
        const park = tripConfig.parks.find((p) => rideId.startsWith(p));
        if (park) prefs[`rdc_${park}`] = rideId;
      }
    });
  }

  return prefs;
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setViewRaw] = useState(() => {
    try { return localStorage.getItem(`dw-${tripConfig.tripId}-view`) || "itinerary"; } catch (e) { return "itinerary"; }
  });
  const setView = (v) => { setViewRaw(v); try { localStorage.setItem(`dw-${tripConfig.tripId}-view`, v); } catch (e) {} };
  const [prefs,     setPrefs]     = useState(() => loadStorage());
  const [rides,     setRides]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [syncing,   setSyncing]   = useState({});
  const [syncError, setSyncError] = useState(null);

  useEffect(() => {
    Promise.all([fetchRides(), fetchAllVotes()])
      .then(([ridesData, notionData]) => {
        setRides(ridesData);
        setPrefs((local) => {
          const merged = { ...local };
          Object.entries(notionData).forEach(([key, data]) => {
            if (key.startsWith("rdc_")) { merged[key] = data; }
            else {
              merged[key] = {
                ...local[key], ...data,
                prefs:   { ...(local[key]?.prefs   ?? {}), ...(data.prefs   ?? {}) },
                pageIds: { ...(local[key]?.pageIds ?? {}), ...(data.pageIds ?? {}) },
              };
            }
          });
          saveStorage(merged);
          return merged;
        });
      })
      .catch(() => setSyncError("Could not load from server — showing local data."))
      .finally(() => setLoading(false));
  }, []);

  const handlePref = useCallback(async (rideId, pid, pref, ride) => {
    const syncKey = `${rideId}_${pid}`;
    setPrefs((prev) => {
      const curPref = prev[rideId]?.prefs?.[pid] ?? null;
      const newPref = curPref === pref ? null : pref;
      const next = { ...prev, [rideId]: { ...prev[rideId], prefs: { ...(prev[rideId]?.prefs ?? {}), [pid]: newPref } } };
      if (!newPref) delete next[rideId].prefs[pid];
      saveStorage(next);
      return next;
    });
    setSyncing((s) => ({ ...s, [syncKey]: true }));
    setSyncError(null);
    try {
      const existingPageId = prefs[rideId]?.pageIds?.[pid];
      if (existingPageId) {
        await fetch(`${WORKER_URL}/votes`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pageId: existingPageId }) });
      }
      const curPref = prefs[rideId]?.prefs?.[pid] ?? null;
      if (curPref !== pref) {
        const res = await fetch(`${WORKER_URL}/votes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rideId, rideName: ride?.displayName, park: ride?.park, person: pid, preference: PREF_NOTION[pref] }) });
        const pageId = (await res.json()).id;
        setPrefs((prev) => { const next = { ...prev, [rideId]: { ...prev[rideId], pageIds: { ...(prev[rideId]?.pageIds ?? {}), [pid]: pageId } } }; saveStorage(next); return next; });
      } else {
        setPrefs((prev) => { const next = { ...prev }; if (next[rideId]?.pageIds) delete next[rideId].pageIds[pid]; saveStorage(next); return next; });
      }
    } catch (_) { setSyncError("Vote saved locally but could not sync to server."); }
    finally { setSyncing((s) => { const n = { ...s }; delete n[syncKey]; return n; }); }
  }, [prefs]);

  const handleNotes = useCallback((rideId, val, ride, saveMetaFn) => {
    setPrefs((prev) => {
      const next = { ...prev, [rideId]: { ...prev[rideId], notes: val } };
      saveStorage(next);
      if (saveMetaFn && ride) saveMetaFn(rideId, ride.displayName, ride.park, next[rideId], next[`rdc_${ride.park}`]);
      return next;
    });
  }, []);

  const handleClosed = useCallback((rideId, ride, isClosedFn, saveMetaFn) => {
    setPrefs((prev) => {
      const cur  = isClosedFn(rideId, prev);
      const park = ride?.park;
      const next = { ...prev, [rideId]: { ...prev[rideId], closed: !cur } };
      if (!cur) { next[rideId].rdNom = false; if (next[`rdc_${park}`] === rideId) next[`rdc_${park}`] = null; }
      saveStorage(next);
      if (saveMetaFn && ride) saveMetaFn(rideId, ride.displayName, park, next[rideId], next[`rdc_${park}`]);
      return next;
    });
  }, []);

  const handleRdNom = useCallback((rideId, ride, saveMetaFn) => {
    setPrefs((prev) => {
      const wasNom = prev[rideId]?.rdNom ?? false;
      const park   = ride?.park;
      const next   = { ...prev, [rideId]: { ...prev[rideId], rdNom: !wasNom } };
      if (wasNom && next[`rdc_${park}`] === rideId) next[`rdc_${park}`] = null;
      saveStorage(next);
      if (saveMetaFn && ride) saveMetaFn(rideId, ride.displayName, park, next[rideId], next[`rdc_${park}`]);
      return next;
    });
  }, []);

  const handleRdConfirm = useCallback((parkId, rideId, parkRides, saveMetaFn) => {
    setPrefs((prev) => {
      const cur  = prev[`rdc_${parkId}`] ?? null;
      const next = { ...prev, [`rdc_${parkId}`]: cur === rideId ? null : rideId };
      saveStorage(next);
      if (saveMetaFn && parkRides) {
        parkRides.filter((r) => prev[r.id]?.rdNom)
          .forEach((r) => saveMetaFn(r.id, r.displayName, parkId, next[r.id] ?? {}, next[`rdc_${parkId}`]));
      }
      return next;
    });
  }, []);

  const handleLLStatus = useCallback((rideId, status, ride, saveMetaFn) => {
    setPrefs((prev) => {
      const cur  = prev[rideId]?.llStatus ?? null;
      const next = { ...prev, [rideId]: { ...prev[rideId], llStatus: cur === status ? null : status } };
      saveStorage(next);
      if (saveMetaFn && ride) saveMetaFn(rideId, ride.displayName, ride.park, next[rideId], next[`rdc_${ride.park}`]);
      return next;
    });
  }, []);

  const handleRefresh = useCallback(() => {
    // Clear only Notion-sourced data, preserve UI state and weather cache
    localStorage.removeItem(LS_KEY);
    setPrefs({});
    setRides([]);
    setLoading(true);
    setSyncError(null);
    Promise.all([fetchRides(), fetchAllVotes()])
      .then(([ridesData, notionData]) => {
        setRides(ridesData);
        setPrefs(() => {
          const merged = { ...notionData };
          saveStorage(merged);
          return merged;
        });
      })
      .catch(() => setSyncError("Could not load from server — showing local data."))
      .finally(() => setLoading(false));
  }, []);

  const handleReset = useCallback(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.reload();
  }, []);

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: "#FBF7F2", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; background: #FBF7F2; font-family: 'DM Sans', sans-serif; }
        .app { max-width: 480px; margin: 0 auto; padding: 20px 16px 60px; }
        .app *, .app *::before, .app *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .ride-card { background: #FFF; border-radius: 14px; border: 1px solid #EDE8E1; margin-bottom: 10px; overflow: hidden; }
        .ride-card.card-closed { background: #EEECEA; border-color: #D8D4CD; }
        .ride-header { padding: 12px 16px 10px; border-bottom: 1px solid #F5F0EA; }
        .card-closed .ride-header { border-color: #D8D4CD; }
        .name-row  { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 4px; }
        .ride-name { font-size: 14px; color: #1A1A1A; flex: 1; line-height: 1.3; }
        .ride-name a { color: #1A1A1A; text-decoration: underline; text-decoration-style: dotted; text-underline-offset: 3px; }
        .card-closed .ride-name a { color: #999; }
        .ride-meta { font-size: 10px; color: #AAA; font-family: 'DM Sans', sans-serif; margin-bottom: 4px; }
        .ride-location { font-size: 10px; color: #AAA; font-family: 'DM Sans', sans-serif; margin-bottom: 6px; }
        .ride-meta.meta-closed { color: #B71C1C; font-weight: bold; }
        .controls-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 6px; }
        .btn-sm { font-size: 9px; font-family: 'DM Sans', sans-serif; padding: 2px 8px; border-radius: 10px; text-transform: uppercase; font-weight: bold; border: 1px solid #BDBDBD; background: #F5F5F5; color: #1A1A1A; cursor: pointer; }
        .rd-btn { font-size: 9px; font-family: 'DM Sans', sans-serif; padding: 3px 10px; border-radius: 10px; text-transform: uppercase; font-weight: bold; border: 1.5px solid #C8C0B6; background: #F0EBE3; color: #1A1A1A; cursor: pointer; white-space: nowrap; }
        .rd-btn.on { background: #1A6B4A; border-color: #1A6B4A; color: #FFF; }
        .score-badge { font-size: 11px; font-family: 'DM Sans', sans-serif; font-weight: bold; padding: 2px 7px; border-radius: 10px; flex-shrink: 0; }
        .score-hi { background: #E8F5E9; color: #1B5E20; }
        .score-md { background: #E3F2FD; color: #0D47A1; }
        .score-lo { background: #F5F5F5; color: #424242; }
        .score-ng { background: #FFEBEE; color: #B71C1C; }
        .prog { height: 3px; background: #EDE8E1; border-radius: 2px; margin-top: 4px; }
        .prog-fill { height: 100%; border-radius: 2px; }
        .prefs { padding: 10px 16px 6px; border-bottom: 1px solid #F5F0EA; }
        .prefs.section-closed { opacity: 0.4; pointer-events: none; background: #EEECEA; }
        .fam-blk { margin-bottom: 8px; }
        .fam-lbl { font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase; color: #AAA; font-family: 'DM Sans', sans-serif; margin-bottom: 6px; }
        .p-row { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
        .p-lbl { font-size: 11px; font-family: 'DM Sans', sans-serif; color: #1A1A1A; width: 18px; flex-shrink: 0; font-weight: bold; }
        .sync-dot { font-size: 10px; color: #2C5F8A; margin-left: 1px; }
        .pref-btns { display: flex; gap: 3px; flex: 1; }
        .pb { flex: 1; padding: 6px 2px; border-radius: 6px; border: 1.5px solid #C8C0B6; background: #F0EBE3; font-size: 8px; font-family: 'DM Sans', sans-serif; cursor: pointer; color: #1A1A1A; text-align: center; white-space: nowrap; font-weight: bold; }
        .pb:hover:not(:disabled) { border-color: #999; background: #E5DED5; }
        .pb:disabled { opacity: 0.6; cursor: wait; }
        .pb.sel-must    { background: #1A6B4A !important; border-color: #1A6B4A !important; color: #FFF !important; }
        .pb.sel-like    { background: #6AAB7E !important; border-color: #6AAB7E !important; color: #FFF !important; }
        .pb.sel-neutral { background: #888    !important; border-color: #888    !important; color: #FFF !important; }
        .pb.sel-skip    { background: #C0392B !important; border-color: #C0392B !important; color: #FFF !important; }
        .notes-sec { padding: 8px 16px 10px; }
        .notes-sec.section-closed { opacity: 0.4; pointer-events: none; background: #EEECEA; }
        .notes-inp { width: 100%; border: 1.5px solid #D0CBC2; border-radius: 8px; padding: 7px 10px; font-size: 12px; font-family: 'DM Sans', sans-serif; color: #1A1A1A; resize: none; background: #FBF7F2; min-height: 44px; }
        .notes-inp:focus { outline: none; border-color: #AAA; }
        .rank-sec { margin-top: 24px; background: #FFF; border-radius: 14px; border: 1px solid #EDE8E1; }
        .rank-hdr { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; cursor: pointer; border-bottom: 1px solid #F5F0EA; }
        .rank-title { font-size: 14px; color: #1A1A1A; font-family: 'DM Sans', sans-serif; }
        .chev { font-size: 11px; color: #AAA; transition: transform 0.2s; display: inline-block; }
        .chev.open { transform: rotate(180deg); }
        .rank-body { padding: 10px 16px 12px; position: relative; }
        .tier-lbl { font-size: 11px; font-weight: 600; letter-spacing: 0.03em; text-transform: uppercase; color: #555; font-family: 'DM Sans', sans-serif; line-height: 1.4; }
        .tier-lbl-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; border-radius: 8px; margin: 10px 0 6px; background: #F0EBE3; }
        .tier-lbl-row:first-child { margin-top: 0; }
        .tier-lbl-row.complete { background: #F1F8F4; }
        .tier-lbl-row.incomplete { background: #FFF8E1; }
        .tier-lbl-row.neutral { background: #F0EBE3; }
        .r-item { background: #FAFAF8; border-radius: 10px; border: 1px solid #EDE8E1; margin-bottom: 5px; padding: 8px 12px; }
        .r-item.r-skipped { background: #F5F3F0; border-color: #E8E3DC; opacity: 0.65; }
        .r-item-top { display: flex; align-items: center; gap: 6px; }
        .r-item-meta { display: flex; flex-wrap: nowrap; gap: 4px; margin-top: 4px; padding-left: 4px; }
        .r-meta-badge { font-size: 9px; font-family: 'DM Sans', sans-serif; font-weight: bold; padding: 1px 7px; border-radius: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .r-meta-badge-ll { flex: 0 0 auto; }
        .r-meta-badge-sb { flex: 1; }
        .r-num  { font-size: 10px; font-family: 'DM Sans', sans-serif; color: #CCC; width: 14px; flex-shrink: 0; }
        .r-name { flex: 1; font-size: 12px; color: #1A1A1A; line-height: 1.3; }
        .r-link { color: #1A1A1A; text-decoration: underline; text-decoration-style: dotted; text-underline-offset: 2px; }
        .r-name-skip .r-link { text-decoration: line-through; color: #AAA; }
        .ill-price { font-size: 9px; color: #BF360C; margin-left: 4px; font-family: 'DM Sans', sans-serif; }
        .r-pill { font-size: 9px; font-family: 'DM Sans', sans-serif; padding: 1px 5px; border-radius: 8px; font-weight: bold; flex-shrink: 0; pointer-events: none; }
        .b-sp  { background: #FFF3E0; color: #BF360C; border: 1px solid #FFCC80; }
        .b-mp1 { background: #E8F5E9; color: #1B5E20; border: 1px solid #A5D6A7; }
        .b-mp2 { background: #E3F2FD; color: #0D47A1; border: 1px solid #90CAF9; }
        .rd-tag   { background: #F1F8F4; color: #1A6B4A; border: 1px solid #A5D6A7; }
        .ee-tag   { background: #E3F2FD; color: #0D47A1; border: 1px solid #90CAF9; }
        .visa-tag { background: #F3E5F5; color: #6A1B9A; border: 1px solid #CE93D8; }
        .ll-tag   { background: #FFF3E0; color: #BF360C; border: 1px solid #FFCC80; }
        .rd-chk { width: 20px; height: 20px; border-radius: 5px; border: 1.5px solid #C8C0B6; background: #FFF; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; font-size: 11px; }
        .rd-chk.on { background: #1A6B4A; border-color: #1A6B4A; color: #FFF; }
        .conflict { background: #FFF8E1; border: 1px solid #FFE082; border-radius: 8px; padding: 8px 12px; margin-bottom: 8px; font-size: 11px; color: #E65100; font-family: 'DM Sans', sans-serif; }
        .rd-pend  { background: #F1F8F4; border: 1px solid #A5D6A7; border-radius: 8px; padding: 7px 10px; margin-bottom: 6px; font-size: 11px; color: #2E7D32; font-family: 'DM Sans', sans-serif; }
        .ll-menu-btn { font-size: 9px; font-family: 'DM Sans', sans-serif; font-weight: bold; padding: 3px 8px; border-radius: 10px; border: 1.5px solid #C8C0B6; background: #F0EBE3; color: #1A1A1A; cursor: pointer; white-space: nowrap; }
        .ll-menu-popup { position: absolute; right: 0; background: #FFF; border: 1px solid #EDE8E1; border-radius: 10px; overflow: hidden; width: 145px; z-index: 1000; box-shadow: 0 4px 16px rgba(0,0,0,0.15); }
        .ll-menu-item { padding: 8px 12px; font-size: 11px; font-family: 'DM Sans', sans-serif; color: #1A1A1A; cursor: pointer; display: flex; align-items: center; gap: 8px; }
        .ll-menu-item:hover { background: #F5F2EE; }
        .ll-menu-item.ll-menu-disabled { opacity: 0.35; cursor: not-allowed; }
        .ll-menu-item.ll-menu-active { background: #F1F8F4; }
        .ll-menu-item.ll-menu-clear { border-top: 1px solid #EDE8E1; color: #AAA; }
        .ll-menu-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .ll-menu-check { margin-left: auto; color: #1A6B4A; }
        .summary-park { background: #FFF; border-radius: 14px; border: 1px solid #EDE8E1; margin-bottom: 10px; overflow: hidden; }
        .summary-park-hdr { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; cursor: pointer; border-bottom: 1px solid #F5F0EA; }
        .summary-park-name { font-size: 14px; font-family: 'DM Sans', sans-serif; }
        .summary-body { padding: 10px 16px 12px; }
        .summary-empty { font-size: 12px; color: #AAA; font-family: 'DM Sans', sans-serif; }
        .summary-section-lbl { font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase; color: #AAA; font-family: 'DM Sans', sans-serif; margin: 10px 0 4px; }
        .summary-item { padding: 8px 0; border-bottom: 1px solid #F5F0EA; }
        .summary-item:last-child { border-bottom: none; }
        .summary-item-top { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 4px; }
        .summary-badge { font-size: 9px; font-family: 'DM Sans', sans-serif; font-weight: bold; padding: 2px 7px; border-radius: 8px; white-space: nowrap; flex-shrink: 0; margin-top: 1px; }
        .summary-ride-info { flex: 1; }
        .summary-ride-name { font-size: 13px; color: #1A1A1A; text-decoration: underline; text-decoration-style: dotted; text-underline-offset: 2px; display: block; line-height: 1.3; }
        .summary-ll-type { font-size: 9px; color: #AAA; font-family: 'DM Sans', sans-serif; }
        .summary-meta-row { display: flex; flex-wrap: nowrap; gap: 4px; margin-top: 4px; }
      `}</style>

      <div style={{ flex: 1 }}>
        <Itinerary
          view={view}
          setView={setView}
          prefs={prefs}
          rides={rides}
          syncing={syncing}
          loading={loading}
          syncError={syncError}
          onPref={handlePref}
          onNotes={handleNotes}
          onClosed={handleClosed}
          onRdNom={handleRdNom}
          onRdConfirm={handleRdConfirm}
          onLLStatus={handleLLStatus}
        />
      </div>

      {/* ── App Footer ── */}
      <div style={{ padding: "16px 20px 32px", textAlign: "center" }}>
        <div style={{ fontSize: 10, color: "#CCC", fontFamily: "'DM Sans',sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
          {tripConfig.name}
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
          <button
            onClick={handleRefresh}
            disabled={loading}
            style={{ fontSize: 11, fontFamily: "'DM Sans',sans-serif", fontWeight: 600, padding: "6px 14px", borderRadius: 20, border: "1.5px solid #C8C0B6", background: "#F0EBE3", color: "#555", cursor: loading ? "wait" : "pointer", opacity: loading ? 0.5 : 1 }}
          >
            {loading ? "Refreshing…" : "↻ Refresh"}
          </button>
          <button
            onClick={handleReset}
            style={{ fontSize: 11, fontFamily: "'DM Sans',sans-serif", fontWeight: 600, padding: "6px 14px", borderRadius: 20, border: "1.5px solid #C8C0B6", background: "#F0EBE3", color: "#C0392B", cursor: "pointer" }}
          >
            ✕ Reset
          </button>
        </div>
      </div>
    </div>
  );
}
