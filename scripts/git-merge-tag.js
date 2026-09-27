/* ============================================================
   SCRIPTS/GIT-MERGE-TAG.JS — Ein-Schritt-Merge+Tag für PRs, die
   app/, scripts/, supabase/ oder admin-api/ ändern (Issue #68,
   Review-Finding 2 in PR #97, mit Tony).

   Der ursprüngliche Plan war ein reiner globaler `git merge-tag`-
   Alias-Einzeiler — der stand aber nirgends im Repo, also für
   niemanden außer Alex nachvollziehbar oder testbar (Tonys
   Review-Einwand, PR #97). Dieses Skript ist jetzt die einzige
   Quelle der Wahrheit; der globale Git-Alias ruft nur noch
   `node scripts/git-merge-tag.js` auf (s. AGENTS.md → "Versions-Tag
   für Docker-Images").

   Ablauf: PR mergen (`gh pr merge --squash --delete-branch`) →
   lokalen main per Fast-Forward auf den neuen Merge-Commit bringen
   (schlägt sauber fehl statt etwas zu überschreiben, falls lokal
   main divergiert ist — kein `reset --hard`) → vX.Y.Z-Tag GENAU auf
   diesen Commit setzen und pushen. Grund für "erst mergen, dann
   taggen" statt umgekehrt: Squash-/Merge-/Rebase-Merges erzeugen auf
   main immer einen NEUEN Commit — ein vor dem Merge gesetzter Tag
   kann diesen nie treffen.

   Usage: node scripts/git-merge-tag.js <pr-nummer> <version>
     Version mit oder ohne "v"-Prefix ("1.5.0" und "v1.5.0" ergeben
     beide den Tag v1.5.0).
   ============================================================ */

import { execSync } from "node:child_process";
import { log } from "./lib/log.js";

function run(cmd) {
  return execSync(cmd, { stdio: "inherit" });
}

function runCapture(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

function fail(message) {
  log.error(`git-merge-tag: ${message}`);
  process.exit(1);
}

const [, , pr, rawVersion] = process.argv;

if (!pr || !rawVersion) {
  fail("usage: node scripts/git-merge-tag.js <pr-nummer> <version>  (z.B. 97 1.5.0)");
}

const branch = runCapture("git symbolic-ref --short -q HEAD");
if (branch !== "main") {
  fail(`abgebrochen, Branch ist "${branch}", nicht main.`);
}

const version = rawVersion.replace(/^v/, "");
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  fail(`abgebrochen, Version "${rawVersion}" ist kein X.Y.Z-Format.`);
}
const tag = `v${version}`;

try {
  execSync(`git rev-parse ${tag}`, { stdio: "ignore" });
  fail(`abgebrochen, Tag ${tag} existiert bereits.`);
} catch {
  // Tag existiert noch nicht — erwarteter Pfad, weiter geht's.
}

try {
  run(`gh pr merge ${pr} --squash --delete-branch`);
} catch {
  fail("abgebrochen, PR-Merge fehlgeschlagen (siehe gh-Ausgabe oben).");
}

run("git fetch origin");

try {
  run("git merge --ff-only origin/main");
} catch {
  fail(
    "PR ist gemerged, aber lokaler main liess sich nicht per Fast-Forward aktualisieren — main manuell abgleichen und Tag von Hand setzen (kein automatischer reset --hard)."
  );
}

run(`git tag ${tag}`);
run(`git push origin ${tag}`);

log.info(`git-merge-tag: PR #${pr} gemerged, main aktualisiert, ${tag} gesetzt und gepusht.`);
