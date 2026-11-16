import test from "node:test";
import assert from "node:assert/strict";

import { buildSearchTaskChannels } from "./searchTaskPayloadBuilder.js";

test("recommend BOSS config stores selected position id and name", () => {
  const channels = buildSearchTaskChannels({
    cfgList: [{ key: "BOSS", enableConfig: true }],
    selectedModules: { search: false, recommend: true },
    matchedBossJobId: "boss-job-1",
    matchedBossJobName: "测试工程师",
    resumeCount: 10
  });

  assert.equal(channels.length, 1);
  assert.deepEqual(JSON.parse(channels[0].searchTaskConfig), {
    relatedPositionValue: "boss-job-1",
    matchedPosition: {
      encryptJobId: "boss-job-1",
      positionName: "测试工程师"
    },
    maxResumeCount: 10
  });
});
