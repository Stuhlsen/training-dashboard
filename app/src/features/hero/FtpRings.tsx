import { GlassCard } from "../../components/GlassCard";
import { ProgressRing } from "../../components/ProgressRing";
import { fmtDate } from "../../core/format.js";
import type { HeroRing, HeroViewModel } from "./hero-view-model";

function MilestoneRow({ label, value, date, accent }: { label: string; value: number; date?: string; accent?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".86rem" }}>
      <span style={{ color: accent ? "var(--accent-2)" : "var(--ink-3)" }}>
        {label}
        {date ? ` · ${fmtDate(date)}` : ""}
      </span>
      <span style={{ color: accent ? "var(--ink)" : "var(--ink-2)", fontWeight: 600 }}>{value} W</span>
    </div>
  );
}

/** Tier "FTP-Ringe" — zwei Ringe (eFTP/Ramp-Test) + Saisonziel-Tabelle
 *  (`core/ftp-progress.js::ringProgress/buildMilestones`). Die "Ramp-Test"-
 *  Zeile der Meilensteinliste wird hier ausgeblendet — der Ramp-Wert steht
 *  bereits im zweiten Ring, Hero-Weitwinkel.dc.html zeigt sie nicht mehr
 *  doppelt (nur noch Start-FTP/Aktuelle eFTP/Saisonziel). `buildMilestones()`
 *  selbst bleibt unverändert (core/), das ist reine Render-Auswahl. */
export function FtpRings({ eftp, ramp, milestones, goal }: { eftp: HeroRing; ramp: HeroRing & { date: string | null }; milestones: HeroViewModel["milestones"]; goal: number }) {
  const remaining = Math.max(0, goal - eftp.value);
  const nochLabel = goal
    ? remaining > 0
      ? `noch ${remaining} W bis ${goal} W`
      : "Saisonziel erreicht"
    : "";
  const visibleMilestones = milestones.filter((m) => m.label !== "Ramp-Test");

  return (
    <GlassCard variant="soft" radius="24px" style={{ padding: "26px 28px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <ProgressRing size={164} strokeWidth={11} progress={eftp.progress} color="var(--accent)">
          <span style={{ fontSize: "2.6rem", fontWeight: 600, lineHeight: 1, letterSpacing: "-.02em", color: "var(--ink)" }}>{eftp.value}</span>
          <span style={{ fontSize: ".7rem", letterSpacing: ".12em", textTransform: "uppercase", color: "var(--accent-2)", fontWeight: 600 }}>
            eFTP · W
          </span>
        </ProgressRing>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
          <ProgressRing size={106} strokeWidth={8} progress={ramp.progress} color="var(--ink-2)">
            <span style={{ fontSize: "1.5rem", fontWeight: 600, lineHeight: 1, color: "var(--ink)" }}>{ramp.value}</span>
            <span style={{ fontSize: ".64rem", letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600 }}>
              Ramp · W
            </span>
          </ProgressRing>
          <span style={{ fontSize: ".72rem", color: "var(--ink-3)" }}>{ramp.date ? `Test ${fmtDate(ramp.date)}` : ""}</span>
        </div>
      </div>

      <div style={{ height: 1, background: "var(--hair)" }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {visibleMilestones.map((m) => (
          <MilestoneRow key={m.label} label={m.label} value={m.value} date={m.date} accent={m.label === "Aktuelle eFTP"} />
        ))}
        {nochLabel && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 2 }}>
            <span style={{ fontSize: ".82rem", color: "var(--ink-3)" }}>{nochLabel}</span>
          </div>
        )}
      </div>
    </GlassCard>
  );
}
