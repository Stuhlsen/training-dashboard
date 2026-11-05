/* Tests: LoadWarningNote — schließbarer Hinweis je Woche (Fahrplan 43, E6). */

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { LoadWarningNote } from "./LoadWarningNote";
import { loadWarningStorageKey } from "./nutrition-goal-model";

const WARNING = { text: "Diese Woche sind ein Defizit und viel Training zusammen geplant.", weekKey: "2026-10-12" };

describe("LoadWarningNote", () => {
  beforeEach(() => localStorage.clear());

  it("zeigt den Hinweis als ruhige Notiz mit Schließen-Knopf", () => {
    render(<LoadWarningNote warning={WARNING} userId="u1" />);
    expect(screen.getByRole("note").textContent).toContain("Defizit");
    expect(screen.getByRole("button", { name: "Schließen" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("verschwindet nach „Schließen“ und merkt sich das für diese Woche", () => {
    const { container } = render(<LoadWarningNote warning={WARNING} userId="u1" />);
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    expect(container.childNodes.length).toBe(0);
    expect(localStorage.getItem(loadWarningStorageKey("u1", "2026-10-12"))).toBe("1");
  });

  it("bleibt weg, wenn die Woche schon geschlossen wurde, kommt aber in der nächsten Woche wieder", () => {
    localStorage.setItem(loadWarningStorageKey("u1", "2026-10-12"), "1");
    const first = render(<LoadWarningNote warning={WARNING} userId="u1" />);
    expect(first.container.childNodes.length).toBe(0);
    first.unmount();
    render(<LoadWarningNote warning={{ ...WARNING, weekKey: "2026-10-19" }} userId="u1" />);
    expect(screen.getByRole("note")).toBeTruthy();
  });

  it("trennt die Nutzer", () => {
    localStorage.setItem(loadWarningStorageKey("u1", "2026-10-12"), "1");
    render(<LoadWarningNote warning={WARNING} userId="u2" />);
    expect(screen.getByRole("note")).toBeTruthy();
  });
});
