import assert from "node:assert/strict";
import test from "node:test";
import { localDemoEnabled } from "./local-demo";
test("local demo credentials require development, explicit opt-in, password, and isolated local database", () => {
  const env = { NODE_ENV: "development", COLLAB_LOCAL_DEMO: "1", COLLAB_DEMO_PASSWORD: "long-local-demo-password", DATABASE_URL: "postgres://runtime:password@127.0.0.1:55440/collab_demo" };
  assert.equal(localDemoEnabled(env), true);
  for (const patch of [{ NODE_ENV: "production" }, { COLLAB_LOCAL_DEMO: "0" }, { COLLAB_DEMO_PASSWORD: "short" }, { DATABASE_URL: "postgres://localhost/production" }, { DATABASE_URL: "postgres://remote.example/collab_demo" }, { DATABASE_URL: "bad" }]) assert.equal(localDemoEnabled({ ...env, ...patch }), false);
});
