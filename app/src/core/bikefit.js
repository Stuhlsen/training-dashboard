/* ============================================================
   CORE/BIKEFIT.JS — Reine Bike-Fitting-Rechenlogik (kein DOM, kein I/O)
   (Fahrplan 16 — B1, B2, B5, B8, B9, V3)

   Berechnet Gelenkwinkel aus manuell gesetzten Bildpunkten, vergleicht sie
   mit sportartspezifischen Zielbereichen (Holmes-Methode u. a.) und
   erzeugt strukturierte Richtungsempfehlungen (ohne mm in v1, B5).

   Winkelkonventionen:
   - Knie (Knee Extension am BDC): Winkel Trochanter-Knie-Knöchel (Scheitel Knie).
     Gestreckt = 180°. Holmes-Methode empfiehlt 140°–150° (statisch).
   - Hüfte (Hip Angle): Winkel Schulter-Hüfte-Knie (Scheitel Trochanter/Hüfte).
   - Rumpf (Torso Angle): Winkel der Linie Hüfte->Schulter zur Horizontalen (0° = flach, 90° = aufrecht).
   - Ellenbogen (Elbow Angle): Winkel Schulter-Ellenbogen-Handgelenk (Scheitel Ellenbogen).
   ============================================================ */

/**
 * Wissenschaftlich und praxisnah etablierte Zielbereiche nach Radtyp und Fahrziel.
 * Quellen:
 * - Holmes et al. (1994): "Lower extremity cycling mechanics and saddle height" (140°–150° Knie-Extension am BDC)
 * - Pruitt (2006): "Andy Pruitt's Complete Medical Guide for Cyclists"
 * - Bisi et al. / BiciScience biomechanical corridors
 * - Silberman et al. (2005): "Bicycling injuries: diagnosis, treatment, and prevention"
 */
export const BIKEFIT_TARGET_RANGES = {
  road: {
    comfort: {
      kneeAngle: { min: 140, max: 148, name: "Kniewinkel (BDC)" },
      hipAngle: { min: 60, max: 72, name: "Hüftwinkel" },
      torsoAngle: { min: 45, max: 55, name: "Rumpfwinkel" },
      elbowAngle: { min: 150, max: 165, name: "Ellenbogenwinkel" },
    },
    balanced: {
      kneeAngle: { min: 142, max: 150, name: "Kniewinkel (BDC)" },
      hipAngle: { min: 55, max: 68, name: "Hüftwinkel" },
      torsoAngle: { min: 40, max: 48, name: "Rumpfwinkel" },
      elbowAngle: { min: 150, max: 165, name: "Ellenbogenwinkel" },
    },
    aero: {
      kneeAngle: { min: 143, max: 150, name: "Kniewinkel (BDC)" },
      hipAngle: { min: 50, max: 62, name: "Hüftwinkel" },
      torsoAngle: { min: 32, max: 42, name: "Rumpfwinkel" },
      elbowAngle: { min: 145, max: 160, name: "Ellenbogenwinkel" },
    },
  },
  gravel: {
    comfort: {
      kneeAngle: { min: 140, max: 147, name: "Kniewinkel (BDC)" },
      hipAngle: { min: 62, max: 75, name: "Hüftwinkel" },
      torsoAngle: { min: 45, max: 55, name: "Rumpfwinkel" },
      elbowAngle: { min: 150, max: 165, name: "Ellenbogenwinkel" },
    },
    balanced: {
      kneeAngle: { min: 141, max: 149, name: "Kniewinkel (BDC)" },
      hipAngle: { min: 58, max: 70, name: "Hüftwinkel" },
      torsoAngle: { min: 42, max: 50, name: "Rumpfwinkel" },
      elbowAngle: { min: 150, max: 165, name: "Ellenbogenwinkel" },
    },
    aero: {
      kneeAngle: { min: 142, max: 150, name: "Kniewinkel (BDC)" },
      hipAngle: { min: 52, max: 64, name: "Hüftwinkel" },
      torsoAngle: { min: 35, max: 45, name: "Rumpfwinkel" },
      elbowAngle: { min: 145, max: 160, name: "Ellenbogenwinkel" },
    },
  },
  tt: {
    comfort: {
      kneeAngle: { min: 142, max: 150, name: "Kniewinkel (BDC)" },
      hipAngle: { min: 50, max: 60, name: "Hüftwinkel" },
      torsoAngle: { min: 20, max: 30, name: "Rumpfwinkel" },
      elbowAngle: { min: 85, max: 105, name: "Ellenbogenwinkel (Aero)" },
    },
    balanced: {
      kneeAngle: { min: 143, max: 151, name: "Kniewinkel (BDC)" },
      hipAngle: { min: 45, max: 55, name: "Hüftwinkel" },
      torsoAngle: { min: 15, max: 25, name: "Rumpfwinkel" },
      elbowAngle: { min: 85, max: 100, name: "Ellenbogenwinkel (Aero)" },
    },
    aero: {
      kneeAngle: { min: 144, max: 152, name: "Kniewinkel (BDC)" },
      hipAngle: { min: 40, max: 52, name: "Hüftwinkel" },
      torsoAngle: { min: 10, max: 20, name: "Rumpfwinkel" },
      elbowAngle: { min: 85, max: 95, name: "Ellenbogenwinkel (Aero)" },
    },
  },
  mtb: {
    comfort: {
      kneeAngle: { min: 138, max: 146, name: "Kniewinkel (BDC)" },
      hipAngle: { min: 65, max: 78, name: "Hüftwinkel" },
      torsoAngle: { min: 50, max: 62, name: "Rumpfwinkel" },
      elbowAngle: { min: 145, max: 160, name: "Ellenbogenwinkel" },
    },
    balanced: {
      kneeAngle: { min: 140, max: 148, name: "Kniewinkel (BDC)" },
      hipAngle: { min: 60, max: 74, name: "Hüftwinkel" },
      torsoAngle: { min: 45, max: 55, name: "Rumpfwinkel" },
      elbowAngle: { min: 145, max: 160, name: "Ellenbogenwinkel" },
    },
    aero: {
      kneeAngle: { min: 140, max: 148, name: "Kniewinkel (BDC)" },
      hipAngle: { min: 55, max: 68, name: "Hüftwinkel" },
      torsoAngle: { min: 40, max: 50, name: "Rumpfwinkel" },
      elbowAngle: { min: 140, max: 155, name: "Ellenbogenwinkel" },
    },
  },
};

/**
 * Berechnet den Innenwinkel in Grad am Scheitelpunkt B zwischen Vektor BA und BC.
 * @param {{x: number, y: number}} a
 * @param {{x: number, y: number}} b Scheitelpunkt
 * @param {{x: number, y: number}} c
 * @returns {number|null} Winkel in Grad (0°–180°) auf 1 Dezimalstelle gerundet oder null bei unvollständigen Punkten
 */
export function calculateAngle(a, b, c) {
  if (!a || !b || !c) return null;
  if (
    typeof a.x !== "number" ||
    typeof a.y !== "number" ||
    typeof b.x !== "number" ||
    typeof b.y !== "number" ||
    typeof c.x !== "number" ||
    typeof c.y !== "number"
  ) {
    return null;
  }

  const vax = a.x - b.x;
  const vay = a.y - b.y;
  const vcx = c.x - b.x;
  const vcy = c.y - b.y;

  const magA = Math.sqrt(vax * vax + vay * vay);
  const magC = Math.sqrt(vcx * vcx + vcy * vcy);

  if (magA === 0 || magC === 0) return null;

  const dot = vax * vcx + vay * vcy;
  const cosTheta = Math.max(-1, Math.min(1, dot / (magA * magC)));
  const angleRad = Math.acos(cosTheta);
  return Math.round(((angleRad * 180) / Math.PI) * 10) / 10;
}

/**
 * Berechnet den Neigungswinkel einer Strecke (z. B. Hüfte -> Schulter) zur Horizontalen in Grad.
 * 0° = waagerecht, 90° = senkrecht.
 * @param {{x: number, y: number}} hip
 * @param {{x: number, y: number}} shoulder
 * @returns {number|null} Winkel in Grad (0°–90°) auf 1 Dezimalstelle gerundet
 */
export function calculateTorsoAngle(hip, shoulder) {
  if (!hip || !shoulder) return null;
  if (
    typeof hip.x !== "number" ||
    typeof hip.y !== "number" ||
    typeof shoulder.x !== "number" ||
    typeof shoulder.y !== "number"
  ) {
    return null;
  }

  const dx = Math.abs(shoulder.x - hip.x);
  const dy = Math.abs(hip.y - shoulder.y); // Y verläuft im Bild nach unten

  if (dx === 0 && dy === 0) return null;

  const angleRad = Math.atan2(dy, dx);
  return Math.round(((angleRad * 180) / Math.PI) * 10) / 10;
}

/**
 * Berechnet alle 4 Gelenkwinkel aus den beiden Fotos einer Fitting-Iteration (B8).
 *
 * Foto 1 ("legs" / Bein gestreckt am BDC):
 * - hip (Trochanter major)
 * - knee (Lateraler Femurkondylus)
 * - ankle (Lateraler Malleolus)
 *
 * Foto 2 ("riding" / Fahrhaltung):
 * - shoulder (Akromion)
 * - elbow (Lateraler Epikondylus)
 * - wrist (Handgelenk)
 * - hip (Trochanter major)
 * - knee (Knie)
 *
 * @param {{
 *   legs?: { hip?: {x: number, y: number}, knee?: {x: number, y: number}, ankle?: {x: number, y: number} },
 *   riding?: { shoulder?: {x: number, y: number}, elbow?: {x: number, y: number}, wrist?: {x: number, y: number}, hip?: {x: number, y: number}, knee?: {x: number, y: number} }
 * }} points
 * @returns {{
 *   kneeAngle: number|null,
 *   hipAngle: number|null,
 *   torsoAngle: number|null,
 *   elbowAngle: number|null
 * }}
 */
export function computeJointAngles(points) {
  if (!points || typeof points !== "object") {
    return { kneeAngle: null, hipAngle: null, torsoAngle: null, elbowAngle: null };
  }

  const legs = points.legs || {};
  const riding = points.riding || {};

  // 1. Kniewinkel am BDC (aus Beinfoto)
  const kneeAngle = calculateAngle(legs.hip, legs.knee, legs.ankle);

  // 2. Hüftwinkel in Fahrhaltung (Schulter - Hüfte - Knie)
  // Falls im Riding-Foto gesetzt, sonst Fallback mit Beinfoto-Hüfte/Knie falls Schulter da ist
  const hipPoint = riding.hip || legs.hip;
  const kneePoint = riding.knee || legs.knee;
  const hipAngle = calculateAngle(riding.shoulder, hipPoint, kneePoint);

  // 3. Rumpfwinkel zur Horizontalen
  const torsoAngle = calculateTorsoAngle(hipPoint, riding.shoulder);

  // 4. Ellenbogenwinkel in Fahrhaltung (Schulter - Ellenbogen - Handgelenk)
  const elbowAngle = calculateAngle(riding.shoulder, riding.elbow, riding.wrist);

  return {
    kneeAngle,
    hipAngle,
    torsoAngle,
    elbowAngle,
  };
}

/**
 * Bestimmt Handlungsanweisung / Text für die Anpassung am Rad (ohne mm in v1, B5).
 * @param {string} joint
 * @param {'higher'|'lower'|'ok'} direction
 * @param {'slight'|'moderate'|'strong'} strength
 * @returns {string}
 */
export function getAdjustmentAdvice(joint, direction, strength) {
  if (direction === "ok") {
    return "Optimal im Zielbereich";
  }

  const strengthText =
    strength === "strong" ? "deutlich" : strength === "moderate" ? "moderat" : "leicht";

  switch (joint) {
    case "kneeAngle":
      return direction === "higher"
        ? `Sattel ${strengthText} höher stellen`
        : `Sattel ${strengthText} tiefer stellen`;
    case "hipAngle":
      return direction === "higher"
        ? `Lenker ${strengthText} höher oder Sattelüberhöhung reduzieren`
        : `Sitzposition ${strengthText} kompakter / sportlicher ausrichten`;
    case "torsoAngle":
      return direction === "higher"
        ? `Aufrechtere Haltung: Vorbau ${strengthText} kürzer/höher wählen`
        : `Aerodynamischere Haltung: Vorbau ${strengthText} länger/tiefer wählen`;
    case "elbowAngle":
      return direction === "higher"
        ? `Arme zu stark gebeugt: Cockpit ${strengthText} weiter nach vorne`
        : `Arme zu gestreckt (Überstreckung): Cockpit ${strengthText} näher heranholen`;
    default:
      return direction === "higher"
        ? `Winkel ${strengthText} vergrößern`
        : `Winkel ${strengthText} verringern`;
  }
}

/**
 * Vergleicht berechnete Winkel mit den Zielbereichen und gibt Richtung + Stärke zurück (B5, V3).
 *
 * @param {{
 *   kneeAngle?: number|null,
 *   hipAngle?: number|null,
 *   torsoAngle?: number|null,
 *   elbowAngle?: number|null
 * }} angles
 * @param {string} [bikeType='road'] 'road' | 'gravel' | 'tt' | 'mtb'
 * @param {string} [goal='balanced'] 'comfort' | 'balanced' | 'aero'
 * @returns {Record<string, {
 *   name: string,
 *   value: number|null,
 *   targetMin: number,
 *   targetMax: number,
 *   direction: 'higher'|'lower'|'ok'|'unknown',
 *   strength: 'slight'|'moderate'|'strong'|'ok',
 *   diff: number|null,
 *   advice: string
 * }>}
 */
export function compareToTargets(angles, bikeType = "road", goal = "balanced") {
  const bikeTypeRanges = BIKEFIT_TARGET_RANGES[bikeType] || BIKEFIT_TARGET_RANGES.road;
  const targetConfig = bikeTypeRanges[goal] || bikeTypeRanges.balanced;

  const result = {};

  const jointKeys = ["kneeAngle", "hipAngle", "torsoAngle", "elbowAngle"];

  for (const key of jointKeys) {
    const target = targetConfig[key];
    const value = angles && typeof angles[key] === "number" ? angles[key] : null;

    if (!target) continue;

    if (value == null) {
      result[key] = {
        name: target.name || key,
        value: null,
        targetMin: target.min,
        targetMax: target.max,
        direction: "unknown",
        strength: "ok",
        diff: null,
        advice: "Punkte noch nicht vollständig markiert",
      };
      continue;
    }

    let direction = "ok";
    let strength = "ok";
    let diff = 0;

    if (value < target.min) {
      direction = "higher"; // Winkel muss steigen
      diff = Math.round((target.min - value) * 10) / 10;
      if (diff <= 3) strength = "slight";
      else if (diff < 7) strength = "moderate";
      else strength = "strong";
    } else if (value > target.max) {
      direction = "lower"; // Winkel muss sinken
      diff = Math.round((value - target.max) * 10) / 10;
      if (diff <= 3) strength = "slight";
      else if (diff < 7) strength = "moderate";
      else strength = "strong";
    }

    const advice = getAdjustmentAdvice(key, direction, strength);

    result[key] = {
      name: target.name,
      value,
      targetMin: target.min,
      targetMax: target.max,
      direction,
      strength,
      diff: direction === "ok" ? 0 : diff,
      advice,
    };
  }

  return result;
}