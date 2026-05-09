import assert from "node:assert/strict";
import { test } from "node:test";
import { dedupePublicUpdates } from "../dist/server/public-update-dedupe.js";

test("dedupes stored webhook and polled GitLab merge request updates", () => {
  const updates = dedupePublicUpdates([
    {
      id: "gitlab:merge:42:34",
      serviceId: "openvoice",
      date: "2026-05-08T19:58:34.557+02:00",
      title: "OpenVoice UI-Redesign ohne Dummy-Buttons",
      text: "OpenVoice: Merge Event veroeffentlicht.",
      href: "https://labs.schnick-schnack.info/schnick-schnack/openvoice/-/merge_requests/34"
    },
    {
      id: "gitlab-42-34",
      serviceId: "openvoice",
      date: "2026-05-08T19:58:34.557+02:00",
      title: "OpenVoice UI-Redesign ohne Dummy-Buttons",
      text: "schnick-schnack/openvoice!34 wurde gemerged. 1 Datei wurde geaendert.",
      href: "https://labs.schnick-schnack.info/schnick-schnack/openvoice/-/merge_requests/34"
    }
  ]);

  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, "gitlab:merge:42:34");
});
