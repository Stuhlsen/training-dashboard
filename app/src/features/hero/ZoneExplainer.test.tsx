/* Tests: Zonen-Erklärer (ZoneExplainer, PowerScale, HrZonesTile) — Fahrplan 24, E2.
   Echter Datenweg: ZONE_EXPLANATIONS, buildPowerScale, buildCyclingHrZones. */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  EASY_ZONE_ID_BY_SPORT,
  EASY_ZONE_SHARE_SENTENCE,
  HR_RICHTWERT_HINT,
  ZONE_EXPLANATIONS,
} from "../../core/zone-explanations.js";
import { ZoneExplainer } from "./ZoneExplainer";
import { PowerScale } from "./PowerScale";
import { HrZonesTile } from "./HrZonesTile";
import { buildPowerScale } from "./hero-view-model";
import { buildCyclingHrZones, powerExplainerZones } from "./zone-explainer-view-model";

afterEach(cleanup);

const SHARE = EASY_ZONE_SHARE_SENTENCE.text;
const EASY = EASY_ZONE_ID_BY_SPORT.cycling;
const POWER_TEXTS = ZONE_EXPLANATIONS.cycling.zonen;
const HR_TEXTS = ZONE_EXPLANATIONS.cycling.hf;

function Harness({ degraded = false, hr = false }: { degraded?: boolean; hr?: boolean }) {
  const [selectedId, setSelectedId] = useState<string>(EASY);
  const zones = hr
    ? buildCyclingHrZones(degraded ? null : 190).explainerZones
    : powerExplainerZones(buildPowerScale(250, 260, 260).segments);
  return (
    <ZoneExplainer
      zones={zones}
      explanations={hr ? HR_TEXTS : POWER_TEXTS}
      selectedId={selectedId}
      onSelect={setSelectedId}
      degraded={degraded}
      easyZoneId={EASY}
      shareSentence={EASY_ZONE_SHARE_SENTENCE}
      hints={hr ? [HR_RICHTWERT_HINT] : undefined}
    />
  );
}

/** Der Block einer Zone im Beschreibungsfeld (alle liegen übereinander). */
function blockOf(el: HTMLElement): HTMLElement {
  return el.closest<HTMLElement>("div[style*='grid-area']")!;
}

/** Texte der aktuell sichtbaren (nicht visibility:hidden) Beschreibung. */
function visibleBlocks(): HTMLElement[] {
  return screen.getAllByText(/^Gefühl/).map(blockOf).filter((b) => b.style.visibility === "visible");
}

describe("ZoneExplainer — Auswahl", () => {
  it("wählt Z2 (Easy) vor und zeigt dazu den 80-%-Satz", () => {
    render(<Harness />);
    const pressed = screen.getAllByRole("button", { pressed: true });
    expect(pressed).toHaveLength(1);
    expect(pressed[0].textContent).toContain("Z2");
    const blocks = visibleBlocks();
    expect(blocks).toHaveLength(1);
    expect(blocks[0].textContent).toContain(POWER_TEXTS.find((t) => t.id === EASY)!.gefuehl);
    expect(blocks[0].textContent).toContain(SHARE);
  });

  it("wechselt per Klick die Zone; der 80-%-Satz steht nur im Easy-Block", () => {
    render(<Harness />);
    const z4 = screen.getByRole("button", { name: /Z4/ });
    fireEvent.click(z4);
    expect(z4.getAttribute("aria-pressed")).toBe("true");
    const blocks = visibleBlocks();
    expect(blocks).toHaveLength(1);
    expect(blocks[0].textContent).toContain(POWER_TEXTS.find((t) => t.id === "z4")!.gefuehl);
    expect(blocks[0].textContent).not.toContain(SHARE);
    expect(screen.getAllByText(SHARE)).toHaveLength(1);
    expect(blockOf(screen.getByText(SHARE)).style.visibility).toBe("hidden");
  });

  it("bedient sich per Tastatur: Pfeile, Home/End wechseln rund um; Tab erreicht nur die gewählte Zone", () => {
    render(<Harness />);
    const group = screen.getByRole("group", { name: /Zone auswählen/ });
    const buttons = within(group).getAllByRole("button");
    expect(buttons.filter((b) => b.tabIndex === 0)).toHaveLength(1);
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(buttons[2].getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(group, { key: "End" });
    expect(buttons[buttons.length - 1].getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(buttons[0].getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(group, { key: "ArrowLeft" });
    expect(buttons[buttons.length - 1].getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(group, { key: "Home" });
    expect(buttons[0].getAttribute("aria-pressed")).toBe("true");
  });
});

describe("ZoneExplainer — Quellen", () => {
  it("bietet 'ⓘ Quelle' mit klickbarem Link und Herkunftsvermerk", () => {
    render(<Harness />);
    expect(screen.getByText("ⓘ Quelle")).toBeTruthy();
    const link = screen.getAllByRole("link").find((a) => a.getAttribute("href")?.startsWith("https://"));
    expect(link).toBeTruthy();
    expect(link!.getAttribute("target")).toBe("_blank");
    expect(link!.getAttribute("rel")).toContain("noopener");
    expect(screen.getAllByText(/Originalquelle gelesen/).length).toBeGreaterThan(0);
  });

  it("kennzeichnet die übernommenen HF-Grenzen ehrlich als nicht belegt und ohne Link", () => {
    render(<Harness hr />);
    expect(screen.getAllByText(/übernommene Wahl, nicht belegt/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Prozentwerte der HF-Zonen/).closest("a")).toBeNull();
  });
});

describe("ZoneExplainer — degradiert", () => {
  it("zeigt keine Zahlen mehr, die Beschreibungen bleiben lesbar", () => {
    const { container } = render(<Harness hr degraded />);
    expect(container.textContent).not.toMatch(/\d+\s?bpm/);
    const blocks = visibleBlocks();
    expect(blocks[0].textContent).toContain(HR_TEXTS.find((t) => t.id === EASY)!.gefuehl);
    expect(screen.getByText(HR_RICHTWERT_HINT.text)).toBeTruthy();
  });
});

describe("PowerScale (Rad-Watt-Kachel)", () => {
  function renderPower() {
    const scale = buildPowerScale(250, 260, 260);
    render(
      <PowerScale powerScale={scale} whatIf={{ min: 100, max: 430 }} whatIfFtp={260} onWhatIfChange={() => {}} eftpVal={255} />,
    );
    return scale;
  }

  it("zeigt den Erklärer mit Z2 vorgewählt, der What-if-Slider bleibt", () => {
    renderPower();
    expect(screen.getByRole("button", { name: /Z2/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("slider")).toBeTruthy();
  });

  it("wählt per Klick auf den Zonenbalken die Zone", () => {
    const scale = renderPower();
    const z4Color = scale.segments.find((s) => s.id === "z4")!.color;
    const segment = document.querySelector<HTMLElement>(`div[style*="cursor: pointer"][style*="${z4Color}"]`)!;
    fireEvent.click(segment);
    expect(screen.getByRole("button", { name: /Z4/ }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("HrZonesTile (Rad-HF-Kachel)", () => {
  it("mit HFmax: bpm-Zahlen, Richtwert-Hinweis und 'HFmax geschätzt'", () => {
    const { container } = render(<HrZonesTile sport="ride" vm={buildCyclingHrZones(190)} hrMaxEstimated />);
    expect(container.textContent).toMatch(/\d+ bpm/);
    expect(screen.getByText(HR_RICHTWERT_HINT.text)).toBeTruthy();
    expect(screen.getByText(/HFmax geschätzt/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Z2/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("vermerkt einen Profilwert nicht fälschlich als geschätzt", () => {
    render(<HrZonesTile sport="ride" vm={buildCyclingHrZones(190)} hrMaxEstimated={false} />);
    expect(screen.queryByText(/HFmax geschätzt/)).toBeNull();
    expect(screen.getByText(/HFmax hinterlegt/)).toBeTruthy();
  });

  it("ohne HFmax: degradierter Balken ohne Zahlen, Texte und Hinweis bleiben", () => {
    const { container } = render(<HrZonesTile sport="ride" vm={buildCyclingHrZones(null)} hrMaxEstimated={false} />);
    expect(container.textContent).not.toMatch(/\d+\s?bpm/);
    expect(screen.getByText(/HFmax noch nicht bekannt/)).toBeTruthy();
    expect(screen.getByText(HR_RICHTWERT_HINT.text)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Z4/ }));
    expect(screen.getByRole("button", { name: /Z4/ }).getAttribute("aria-pressed")).toBe("true");
  });
});
