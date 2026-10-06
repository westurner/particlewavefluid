import * as Astronomy from 'astronomy-engine';

export const SOLAR_SYSTEM_SCENE_SCALE = 0.42;
export const ASTRONOMICAL_UNITS_PER_YEAR = 365.25;
export const SOLAR_SYSTEM_ATTRACTOR_MODELS = [
  { value: 'solar-system', label: 'Solar System + Earth’s Moon' },
  { value: 'solar-system-moons', label: 'Solar System + major moons' },
  { value: 'illustrative', label: 'Illustrative five-body system' }
];
export const PLANET_DIAMETER_MODES = [
  { value: 'illustrative', label: 'Illustrative diameters' },
  { value: 'actual', label: 'Actual diameters' }
];

const SOLAR_MASS_KG = 1.98847e30;
const STANDARD_G_KM3_PER_KG_S2 = 6.67430e-20;
const KM_PER_AU = 149597870.7;
const KM_PER_AU_PER_YEAR = 149597870.7 / (365.25 * 86400);
const EARTH_RADIUS_KM = 6371;
const J2000_UTC_MS = Date.UTC(2000, 0, 1, 12);
const DAYS_PER_MILLENNIUM = 365250;
const BODY_FACTS_SOURCE = 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/';
const SATELLITE_MASS_SOURCE = 'https://ssd.jpl.nasa.gov/sats/phys_par/';
const SATELLITE_ELEMENTS_SOURCE = 'https://ssd.jpl.nasa.gov/sats/elem/';
const ROTATION_SOURCE = 'https://github.com/cosinekitty/astronomy';

export const JPL_SATELLITE_GM_KM3_S2 = Object.freeze({
  Moon: 4902.800,
  Phobos: 0.0007087,
  Deimos: 0.0000962,
  Io: 5959.91547,
  Europa: 3202.71210,
  Ganymede: 9887.83275,
  Callisto: 7179.28340,
  Amalthea: 0.16456,
  Himalia: 0.15155,
  Thebe: 0.03015,
  Mimas: 2.50349,
  Enceladus: 7.21037,
  Tethys: 41.21353,
  Dione: 73.11607,
  Rhea: 153.94175,
  Titan: 8978.13710,
  Hyperion: 0.37049,
  Iapetus: 120.51511,
  Phoebe: 0.55479,
  Janus: 0.12662,
  Ariel: 83.5,
  Umbriel: 85.1,
  Titania: 226.9,
  Oberon: 205.3,
  Miranda: 4.3,
  Triton: 1428.49546,
  Naiad: 0.00853,
  Thalassa: 0.02359,
  Despina: 0.11673,
  Galatea: 0.18990,
  Larissa: 0.25484,
  Proteus: 2.58342
});

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

const PARENT_GM_KM3_S2 = Object.freeze({
  Earth: 398600.436,
  Mars: 42828.37362,
  Jupiter: 126686531.9,
  Saturn: 37931206.23,
  Uranus: 5793951.3,
  Neptune: 6835099.97
});

const CENTRAL_BODIES = [
  {
    id: 'Sun', name: 'Sun', massKg: 1.98847e30, radiusKm: 696340, color: '#ffce62',
    rotationPeriodHours: 609.12, axialTiltDeg: 7.25, magneticField: 'Variable global field; about 1–2 gauss at the photosphere, with strong solar-cycle variation.',
    chargeField: 'No fixed net electric charge is established; the solar wind is a plasma outflow.',
    fact: 'Contains about 99.86% of the Solar System’s mass.'
  },
  {
    id: 'Mercury', name: 'Mercury', massKg: 3.3011e23, radiusKm: 2439.7, color: '#b8aaa0',
    rotationPeriodHours: 1407.6, axialTiltDeg: 0.034, magneticField: 'Weak intrinsic dipole, about 1% of Earth’s surface field.',
    chargeField: 'No fixed net electric charge is established.', fact: 'A 3:2 spin-orbit resonance gives three rotations for every two Mercury years.'
  },
  {
    id: 'Venus', name: 'Venus', massKg: 4.8675e24, radiusKm: 6051.8, color: '#e9a469',
    rotationPeriodHours: -5832.5, axialTiltDeg: 177.36, magneticField: 'No intrinsic global dipole detected; it has an induced magnetosphere.',
    chargeField: 'No fixed net electric charge is established.', fact: 'Its dense carbon-dioxide atmosphere produces an extreme greenhouse effect.'
  },
  {
    id: 'Earth', name: 'Earth', massKg: 5.97237e24, radiusKm: 6371, color: '#5db9dc',
    rotationPeriodHours: 23.9345, axialTiltDeg: 23.439, magneticField: 'Surface field is roughly 25–65 microtesla; dipole moment is about 7.8 × 10²² A·m².',
    chargeField: 'No fixed net electric charge is established; the ionosphere and magnetosphere are electrically active.',
    fact: 'The Moon’s gravity raises ocean tides and stabilizes long-term axial motion.'
  },
  {
    id: 'Mars', name: 'Mars', massKg: 6.4171e23, radiusKm: 3389.5, color: '#d97359',
    rotationPeriodHours: 24.6229, axialTiltDeg: 25.19, magneticField: 'No global dipole; ancient magnetization remains in parts of the crust.',
    chargeField: 'No fixed net electric charge is established.', fact: 'Its two small moons are Phobos and Deimos.'
  },
  {
    id: 'Jupiter', name: 'Jupiter', massKg: 1.8982e27, radiusKm: 69911, color: '#e5bd8c',
    rotationPeriodHours: 9.925, axialTiltDeg: 3.13, magneticField: 'Equatorial surface field is about 4.3 gauss; dipole moment is about 1.56 × 10²⁷ A·m².',
    chargeField: 'No fixed net electric charge is established; its magnetosphere traps energetic charged particles.',
    fact: 'Io, Europa, Ganymede, and Callisto are the four Galilean moons.'
  },
  {
    id: 'Saturn', name: 'Saturn', massKg: 5.6834e26, radiusKm: 58232, color: '#e3c16e',
    rotationPeriodHours: 10.656, axialTiltDeg: 26.73, magneticField: 'Strong intrinsic field with an unusually axis-aligned dipole.',
    chargeField: 'No fixed net electric charge is established.', fact: 'Its low density and bright rings make it a distinctive gas giant.'
  },
  {
    id: 'Uranus', name: 'Uranus', massKg: 8.681e25, radiusKm: 25362, color: '#79c8c7',
    rotationPeriodHours: -17.24, axialTiltDeg: 97.77, magneticField: 'Strong, highly tilted and offset magnetic field.',
    chargeField: 'No fixed net electric charge is established.', fact: 'Its extreme axial tilt makes the planet rotate nearly on its side.'
  },
  {
    id: 'Neptune', name: 'Neptune', massKg: 1.02413e26, radiusKm: 24622, color: '#557ee5',
    rotationPeriodHours: 16.11, axialTiltDeg: 28.32, magneticField: 'Strong, highly tilted and offset magnetic field.',
    chargeField: 'No fixed net electric charge is established.', fact: 'Triton orbits backward and is likely a captured Kuiper Belt object.'
  }
];

const MOON_FACTS = {
  id: 'Moon', name: 'Moon', parentId: 'Earth', massKg: 7.342e22, radiusKm: 1737.4, color: '#d8d9cf',
  rotationPeriodHours: 655.72, axialTiltDeg: 6.68, magneticField: 'No global dipole; localized crustal magnetic anomalies are measured.',
  chargeField: 'No fixed net electric charge is established; surface charging varies with plasma and sunlight.',
  fact: 'Physical libration and orbital eccentricity reveal small departures from uniform synchronous motion.'
};

const OPTIONAL_MOONS = [
  { parentId: 'Mars', name: 'Phobos', massKg: 1.0659e16, radiusKm: 11.27, orbitRadiusKm: 9376, periodDays: 0.3189, inclinationDeg: 1.1, phase: 0.4 },
  { parentId: 'Mars', name: 'Deimos', massKg: 1.4762e15, radiusKm: 6.2, orbitRadiusKm: 23463, periodDays: 1.263, inclinationDeg: 1.8, phase: 2.2 },
  { parentId: 'Jupiter', name: 'Io', massKg: 8.9319e22, radiusKm: 1821.6, orbitRadiusKm: 421700, periodDays: 1.769, inclinationDeg: 0.04, phase: 0.2 },
  { parentId: 'Jupiter', name: 'Europa', massKg: 4.7998e22, radiusKm: 1560.8, orbitRadiusKm: 671100, periodDays: 3.551, inclinationDeg: 0.47, phase: 1.1 },
  { parentId: 'Jupiter', name: 'Ganymede', massKg: 1.4819e23, radiusKm: 2631.2, orbitRadiusKm: 1070400, periodDays: 7.155, inclinationDeg: 0.21, phase: 2.4 },
  { parentId: 'Jupiter', name: 'Callisto', massKg: 1.0759e23, radiusKm: 2410.3, orbitRadiusKm: 1882700, periodDays: 16.689, inclinationDeg: 0.28, phase: 4.1 },
  { parentId: 'Jupiter', name: 'Amalthea', massKg: 2.08e18, radiusKm: 83.5, orbitRadiusKm: 181400, periodDays: 0.498, inclinationDeg: 0.37, phase: 3.2 },
  { parentId: 'Jupiter', name: 'Himalia', massKg: 4.2e18, radiusKm: 85, orbitRadiusKm: 11461000, periodDays: 250.6, inclinationDeg: 27.5, phase: 0.7 },
  { parentId: 'Jupiter', name: 'Thebe', massKg: 4.3e17, radiusKm: 49.3, orbitRadiusKm: 221900, periodDays: 0.675, inclinationDeg: 1.1, phase: 5.1 },
  { parentId: 'Jupiter', name: 'Elara', massKg: 8.7e17, radiusKm: 43, orbitRadiusKm: 11741000, periodDays: 259.6, inclinationDeg: 26.6, phase: 2.7 },
  { parentId: 'Saturn', name: 'Titan', massKg: 1.3452e23, radiusKm: 2574.7, orbitRadiusKm: 1221870, periodDays: 15.945, inclinationDeg: 0.33, phase: 0.9 },
  { parentId: 'Saturn', name: 'Rhea', massKg: 2.3065e21, radiusKm: 763.8, orbitRadiusKm: 527108, periodDays: 4.518, inclinationDeg: 0.35, phase: 2.1 },
  { parentId: 'Saturn', name: 'Iapetus', massKg: 1.8056e21, radiusKm: 734.5, orbitRadiusKm: 3560850, periodDays: 79.321, inclinationDeg: 15.47, phase: 4.2 },
  { parentId: 'Saturn', name: 'Dione', massKg: 1.0955e21, radiusKm: 561.4, orbitRadiusKm: 377396, periodDays: 2.737, inclinationDeg: 0.02, phase: 1.4 },
  { parentId: 'Saturn', name: 'Tethys', massKg: 6.1745e20, radiusKm: 531.1, orbitRadiusKm: 294619, periodDays: 1.888, inclinationDeg: 1.09, phase: 3.7 },
  { parentId: 'Saturn', name: 'Enceladus', massKg: 1.0802e20, radiusKm: 252.1, orbitRadiusKm: 237948, periodDays: 1.37, inclinationDeg: 0.02, phase: 5.2 },
  { parentId: 'Saturn', name: 'Mimas', massKg: 3.7493e19, radiusKm: 198.2, orbitRadiusKm: 185539, periodDays: 0.942, inclinationDeg: 1.57, phase: 0.1 },
  { parentId: 'Saturn', name: 'Hyperion', massKg: 5.62e18, radiusKm: 135, orbitRadiusKm: 1481100, periodDays: 21.277, inclinationDeg: 0.43, phase: 2.9 },
  { parentId: 'Saturn', name: 'Phoebe', massKg: 8.292e18, radiusKm: 106.5, orbitRadiusKm: 12952000, periodDays: 550.3, inclinationDeg: 175.2, phase: 4.7 },
  { parentId: 'Saturn', name: 'Janus', massKg: 1.8975e18, radiusKm: 89.5, orbitRadiusKm: 151472, periodDays: 0.695, inclinationDeg: 0.14, phase: 1.8 },
  { parentId: 'Uranus', name: 'Titania', massKg: 3.527e21, radiusKm: 788.9, orbitRadiusKm: 435910, periodDays: 8.706, inclinationDeg: 0.08, phase: 0.6 },
  { parentId: 'Uranus', name: 'Oberon', massKg: 3.014e21, radiusKm: 761.4, orbitRadiusKm: 583520, periodDays: 13.463, inclinationDeg: 0.07, phase: 2.6 },
  { parentId: 'Uranus', name: 'Umbriel', massKg: 1.275e21, radiusKm: 584.7, orbitRadiusKm: 266000, periodDays: 4.144, inclinationDeg: 0.13, phase: 4.6 },
  { parentId: 'Uranus', name: 'Ariel', massKg: 1.251e21, radiusKm: 578.9, orbitRadiusKm: 190900, periodDays: 2.52, inclinationDeg: 0.04, phase: 1.7 },
  { parentId: 'Uranus', name: 'Miranda', massKg: 6.59e19, radiusKm: 235.8, orbitRadiusKm: 129900, periodDays: 1.413, inclinationDeg: 4.34, phase: 3.1 },
  { parentId: 'Uranus', name: 'Puck', massKg: 2.9e18, radiusKm: 81, orbitRadiusKm: 86004, periodDays: 0.762, inclinationDeg: 0.32, phase: 5.4 },
  { parentId: 'Uranus', name: 'Sycorax', massKg: 5.4e18, radiusKm: 75, orbitRadiusKm: 12179000, periodDays: 1283.4, inclinationDeg: 159, phase: 0.3 },
  { parentId: 'Uranus', name: 'Portia', massKg: 1.7e18, radiusKm: 67.6, orbitRadiusKm: 66097, periodDays: 0.513, inclinationDeg: 0.06, phase: 2.8 },
  { parentId: 'Uranus', name: 'Juliet', massKg: 1.7e18, radiusKm: 53, orbitRadiusKm: 64358, periodDays: 0.493, inclinationDeg: 0.06, phase: 4.8 },
  { parentId: 'Uranus', name: 'Belinda', massKg: 1.5e18, radiusKm: 45, orbitRadiusKm: 75255, periodDays: 0.624, inclinationDeg: 0.03, phase: 1.2 },
  { parentId: 'Neptune', name: 'Triton', massKg: 2.14e22, radiusKm: 1353.4, orbitRadiusKm: 354759, periodDays: -5.877, inclinationDeg: 156.9, phase: 2.3 },
  { parentId: 'Neptune', name: 'Proteus', massKg: 4.4e19, radiusKm: 210, orbitRadiusKm: 117647, periodDays: 1.122, inclinationDeg: 0.52, phase: 0.8 },
  { parentId: 'Neptune', name: 'Nereid', massKg: 3.1e19, radiusKm: 170, orbitRadiusKm: 5513818, periodDays: 360.1, inclinationDeg: 7.23, phase: 3.9 },
  { parentId: 'Neptune', name: 'Larissa', massKg: 4.2e18, radiusKm: 97, orbitRadiusKm: 73548, periodDays: 0.555, inclinationDeg: 0.2, phase: 5.5 },
  { parentId: 'Neptune', name: 'Galatea', massKg: 2.1e18, radiusKm: 88, orbitRadiusKm: 61953, periodDays: 0.429, inclinationDeg: 0.05, phase: 1.9 },
  { parentId: 'Neptune', name: 'Despina', massKg: 2.1e18, radiusKm: 75, orbitRadiusKm: 52526, periodDays: 0.335, inclinationDeg: 0.07, phase: 4.4 },
  { parentId: 'Neptune', name: 'Thalassa', massKg: 3.75e17, radiusKm: 41, orbitRadiusKm: 50074, periodDays: 0.311, inclinationDeg: 0.2, phase: 0.5 },
  { parentId: 'Neptune', name: 'Naiad', massKg: 1.9e17, radiusKm: 33, orbitRadiusKm: 48227, periodDays: 0.294, inclinationDeg: 4.7, phase: 2.1 },
  { parentId: 'Neptune', name: 'Halimede', massKg: 1.5e17, radiusKm: 31, orbitRadiusKm: 16611000, periodDays: -1879.7, inclinationDeg: 134, phase: 3.4 },
  { parentId: 'Neptune', name: 'Sao', massKg: 1.5e17, radiusKm: 22, orbitRadiusKm: 22422000, periodDays: 2914, inclinationDeg: 53, phase: 5.8 }
];

const historicMission = (id, label, launchDate, events, source) => ({
  id,
  label,
  launchDate,
  events,
  source,
  note: 'Earth and target-body positions are dated ephemeris waypoints, not spacecraft positions; the connecting curve is schematic, not reconstructed trajectory telemetry.'
});

export const HISTORIC_MISSIONS = [
  historicMission('apollo-8', 'Apollo 8 · First crewed lunar orbit', '1968-12-21', [{ body: 'Moon', date: '1968-12-24' }], 'https://www.nasa.gov/mission/apollo-8/'),
  historicMission('apollo-10', 'Apollo 10 · Lunar orbit rehearsal', '1969-05-18', [{ body: 'Moon', date: '1969-05-21' }], 'https://www.nasa.gov/mission/apollo-10/'),
  historicMission('apollo-11', 'Apollo 11 · First lunar landing', '1969-07-16', [{ body: 'Moon', date: '1969-07-20' }], 'https://www.nasa.gov/mission/apollo-11/'),
  historicMission('apollo-12', 'Apollo 12 · Lunar landing', '1969-11-14', [{ body: 'Moon', date: '1969-11-19' }], 'https://www.nasa.gov/mission/apollo-12/'),
  historicMission('apollo-13', 'Apollo 13 · Lunar free-return', '1970-04-11', [{ body: 'Moon', date: '1970-04-15' }], 'https://www.nasa.gov/mission/apollo-13/'),
  historicMission('apollo-14', 'Apollo 14 · Lunar landing', '1971-01-31', [{ body: 'Moon', date: '1971-02-05' }], 'https://www.nasa.gov/mission/apollo-14/'),
  historicMission('apollo-15', 'Apollo 15 · Hadley-Apennine', '1971-07-26', [{ body: 'Moon', date: '1971-07-30' }], 'https://www.nasa.gov/mission/apollo-15/'),
  historicMission('apollo-16', 'Apollo 16 · Descartes Highlands', '1972-04-16', [{ body: 'Moon', date: '1972-04-21' }], 'https://www.nasa.gov/mission/apollo-16/'),
  historicMission('apollo-17', 'Apollo 17 · Final Apollo landing', '1972-12-07', [{ body: 'Moon', date: '1972-12-11' }], 'https://www.nasa.gov/mission/apollo-17/'),
  historicMission('artemis-2', 'Artemis II · Crewed lunar flyby', '2026-04-01', [{ body: 'Moon', date: '2026-04-06' }], 'https://www.nasa.gov/missions/artemis/artemis-2/'),
  historicMission('pioneer-10', 'Pioneer 10 · Jupiter', '1972-03-02', [{ body: 'Jupiter', date: '1973-12-03' }], 'https://science.nasa.gov/mission/pioneer-10/'),
  historicMission('pioneer-11', 'Pioneer 11 · Jupiter / Saturn', '1973-04-06', [{ body: 'Jupiter', date: '1974-12-03' }, { body: 'Saturn', date: '1979-09-01' }], 'https://science.nasa.gov/mission/pioneer-11/'),
  historicMission('voyager-1', 'Voyager 1 · Jupiter / Saturn', '1977-09-05', [{ body: 'Jupiter', date: '1979-03-05' }, { body: 'Saturn', date: '1980-11-12' }], 'https://science.nasa.gov/mission/voyager/voyager-1/'),
  historicMission('voyager-2', 'Voyager 2 · Grand Tour', '1977-08-20', [
    { body: 'Jupiter', date: '1979-07-09' }, { body: 'Saturn', date: '1981-08-26' },
    { body: 'Uranus', date: '1986-01-24' }, { body: 'Neptune', date: '1989-08-25' }
  ], 'https://science.nasa.gov/mission/voyager/voyager-2/'),
  historicMission('new-horizons', 'New Horizons · Jupiter / Pluto', '2006-01-19', [{ body: 'Jupiter', date: '2007-02-28' }, { body: 'Pluto', date: '2015-07-14' }], 'https://science.nasa.gov/mission/new-horizons/'),
  historicMission('viking-1', 'Viking 1 · Mars orbiter / lander', '1975-08-20', [{ body: 'Mars', date: '1976-06-19' }, { body: 'Mars', date: '1976-07-20' }], 'https://science.nasa.gov/mission/viking-1/'),
  historicMission('viking-2', 'Viking 2 · Mars orbiter / lander', '1975-09-09', [{ body: 'Mars', date: '1976-08-07' }, { body: 'Mars', date: '1976-09-03' }], 'https://science.nasa.gov/mission/viking-2/'),
  historicMission('mars-pathfinder', 'Mars Pathfinder · Sojourner', '1996-12-04', [{ body: 'Mars', date: '1997-07-04' }], 'https://science.nasa.gov/mission/mars-pathfinder/'),
  historicMission('spirit', 'Spirit rover · Mars', '2003-06-10', [{ body: 'Mars', date: '2004-01-04' }], 'https://science.nasa.gov/mission/mars-exploration-rovers-spirit-and-opportunity/'),
  historicMission('opportunity', 'Opportunity rover · Mars', '2003-07-07', [{ body: 'Mars', date: '2004-01-25' }], 'https://science.nasa.gov/mission/mars-exploration-rovers-spirit-and-opportunity/'),
  historicMission('mars-reconnaissance-orbiter', 'Mars Reconnaissance Orbiter', '2005-08-12', [{ body: 'Mars', date: '2006-03-10' }], 'https://science.nasa.gov/mission/mars-reconnaissance-orbiter/'),
  historicMission('curiosity', 'Curiosity rover · Mars', '2011-11-26', [{ body: 'Mars', date: '2012-08-06' }], 'https://science.nasa.gov/mission/msl-curiosity/'),
  historicMission('maven', 'MAVEN · Mars orbiter', '2013-11-18', [{ body: 'Mars', date: '2014-09-21' }], 'https://science.nasa.gov/mission/maven/'),
  historicMission('insight', 'InSight · Mars lander', '2018-05-05', [{ body: 'Mars', date: '2018-11-26' }], 'https://science.nasa.gov/mission/insight/'),
  historicMission('perseverance-ingenuity', 'Perseverance / Ingenuity · Mars', '2020-07-30', [{ body: 'Mars', date: '2021-02-18' }, { body: 'Mars', date: '2021-04-19' }], 'https://science.nasa.gov/mission/mars-2020-perseverance/'),
  historicMission('mariner-2', 'Mariner 2 · Venus', '1962-08-27', [{ body: 'Venus', date: '1962-12-14' }], 'https://science.nasa.gov/mission/mariner-2/'),
  historicMission('mariner-10', 'Mariner 10 · Venus / Mercury', '1973-11-03', [
    { body: 'Venus', date: '1974-02-05' }, { body: 'Mercury', date: '1974-03-29' },
    { body: 'Mercury', date: '1974-09-21' }, { body: 'Mercury', date: '1975-03-16' }
  ], 'https://science.nasa.gov/mission/mariner-10/'),
  historicMission('magellan', 'Magellan · Venus orbiter', '1989-05-04', [{ body: 'Venus', date: '1990-08-10' }], 'https://science.nasa.gov/mission/magellan/'),
  historicMission('messenger', 'MESSENGER · Mercury orbiter', '2004-08-03', [
    { body: 'Earth', date: '2005-08-02' }, { body: 'Venus', date: '2006-10-24' },
    { body: 'Venus', date: '2007-06-05' }, { body: 'Mercury', date: '2008-01-14' },
    { body: 'Mercury', date: '2008-10-06' }, { body: 'Mercury', date: '2009-09-29' },
    { body: 'Mercury', date: '2011-03-18' }
  ], 'https://science.nasa.gov/mission/messenger/'),
  historicMission('galileo', 'Galileo · Jupiter orbiter / probe', '1989-10-18', [
    { body: 'Venus', date: '1990-02-10' }, { body: 'Earth', date: '1990-12-08' },
    { body: 'Earth', date: '1992-12-08' }, { body: 'Jupiter', date: '1995-12-07' },
    { body: 'Jupiter', date: '2003-09-21' }
  ], 'https://science.nasa.gov/mission/galileo/'),
  historicMission('juno', 'Juno · Jupiter orbiter', '2011-08-05', [{ body: 'Earth', date: '2013-10-09' }, { body: 'Jupiter', date: '2016-07-04' }], 'https://science.nasa.gov/mission/juno/'),
  historicMission('cassini', 'Cassini-Huygens · Saturn', '1997-10-15', [
    { body: 'Venus', date: '1998-04-26' }, { body: 'Venus', date: '1999-06-24' },
    { body: 'Earth', date: '1999-08-18' }, { body: 'Jupiter', date: '2000-12-30' },
    { body: 'Saturn', date: '2004-07-01' }, { body: 'Saturn', date: '2017-09-15' }
  ], 'https://science.nasa.gov/mission/cassini/')
];

function vectorToScene(x, y, z) {
  return [x * SOLAR_SYSTEM_SCENE_SCALE, z * SOLAR_SYSTEM_SCENE_SCALE, -y * SOLAR_SYSTEM_SCENE_SCALE];
}

function stateToScene(state) {
  return {
    position: vectorToScene(state.x, state.y, state.z),
    velocity: vectorToScene(state.vx * ASTRONOMICAL_UNITS_PER_YEAR, state.vy * ASTRONOMICAL_UNITS_PER_YEAR, state.vz * ASTRONOMICAL_UNITS_PER_YEAR),
    positionAU: [state.x, state.y, state.z],
    velocityAUPerDay: [state.vx, state.vy, state.vz]
  };
}

function illustrativeRadius(radiusKm, id) {
  if (id === 'Sun') return 0.09;
  return Math.min(0.62, Math.max(0.035, radiusKm / EARTH_RADIUS_KM * 0.115));
}

function displayRadius(radiusKm, id, diameterMode, diameterExaggeration = 1) {
  if (diameterMode === 'actual') return radiusKm / KM_PER_AU * SOLAR_SYSTEM_SCENE_SCALE * diameterExaggeration;
  return illustrativeRadius(radiusKm, id) * diameterExaggeration;
}

function bodyRotation(body, date) {
  if (!Astronomy.Body[body.id]) return null;
  try {
    const axis = Astronomy.RotationAxis(Astronomy.Body[body.id], date);
    const rightAscension = axis.ra * Math.PI / 12;
    const declination = axis.dec * Math.PI / 180;
    const pole = [
      Math.cos(declination) * Math.cos(rightAscension),
      Math.cos(declination) * Math.sin(rightAscension),
      Math.sin(declination)
    ];
    const libration = body.id === 'Moon' ? Astronomy.Libration(date) : null;
    return {
      pole: vectorToScene(...pole),
      primeMeridianDeg: axis.spin,
      librationLongitudeDeg: libration?.elon ?? null,
      librationLatitudeDeg: libration?.elat ?? null
    };
  } catch {
    return null;
  }
}

function makeBody(definition, state, date, parentId = null, relativeState = null, diameterOptions = {}) {
  const converted = stateToScene(state);
  const satelliteGM = JPL_SATELLITE_GM_KM3_S2[definition.name];
  const massKg = satelliteGM == null ? definition.massKg : satelliteGM / STANDARD_G_KM3_PER_KG_S2;
  const massSource = satelliteGM != null
    ? `JPL ephemeris GM ${satelliteGM} km^3/s^2 converted to mass using G = ${STANDARD_G_KM3_PER_KG_S2} km^3 kg^-1 s^-2.`
    : parentId
      ? `Approximate catalog mass; JPL does not list a determined GM for ${definition.name}.`
      : 'Planetary mass from NASA planetary fact sheet; rendered and integrated using the solar-mass ratio.';
  const parentGM = PARENT_GM_KM3_S2[parentId];
  const moonOrbit = parentId && relativeState && parentGM
    ? createKeplerOrbit(
      [relativeState.x, relativeState.y, relativeState.z],
      [relativeState.vx, relativeState.vy, relativeState.vz],
      (parentGM + (satelliteGM ?? definition.massKg * STANDARD_G_KM3_PER_KG_S2)) * 86400 ** 2 / KM_PER_AU ** 3,
      date.getTime()
    )
    : null;
  const parentDefinition = CENTRAL_BODIES.find(({ id }) => id === parentId);
  const minimumSatelliteRadiusAU = parentId === 'Earth'
    ? 384400 / KM_PER_AU
    : Math.min(...OPTIONAL_MOONS.filter(({ parentId: moonParent }) => moonParent === parentId).map(({ orbitRadiusKm }) => orbitRadiusKm / KM_PER_AU));
  const displayPeriapsis = moonOrbit && diameterOptions.mode !== 'actual'
    ? displayRadius(parentDefinition.radiusKm, parentId, diameterOptions.mode, diameterOptions.exaggeration)
      * (1.6 + 0.28 * Math.log(Math.max(1, moonOrbit.semiMajorAxis / minimumSatelliteRadiusAU)))
    : null;
  const orbitDisplayScale = displayPeriapsis == null
    ? 1
    : displayPeriapsis / (moonOrbit.semiMajorAxis * (1 - moonOrbit.eccentricity) * SOLAR_SYSTEM_SCENE_SCALE);
  const relativeScenePosition = relativeState ? vectorToScene(relativeState.x, relativeState.y, relativeState.z) : null;
  const displayPosition = relativeScenePosition && moonOrbit
    ? converted.position.map((value, axis) => value + relativeScenePosition[axis] * (orbitDisplayScale - 1))
    : [...converted.position];
  return {
    name: definition.name,
    id: definition.id ?? definition.name,
    parentId,
    mass: massKg / SOLAR_MASS_KG,
    massKg,
    gmKm3PerS2: satelliteGM ?? null,
    massSource,
    massSourceUrl: satelliteGM == null ? (parentId ? SATELLITE_MASS_SOURCE : BODY_FACTS_SOURCE) : SATELLITE_MASS_SOURCE,
    charge: 0,
    position: converted.position,
    displayPosition,
    velocity: converted.velocity,
    positionAU: converted.positionAU,
    velocityAUPerDay: converted.velocityAUPerDay,
    radius: displayRadius(definition.radiusKm, definition.id, diameterOptions.mode ?? 'illustrative', diameterOptions.exaggeration ?? 1),
    actualRadius: definition.radiusKm / KM_PER_AU * SOLAR_SYSTEM_SCENE_SCALE,
    radiusKm: definition.radiusKm,
    color: definition.color ?? '#a9c4cf',
    rotationPeriodHours: definition.rotationPeriodHours ?? null,
    axialTiltDeg: definition.axialTiltDeg ?? null,
    rotation: bodyRotation(definition, date),
    moonOrbit: moonOrbit ? { ...moonOrbit, displayScale: orbitDisplayScale } : null,
    magneticField: definition.magneticField ?? 'No global magnetic-field value in this catalog.',
    chargeField: definition.chargeField ?? 'No fixed net electric charge is established.',
    fact: definition.fact ?? 'Orbital elements are an educational approximation.',
    dataQuality: definition.dataQuality ?? 'Astronomy Engine ephemeris / NASA body fact sheet.',
    source: BODY_FACTS_SOURCE,
    rotationSource: ROTATION_SOURCE
  };
}

function cross3(first, second) {
  return [
    first[1] * second[2] - first[2] * second[1],
    first[2] * second[0] - first[0] * second[2],
    first[0] * second[1] - first[1] * second[0]
  ];
}

function dot3(first, second) {
  return first.reduce((sum, value, index) => sum + value * second[index], 0);
}

function unit3(vector) {
  const magnitude = Math.hypot(...vector);
  return magnitude > 0 ? vector.map((value) => value / magnitude) : [1, 0, 0];
}

export function createKeplerOrbit(position, velocity, mu, epochMs) {
  const radius = Math.hypot(...position);
  const speedSquared = dot3(velocity, velocity);
  const angularMomentum = cross3(position, velocity);
  const angularMomentumMagnitude = Math.hypot(...angularMomentum);
  const eccentricityVector = cross3(velocity, angularMomentum).map((value, index) => value / mu - position[index] / radius);
  const eccentricity = Math.hypot(...eccentricityVector);
  const semiMajorAxis = 1 / (2 / radius - speedSquared / mu);
  if (!(radius > 0 && angularMomentumMagnitude > 0 && mu > 0 && semiMajorAxis > 0 && eccentricity < 1)) return null;
  const hHat = unit3(angularMomentum);
  const pHat = eccentricity > 1e-10 ? unit3(eccentricityVector) : unit3(position);
  const qHat = unit3(cross3(hHat, pHat));
  const cosTrueAnomaly = clamp(dot3(position, pHat) / radius, -1, 1);
  const sinTrueAnomaly = dot3(position, qHat) / radius;
  const initialEccentricAnomaly = Math.atan2(
    Math.sqrt(1 - eccentricity * eccentricity) * sinTrueAnomaly,
    eccentricity + cosTrueAnomaly
  );
  const meanAnomaly = initialEccentricAnomaly - eccentricity * Math.sin(initialEccentricAnomaly);
  return { semiMajorAxis, eccentricity, meanAnomaly, pHat, qHat, mu, epochMs };
}

function solveKeplerEquation(meanAnomaly, eccentricity) {
  const wrappedMean = Math.atan2(Math.sin(meanAnomaly), Math.cos(meanAnomaly));
  let eccentricAnomaly = eccentricity < 0.8 ? wrappedMean : Math.sign(wrappedMean || 1) * Math.PI;
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const residual = eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - wrappedMean;
    const slope = 1 - eccentricity * Math.cos(eccentricAnomaly);
    eccentricAnomaly -= residual / slope;
  }
  return eccentricAnomaly;
}

export function propagateKeplerOrbit(orbit, dateMs) {
  if (!orbit) return null;
  const { semiMajorAxis, eccentricity, meanAnomaly, pHat, qHat, mu, epochMs } = orbit;
  const meanMotion = Math.sqrt(mu / semiMajorAxis ** 3);
  const meanAtDate = meanAnomaly + meanMotion * ((dateMs - epochMs) / 86400000);
  const eccentricAnomaly = solveKeplerEquation(meanAtDate, eccentricity);
  const cosAnomaly = Math.cos(eccentricAnomaly);
  const sinAnomaly = Math.sin(eccentricAnomaly);
  const root = Math.sqrt(1 - eccentricity * eccentricity);
  const radiusFactor = 1 - eccentricity * cosAnomaly;
  const position = [0, 1, 2].map((axis) => semiMajorAxis * ((cosAnomaly - eccentricity) * pHat[axis] + root * sinAnomaly * qHat[axis]));
  const velocity = [0, 1, 2].map((axis) => (semiMajorAxis * meanMotion / radiusFactor) * (-sinAnomaly * pHat[axis] + root * cosAnomaly * qHat[axis]));
  return { x: position[0], y: position[1], z: position[2], vx: velocity[0], vy: velocity[1], vz: velocity[2] };
}

function approximateMoonRelativeState(moon, date) {
  const daysFromJ2000 = (date.getTime() - J2000_UTC_MS) / 86400000;
  const radiusAU = moon.orbitRadiusKm / KM_PER_AU;
  const inclination = moon.inclinationDeg * Math.PI / 180;
  const direction = Math.sign(moon.periodDays);
  const angularRate = direction * 2 * Math.PI / Math.abs(moon.periodDays);
  const angle = moon.phase + angularRate * daysFromJ2000;
  const relativePosition = [
    radiusAU * Math.cos(angle),
    radiusAU * Math.sin(angle) * Math.cos(inclination),
    radiusAU * Math.sin(angle) * Math.sin(inclination)
  ];
  const relativeVelocity = [
    -radiusAU * angularRate * Math.sin(angle),
    radiusAU * angularRate * Math.cos(angle) * Math.cos(inclination),
    radiusAU * angularRate * Math.cos(angle) * Math.sin(inclination)
  ];
  return { x: relativePosition[0], y: relativePosition[1], z: relativePosition[2], vx: relativeVelocity[0], vy: relativeVelocity[1], vz: relativeVelocity[2] };
}

function addRelativeState(parent, relative) {
  return {
    x: parent.x + relative.x, y: parent.y + relative.y, z: parent.z + relative.z,
    vx: parent.vx + relative.vx, vy: parent.vy + relative.vy, vz: parent.vz + relative.vz
  };
}

export function createSolarSystemBodies(date = new Date(), { includeMajorMoons = false, diameterMode = 'illustrative', diameterExaggeration = 1 } = {}) {
  const diameterOptions = { mode: diameterMode, exaggeration: diameterExaggeration };
  const definitions = [CENTRAL_BODIES[0], ...CENTRAL_BODIES.slice(1)];
  const ephemerisStates = new Map();
  const bodies = definitions.map((definition) => {
    const state = definition.id === 'Sun'
      ? { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }
      : Astronomy.HelioState(Astronomy.Body[definition.id], date);
    ephemerisStates.set(definition.id, state);
    return makeBody(definition, state, date, null, null, diameterOptions);
  });

  const earth = ephemerisStates.get('Earth');
  const geocentricMoon = Astronomy.GeoMoonState(date);
  const moonState = addRelativeState(earth, geocentricMoon);
  ephemerisStates.set('Moon', moonState);
  bodies.splice(4, 0, makeBody(MOON_FACTS, moonState, date, 'Earth', geocentricMoon, diameterOptions));

  if (!includeMajorMoons) return bodies;

  const jupiterMoons = Astronomy.JupiterMoons(date);
  const jupiter = ephemerisStates.get('Jupiter');
  const jupiterStates = {
    Io: jupiterMoons.io,
    Europa: jupiterMoons.europa,
    Ganymede: jupiterMoons.ganymede,
    Callisto: jupiterMoons.callisto
  };
  for (const moon of OPTIONAL_MOONS) {
    const parent = ephemerisStates.get(moon.parentId);
    const relativeState = moon.parentId === 'Jupiter' && jupiterStates[moon.name]
      ? jupiterStates[moon.name]
      : approximateMoonRelativeState(moon, date);
    const state = addRelativeState(parent, relativeState);
    bodies.push(makeBody({
      ...moon,
      dataQuality: moon.parentId === 'Jupiter' && jupiterStates[moon.name]
        ? 'Astronomy Engine major-moon state; moon catalog facts from NASA.'
        : 'Simplified circular satellite orbit from catalog radius, period, and inclination; not a full ephemeris.'
    }, state, date, moon.parentId, relativeState, diameterOptions));
  }
  return bodies;
}

export function createSolarSystemOrbitPaths(date = new Date(), segments = 180) {
  return CENTRAL_BODIES.slice(1).map((body) => {
    const periodDays = Astronomy.PlanetOrbitalPeriod(Astronomy.Body[body.id]);
    const positions = Array.from({ length: segments }, (_, index) => {
      const offsetDays = (index / segments - 0.5) * periodDays;
      const sampleDate = new Date(date.getTime() + offsetDays * 86400000);
      const vector = Astronomy.HelioVector(Astronomy.Body[body.id], sampleDate);
      return vectorToScene(vector.x, vector.y, vector.z);
    });
    positions.push([...positions[0]]);
    return { id: body.id, color: body.color, positions };
  });
}

export function createHistoricMissionTrajectory(missionId) {
  const mission = HISTORIC_MISSIONS.find(({ id }) => id === missionId);
  if (!mission) return null;
  const waypoints = [
    { body: 'Earth', date: mission.launchDate },
    ...mission.events
  ].map((event) => {
    const state = Astronomy.HelioState(Astronomy.Body[event.body], new Date(`${event.date}T00:00:00Z`));
    return { ...event, position: vectorToScene(state.x, state.y, state.z) };
  });
  return { ...mission, waypoints };
}

export function createSpacecraftLaunchBody(bodies, { originId = 'Earth', speedKmPerSecond = 12, headingDeg = 0, inclinationDeg = 0 } = {}) {
  const origin = bodies.find(({ id }) => id === originId);
  if (!origin) return null;
  const [x, , z] = origin.position;
  const radius = Math.hypot(x, z) || 1;
  const tangent = [-z / radius, 0, x / radius];
  const normal = [0, 1, 0];
  const heading = headingDeg * Math.PI / 180;
  const inclination = inclinationDeg * Math.PI / 180;
  const speedScale = speedKmPerSecond / KM_PER_AU_PER_YEAR * SOLAR_SYSTEM_SCENE_SCALE;
  const launchVector = [0, 1, 2].map((axis) => speedScale * (Math.cos(heading) * Math.cos(inclination) * tangent[axis] + Math.sin(inclination) * normal[axis]));
  return {
    name: 'Spacecraft', id: 'spacecraft', parentId: originId, mass: 1e-12, charge: 0,
    position: [...origin.position], velocity: origin.velocity.map((value, axis) => value + launchVector[axis]),
    radius: 0.055, color: '#fff1a7', rotationPeriodHours: null, axialTiltDeg: null, rotation: null,
    magneticField: 'Not applicable to this test particle.', chargeField: 'Charge is set to zero for this gravitational path model.',
    fact: `${speedKmPerSecond.toFixed(1)} km/s launch impulse relative to ${origin.name}.`, source: BODY_FACTS_SOURCE
  };
}

export function getSolarSystemBodyFacts(bodies, bodyId) {
  return bodies.find(({ id }) => id === bodyId) ?? bodies[0] ?? null;
}

export const SOLAR_SYSTEM_SOURCE_URLS = Object.freeze({ facts: BODY_FACTS_SOURCE, ephemeris: ROTATION_SOURCE });
export const SOLAR_SYSTEM_DATASET_CITATIONS = Object.freeze([
  {
    id: 'astronomy-engine',
    label: 'Astronomy Engine',
    source: ROTATION_SOURCE,
    description: 'Sun and planet state vectors, the Earth-Moon state, four Galilean moon states, IAU rotation axes and prime-meridian angles, and lunar libration.',
    limitations: 'Approximate ephemeris engine, not a spacecraft-navigation ephemeris; sub-arcminute typical accuracy. Satellites beyond the four Galilean moons use the explicitly simplified entries below.'
  },
  {
    id: 'planet-facts',
    label: 'NASA / NSSDC planetary fact sheets',
    source: BODY_FACTS_SOURCE,
    description: 'Planet masses, radii, spin periods, axial tilts, magnetic-field context, and descriptive facts.',
    limitations: 'Rounded reference facts; electric net charges are not assumed or inferred.'
  },
  {
    id: 'satellite-gm',
    label: 'JPL satellite physical parameters',
    source: SATELLITE_MASS_SOURCE,
    description: 'Satellite ephemeris GM values and mean radii; GM is converted to mass using the stated standard gravitational constant.',
    limitations: 'JPL marks some satellite GM values as undetermined; those catalog masses are labeled estimates, not observations.'
  },
  {
    id: 'satellite-elements',
    label: 'JPL planetary satellite mean elements',
    source: SATELLITE_ELEMENTS_SOURCE,
    description: 'Reference for approximate satellite semimajor axes, periods, eccentricities, inclinations, and orbital orientations.',
    limitations: 'JPL explicitly says mean elements describe general orbit shape/orientation and are not intended for ephemeris computation. Except for Earth’s Moon and Astronomy Engine’s four Galilean states, this catalog propagates rounded circular, planar approximations.'
  },
  {
    id: 'iau-rotation',
    label: 'IAU cartographic and rotation models',
    source: 'https://doi.org/10.1007/s10569-017-9805-5',
    description: 'Reference convention for body poles, axial orientation, and prime meridians used by Astronomy Engine.',
    limitations: 'Some satellite rotational solutions are low precision or valid only near spacecraft flyby epochs.'
  },
  {
    id: 'gravitational-constant',
    label: 'NIST fundamental physical constants',
    source: 'https://physics.nist.gov/cuu/Constants/',
    description: 'Standard gravitational constant used to convert JPL satellite GM to mass.',
    limitations: 'A rounded CODATA value is used in this educational simulator.'
  }
]);
export const OPTIONAL_MOON_COUNTS = Object.freeze(Object.fromEntries(
  [...new Set(OPTIONAL_MOONS.map(({ parentId }) => parentId))].map((parentId) => [parentId, OPTIONAL_MOONS.filter((moon) => moon.parentId === parentId).length])
));
export const MAX_OPTIONAL_MOONS_PER_PLANET = Math.max(...Object.values(OPTIONAL_MOON_COUNTS));
export const SOLAR_SYSTEM_GRAVITATIONAL_CONSTANT = 4 * Math.PI ** 2 * SOLAR_SYSTEM_SCENE_SCALE ** 3;
export const SOLAR_SYSTEM_SOFTENING = 0.001;
export const SOLAR_SYSTEM_MASS_SCALE = SOLAR_MASS_KG;
export const SOLAR_SYSTEM_EPOCH_DAYS = DAYS_PER_MILLENNIUM;