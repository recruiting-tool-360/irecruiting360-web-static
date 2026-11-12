import test from "node:test";
import assert from "node:assert/strict";

import {
  POSITION_PROFILE_AVAILABILITY,
  resolvePositionProfileAvailability
} from "./jobProfileAvailability.js";

test("returns available when any application position enables job profile", () => {
  const result = resolvePositionProfileAvailability(
    [
      { headcountId: "1", jobProfileEnabled: false },
      { headcountId: "2", jobProfileEnabled: true }
    ],
    {}
  );

  assert.equal(result, POSITION_PROFILE_AVAILABILITY.AVAILABLE);
});

test("returns none-enabled when every application position explicitly disables job profile", () => {
  const result = resolvePositionProfileAvailability(
    [
      { headcountId: "1", jobProfileEnabled: false },
      { headcountId: "2", jobProfileEnabled: false }
    ],
    {}
  );

  assert.equal(result, POSITION_PROFILE_AVAILABILITY.NONE_ENABLED);
});

test("uses position detail flag before application position flag", () => {
  const result = resolvePositionProfileAvailability(
    [{ headcountId: "1", jobProfileEnabled: false }],
    { "1": { jobProfileEnabled: true } }
  );

  assert.equal(result, POSITION_PROFILE_AVAILABILITY.AVAILABLE);
});

test("returns unknown when the profile flag cannot be determined", () => {
  const result = resolvePositionProfileAvailability([{ headcountId: "1" }], {});

  assert.equal(result, POSITION_PROFILE_AVAILABILITY.UNKNOWN);
});

test("returns none-enabled for an empty active position list", () => {
  const result = resolvePositionProfileAvailability([], {});

  assert.equal(result, POSITION_PROFILE_AVAILABILITY.NONE_ENABLED);
});

test("returns unknown when the application position request failed", () => {
  const result = resolvePositionProfileAvailability(null, {});

  assert.equal(result, POSITION_PROFILE_AVAILABILITY.UNKNOWN);
});
