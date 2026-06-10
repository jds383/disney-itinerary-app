import { useState, useEffect, useRef } from "react";
import { ParkRides, Summary, RIDES, saveMetaToNotion, isClosed } from "./LLPlanner";
import { tripConfig } from "./trip.config";

const WORKER_URL = "https://disney-intinerary-app.45-reactor-puritan.workers.dev";

// ── Day colors by type/park ───────────────────────────────────────────────────
const DAY_COLORS = {
  Travel:  "#2C5F8A",
  Resort:  "#7B4F2E",
  mk:      "#1A6B4A",
  ep:      "#4A2C6B",
  hs:      "#8A3A2C",
  ak:      "#5C7A2E",
  Test:    "#555",
};

function getDayColor(day) {
  if (day.parkId && DAY_COLORS[day.parkId]) return DAY_COLORS[day.parkId];
  return DAY_COLORS[day.dayType] || "#7B4F2E";
}

// ── Session storage helpers ───────────────────────────────────────────────────
const SS_KEY = `dw-${tripConfig.tripId}-expanded`;

function loadExpanded() {
  try { const r = sessionStorage.getItem(SS_KEY); return r ? JSON.parse(r) : null; }
  catch (_) { return null; }
}

function saveExpanded(set) {
  try { sessionStorage.setItem(SS_KEY, JSON.stringify([...set])); } catch (_) {}
}

// ── Default expanded day logic ────────────────────────────────────────────────
function getDefaultExpandedDate(calendarDays) {
  if (!calendarDays.length) return null;
  const today = new Date().toISOString().split("T")[0];
  // If today is a trip day, expand it
  const todayDay = calendarDays.find(d => d.date === today);
  if (todayDay) return todayDay.date;
  // Otherwise expand the next future trip day
  const future = calendarDays.filter(d => d.date > today).sort((a, b) => a.date.localeCompare(b.date));
  if (future.length) return future[0].date;
  // Trip is over — expand the last day
  return calendarDays[calendarDays.length - 1].date;
}

// ── Notion fetch functions ────────────────────────────────────────────────────
async function fetchBookedLLs() {
  try {
    const res = await fetch(`${WORKER_URL}/activities`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.results) return [];
    return data.results
      .filter(page => (page.properties["Visibility"]?.select?.name ?? "Show") !== "Delete")
      .map((page) => {
        const props = page.properties;
        return {
          rideName:   props["Name"]?.title?.[0]?.text?.content ?? "",
          rideId:     props["Ride ID"]?.rich_text?.[0]?.text?.content ?? "",
          park:       props["Park"]?.select?.name ?? "",
          date:       props["Date"]?.date?.start ?? "",
          startTime:  props["Start Time"]?.rich_text?.[0]?.text?.content ?? "",
          endTime:    props["End Time"]?.rich_text?.[0]?.text?.content ?? "",
          party:      props["Party"]?.rich_text?.[0]?.text?.content ?? "All",
          type:       props["Type"]?.select?.name ?? "LL",
          location:   props["Location"]?.rich_text?.[0]?.text?.content ?? "",
          resort:     props["Resort"]?.select?.name ?? "",
          optional:   props["Optional"]?.checkbox ?? false,
          visibility: props["Visibility"]?.select?.name ?? "Show",
          pageId:     page.id,
          icon:       props["Icon"]?.rich_text?.[0]?.text?.content ?? "",
          url:        props["userDefined:URL"]?.url ?? props["URL"]?.url ?? props["userDefined:URL"]?.rich_text?.[0]?.text?.content ?? "",
          subtext:    props["Subtext"]?.rich_text?.[0]?.text?.content ?? "",
          sortTime:   props["Sort Time"]?.number ?? 9999,
        };
      });
  } catch (e) { return []; }
}

async function fetchCalendarDays() {
  try {
    const res = await fetch(`${WORKER_URL}/calendar`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.results) return [];
    return data.results
      .map(page => {
        const props = page.properties;
        return {
          date:      props["Date"]?.date?.start ?? null,
          name:      props["Name"]?.title?.[0]?.text?.content ?? "",
          dayType:   props["Day Type"]?.select?.name ?? null,
          parkId:    props["Park ID"]?.select?.name ?? null,
          latStart:  props["Lat Start"]?.number ?? null,
          lonStart:  props["Lon Start"]?.number ?? null,
          latEnd:    props["Lat End"]?.number ?? null,
          lonEnd:    props["Lon End"]?.number ?? null,
          locStart:  props["Location Start"]?.rich_text?.[0]?.text?.content ?? null,
          locEnd:    props["Location End"]?.rich_text?.[0]?.text?.content ?? null,
        };
      })
      .filter(d => d.date && d.dayType !== "Test")
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (e) { return []; }
}

// ── Time helpers ──────────────────────────────────────────────────────────────
function parseTimeToInt(str) {
  if (!str) return 9999;
  const m = str.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return 9999;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const ampm = m[3].toUpperCase();
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return h * 100 + min;
}

function isLLExpired(endTime, isoDate, startTime) {
  if (!isoDate) return false;
  const today = new Date().toISOString().split("T")[0];
  if (isoDate !== today) return false;
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  if (endTime) {
    const t = parseTimeToInt(endTime);
    return nowMins > Math.floor(t / 100) * 60 + (t % 100) + 5;
  } else if (startTime) {
    const t = parseTimeToInt(startTime);
    return nowMins > Math.floor(t / 100) * 60 + (t % 100) + 60;
  }
  return false;
}

function isToday(dateStr) {
  const now = new Date();
  const [y, m, d] = dateStr.split("-").map(Number);
  return now.getFullYear() === y && now.getMonth() + 1 === m && now.getDate() === d;
}

// ── Weather ───────────────────────────────────────────────────────────────────
const WMO_ICON  = { 0:"☀️",1:"🌤️",2:"⛅",3:"☁️",45:"🌫️",48:"🌫️",51:"🌦️",53:"🌦️",55:"🌧️",61:"🌧️",63:"🌧️",65:"🌧️",80:"🌦️",81:"🌧️",82:"🌧️",95:"⛈️",96:"⛈️",99:"⛈️" };
const WMO_LABEL = { 0:"Clear",1:"Mostly clear",2:"Partly cloudy",3:"Overcast",45:"Foggy",48:"Foggy",51:"Light drizzle",53:"Drizzle",55:"Heavy drizzle",61:"Light rain",63:"Rain",65:"Heavy rain",80:"Rain showers",81:"Rain showers",82:"Heavy showers",95:"Thunderstorms",96:"Thunderstorms",99:"Thunderstorms" };
const fmtHour = (t) => { try { return new Date(t).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}); } catch (e){return "";} };
const WEATHER_CACHE_KEY = `dw-${tripConfig.tripId}-weather`;

const getCachedWeather = (dk) => {
  try {
    const raw = localStorage.getItem(WEATHER_CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw);
    const entry = cache[dk];
    if (!entry) return null;
    const dateOnly = dk.split("|")[0];
    const ttl = (dateOnly === new Date().toISOString().split("T")[0]) ? 3600000 : 86400000;
    return Date.now() - entry.fetchedAt < ttl ? entry.weather : null;
  } catch (e) { return null; }
};

const setCachedWeather = (dk, w) => {
  try {
    let cache = {};
    try { const raw = localStorage.getItem(WEATHER_CACHE_KEY); if (raw) cache = JSON.parse(raw); } catch (e) {}
    cache[dk] = { weather: w, fetchedAt: Date.now() };
    localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {}
};

function useWeather(date, lat, lon) {
  const [weather, setWeather] = useState(null);
  const [error, setError] = useState(null);
  const cacheKey = `${date}|${lat}|${lon}`;
  useEffect(() => {
    if (!date || !lat || !lon) return;
    setWeather(null); setError(null);
    (async () => {
      const cached = getCachedWeather(cacheKey);
      if (cached) { setWeather(cached); return; }
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,weathercode,precipitation_probability&temperature_unit=fahrenheit&timezone=America%2FNew_York&start_date=${date}&end_date=${date}`;
        const res = await fetch(url); const data = await res.json();
        const hours = data.hourly; const temps = hours.temperature_2m; const codes = hours.weathercode; const precip = hours.precipitation_probability;
        const highIdx = temps.indexOf(Math.max(...temps)); const lowIdx = temps.indexOf(Math.min(...temps));
        let stormWindow = null;
        const stormHours = hours.time.map((t,i) => ({t,code:codes[i],prob:precip[i]})).filter(h => h.code >= 95 && h.prob >= 50);
        if (stormHours.length > 0) { const start = fmtHour(stormHours[0].t); const end = fmtHour(stormHours[stormHours.length-1].t); const maxProb = Math.max(...stormHours.map(h => h.prob)); stormWindow = {start,end,prob:maxProb,label:"Storm possible"}; }
        const dayCodes = codes.slice(9,18);
        const dominantCode = dayCodes.sort((a,b) => dayCodes.filter(v=>v===b).length - dayCodes.filter(v=>v===a).length)[0];
        const w = { high:Math.round(Math.max(...temps)), low:Math.round(Math.min(...temps)), highTime:fmtHour(hours.time[highIdx]), lowTime:fmtHour(hours.time[lowIdx]), icon:WMO_ICON[dominantCode]||"🌡️", label:WMO_LABEL[dominantCode]||"Unknown", stormWindow };
        setCachedWeather(cacheKey, w); setWeather(w);
      } catch(e) { setError("failed"); }
    })();
  }, [cacheKey]);
  return { weather, error };
}

function WeatherStack({ weather, error }) {
  if (error === "not yet available") return <div style={{textAlign:"right",flexShrink:0}}><div style={{fontSize:9,color:"rgba(255,255,255,0.35)",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap"}}>no data</div></div>;
  if (error) return <div style={{textAlign:"right",flexShrink:0}}><div style={{fontSize:18,lineHeight:1,marginBottom:4}}>⚠️</div></div>;
  if (!weather) return <div style={{textAlign:"right",flexShrink:0}}><div style={{fontSize:16,lineHeight:1,marginBottom:4}}>🌡️</div><div style={{fontSize:9,color:"rgba(255,255,255,0.35)",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap"}}>fetching...</div></div>;
  return (
    <div style={{textAlign:"right",flexShrink:0}}>
      <div style={{fontSize:24,lineHeight:1,marginBottom:4}}>{weather.stormWindow?"⛈️":weather.icon}</div>
      <div style={{fontSize:11,color:"rgba(255,255,255,0.9)",fontFamily:"'DM Sans',sans-serif",lineHeight:1.5,whiteSpace:"nowrap"}}><span style={{color:"#FFF",fontWeight:"bold"}}>{weather.high}°</span><span style={{color:"rgba(255,255,255,0.5)",fontSize:9}}> ↑{weather.highTime}</span></div>
      <div style={{fontSize:11,color:"rgba(255,255,255,0.9)",fontFamily:"'DM Sans',sans-serif",lineHeight:1.5,whiteSpace:"nowrap"}}><span style={{color:"rgba(255,255,255,0.75)"}}>{weather.low}°</span><span style={{color:"rgba(255,255,255,0.5)",fontSize:9}}> ↓{weather.lowTime}</span></div>
    </div>
  );
}

function WeatherAlert({ weather }) {
  if (!weather?.stormWindow) return null;
  const { start, end, prob, label } = weather.stormWindow;
  return (
    <div style={{ display:"flex",alignItems:"center",gap:8,padding:"7px 22px",background:"rgba(0,0,0,0.08)",borderBottom:"1px solid rgba(0,0,0,0.06)",fontSize:11,color:"rgba(255,255,255,0.9)",fontFamily:"'DM Sans',sans-serif" }}>
      <span>⛈️</span><span>{label} {start}–{end} · {prob}% chance</span>
    </div>
  );
}

// ── Collapsed weather (small, inline for header) ──────────────────────────────
function WeatherInline({ date, lat, lon }) {
  const { weather } = useWeather(date, lat, lon);
  if (!weather) return <span style={{fontSize:11,color:"#AAA",fontFamily:"'DM Sans',sans-serif"}}>🌡️</span>;
  return (
    <span style={{fontSize:11,color:"#888",fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap"}}>
      {weather.stormWindow ? "⛈️" : weather.icon} {weather.high}°/{weather.low}°
    </span>
  );
}

// ── Quick service (stub) ──────────────────────────────────────────────────────
const quickServiceData = { breakfast: [], lunch: [], dinner: [] };

function QuickServiceDining({ color }) {
  const [open, setOpen] = useState(null);
  const meals = [{ key:"breakfast",label:"📖 Breakfast" },{ key:"lunch",label:"📖 Lunch" },{ key:"dinner",label:"📖 Dinner" }];
  return (
    <div style={{ borderTop:"1px solid #F5F0EA", background:"#FAFAF8" }}>
      {meals.map(({ key, label }) => (
        <div key={key}>
          <div onClick={() => setOpen(open === key ? null : key)} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 22px", cursor:"pointer", borderTop:"1px solid #F5F0EA", background: open===key ? color+"11" : "transparent" }}>
            <span style={{ fontSize:14, color:"#1A1A1A", fontWeight: open===key ? "bold" : "normal" }}>{label}</span>
            <span style={{ fontSize:12, color:"#AAA", transition:"transform 0.2s", display:"inline-block", transform: open===key ? "rotate(180deg)" : "none" }}>▾</span>
          </div>
          {open === key && (
            <div style={{ background:"#FFF", borderTop:"1px solid #F0EBE3", padding:"10px 22px" }}>
              {quickServiceData[key].length === 0
                ? <div style={{ fontSize:12, color:"#AAA", fontFamily:"'DM Sans',sans-serif" }}>No options added yet.</div>
                : quickServiceData[key].map((r,i) => (
                    <div key={i} style={{ padding:"9px 0", borderBottom: i<quickServiceData[key].length-1?"1px solid #F5F0EA":"none" }}>
                      <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ fontSize:13, color, textDecoration:"underline", textDecorationStyle:"dotted", textUnderlineOffset:3, display:"block" }}>{r.name} ↗</a>
                      <div style={{ fontSize:11, color:"#AAA", marginTop:2 }}>{r.where}</div>
                    </div>
                  ))
              }
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ReservationBadges({ reservations, color, icon, text, url }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div onClick={() => setOpen(o => !o)} style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"11px 22px", cursor:"pointer" }}>
        <span style={{ fontSize:16, flexShrink:0, marginTop:1 }}>{icon}</span>
        <div style={{ flex:1, display:"flex", justifyContent:"space-between", alignItems:"center", gap:8 }}>
          {url
            ? <a href={url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{ fontSize:13, color, lineHeight:1.5, textDecoration:"underline", textDecorationStyle:"dotted", textUnderlineOffset:3 }}>{text} ↗</a>
            : <span style={{ fontSize:13, color:"#2A2A2A", lineHeight:1.5 }}>{text}</span>
          }
          <span style={{ fontSize:11, color:"#CCC", flexShrink:0, transition:"transform 0.2s", display:"inline-block", transform: open?"rotate(180deg)":"none" }}>▾</span>
        </div>
      </div>
      {open && (
        <div style={{ display:"flex", gap:8, padding:"0 22px 10px" }}>
          {reservations.map((r,i) => (
            <div key={i} style={{ flex:1, background:"#FAFAF8", border:"1px solid #EDE8E1", borderRadius:8, padding:"8px 10px" }}>
              <div style={{ fontSize:11, fontWeight:"bold", color, marginBottom:3 }}>{r.party}</div>
              <div style={{ fontSize:10, color:"#AAA", fontFamily:"'DM Sans',sans-serif", letterSpacing:"0.04em", marginBottom:2 }}>#{r.conf}</div>
              <div style={{ fontSize:10, color:"#888" }}>{r.size} @ {r.time}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Status colors for flights ─────────────────────────────────────────────────
const STATUS_COLORS = {
  "Scheduled":"#2C5F8A","On Time":"#1A6B4A","Delayed":"#C8832A",
  "Cancelled":"#CC4444","Landed":"#4A2C6B","En Route":"#1A6B4A",
};

const parseFlight = (data) => {
  try {
    const f = Array.isArray(data) ? data[0] : data?.data?.[0];
    if (!f) return null;
    const fmtAero = (timeObj) => {
      if (!timeObj) return "—";
      const local = timeObj.local || timeObj.utc;
      if (!local) return "—";
      const match = local.match(/\d{4}-\d{2}-\d{2}\s+(\d{2}:\d{2})/);
      if (!match) return "—";
      const [h, m] = match[1].split(":").map(Number);
      const ampm = h >= 12 ? "PM" : "AM";
      return `${h%12||12}:${m.toString().padStart(2,"0")} ${ampm}`;
    };
    return {
      status: f.status ? f.status.charAt(0).toUpperCase()+f.status.slice(1).toLowerCase() : "Scheduled",
      gate_dep: f.departure?.gate||"—", gate_arr: f.arrival?.gate||"—",
      terminal_dep: f.departure?.terminal||"—", terminal_arr: f.arrival?.terminal||"—",
      actual_dep: fmtAero(f.departure?.runwayTime||f.departure?.revisedTime||f.departure?.scheduledTime),
      actual_arr: fmtAero(f.arrival?.runwayTime||f.arrival?.revisedTime||f.arrival?.scheduledTime),
      baggage: f.arrival?.baggageBelt||"—", live:true,
    };
  } catch (e) { return null; }
};

function FlightStatus({ flightNumber, flightDate, schedDep, schedArr }) {
  const [live, setLive] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const fetchData = async () => {
    if (!flightNumber || !flightDate) return;
    setSpinning(true);
    const today = new Date().toISOString().split("T")[0];
    if (today !== flightDate) { setSpinning(false); return; }
    try {
      const res = await fetch(`${WORKER_URL}/flight?iata=${flightNumber}&date=${flightDate}`);
      const data = await res.json();
      const parsed = parseFlight(data);
      if (parsed) setLive(parsed);
    } catch (e) {}
    setSpinning(false);
  };
  useEffect(() => { fetchData(); }, [flightNumber, flightDate]);
  const d = live || { status:"Scheduled", gate_dep:"—", gate_arr:"—", terminal_dep:"—", terminal_arr:"—", actual_dep:schedDep||"—", actual_arr:schedArr||"—", baggage:"—", live:false };
  const statusColor = STATUS_COLORS[d.status] || "#888";
  const line = `${flightNumber} · ${d.status} · Dep ${d.actual_dep} T:${d.terminal_dep} G:${d.gate_dep} · Arr ${d.actual_arr} T:${d.terminal_arr} G:${d.gate_arr} · Bag:${d.baggage}`;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6, padding:"0 22px 6px 50px" }}>
      <span style={{ fontSize:11, color: d.status==="Delayed"||d.status==="Cancelled" ? statusColor : "#888", fontFamily:"'DM Sans',sans-serif", flex:1, textAlign:"left", fontWeight: d.status==="Delayed"||d.status==="Cancelled" ? 600 : 400 }}>{line}</span>
      <button onClick={e => { e.stopPropagation(); fetchData(); }} style={{ fontSize:12, background:"none", border:"none", cursor:"pointer", color:"#CCC", padding:0, lineHeight:1, display:"inline-flex", alignItems:"center", transform:spinning?"rotate(180deg)":"none", transition:"transform 0.4s ease", flexShrink:0 }}>↻</button>
    </div>
  );
}

// ── Activity styles ───────────────────────────────────────────────────────────
const ACTIVITY_STYLES = {
  "LL":             { bg:"transparent", badge:"⚡ LL",     badgeBg:"#D1FAE5", badgeColor:"#065F46", badgeBorder:"#6EE7B7" },
  "Character Meet": { bg:"transparent", badge:"🧸 Meet",   badgeBg:"#EDE9FE", badgeColor:"#4C1D95", badgeBorder:"#C4B5FD" },
  "Resort Activity":{ bg:"transparent", badge:"🏨 Resort", badgeBg:"#DBEAFE", badgeColor:"#1E40AF", badgeBorder:"#93C5FD" },
};

function LLRow({ h, color, borderBottom, onSkip }) {
  const [open, setOpen] = useState(false);
  const isMeet   = h.type === "Character Meet";
  const isResort = h.type === "Resort Activity";
  const style    = ACTIVITY_STYLES[h.type] || ACTIVITY_STYLES["LL"];
  const MEET_URLS = {
    "Meet Stitch (D. Visa)":            "https://disneyrewards.com/parks-and-vacations/walt-disney-world-perks/#stitchcharacterexperience",
    "Star Wars Photo (D. Visa)":        "https://disneyrewards.com/parks-and-vacations/walt-disney-world-perks/#starwarscharacterexperience",
    "Mystery Character Meet (D. Visa)": "https://disneyrewards.com/parks-and-vacations/walt-disney-world-perks/#characterexperience",
  };
  const rideUrl = h.url || (isMeet
    ? MEET_URLS[h.rideName] ?? RIDES.find(r => r.name === h.rideName)?.url ?? null
    : isResort ? null
    : RIDES.find(r => r.id === h.rideId)?.url);
  const isFlight = h.type === "Flight";
  const locationPart = !isFlight && (h.location ? h.location : (h.resort || null));
  const collapsibleText = locationPart && h.subtext ? `${locationPart} · ${h.subtext}` : (h.subtext || locationPart || null);
  const timeStr  = (h.startTime && h.startTime !== "TBD") ? h.startTime + (h.endTime ? ` – ${h.endTime}` : "") : "";
  const partyStr = h.party && h.party !== "All" ? ` · ${h.party}` : "";
  const fullText = isFlight
    ? [h.startTime, h.rideName, h.endTime].filter(Boolean).join(" · ") + (rideUrl ? " ↗" : "")
    : [timeStr, h.rideName + partyStr].filter(Boolean).join(" · ") + (rideUrl ? " ↗" : "");
  return (
    <div style={{ borderBottom, background:style.bg }}>
      <div onClick={() => !isFlight && collapsibleText && setOpen(o => !o)} style={{ display:"flex", alignItems:"center", gap:8, padding:`6px 22px 6px ${h.optional?"34px":"22px"}`, cursor:(!isFlight&&collapsibleText)?"pointer":"default" }}>
        <span style={{ fontSize:14, flexShrink:0 }}>{h.icon}</span>
        <div style={{ flex:1 }}>
          {rideUrl
            ? <a href={rideUrl} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{ fontSize:13, color, fontWeight:400, fontFamily:"'DM Sans',sans-serif", textDecoration:"underline", textDecorationStyle:"dotted", textUnderlineOffset:3, display:"block", textAlign:"left" }}>{fullText}</a>
            : <span style={{ fontSize:13, color:"#1A1A1A", fontWeight:400, fontFamily:"'DM Sans',sans-serif", display:"block", textAlign:"left" }}>{fullText}</span>
          }
        </div>
        {h.optional && onSkip && (
          <button onClick={e=>{e.stopPropagation();onSkip(h.pageId);}} style={{ fontSize:10, color:"#AAA", background:"none", border:"1px solid #EDE8E1", borderRadius:12, padding:"2px 8px", cursor:"pointer", flexShrink:0, fontFamily:"'DM Sans',sans-serif" }}>Skip</button>
        )}
        {!isFlight && collapsibleText && (
          <span style={{ fontSize:11, color:"#CCC", flexShrink:0, transition:"transform 0.2s", display:"inline-block", transform:open?"rotate(180deg)":"none" }}>▾</span>
        )}
      </div>
      {isFlight && <FlightStatus flightNumber={h.location} flightDate={h.date} schedDep={h.startTime} schedArr={h.endTime} />}
      {!isFlight && open && collapsibleText && (
        <div style={{ padding:`0 22px 8px ${h.optional?"56px":"44px"}`, fontSize:11, color:"#888", fontFamily:"'DM Sans',sans-serif", lineHeight:1.5 }}>{collapsibleText}</div>
      )}
    </div>
  );
}

function ArchivedSection({ archivedLLs, onRestore }) {
  const [open, setOpen] = useState(false);
  if (!archivedLLs || archivedLLs.length === 0) return null;
  return (
    <div style={{ borderTop:"1px solid #EDE8E1" }}>
      <div onClick={() => setOpen(o=>!o)} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 22px", cursor:"pointer", background:"#FAFAF8" }}>
        <span style={{ fontSize:12, color:"#AAA", fontFamily:"'DM Sans',sans-serif" }}>Past & Declined ({archivedLLs.length})</span>
        <span style={{ fontSize:10, color:"#CCC", transform:open?"rotate(180deg)":"none", transition:"transform 0.2s" }}>▾</span>
      </div>
      {open && (
        <div style={{ padding:"4px 0 8px" }}>
          {archivedLLs.map((ll,i) => {
            const timeStr = ll.startTime+(ll.endTime?` – ${ll.endTime}`:"");
            const locationStr = ll.resort?(ll.location?`${ll.resort} · ${ll.location}`:ll.resort):ll.location;
            return (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 22px", borderBottom:i<archivedLLs.length-1?"1px solid #F5F0EA":"none", opacity:0.5 }}>
                <span style={{ fontSize:13 }}>{ll.type==="Character Meet"?"🧸":ll.type==="Resort Activity"?"🏨":"⚡"}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, color:"#555", fontFamily:"'DM Sans',sans-serif" }}>{timeStr} · {ll.rideName}</div>
                  {locationStr && <div style={{ fontSize:10, color:"#AAA", fontFamily:"'DM Sans',sans-serif" }}>{locationStr}</div>}
                </div>
                <button onClick={()=>onRestore(ll.pageId)} style={{ fontSize:10, color:"#4A7C59", background:"none", border:"1px solid #B7DFC8", borderRadius:12, padding:"2px 8px", cursor:"pointer", flexShrink:0, fontFamily:"'DM Sans',sans-serif" }}>Restore</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Dining Credits ─────────────────────────────────────────────────────────────
function DiningCredits() {
  const [open, setOpen] = useState(false);
  // Dining plan data not yet configured for this trip
  return (
    <div style={{ marginTop:12, borderRadius:12, border:"1px solid #EDE8E1", overflow:"hidden", background:"#FFF" }}>
      <div onClick={() => setOpen(o=>!o)} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 16px", cursor:"pointer", background:"#FAFAF8" }}>
        <span style={{ fontSize:13, fontWeight:600, color:"#1A1A1A", fontFamily:"'DM Sans',sans-serif" }}>🍽️ Dining Plan Credits</span>
        <span style={{ fontSize:10, color:"#CCC", transform:open?"rotate(180deg)":"none", transition:"transform 0.2s" }}>▾</span>
      </div>
      {open && (
        <div style={{ padding:"16px", borderTop:"1px solid #EDE8E1", textAlign:"center" }}>
          <div style={{ fontSize:12, color:"#AAA", fontFamily:"'DM Sans',sans-serif" }}>No dining plan data for this trip yet.</div>
        </div>
      )}
    </div>
  );
}

function HighlightRow({ h, color, borderBottom }) {
  const [open, setOpen] = useState(false);
  const hasSubtext = !!h.subtext;
  return (
    <div style={{ borderBottom }}>
      <div onClick={() => hasSubtext && setOpen(o=>!o)} style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"6px 22px", cursor:hasSubtext?"pointer":"default" }}>
        <span style={{ fontSize:16, flexShrink:0, marginTop:1 }}>{h.icon}</span>
        <div style={{ flex:1, textAlign:"left" }}>
          {h.url
            ? <a href={h.url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{ fontSize:13, color, lineHeight:1.5, textDecoration:"underline", textDecorationStyle:"dotted", textUnderlineOffset:3, textAlign:"left", fontWeight:400, fontFamily:"'DM Sans',sans-serif" }}>{h.text} ↗</a>
            : <span style={{ fontSize:13, color:"#2A2A2A", lineHeight:1.5, textAlign:"left", fontWeight:400, fontFamily:"'DM Sans',sans-serif" }}>{h.text}</span>
          }
        </div>
        {hasSubtext && <span style={{ fontSize:11, color:"#CCC", flexShrink:0, marginTop:2, transition:"transform 0.2s", display:"inline-block", transform:open?"rotate(180deg)":"none" }}>▾</span>}
      </div>
      {open && hasSubtext && (
        <div style={{ padding:"0 22px 8px 50px", fontSize:11, color:"#888", fontFamily:"'DM Sans',sans-serif", lineHeight:1.5 }}>{h.subtext}</div>
      )}
    </div>
  );
}

// ── RidePreferences ───────────────────────────────────────────────────────────
function RidePreferences({ prefs, syncing, onPref, onNotes, onClosed, onRdNom, onRdConfirm, onLLStatus }) {
  const parks = tripConfig.parks.map(id => ({
    id,
    name: id==="mk"?"Magic Kingdom":id==="ep"?"EPCOT":id==="hs"?"Hollywood Studios":id==="ak"?"Animal Kingdom":id.toUpperCase(),
  }));
  const [activePark, setActivePark] = useState(() => {
    try { return localStorage.getItem(`dw-${tripConfig.tripId}-prefPark`) || parks[0].id; } catch (e) { return parks[0].id; }
  });
  const setPark = (p) => { setActivePark(p); try { localStorage.setItem(`dw-${tripConfig.tripId}-prefPark`, p); } catch (e) {} };
  return (
    <div>
      <div style={{ display:"flex", background:"#EDE8E1", borderRadius:20, padding:3, marginBottom:16 }}>
        {parks.map(p => (
          <button key={p.id} onClick={() => setPark(p.id)} style={{
            flex:1, padding:"7px 0", border:"none", borderRadius:17,
            fontSize:11, fontFamily:"'DM Sans',sans-serif", fontWeight:600,
            cursor:"pointer", transition:"background 0.15s, color 0.15s",
            background: activePark===p.id ? "#FFF" : "transparent",
            color: activePark===p.id ? "#1A1A1A" : "#999",
            boxShadow: activePark===p.id ? "0 1px 4px rgba(0,0,0,0.12)" : "none",
          }}>{p.name}</button>
        ))}
      </div>
      <ParkRides parkId={activePark} prefs={prefs} syncing={syncing} onPref={onPref} onNotes={onNotes} onClosed={onClosed} onRdNom={onRdNom} onRdConfirm={onRdConfirm} onLLStatus={onLLStatus} showRankings={false} />
    </div>
  );
}

function ViewToggle({ view, setView }) {
  return (
    <div style={{ display:"flex", background:"#EDE8E1", borderRadius:20, padding:3, marginBottom:16 }}>
      {[
        { id:"preferences", label:"🎢 Preferences" },
        { id:"llsummary",   label:"⚡ LL Plan"     },
        { id:"itinerary",   label:"🗓 Itinerary"   },
      ].map(({ id, label }) => (
        <button key={id} onClick={() => setView(id)} style={{
          flex:1, padding:"7px 0", border:"none", borderRadius:17,
          fontSize:12, fontFamily:"'DM Sans',sans-serif", fontWeight:600,
          cursor:"pointer", transition:"background 0.15s, color 0.15s",
          background: view===id ? "#FFF" : "transparent",
          color: view===id ? "#1A1A1A" : "#999",
          boxShadow: view===id ? "0 1px 4px rgba(0,0,0,0.12)" : "none",
        }}>{label}</button>
      ))}
    </div>
  );
}

// ── Countdown title ───────────────────────────────────────────────────────────
function CountdownTitle() {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dep   = new Date(2026, 7, 11); // Aug 11
  const ret   = new Date(2026, 7, 21); // Aug 21
  const seeYa = new Date(2026, 7, 21, 14, 0);
  let text;
  if (now >= seeYa) {
    text = "See ya real soon! 👋";
  } else if (today < dep) {
    const n = Math.round((dep - today) / 86400000);
    text = `${n} ${n===1?"day":"days"} until Disney World August 2026`;
  } else if (today <= ret) {
    const n = Math.round((today - dep) / 86400000) + 1;
    text = `Day ${n} of Disney World August 2026`;
  } else {
    text = "See ya real soon! 👋";
  }
  return <>{text}</>;
}

// ── Day header (collapsed state) ──────────────────────────────────────────────
function CollapsedDayHeader({ day, onFocus, onAdd }) {
  const color = getDayColor(day);
  const today = new Date().toISOString().split("T")[0];
  const showWeather = day.date >= today;

  // Format date: "Tuesday, Aug 11"
  const d = new Date(day.date + "T12:00:00");
  const dowFull = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d.getDay()];
  const monShort = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
  const dateLabel = `${dowFull}, ${monShort} ${d.getDate()}`;

  // Location label: deduplicate if start === end
  const locLabel = (!day.locEnd || day.locStart === day.locEnd)
    ? day.locStart
    : `${day.locStart} → ${day.locEnd}`;

  return (
    <div
      onClick={onFocus}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 12px 10px 16px", cursor: "pointer",
        borderLeft: `4px solid ${color}`,
        background: "#FAFAF8",
        borderBottom: "1px solid #EDE8E1",
        transition: "background 0.15s",
      }}
    >
      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#1A1A1A", fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap" }}>{dateLabel}</div>
        {locLabel && (
          <div style={{ fontSize: 11, color: "#AAA", fontFamily: "'DM Sans',sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{locLabel}</div>
        )}
      </div>
      {showWeather && day.latStart && (
        <WeatherInline date={day.date} lat={day.latStart} lon={day.lonStart} />
      )}
      <button
        onClick={e => { e.stopPropagation(); onAdd(); }}
        style={{
          fontSize: 16, lineHeight: 1, color: "#CCC", background: "none", border: "none",
          cursor: "pointer", flexShrink: 0, padding: "0 2px", fontFamily: "'DM Sans',sans-serif",
          marginLeft: 4,
        }}
      >+</button>
    </div>
  );
}

// ── Expanded day content ──────────────────────────────────────────────────────
function DayContent({ day, bookedLLs, updateVisibility, onCollapse }) {
  const color = getDayColor(day);

  // Weather carousel
  const weatherLocs = (() => {
    const start = { lat: day.latStart, lon: day.lonStart, label: day.locStart };
    const end   = { lat: day.latEnd,   lon: day.lonEnd,   label: day.locEnd   };
    if (!end.lat || (Math.abs(start.lat - end.lat) < 0.001 && Math.abs(start.lon - end.lon) < 0.001)) return [start];
    return [start, end];
  })();
  const [locIdx, setLocIdx] = useState(0);
  const activeLoc = weatherLocs[locIdx % weatherLocs.length];
  const { weather, error: weatherError } = useWeather(day.date, activeLoc.lat, activeLoc.lon);

  // Auto-rotate weather every 5s
  useEffect(() => {
    if (weatherLocs.length < 2) return;
    const timer = setInterval(() => setLocIdx(i => (i+1) % weatherLocs.length), 5000);
    return () => clearInterval(timer);
  }, [day.date, weatherLocs.length]);

  // Format date for full header
  const d = new Date(day.date + "T12:00:00");
  const dowFull  = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d.getDay()];
  const monFull  = ["January","February","March","April","May","June","July","August","September","October","November","December"][d.getMonth()];
  const num = d.getDate();
  const s = [1,21,31].includes(num)?"st":[2,22].includes(num)?"nd":[3,23].includes(num)?"rd":"th";
  const fullDateLabel = `${dowFull}, ${monFull} ${num}${s}, 2026`;

  // Activities for this day
  const llsForDay = bookedLLs
    .filter(ll => ll.date === day.date && (ll.visibility === "Show" || !ll.visibility) && !isLLExpired(ll.endTime, ll.date, ll.startTime))
    .map(ll => ({
      _type: "ll",
      sortTime: ll.sortTime ?? parseTimeToInt(ll.startTime),
      icon: ll.icon || (ll.type==="Character Meet"?"🧸":ll.type==="Resort Activity"?"🏨":"⚡"),
      rideName: ll.rideName, startTime: ll.startTime, endTime: ll.endTime,
      party: ll.party, rideId: ll.rideId, type: ll.type,
      location: ll.location, resort: ll.resort, optional: ll.optional,
      visibility: ll.visibility, pageId: ll.pageId, url: ll.url,
      subtext: ll.subtext, date: ll.date,
    }));

  const mergedHighlights = llsForDay.sort((a,b) => (a.sortTime??9999) - (b.sortTime??9999));

  const archivedLLs = bookedLLs.filter(ll =>
    ll.date === day.date && (ll.visibility === "Archive" || isLLExpired(ll.endTime, ll.date, ll.startTime))
  );

  return (
    <div style={{ background:"#FFF", borderBottom:"1px solid #EDE8E1" }}>
      {/* Colored header */}
      <div style={{ background: color }}>
        <div style={{ padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
          <div style={{ flex:1, minWidth:0, textAlign:"left" }}>
            <div style={{ fontSize:9, letterSpacing:"0.15em", textTransform:"uppercase", color:"rgba(255,255,255,0.6)", fontFamily:"'DM Sans',sans-serif", marginBottom:3 }}>
              {fullDateLabel}
            </div>
            <div style={{ fontSize:18, color:"#FFF", fontWeight:"normal", marginBottom:2 }}>
              {day.name}
            </div>
            {day.locStart && (
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.6)" }}>
                {(!day.locEnd || day.locStart === day.locEnd) ? day.locStart : `${day.locStart} → ${day.locEnd}`}
              </div>
            )}
          </div>
          <div
            style={{ flexShrink:0, textAlign:"right", cursor: weatherLocs.length>1 ? "pointer" : "default", display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4 }}
          >
            <button
              onClick={onCollapse}
              style={{ fontSize:14, color:"rgba(255,255,255,0.5)", background:"none", border:"none", cursor:"pointer", padding:0, lineHeight:1, alignSelf:"flex-end" }}
            >▾</button>
            <div
              onClick={() => weatherLocs.length>1 && setLocIdx(i => (i+1) % weatherLocs.length)}
              style={{ cursor: weatherLocs.length>1 ? "pointer" : "default" }}
            >
            {weatherLocs.length > 1 && (
              <div style={{ display:"flex", justifyContent:"flex-end", gap:4, marginBottom:4 }}>
                {weatherLocs.map((_,i) => (
                  <div key={i} style={{ width:5, height:5, borderRadius:"50%", background: i===locIdx%weatherLocs.length ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)" }} />
                ))}
              </div>
            )}
            <WeatherStack weather={weather} error={weatherError} />
            {weatherLocs.length>1 && activeLoc.label && (
              <div style={{ fontSize:8, color:"rgba(255,255,255,0.45)", fontFamily:"'DM Sans',sans-serif", marginTop:2 }}>{activeLoc.label}</div>
            )}
            </div>
          </div>
        </div>
        <WeatherAlert weather={weather} />
      </div>

      {/* Activities */}
      {mergedHighlights.length > 0 && (
        <div style={{ padding:"8px 0" }}>
          {mergedHighlights.map((h,hi) => (
            <div key={hi}>
              {h._type === "ll" ? (
                h.rideName?.toLowerCase().includes("quick service") ? (
                  <>
                    <div style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"11px 22px", borderTop:"1px solid #F5F0EA" }}>
                      <span style={{ fontSize:16, flexShrink:0, marginTop:1 }}>🍽️</span>
                      <span style={{ fontSize:13, color:"#2A2A2A", lineHeight:1.5, fontFamily:"'DM Sans',sans-serif" }}>Quick Service Options</span>
                    </div>
                    <QuickServiceDining color={color} />
                  </>
                ) : (
                  <LLRow h={h} color={color} borderBottom={hi<mergedHighlights.length-1?"1px solid #F5F0EA":"none"} onSkip={(pageId) => updateVisibility(pageId,"Archive")} />
                )
              ) : h.alternatives ? (
                <div style={{ borderTop:"1px solid #F5F0EA" }}>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, padding:"12px 12px" }}>
                    {h.alternatives.map((alt,ai) => (
                      <div key={ai} style={{ background:"#FAFAF8", borderRadius:10, border:"1px solid #EDE8E1", padding:"10px 10px", textAlign:"center" }}>
                        <div style={{ fontSize:20, marginBottom:4 }}>{alt.icon}</div>
                        <div style={{ fontSize:11, fontWeight:"bold", color, marginBottom:4, lineHeight:1.2 }}>{alt.title}</div>
                        <div style={{ fontSize:10, color:"#888", lineHeight:1.4 }}>
                          {Array.isArray(alt.segments)
                            ? alt.segments.map((seg,si) => seg.url
                                ? <a key={si} href={seg.url} target="_blank" rel="noopener noreferrer" style={{color,textDecoration:"underline",textDecorationStyle:"dotted"}}>{seg.text}</a>
                                : <span key={si}>{seg.text}</span>)
                            : alt.text}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <HighlightRow h={h} color={color} borderBottom={!h.flight&&!h.quickService&&hi<mergedHighlights.length-1?"1px solid #F5F0EA":"none"} />
                  {h.quickService && <QuickServiceDining color={color} />}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {mergedHighlights.length === 0 && (
        <div style={{ padding:"16px 22px", fontSize:12, color:"#CCC", fontFamily:"'DM Sans',sans-serif", textAlign:"center" }}>
          No activities planned yet.
        </div>
      )}

      <ArchivedSection archivedLLs={archivedLLs} onRestore={(pageId) => updateVisibility(pageId,"Show")} />
      <DiningCredits />
    </div>
  );
}

// ── Main Itinerary export ─────────────────────────────────────────────────────
export function Itinerary({ view, setView, prefs, syncing, loading, syncError, onPref, onNotes, onClosed, onRdNom, onRdConfirm, onLLStatus }) {
  const [calendarDays, setCalendarDays] = useState([]);
  const [bookedLLs,    setBookedLLs]    = useState([]);
  const [expanded,     setExpanded]     = useState(null); // Set of expanded date strings, null = not yet initialized

  // Load calendar and activities
  useEffect(() => {
    fetchCalendarDays().then(days => {
      setCalendarDays(days);
      // Initialize expanded state from session storage, or default
      const saved = loadExpanded();
      if (saved) {
        setExpanded(new Set(saved));
      } else {
        const defaultDate = getDefaultExpandedDate(days);
        setExpanded(new Set(defaultDate ? [defaultDate] : []));
      }
    }).catch(() => setExpanded(new Set()));
    fetchBookedLLs().then(setBookedLLs).catch(() => {});
  }, []);

  const focusDay = (date) => {
    setExpanded(prev => {
      const isOnlyOne = prev.size === 1 && prev.has(date);
      const next = isOnlyOne ? new Set() : new Set([date]);
      saveExpanded(next);
      return next;
    });
  };

  const addDay = (date) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      saveExpanded(next);
      return next;
    });
  };

  const updateVisibility = async (pageId, visibility) => {
    try {
      await fetch(`${WORKER_URL}/activities`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId, visibility }),
      });
      fetchBookedLLs().then(setBookedLLs).catch(() => {});
    } catch (e) {}
  };

  // Wrap handlers
  const w_onPref      = (rideId, pid, pref) => onPref(rideId, pid, pref, RIDES.find(r => r.id === rideId));
  const w_onNotes     = (rideId, val)        => onNotes(rideId, val, RIDES.find(r => r.id === rideId), saveMetaToNotion);
  const w_onClosed    = (rideId)             => onClosed(rideId, RIDES.find(r => r.id === rideId), isClosed, saveMetaToNotion);
  const w_onRdNom     = (rideId)             => onRdNom(rideId, RIDES.find(r => r.id === rideId), saveMetaToNotion);
  const w_onRdConfirm = (parkId, rideId)     => onRdConfirm(parkId, rideId, RIDES.filter(r => r.park === parkId), saveMetaToNotion);
  const w_onLLStatus  = (rideId, status)     => onLLStatus(rideId, status, RIDES.find(r => r.id === rideId), saveMetaToNotion);

  return (
    <div style={{ minHeight:"100vh", background:"#FBF7F2", fontFamily:"'DM Sans',sans-serif", padding:"16px 20px 40px" }}>
      <div style={{ maxWidth:480, margin:"0 auto" }}>

        {/* Title + countdown */}
        <div style={{ marginBottom:12 }}>
          <h1 style={{ fontSize:18, fontWeight:"normal", margin:0, letterSpacing:"-0.02em", color:"#1A1A1A", fontFamily:"'DM Sans',sans-serif" }}>
            <CountdownTitle />
          </h1>
        </div>

        {/* View toggle */}
        <ViewToggle view={view} setView={setView} />

        {/* ── Ride Preferences ── */}
        {view === "preferences" && (
          <RidePreferences
            prefs={prefs} syncing={syncing}
            onPref={w_onPref} onNotes={w_onNotes} onClosed={w_onClosed}
            onRdNom={w_onRdNom} onRdConfirm={w_onRdConfirm} onLLStatus={w_onLLStatus}
          />
        )}

        {/* ── LL Summary ── */}
        {view === "llsummary" && (
          <Summary prefs={prefs} syncing={syncing} onPref={w_onPref} onNotes={w_onNotes} onClosed={w_onClosed} onRdNom={w_onRdNom} onRdConfirm={w_onRdConfirm} onLLStatus={w_onLLStatus} />
        )}

        {/* ── Itinerary ── */}
        {view === "itinerary" && (
          <>
            {loading    && <div style={{ fontSize:10, fontFamily:"'DM Sans',sans-serif", padding:"6px 10px", borderRadius:8, marginBottom:14, background:"#E3F2FD", color:"#0D47A1" }}>Loading votes from server…</div>}
            {syncError  && <div style={{ fontSize:10, fontFamily:"'DM Sans',sans-serif", padding:"6px 10px", borderRadius:8, marginBottom:14, background:"#FFF8E1", color:"#E65100" }}>{syncError}</div>}

            {expanded === null ? (
              <div style={{ fontSize:12, color:"#AAA", fontFamily:"'DM Sans',sans-serif", textAlign:"center", padding:"24px 0" }}>Loading itinerary…</div>
            ) : calendarDays.length === 0 ? (
              <div style={{ fontSize:12, color:"#AAA", fontFamily:"'DM Sans',sans-serif", textAlign:"center", padding:"24px 0" }}>No trip days found.</div>
            ) : (
              <div style={{ borderRadius:16, overflow:"hidden", boxShadow:"0 4px 24px rgba(0,0,0,0.08)", border:"1px solid #EDE8E1" }}>
                {calendarDays.map((day, i) => {
                  const isExp = expanded.has(day.date);
                  return (
                    <div key={day.date}>
                      {!isExp && (
                        <CollapsedDayHeader
                          day={day}
                          onFocus={() => focusDay(day.date)}
                          onAdd={() => addDay(day.date)}
                        />
                      )}
                      {isExp && (
                        <DayContent
                          day={day}
                          bookedLLs={bookedLLs}
                          updateVisibility={updateVisibility}
                          onCollapse={() => addDay(day.date)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ marginTop:32, fontSize:10, color:"#CCC", textAlign:"center", fontFamily:"'DM Sans',sans-serif", letterSpacing:"0.1em" }}>DISNEY WORLD — AUGUST 2026</div>
          </>
        )}
      </div>
    </div>
  );
}
