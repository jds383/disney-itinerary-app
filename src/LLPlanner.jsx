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

export const PARKS = [
  { id: "mk", name: "Magic Kingdom",     color: "#2C5F8A" },
  { id: "ep", name: "EPCOT",             color: "#4A2C6B" },
  { id: "hs", name: "Hollywood Studios", color: "#8A3A2C" },
];

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

// ── Early Entry Data ──────────────────────────────────────────────────────────

const EARLY_ENTRY = new Set([
  // Magic Kingdom
  "mk3", "mk12", "mk12b", "mk7b", "mk6", "mk2", "mk5", "mk1", "mk11",
  "mk30", "mk8", "mk16", "mk15", "mk4", "mk14",
  // EPCOT
  "ep10", "ep1", "ep3", "ep11", "ep5", "ep4", "ep2", "ep7",
  // Hollywood Studios
  "hs7b", "hs11", "hs2", "hs6", "hs3", "hs9", "hs1", "hs7", "hs4",
]);

const RAW_RIDES = [
  { id:"hs7b", park:"hs", name:"Alien Swirling Saucers",                             type:"Ride", ll:"mp2", url:"https://disneyworld.disney.go.com/attractions/hollywood-studios/alien-swirling-saucers/" },
  { id:"mk12", park:"mk", name:"Astro Orbiter",                                       type:"Ride", ll:"noll",url:"https://disneyworld.disney.go.com/attractions/magic-kingdom/astro-orbiter/" },
  { id:"ep9",  park:"ep", name:"Awesome Planet",                                      type:"Film", ll:"noll",url:"https://disneyworld.disney.go.com/attractions/epcot/the-land-awesome-planet/" },
  { id:"mk30", park:"mk", name:"The Barnstormer",                                     type:"Ride", ll:"mp2", url:"https://disneyworld.disney.go.com/attractions/magic-kingdom/barnstormer-starring-great-goofini/" },
  { id:"hs8",  park:"hs", name:"Beauty and the Beast Live on Stage",                  type:"Show", ll:"mp2", url:"https://disneyworld.disney.go.com/entertainment/hollywood-studios/beauty-and-the-beast-live-on-stage/" },
  { id:"ep15", park:"ep", name:"Beauty and the Beast Sing-Along",                     type:"Show", ll:"noll",url:"https://disneyworld.disney.go.com/entertainment/epcot/beauty-and-the-beast-sing-along/" },
  { id:"mk18", park:"mk", name:"Big Thunder Mountain Railroad",                       type:"Ride", ll:"mp1", url:"https://disneyworld.disney.go.com/attractions/magic-kingdom/big-thunder-mountain-railroad/" },
  { id:"mk12b",park:"mk", name:"Buzz Lightyear's Space Ranger Spin",                  type:"Ride", ll:"mp2", url:"https://disneyworld.disney.go.com/attractions/magic-kingdom/buzz-lightyear-space-ranger-spin/" },
  { id:"mk31", park:"mk", name:"Country Bear Musical Jamboree",                       type:"Show", ll:"noll",url:"https://disneyworld.disney.go.com/attractions/magic-kingdom/country-bear-jamboree/" },
  { id:"ep13", park:"ep", name:"Disney and Pixar Short Film Festival",                type:"Film", ll:"mp2", url:"https://disneyworld.disney.go.com/attractions/epcot/disney-pixar-short-film-festival/" },
  { id:"hs14", park:"hs", name:"Disney Villains: Unfairly Ever After",                type:"Show", ll:"noll",url:"https://disneyworld.disney.go.com/entertainment/hollywood-studios/disney-villains-unfairly-ever-after/" },
  { id:"mk7b", park:"mk", name:"Dumbo the Flying Elephant",                           type:"Ride", ll:"mp2", url:"https://disneyworld.disney.go.com/attractions/magic-kingdom/dumbo-the-flying-elephant/" },
  { id:"mk22b",park:"mk", name:"Enchanted Tiki Room",                                 type:"Show", ll:"noll",url:"https://disneyworld.disney.go.com/attractions/magic-kingdom/enchanted-tiki-room/" },
  { id:"mk32", park:"mk", name:"Enchanted Tales with Belle",                          type:"Show", ll:"noll",url:"https://disneyworld.disney.go.com/attractions/magic-kingdom/enchanted-tales-with-belle/" },
  { id:"hs12", park:"hs", name:"For the First Time in Forever: A Frozen Sing-Along",  type:"Show", ll:"mp2", url:"https://disneyworld.disney.go.com/entertainment/hollywood-studios/frozen-sing-along-celebration/" },
  { id:"ep10", park:"ep", name:"Frozen Ever After",                                   type:"Ride", ll:"mp1", url:"https://disneyworld.disney.go.com/attractions/epcot/frozen-ever-after/" },
  { id:"ep12", park:"ep", name:"Gran Fiesta Tour Starring The Three Caballeros",      type:"Ride", ll:"noll",url:"https://disneyworld.disney.go.com/attractions/epcot/gran-fiesta-tour-starring-three-caballeros/" },
  { id:"ep1",  park:"ep", name:"Guardians of the Galaxy: Cosmic Rewind",              type:"Ride", ll:"ill", illPrice:"$15–$22", url:"https://disneyworld.disney.go.com/attractions/epcot/guardians-of-the-galaxy-cosmic-rewind/" },
  { id:"mk33", park:"mk", name:"The Hall of Presidents",                              type:"Show", ll:"noll",url:"https://disneyworld.disney.go.com/attractions/magic-kingdom/hall-of-presidents/" },
  { id:"mk23", park:"mk", name:"Haunted Mansion",                                     type:"Ride", ll:"mp2", url:"https://disneyworld.disney.go.com/attractions/magic-kingdom/haunted-mansion/" },
  { id:"hs10", park:"hs", name:"Indiana Jones Epic Stunt Spectacular",                type:"Show", ll:"mp2", url:"https://disneyworld.disney.go.com/entertainment/hollywood-studios/indiana-jones-epic-stunt-spectacular/" },
  { id:"mk3",  park:"mk", name:"It's a Small World",                                  type:"Ride", ll:"mp2", url:"https://disneyworld.disney.go.com/attractions/magic-kingdom/its-a-small-world/" },
  { id:"ep14", park:"ep", name:"Journey into Imagination with Figment",               type:"Ride", ll:"mp2", url:"https://disneyworld.disney.go.com/attractions/epcot/journey-into-imagination-with-figment/" },
  { id:"ep16", park:"ep", name:"Journey of Water, Inspired by Moana",                 type:"Tour", ll:"noll",url:"https://disneyworld.disney.go.com/attractions/epcot/journey-of-water/" },
  { id:"mk20", park:"mk", name:"Jungle Cruise",                                       type:"Ride", ll:"mp1", url:"https://disneyworld.disney.go.com/attractions/magic-kingdom/jungle-cruise/" },
  { id:"hs13", park:"hs", name:"The Little Mermaid - A Musical Adventure",            type:"Show", ll:"mp2", url:"https://disneyworld.disney.go.com/entertainment/hollywood-studios/little-mermaid-musical-adventure/" },
  { id:"ep6",  park:"ep", name:"Living with the Land",                                type:"Ride", ll:"mp2", url:"https://disneyworld.disney.go.com/attractions/epcot/living-with-the-land/" },
  { id:"mk6",  park:"mk", name:"Mad Tea Party",                                       type:"Ride", ll:"mp2", url:"https://disneyworld.disney.go.com/attractions/magic-kingdom/mad-tea-party/" },
  { id:"mk21", park:"mk", name:"The Magic Carpets of Aladdin",                        type:"Ride", ll:"mp2", url:"https://disneyworld.disney.go.com/attractions/magic-kingdom/magic-carpets-of-aladdin/" },
  { id:"mk8",  park:"mk", name:"The Many Adventures of Winnie the Pooh",              type:"Ride", ll:"mp2", url:"https://disneyworld.disney.go.com/attractions/magic-kingdom/many-adventures-of-winnie-the-pooh/" },
  { id:"mk34", park:"mk", name:"Meet Ariel at Her Grotto",                            type:"Character Meet", ll:"noll",url:"https://disneyworld.disney.go.com/entertainment/magic-kingdom/character-meet-ariel-grotto-fantasyland/" },
  { id:"hs15", park:"hs", name:"Meet Ariel at Walt Disney Presents",                  type:"Character Meet", ll:"noll",url:"https://disneyworld.disney.go.com/entertainment/hollywood-studios/character-meet-ariel-walt-disney-presents/" },
  { id:"ep17", park:"ep", name:"Meet Anna and Elsa at Royal Sommerhus",               type:"Character Meet", ll:"noll",url:"https://disneyworld.disney.go.com/entertainment/epcot/character-meet-anna-elsa-royal-sommerhus/" },
  { id:"ep18", park:"ep", name:"Meet Beloved Disney Pals at Mickey and Friends",      type:"Character Meet", ll:"noll",url:"https://disneyworld.disney.go.com/entertainment/epcot/character-meet-disney-pals-communicore-hall/" },
  { id:"mk35", park:"mk", name:"Meet Cinderella and a Visiting Princess at Princess Fairytale Hall", type:"Character Meet", ll:"noll",url:"https://disneyworld.disney.go.com/entertainment/magic-kingdom/character-meet-princess-fantasyland/" },
  { id:"hs16", park:"hs", name:"Meet Disney Stars at Red Carpet Dreams",              type:"Character Meet", ll:"noll",url:"https://disneyworld.disney.go.com/entertainment/hollywood-studios/character-meet-mickey-minnie-red-carpet/" },
  { id:"hs17", park:"hs", name:"Meet Edna Mode at the Edna Mode Experience",          type:"Character Meet", ll:"noll",url:"https://disneyworld.disney.go.com/entertainment/hollywood-studios/character-meet-edna-mode-experience/" },
  { id:"mk36", park:"mk", name:"Meet Mickey at Town Square Theater",                  type:"Character Meet", ll:"noll",url:"https://disneyworld.disney.go.com/entertainment/magic-kingdom/character-meet-mickey-town-square/" },
  { id:"hs18", park:"hs", name:"Meet Olaf at Celebrity Spotlight",                    type:"Character Meet", ll:"noll",url:"https://disneyworld.disney.go.com/entertainment/hollywood-studios/character-meet-olaf-frozen/" },
  { id:"mk37", park:"mk", name:"Meet Princess Tiana and a Visiting Princess at Princess Fairytale Hall", type:"Character Meet", ll:"noll",url:"https://disneyworld.disney.go.com/entertainment/magic-kingdom/character-meet-princess-fairytale-hall/" },
  { id:"hs11", park:"hs", name:"Mickey and Minnie's Runaway Railway",                 type:"Ride", ll:"mp1", url:"https://disneyworld.disney.go.com/attractions/hollywood-studios/mickey-minnies-runaway-railway/" },
  { id:"mk9",  park:"mk", name:"Mickey's PhilharMagic",                               type:"Show", ll:"mp2", url:"https://disneyworld.disney.go.com/attractions/magic-kingdom/mickeys-philharmagic/" },
  { id:"hs2",  park:"hs", name:"Millennium Falcon: Smugglers Run",                    type:"Ride", ll:"mp1", url:"https://disneyworld.disney.go.com/attractions/hollywood-studios/millennium-falcon-smugglers-run/" },
  { id:"ep3",  park:"ep", name:"Mission: SPACE",                                      type:"Ride", ll:"mp2", url:"https://disneyworld.disney.go.com/attractions/epcot/mission-space/" },
  { id:"mk17", park:"mk", name:"Monsters Inc. Laugh Floor",                           type:"Show", ll:"mp2", url:"https://disneyworld.disney.go.com/attractions/magic-kingdom/monsters-inc-laugh-floor/" },
  { id:"mk2",  park:"mk", name:"Peter Pan's Flight",                                  type:"Ride", ll:"mp1", url:"https://disneyworld.disney.go.com/attractions/magic-kingdom/peter-pan-flight/" },
  { id:"mk38", park:"mk", name:"Pete's Silly Sideshow - Dumbo and Goofy",             type:"Character Meet", ll:"noll",url:"https://disneyworld.disney.go.com/entertainment/magic-kingdom/character-meet-goofy-donald/" },
  { id:"mk39", park:"mk", name:"Pete's Silly Sideshow - Donald and Daisy",            type:"Character Meet", ll:"noll",url:"https://disneyworld.disney.go.com/entertainment/magic-kingdom/character-meet-minnie-daisy/" },
  { id:"mk22", park:"mk", name:"Pirates of the Caribbean",                            type:"Ride", ll:"mp2", url:"https://disneyworld.disney.go.com/attractions/magic-kingdom/pirates-of-the-caribbean/" },
  { id:"mk5",  park:"mk", name:"Prince Charming Regal Carrousel",                     type:"Ride", ll:"noll",url:"https://disneyworld.disney.go.com/attractions/magic-kingdom/prince-charming-regal-carrousel/" },
  { id:"ep11", park:"ep", name:"Remy's Ratatouille Adventure",                        type:"Ride", ll:"mp1", url:"https://disneyworld.disney.go.com/attractions/epcot/remys-ratatouille-adventure/" },
  { id:"hs6",  park:"hs", name:"Rock 'n' Roller Coaster Starring The Muppets",        type:"Ride", ll:"mp1", url:"https://disneyworld.disney.go.com/attractions/hollywood-studios/rock-and-roller-coaster-starring-muppets/" },
  { id:"ep7",  park:"ep", name:"The Seas with Nemo and Friends",                      type:"Ride", ll:"mp2", url:"https://disneyworld.disney.go.com/attractions/epcot/seas-with-nemo-and-friends/" },
  { id:"mk1",  park:"mk", name:"Seven Dwarfs Mine Train",                             type:"Ride", ll:"ill", illPrice:"$15–$22", url:"https://disneyworld.disney.go.com/attractions/magic-kingdom/seven-dwarfs-mine-train/" },
  { id:"hs3",  park:"hs", name:"Slinky Dog Dash",                                     type:"Ride", ll:"mp1", url:"https://disneyworld.disney.go.com/attractions/hollywood-studios/slinky-dog-dash/" },
  { id:"ep5",  park:"ep", name:"Soarin' Around the World",                            type:"Ride", ll:"mp2", url:"https://disneyworld.disney.go.com/attractions/epcot/soarin-around-world/" },
  { id:"ep19", park:"ep", name:"Soarin' Across America",                              type:"Ride", ll:"mp2", closed:true, url:"https://disneyworld.disney.go.com/attractions/epcot/soarin-across-america/" },
  { id:"mk11", park:"mk", name:"Space Mountain",                                      type:"Ride", ll:"mp1", url:"https://disneyworld.disney.go.com/attractions/magic-kingdom/space-mountain/" },
  { id:"ep4",  park:"ep", name:"Spaceship Earth",                                     type:"Ride", ll:"mp2", url:"https://disneyworld.disney.go.com/attractions/epcot/spaceship-earth/" },
  { id:"hs9",  park:"hs", name:"Star Tours - The Adventures Continue",                type:"Ride", ll:"mp2", url:"https://disneyworld.disney.go.com/attractions/hollywood-studios/star-tours/" },
  { id:"hs1",  park:"hs", name:"Star Wars: Rise of the Resistance",                   type:"Ride", ll:"ill", illPrice:"$15–$22", url:"https://disneyworld.disney.go.com/attractions/hollywood-studios/star-wars-rise-of-the-resistance/" },
  { id:"mk40", park:"mk", name:"Swiss Family Treehouse",                              type:"Tour", ll:"noll",url:"https://disneyworld.disney.go.com/attractions/magic-kingdom/swiss-family-treehouse/" },
  { id:"ep2",  park:"ep", name:"Test Track",                                          type:"Ride", ll:"mp1", url:"https://disneyworld.disney.go.com/attractions/epcot/test-track/" },
  { id:"mk19", park:"mk", name:"Tiana's Bayou Adventure",                             type:"Ride", ll:"mp1", url:"https://disneyworld.disney.go.com/attractions/magic-kingdom/tianas-bayou-adventure/" },
  { id:"mk16", park:"mk", name:"Tomorrowland Speedway",                               type:"Ride", ll:"mp2", url:"https://disneyworld.disney.go.com/attractions/magic-kingdom/tomorrowland-speedway/" },
  { id:"mk15", park:"mk", name:"Tomorrowland Transit Authority PeopleMover",          type:"Tour", ll:"noll",url:"https://disneyworld.disney.go.com/attractions/magic-kingdom/tomorrowland-transit-authority-peoplemover/" },
  { id:"hs4",  park:"hs", name:"Toy Story Mania!",                                    type:"Ride", ll:"mp2", url:"https://disneyworld.disney.go.com/attractions/hollywood-studios/toy-story-mania/" },
  { id:"mk10", park:"mk", name:"TRON Lightcycle / Run",                               type:"Ride", ll:"ill", illPrice:"$15–$22", url:"https://disneyworld.disney.go.com/attractions/magic-kingdom/tron-lightcycle-run/" },
  { id:"ep8",  park:"ep", name:"Turtle Talk with Crush",                              type:"Show", ll:"mp2", url:"https://disneyworld.disney.go.com/attractions/epcot/turtle-talk-with-crush/" },
  { id:"hs7",  park:"hs", name:"The Twilight Zone Tower of Terror",                   type:"Ride", ll:"mp2", url:"https://disneyworld.disney.go.com/attractions/hollywood-studios/twilight-zone-tower-of-terror/" },
  { id:"mk4",  park:"mk", name:"Under the Sea: Journey of the Little Mermaid",        type:"Ride", ll:"mp2", url:"https://disneyworld.disney.go.com/attractions/magic-kingdom/under-the-sea-journey-of-the-little-mermaid/" },
  { id:"mk14", park:"mk", name:"Walt Disney's Carousel of Progress",                  type:"Show", ll:"noll",url:"https://disneyworld.disney.go.com/attractions/magic-kingdom/walt-disney-carousel-of-progress/" },
  { id:"ep20", park:"ep", name:"Disney Visa Character Experience",                    type:"Character Meet", ll:"noll", visa:true, hours:"1:00pm–6:30pm", location:"Disney Visa Photo Spot, World Celebration, next to Journey Into Imagination", url:"https://disneyworld.disney.go.com/entertainment/epcot/visa-card-character-experience/" },
  { id:"hs20", park:"hs", name:"Star Wars Visa Photo Opportunity",                    type:"Character Meet", ll:"noll", visa:true, hours:"9:00am–5:00pm", location:"Between Galaxy's Edge and Toy Story Land", url:"https://disneyrewards.com/parks-and-vacations/walt-disney-world-perks/#starwarscharacterexperience" },
  { id:"hs21", park:"hs", name:"Stitch Visa Character Experience",                    type:"Character Meet", ll:"noll", visa:true, hours:"9:00am–12:00pm", location:"Celebrity Spotlight, Echo Lake", url:"https://disneyrewards.com/parks-and-vacations/walt-disney-world-perks/#starwarscharacterexperience" },
];

export const RIDES = RAW_RIDES
  .map((r) => ({ ...r, displayName: toDisplayName(r.name) }))
  .sort((a, b) => sortKey(a.displayName).localeCompare(sortKey(b.displayName)));

// ── Storage ───────────────────────────────────────────────────────────────────

const LS_KEY = "dw2026-ll-v8";
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
      const park        = RIDES.find((r) => r.id === rideId)?.park;
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
  return prefs[rideId]?.closed ?? RIDES.find((r) => r.id === rideId)?.closed ?? false;
}
function preBookCounts(parkId, prefs, excludeRideId) {
  let t1 = 0, t2 = 0;
  RIDES.filter((r) => r.park === parkId).forEach((r) => {
    if (r.id === excludeRideId) return;
    const s = prefs[r.id]?.llStatus;
    if (s === LL_STATUS.PREBOOK || s === LL_STATUS.FIRST) {
      if (r.ll === "mp1") t1++;
      if (r.ll === "mp2") t2++;
    }
  });
  return { t1, t2 };
}
function isPreBookFull(parkId, prefs) {
  const { t1, t2 } = preBookCounts(parkId, prefs, null);
  const maxT2 = t1 === 0 ? 3 : 2;
  return t1 >= 1 && t2 >= maxT2 || t2 >= 3;
}

// ── Sort group for LL ranking ─────────────────────────────────────────────────

function sortTierGroup(group, parkId, prefs) {
  const full = isPreBookFull(parkId, prefs);
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
    EARLY_ENTRY.has(ride.id) ? "Early Entry" : null,
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
            <a href={ride.url} target="_blank" rel="noreferrer">{ride.displayName} ↗</a>
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

function LLStatusMenu({ ride, prefs, parkId, onLLStatus }) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const btnRef = useRef(null);
  const current = prefs[ride.id]?.llStatus ?? null;
  const { t1, t2 } = preBookCounts(parkId, prefs, ride.id);
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
                  RIDES.filter((r) => r.park === ride.park && r.id !== ride.id && prefs[r.id]?.llStatus === LL_STATUS.FIRST)
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

function RankItem({ r, num, prefs, parkId, onLLStatus }) {
  const llStatus  = prefs[r.id]?.llStatus ?? null;
  const isDemoted = llStatus === LL_STATUS.DONTBOOK;
  const isRD      = r.isRD ?? false;
  const isEE      = EARLY_ENTRY.has(r.id);
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
          <a href={r.url} target="_blank" rel="noreferrer" className="r-link">{r.displayName} ↗</a>
          {r.illPrice && !isDemoted && <span className="ill-price">({r.illPrice})</span>}
        </span>
        {isRD && <span className="r-pill rd-tag">RD ✓</span>}
        {isEE && !isDemoted && <span className="r-pill ee-tag">EE</span>}
        {r.visa && !isDemoted && <span className="r-pill visa-tag">Visa</span>}
        <LLStatusMenu ride={r} prefs={prefs} parkId={parkId} onLLStatus={onLLStatus} />
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

function Rankings({ parkId, prefs, onRdConfirm, onLLStatus }) {
  const park        = PARKS.find((p) => p.id === parkId);
  const rides       = RIDES.filter((r) => r.park === parkId);
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
    const nonDecided = activeRides.filter((r) => prefs[r.id]?.llStatus !== LL_STATUS.DONTBOOK && prefs[r.id]?.llStatus !== LL_STATUS.LATER && r.id !== rdConfirmed);
    const topT1  = nonDecided.filter((r) => r.ll === "mp1").map((r) => ({ ...r, score: calcScore(r.id, prefs) })).sort((a, b) => b.score - a.score)[0];
    const topT2  = nonDecided.filter((r) => r.ll === "mp2").map((r) => ({ ...r, score: calcScore(r.id, prefs) })).sort((a, b) => b.score - a.score).slice(0, 2);
    const illR   = nonDecided.filter((r) => r.ll === "ill");
    const llIds  = new Set([...(topT1 ? [topT1.id] : []), ...topT2.map((r) => r.id), ...illR.map((r) => r.id)]);

    return scored.slice(0, 10).map((r, i) => {
      const isConfRD = rdConfirmed === r.id;
      const isRDNom  = prefs[r.id]?.rdNom && !isConfRD;
      const showLL   = llIds.has(r.id) && !isConfRD;
      const pill = r.ll === "ill" ? <span className="r-pill b-sp">SP</span> : r.ll === "mp1" ? <span className="r-pill b-mp1">T1</span> : r.ll === "mp2" ? <span className="r-pill b-mp2">T2</span> : null;
      return (
        <div className="r-item" key={r.id}>
          <div className="r-item-top">
            <span className="r-num">{i + 1}</span>
            <span className={`score-badge ${scoreColorClass(r.score)}`}>{r.score > 0 ? "+" : ""}{r.score}</span>
            <span className="r-name"><a href={r.url} target="_blank" rel="noreferrer" className="r-link">{r.displayName} ↗</a></span>
            {isConfRD && <span className="r-pill rd-tag">RD ✓</span>}
            {isRDNom  && <span className="r-pill rd-tag">RD?</span>}
            {showLL && pill}
            {showLL && <span className="r-pill ll-tag">Book LL</span>}
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
    const { t1: t1Count, t2: t2Count } = preBookCounts(parkId, prefs, null);
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
      if (t1PreBooked) return `Tier 1 — ${t1PreBooked.displayName} ✓`;
      if (t1Skipped)   return `Tier 1 — Skipping · ${maxT2} T2 slots available`;
      return "Tier 1 — Select up to 1 ↓";
    };
    const t2Header = () => {
      if (t2Filled) return `Tier 2 — ${t2Count} of ${maxT2} slots filled ✓`;
      return `Tier 2 — ${t2Count} of ${maxT2} slots filled`;
    };

    const renderRideItem = (r, num) => {
      const isRD = r.id === rdConfirmed;
      return (
        <div key={r.id} style={{ position: "relative" }}>
          <RankItem r={{ ...r, isRD }} num={num} prefs={prefs} parkId={parkId} onLLStatus={onLLStatus} />
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
                      <span className="r-name"><a href={r.url} target="_blank" rel="noreferrer" className="r-link">{r.displayName} ↗</a></span>
                      <div className={`rd-chk${isConf ? " on" : ""}`} onClick={() => onRdConfirm(parkId, r.id)}>{isConf ? "✓" : ""}</div>
                    </div>
                  </div>
                );
              })}
            </>
          </div>
        )}

        {/* Warnings */}
        {rdConfirmed && !EARLY_ENTRY.has(rdConfirmed) && (
          <div className="conflict">⚠ Rope Drop ride is not available during early entry — you'll be competing with the full crowd at park open.</div>
        )}

        {/* Tier 1 */}
        {(() => {
          const t1Rides = allLLScored.filter((r) => r.ll === "mp1" && !laterRoundIds.has(r.id));
          if (!t1Rides.length) return null;
          const isSelecting = !t1PreBooked && !t1Skipped;
          const locked = !!t1PreBooked;
          const sorted  = sortTierGroup(t1Rides, parkId, prefs);
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
          const sorted   = sortTierGroup(t2Rides, parkId, prefs);
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

  return (
    <>
      <div className="rank-sec">
        <div className="rank-hdr" onClick={() => setOverallOpen((o) => !o)}>
          <span className="rank-title">Overall Top 10</span>
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
    </>
  );
}

// ── Summary ───────────────────────────────────────────────────────────────────

const TRIP_START = new Date(2026, 4, 21); // May 21 2026

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

export function Summary({ prefs, syncing, onPref, onNotes, onClosed, onRdNom, onRdConfirm, onLLStatus }) {
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
    const rides = RIDES.filter((r) => r.park === parkId);
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
            <a href={r.url} target="_blank" rel="noreferrer" className="summary-ride-name">{r.displayName} ↗</a>
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
          />
        </div>
      )}
      {(summaryMode === "prebook" || summaryMode === "all") && PARKS.map((park) => {
        const rdConf  = prefs[`rdc_${park.id}`] ?? null;
        const rdRide  = rdConf ? RIDES.find((r) => r.id === rdConf) : null;
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
                            <a href={r.url} target="_blank" rel="noreferrer" className="summary-ride-name">{r.displayName} ↗</a>
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

export function ParkRides({ parkId, prefs, onPref, onNotes, onClosed, onRdNom, syncing, onRdConfirm, onLLStatus, showRankings = true }) {
  const [ratedOpen, setRatedOpen] = useState(false);

  const parkRides = RIDES.filter((r) => r.park === parkId);

  const needsRating = parkRides.filter((r) =>
    !isClosed(r.id, prefs) && totalVotes(r.id, prefs) < PEOPLE.length
  );
  const ratedAndClosed = parkRides.filter((r) =>
    isClosed(r.id, prefs) || totalVotes(r.id, prefs) === PEOPLE.length
  );

  const cardProps = { prefs, onPref, onNotes, onClosed, onRdNom, syncing };

  return (
    <>
      {needsRating.map((ride) => (
        <RideCard key={ride.id} ride={ride} {...cardProps} />
      ))}
      {ratedAndClosed.length > 0 && (
        <div className="rank-sec" style={{marginTop: '0', marginBottom: '10px'}}>
          <div className="rank-hdr" onClick={() => setRatedOpen((o) => !o)}>
            <span className="rank-title">Rated (or Closed) Rides ({ratedAndClosed.length})</span>
            <span className={`chev${ratedOpen ? " open" : ""}`}>▼</span>
          </div>
          {ratedOpen && ratedAndClosed.map((ride) => (
            <RideCard key={ride.id} ride={ride} {...cardProps} />
          ))}
        </div>
      )}
      {showRankings && <Rankings parkId={parkId} prefs={prefs} onRdConfirm={onRdConfirm} onLLStatus={onLLStatus} />}
    </>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export function LLPlanner() {
  const [activeTab, setActiveTab] = useState("mk");
  const [prefs, setPrefs]         = useState(() => loadStorage());
  const [loading, setLoading]     = useState(true);
  const [syncing, setSyncing]     = useState({});
  const [syncError, setSyncError] = useState(null);

  useEffect(() => {
    fetchAllVotes()
      .then((notionData) => {
        setPrefs((local) => {
          const merged = { ...local };
          Object.entries(notionData).forEach(([key, data]) => {
            if (key.startsWith("rdc_")) { merged[key] = data; }
            else { merged[key] = { ...local[key], ...data, prefs: { ...(local[key]?.prefs ?? {}), ...(data.prefs ?? {}) }, pageIds: { ...(local[key]?.pageIds ?? {}), ...(data.pageIds ?? {}) } }; }
          });
          saveStorage(merged);
          return merged;
        });
      })
      .catch(() => setSyncError("Could not load from server — showing local data."))
      .finally(() => setLoading(false));
  }, []);

  const handlePref = useCallback(async (rideId, pid, pref) => {
    const ride    = RIDES.find((r) => r.id === rideId);
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
      if (existingPageId) await deleteVoteFromNotion(existingPageId);
      const curPref = prefs[rideId]?.prefs?.[pid] ?? null;
      if (curPref !== pref) {
        const pageId = await saveVoteToNotion(rideId, ride.displayName, ride.park, pid, pref);
        setPrefs((prev) => { const next = { ...prev, [rideId]: { ...prev[rideId], pageIds: { ...(prev[rideId]?.pageIds ?? {}), [pid]: pageId } } }; saveStorage(next); return next; });
      } else {
        setPrefs((prev) => { const next = { ...prev }; if (next[rideId]?.pageIds) delete next[rideId].pageIds[pid]; saveStorage(next); return next; });
      }
    } catch (_) { setSyncError("Vote saved locally but could not sync to server."); }
    finally { setSyncing((s) => { const n = { ...s }; delete n[syncKey]; return n; }); }
  }, [prefs]);

  const handleNotes = useCallback((rideId, val) => {
    setPrefs((prev) => {
      const next = { ...prev, [rideId]: { ...prev[rideId], notes: val } };
      saveStorage(next);
      const ride = RIDES.find((r) => r.id === rideId);
      saveMetaToNotion(rideId, ride?.displayName, ride?.park, next[rideId], next[`rdc_${ride?.park}`]);
      return next;
    });
  }, []);

  const handleClosed = useCallback((rideId) => {
    setPrefs((prev) => {
      const cur  = isClosed(rideId, prev);
      const park = RIDES.find((r) => r.id === rideId)?.park;
      const next = { ...prev, [rideId]: { ...prev[rideId], closed: !cur } };
      if (!cur) { next[rideId].rdNom = false; if (next[`rdc_${park}`] === rideId) next[`rdc_${park}`] = null; }
      saveStorage(next);
      const ride = RIDES.find((r) => r.id === rideId);
      saveMetaToNotion(rideId, ride?.displayName, park, next[rideId], next[`rdc_${park}`]);
      return next;
    });
  }, []);

  const handleRdNom = useCallback((rideId) => {
    setPrefs((prev) => {
      const wasNom = prev[rideId]?.rdNom ?? false;
      const park   = RIDES.find((r) => r.id === rideId)?.park;
      const next   = { ...prev, [rideId]: { ...prev[rideId], rdNom: !wasNom } };
      if (wasNom && next[`rdc_${park}`] === rideId) next[`rdc_${park}`] = null;
      saveStorage(next);
      const ride = RIDES.find((r) => r.id === rideId);
      saveMetaToNotion(rideId, ride?.displayName, park, next[rideId], next[`rdc_${park}`]);
      return next;
    });
  }, []);

  const handleRdConfirm = useCallback((parkId, rideId) => {
    setPrefs((prev) => {
      const cur  = prev[`rdc_${parkId}`] ?? null;
      const next = { ...prev, [`rdc_${parkId}`]: cur === rideId ? null : rideId };
      saveStorage(next);
      RIDES.filter((r) => r.park === parkId && prev[r.id]?.rdNom)
        .forEach((r) => saveMetaToNotion(r.id, r.displayName, parkId, next[r.id] ?? {}, next[`rdc_${parkId}`]));
      return next;
    });
  }, []);

  const handleLLStatus = useCallback((rideId, status) => {
    setPrefs((prev) => {
      const cur  = prev[rideId]?.llStatus ?? null;
      const next = { ...prev, [rideId]: { ...prev[rideId], llStatus: cur === status ? null : status } };
      saveStorage(next);
      const ride = RIDES.find((r) => r.id === rideId);
      saveMetaToNotion(rideId, ride?.displayName, ride?.park, next[rideId], next[`rdc_${ride?.park}`]);
      return next;
    });
  }, []);

  const TABS = [...PARKS, { id: "summary", name: "Summary", color: "#555" }];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap');
        .app *, .app *::before, .app *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #FBF7F2; font-family: 'DM Sans', sans-serif; }
        .app { max-width: 480px; margin: 0 auto; padding: 20px 16px 60px; }
        .header { margin-bottom: 20px; }
        .header h1 { font-size: 22px; font-weight: normal; color: #1A1A1A; letter-spacing: -0.02em; margin-bottom: 4px; }
        .header p  { font-size: 11px; color: #AAA; font-family: 'DM Sans', sans-serif; letter-spacing: 0.08em; text-transform: uppercase; }
        .sync-status  { font-size: 10px; font-family: 'DM Sans', sans-serif; padding: 6px 10px; border-radius: 8px; margin-bottom: 14px; }
        .sync-loading { background: #E3F2FD; color: #0D47A1; }
        .sync-error   { background: #FFF8E1; color: #E65100; }
        .park-tabs { display: flex; gap: 6px; margin-bottom: 20px; overflow-x: auto; padding-bottom: 4px; }
        .park-tab  { flex-shrink: 0; padding: 7px 14px; border-radius: 20px; border: none; font-family: 'DM Sans', sans-serif; font-size: 11px; cursor: pointer; }
        .park-tab.active   { color: #FFF; }
        .park-tab.inactive { background: #EDE8E1; color: #1A1A1A; }
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
        .tog-row { display: flex; gap: 6px; padding: 10px 16px; border-bottom: 1px solid #F5F0EA; }
        .tog-btn { flex: 1; padding: 6px; border-radius: 20px; border: 1.5px solid #C8C0B6; background: #F0EBE3; font-size: 10px; font-family: 'DM Sans', sans-serif; color: #1A1A1A; cursor: pointer; text-align: center; font-weight: bold; }
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
        .b-mp1  { background: #E8F5E9; color: #1B5E20; border: 1px solid #A5D6A7; }
        .b-mp2  { background: #E3F2FD; color: #0D47A1; border: 1px solid #90CAF9; }
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
      <div className="app">
        <div className="header">
          <h1>Ride Selection for May 2026</h1>
          <p>Disney World · May 2026</p>
        </div>
        {loading && <div className="sync-status sync-loading">Loading votes from server…</div>}
        {syncError && <div className="sync-status sync-error">{syncError}</div>}
        <div className="park-tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`park-tab ${t.id === activeTab ? "active" : "inactive"}`} style={t.id === activeTab ? { background: t.color } : {}} onClick={() => setActiveTab(t.id)}>
              {t.name}
            </button>
          ))}
        </div>
        {activeTab === "summary" ? (
          <Summary prefs={prefs} />
        ) : (
          <ParkRides parkId={activeTab} prefs={prefs} onPref={handlePref} onNotes={handleNotes} onClosed={handleClosed} onRdNom={handleRdNom} syncing={syncing} onRdConfirm={handleRdConfirm} onLLStatus={handleLLStatus} />
        )}
      </div>
    </>
  );
}
