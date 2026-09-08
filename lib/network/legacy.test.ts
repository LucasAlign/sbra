import assert from "node:assert/strict";
import test from "node:test";
import * as actions from "../../app/actions";
import { GET } from "../../app/api/seed/route";

test("all legacy actions reject without reading or writing unscoped data", async () => {
  for (const action of Object.values(actions)) {
    // Simulate a direct invocation, independent of hidden/disabled UI controls.
    await assert.rejects(Reflect.apply(action, undefined, []), /legacy operation is unavailable/);
  }
});

test("HTTP seeding is retired", async () => {
  assert.equal((await GET()).status, 410);
});
