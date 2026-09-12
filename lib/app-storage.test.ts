import assert from "node:assert/strict";
import test from "node:test";
import { APP_KEYS, clearAppData, clearValue, loadCollection, loadValue, saveCollection, saveValue } from "./app-storage";

type StorageWindow = {
  localStorage: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  };
};

function withStorage(run: (values: Map<string, string>) => void) {
  const values = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  const storageWindow: StorageWindow = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => void values.delete(key)
    }
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: storageWindow });
  try {
    run(values);
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
}

test("seed app storage owns every persisted member-state key", () => {
  assert.deepEqual(Object.keys(APP_KEYS).sort(), [
    "comments",
    "events",
    "posts",
    "preferences",
    "reactions",
    "referrals",
    "requests",
    "rsvps",
    "session"
  ]);
});

test("member collections round-trip and reset through the storage adapter", () => {
  withStorage((values) => {
    const referral = { id: "ref-new", status: "sent" };
    const rsvp = { eventId: "event-1", memberId: "person-1", status: "maybe" };

    saveCollection(APP_KEYS.referrals, [referral]);
    saveCollection(APP_KEYS.rsvps, [rsvp]);
    saveValue(APP_KEYS.preferences, { compactDirectory: true });
    saveValue(APP_KEYS.session, { role: "member" });

    assert.deepEqual(loadCollection(APP_KEYS.referrals, []), [referral]);
    assert.deepEqual(loadCollection(APP_KEYS.rsvps, []), [rsvp]);
    assert.deepEqual(loadValue(APP_KEYS.preferences, { compactDirectory: false }), { compactDirectory: true });
    assert.deepEqual(loadValue(APP_KEYS.session, null), { role: "member" });

    clearValue(APP_KEYS.session);
    assert.equal(values.has(APP_KEYS.session), false);
    saveValue(APP_KEYS.session, { role: "member" });

    clearAppData([]);
    assert.equal(values.has(APP_KEYS.referrals), false);
    assert.equal(values.has(APP_KEYS.rsvps), false);
    assert.equal(values.has(APP_KEYS.preferences), false);
    assert.equal(values.has(APP_KEYS.session), false);
  });
});
