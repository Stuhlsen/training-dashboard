import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_EDGE,
  buildManifest,
  externalIdFromPng,
  ffmpegArgs,
} from "../scripts/build-recipe-images.js";

describe("externalIdFromPng", () => {
  it("liefert die external_id für own-<slug>.png", () => {
    assert.equal(externalIdFromPng("own-haferbrei-mit-beeren.png"), "own-haferbrei-mit-beeren");
  });

  it("überspringt Fremddateien", () => {
    assert.equal(externalIdFromPng("kontaktbogen.html"), null);
    assert.equal(externalIdFromPng("own-x.jpg"), null);
    assert.equal(externalIdFromPng("../own-x.png"), null);
    assert.equal(externalIdFromPng("spoon-123.png"), null);
  });
});

describe("buildManifest", () => {
  it("sortiert, entdoppelt und ignoriert Nicht-WebP", () => {
    assert.deepEqual(
      buildManifest(["own-b.webp", "own-a.webp", "own-a.webp", ".gitkeep", "own-c.png"]),
      ["own-a", "own-b"]
    );
  });
});

describe("ffmpegArgs", () => {
  it("begrenzt die Kante, verwirft Metadaten und setzt die Qualität", () => {
    const args = ffmpegArgs("in.png", "out.webp", 75);
    assert.ok(args.join(" ").includes(`min(${MAX_EDGE},iw)`));
    assert.equal(args[args.indexOf("-map_metadata") + 1], "-1");
    assert.equal(args[args.indexOf("-quality") + 1], "75");
    assert.equal(args.at(-1), "out.webp");
  });
});
