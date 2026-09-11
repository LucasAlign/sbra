import assert from "node:assert/strict";
import test from "node:test";
import { parseBackfillOptions } from "./backfill-options";

test("backfill defaults to reporting and requires a dedicated connection", () => {
  assert.equal(parseBackfillOptions(["c", "s"], "postgres://localhost/collab_staging").apply, false);
  assert.throws(() => parseBackfillOptions(["c", "s"]));
  assert.throws(() => parseBackfillOptions(["c", "s", "--apply"]));
  assert.throws(() => parseBackfillOptions(["c", "s", "--report", "extra"]));
});
test("backfill mutations are confined to explicitly named rehearsal databases", () => {
  for (const name of ["collab_test", "collab_staging"]) {
    assert.equal(parseBackfillOptions(["c", "s", "--apply-staging"], `postgres://localhost/${name}`).apply, true);
  }
  for (const url of ["postgres://localhost/production", "postgres://localhost/collab_staging_copy", "https://localhost/collab_staging"]) {
    assert.throws(() => parseBackfillOptions(["c", "s", "--apply-staging"], url));
  }
});
