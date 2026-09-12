import assert from "node:assert/strict";
import test from "node:test";
import { latinoMemberSeed } from "./latino-directory";
import { sbraMemberSeed } from "./sbra-directory.generated";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

test("published directory contacts never expose malformed email links", () => {
  const malformed = [...sbraMemberSeed, ...latinoMemberSeed]
    .filter((member) => member.email && !emailPattern.test(member.email))
    .map((member) => `${member.name}: ${member.email}`);

  assert.deepEqual(malformed, []);
});
