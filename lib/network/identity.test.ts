import assert from "node:assert/strict";
import test from "node:test";
import { boundedText, providerIdentity } from "./identity";

test("only a provider subject from the verified session can resolve identity", () => {
  assert.deepEqual(providerIdentity("google:123456"), { provider: "google", subject: "123456" });
  for (const id of [undefined, null, "member@example.com", "legacy-id", "google:", "google:with space", "other:123"]) {
    assert.throws(() => providerIdentity(id));
  }
});
test("profile fields reject missing, blank, non-string and oversized inputs", () => {
  assert.equal(boundedText(" Alice ", 10), "Alice");
  for (const value of [null, undefined, 12, {}, "  ", "x".repeat(11)]) assert.throws(() => boundedText(value, 10));
});
