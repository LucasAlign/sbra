import assert from "node:assert/strict";
import test from "node:test";
import { sbraBusinessSeed } from "./sbra-directory.generated";

test("directory taxonomy does not publish known source typos", () => {
  const searchable = sbraBusinessSeed
    .flatMap((business) => [business.category, business.description, business.servicesOffered])
    .join("\n");
  assert.doesNotMatch(searchable, /\bComertial\b/);
  assert.doesNotMatch(searchable, /\bManages Service Security Provider\b/);
  assert.doesNotMatch(searchable, /\bcovenient\b/);
});

test("known businesses do not inherit unrelated financial-services descriptions", () => {
  for (const name of ["FXV Digital Design", "GKS Brown Realty", "Golden Rule Remodeling"]) {
    const business = sbraBusinessSeed.find((candidate) => candidate.name === name);
    assert.ok(business, `${name} must remain in the directory`);
    assert.doesNotMatch(business.description, /financial (?:strategy|minds)|wealth accumulation/i, name);
  }
});
