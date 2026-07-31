# Phase 6 — Konzept: Sichtbarkeit pro Datentyp — finale Matrix [F5]

> **Ziel:** Eine verbindliche, vollständige Entscheidung, was öffentlich sichtbar
> ist und was hinter Login/Rolle liegt — pro Datentyp, nicht pro Feature.
> **Leitprinzip (Portfolio-Charakter):** Öffentlich ist der Default für
> *Trainingsdaten*; privat ist der Default für *Persönliches* (Befinden, Notizen).
> Schreiben erfordert immer Login — einzige Ausnahme ist das Feedback-Widget
> (eigenes Konzept).
>
> **Technischer Rahmen:** Der Supabase-anon-Key ist per Design öffentlich; die
> Grenze ist ausschließlich RLS (+ Views für Spaltensicherheit). Jede Zeile der
> Matrix unten muss sich in einer Policy wiederfinden — die Matrix ist die
> Prüfliste für den finalen Security-Review am Phasenende.

---

## 1. Die Matrix

| Datentyp | Besucher (öffentlich) | Athlet (selbst) | Trainer (des Athleten) | Anmerkung |
|---|---|---|---|---|
| Lesedaten: Fahrten, PMC, Wetter (`data/*.json`) | ✅ voll | ✅ | ✅ | statische Dateien, per Definition öffentlich — hier liegt nichts Persönliches außer Trainingsmetriken |
| `goals` | ✅ lesen (E1) | ✅ CRUD | ✅ lesen | |
| `events` | ✅ lesen (E1) | ✅ CRUD | ✅ lesen, Vorschläge | |
| `plan_cards` | ✅ lesen (E1) | ✅ CRUD | ✏️ gemäß T2 | inkl. `moved_from`/`cancel`-Historie |
| Prognose & Konflikte (abgeleitet) | ✅ | ✅ | ✅ | reine Ableitung aus öffentlichen Daten — keine eigene Policy nötig |
| `wellbeing` Slider | Toggle je Athlet (E2), **Default: aus** | ✅ | ✅ immer | |
| `wellbeing.note` | ❌ nie (E2) | ✅ | Toggle je Athlet (T1, Default aus) | persönlichster Datenpunkt der App |
| Governor-Empfehlung (abgeleitet aus Befinden) | ❌ | ✅ | ✅ | leitet sich aus Befinden ab ⇒ folgt dessen Schutz, nicht dem der Plandaten; bestehendes `isAthlete()`-Gate bleibt |
| `proposals` (inkl. `reason`) | ✅ lesen (S1) | ✅ voll | ✅ eigene + Historie | `reason` gilt als öffentlich — Leitplanke s. Entscheidungen |
| `feedback` | ✅ nur `approved`, ohne `ip_hash` (View) | — | — | Admin: alles (E3) |
| `profiles` | nur `display_name` + öffentliche Toggles (View) | ✅ eigenes | `display_name` | E-Mail/Auth-Daten nie über die API sichtbar; `trainer_id` nicht öffentlich (unnötig) |
| `plan_cards.updated_by` | ❌ (nur Badge-Logik intern) | ✅ | ✅ | öffentlich reicht „was", nicht „wer" |

## 2. Konsequenzen & Umsetzungsregeln

- **Spaltensicherheit über Views, nicht nur Zeilen-Policies:** Überall, wo einzelne
  Spalten privat sind, während die Zeile öffentlich ist (`profiles`, `feedback`,
  ggf. `wellbeing`), bekommt der öffentliche Zugriff eine dedizierte
  `*_public`-View. Policies schützen Zeilen zuverlässig, Spalten nur umständlich —
  Views machen die Grenze strukturell.
- **Abgeleitete Daten erben die Sichtbarkeit ihrer sensibelsten Quelle:** Die
  Governor-Empfehlung ist das Beispiel — sie sieht harmlos aus („Belastung
  reduzieren"), lässt aber Rückschlüsse aufs Befinden zu. Regel für alles Künftige
  (auch Phase-5-Explorer): Was aus privaten Daten rechnet, ist privat, egal wie
  aggregiert es wirkt.
- **Der Athleten-Toggle bleibt frei** (Portfolio-Entscheidung) — er wechselt nur die
  *Ansicht*, nie die *Rechte*. Alle Rechte hängen an `auth.uid()`, nie am angezeigten
  Athleten.
- **Export-Briefing folgt der Trainer-Spalte** (Schema-Konzept §6): Der
  Claude-Trainer sieht exakt, was ein menschlicher Trainer sähe — inklusive
  T1-Toggle für Notizen. Keine Sonderrechte für den Export.
- Diese Matrix ist **Anhang des finalen Security-Reviews**: der Review prüft pro
  Zeile Policy/View/GRANT gegen die Matrix, plus die bekannten Querschnittsthemen
  (GRANTs vollständig? anon-Rolle nur wo vorgesehen? `ip_hash`/`note` in keinem
  öffentlichen Pfad?).

---

## Getroffene Entscheidungen

- Öffentlich = Default für Trainingsdaten, privat = Default für Persönliches;
  Schreiben immer hinter Login außer Feedback. ✅
- Spaltensicherheit über `*_public`-Views. ✅
- Abgeleitete Daten erben die Sichtbarkeit der sensibelsten Quelle
  (Governor-Empfehlung bleibt privat). ✅
- Athleten-Toggle wechselt Ansicht, nie Rechte. ✅
- Matrix dient als Prüfliste des finalen Security-Reviews. ✅
- **S1 — `proposals` sind öffentlich lesbar.** Der Vorschlags-/Review-Workflow ist
  Portfolio-Kern. Leitplanke: `reason` gilt als öffentlicher Text — Trainer-UI und
  Prompt-Vorlage weisen darauf hin; Begründungen werden lastbasiert formuliert
  („TSB-Verlauf"), nie persönlich („weil du schlecht geschlafen hast"). In der
  Prompt-Vorlage explizit verankert. ✅
- **S2 — `wellbeing_public`-Toggle Default: aus.** Privacy by default; die Freigabe
  ist eine bewusste Athleten-Entscheidung im Profil. ✅
