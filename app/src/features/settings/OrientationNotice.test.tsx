/* Tests: OrientationNotice — Fahrplan 43 E7. Ein kurzer, ruhiger Satz bei den
 * Zielen und Ernährungszielen: Werte sind Orientierung, kein Ersatz für
 * Fachberatung. Kein Warnton, keine Diagnose. */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OrientationNotice, ORIENTATION_NOTICE_TEXT } from "./OrientationNotice";

describe("OrientationNotice", () => {
  it("sagt: Orientierung, kein Ersatz für Fachberatung", () => {
    render(<OrientationNotice />);
    expect(screen.getByText(ORIENTATION_NOTICE_TEXT)).toBeTruthy();
    expect(ORIENTATION_NOTICE_TEXT).toMatch(/Orientierung/);
    expect(ORIENTATION_NOTICE_TEXT).toMatch(/kein Ersatz für Fachberatung/);
  });

  it("ist ein kurzer Satz ohne Warnton, ohne Diagnose, ohne Symbole", () => {
    expect(ORIENTATION_NOTICE_TEXT.length).toBeLessThan(90);
    expect(ORIENTATION_NOTICE_TEXT).not.toMatch(/!|⚠|Achtung|Warnung|Vorsicht|Gefahr|Diagnose|krank|Risiko/i);
  });

  it("ist ein ruhiger Absatz: kein Alarm, keine Bedienelemente", () => {
    const { container } = render(<OrientationNotice />);
    expect(container.querySelector("[role=alert]")).toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
