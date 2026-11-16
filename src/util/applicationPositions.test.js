import test from "node:test";
import assert from "node:assert/strict";

import { filterNonDeletedApplicationPositions } from "./applicationPositions.js";

test("filters application positions explicitly marked as deleted", () => {
  const positions = filterNonDeletedApplicationPositions([
    { headcountId: "1", isDeleted: false },
    { headcountId: "2", isDeleted: true },
    { headcountId: "3" }
  ]);

  assert.deepEqual(
    positions.map((position) => position.headcountId),
    ["1", "3"]
  );
});
