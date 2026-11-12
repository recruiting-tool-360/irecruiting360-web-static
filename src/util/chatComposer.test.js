import test from "node:test";
import assert from "node:assert/strict";

import { resolveChatMessageText } from "./chatComposer.js";

test("explicit empty injected message does not reuse the current draft", () => {
  assert.equal(resolveChatMessageText("", "会话 A 未发送草稿"), "");
});

test("explicit whitespace injected message does not reuse the current draft", () => {
  assert.equal(resolveChatMessageText("   ", "会话 A 未发送草稿"), "");
});

test("undefined message falls back to the input draft", () => {
  assert.equal(resolveChatMessageText(undefined, "用户输入内容"), "用户输入内容");
});

test("explicit injected message is trimmed and sent as-is", () => {
  assert.equal(resolveChatMessageText("  外部消息  ", "旧草稿"), "外部消息");
});
