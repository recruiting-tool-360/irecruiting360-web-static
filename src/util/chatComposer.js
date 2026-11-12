export function resolveChatMessageText(input, draft) {
  const source = input == null ? draft : input;
  return typeof source === "string" ? source.trim() : String(source).trim();
}
