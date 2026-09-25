import assert from "node:assert/strict";
import test from "node:test";
import { sbraBusinessSeed } from "./sbra-directory.generated";
import { directoryCategory, repairDirectoryBusiness } from "./directory-quality";

test("directory repairs known stale copy without replacing custom edits", () => {
  const business = sbraBusinessSeed.find((entry) => entry.name === "Golden Rule Remodeling")!;
  const stale = { ...business, description: "Helping to … Optimize your wealth. Achieve your goals. Protect your dreams. Contact me today to discuss turning your dreams into realities." };
  assert.equal(repairDirectoryBusiness(stale).description, business.description);
  assert.equal(repairDirectoryBusiness({ ...business, description: "My custom profile" }).description, "My custom profile");
});

test("category filters group similar services without translating Spanish categories", () => {
  assert.equal(directoryCategory("Digital Marketing"), directoryCategory("Marketing Consulting"));
  assert.equal(directoryCategory("Comertial Janitorial Services"), "Cleaning & restoration");
  assert.equal(directoryCategory("Restaurante"), "Restaurante");
});

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
