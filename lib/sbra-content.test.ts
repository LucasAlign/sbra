import assert from "node:assert/strict";
import test from "node:test";
import { sbraArticles, sbraPodcastEpisodes, sbraSupportResources } from "./sbra-content";

test("official SBRA learning catalog contains the complete public archives", () => {
  assert.equal(sbraPodcastEpisodes.length, 97);
  assert.equal(sbraArticles.length, 39);
  assert.equal(new Set(sbraPodcastEpisodes.map((episode) => episode.url)).size, sbraPodcastEpisodes.length);
  assert.equal(new Set(sbraArticles.map((article) => article.url)).size, sbraArticles.length);
});

test("learning and support links point to official SBRA properties", () => {
  for (const episode of sbraPodcastEpisodes) {
    assert.equal(new URL(episode.url).hostname, "sbrashow.libsyn.com");
    assert.match(episode.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(episode.duration, /^\d{1,2}:\d{2}$/);
  }

  for (const resource of [...sbraArticles, ...sbraSupportResources]) {
    assert.equal(new URL(resource.url).hostname, "www.sbrassociation.com");
  }
});

test("support catalog covers direct help, programs, promotion, and policies", () => {
  const groups = new Set(sbraSupportResources.map((resource) => resource.group));
  assert.deepEqual(groups, new Set(["Get help", "Member programs", "Benefits & policies", "Promote your business"]));
});
