export const BOSS_FILTER_DEFAULTS = Object.freeze({
  activeness: 1,
  viewResume: 0,
  exchangeResume: 1
});

export const BOSS_ACTIVE_OPTIONS = [
  { value: 0, label: "不限" },
  { value: 1, label: "刚刚活跃" },
  { value: 2, label: "今日活跃" },
  { value: 3, label: "3日内活跃" },
  { value: 4, label: "本周活跃" },
  { value: 5, label: "本月活跃" }
];

export const BOSS_NOT_VIEWED_OPTIONS = [
  { value: 0, label: "不限" },
  { value: 1, label: "近14天没有" }
];

export const BOSS_RESUME_EXCHANGE_OPTIONS = [
  { value: 0, label: "不限" },
  { value: 1, label: "近一个月没有" }
];

export function normalizeBossJobId(value) {
  const candidate = value && typeof value === "object"
    ? value.encryptJobId || value.encryptId || value.jobId
    : value;
  if (candidate === undefined || candidate === null) return null;
  const normalized = String(candidate).trim();
  if (!normalized || ["null", "undefined"].includes(normalized.toLowerCase())) return null;
  return normalized;
}

const LEGACY_VALUE_MAP = {
  UNLIMITED: 0,
  JUST_ACTIVE: 1,
  ACTIVE_TODAY: 2,
  ACTIVE_3_DAYS: 3,
  ACTIVE_7_DAYS: 4,
  ACTIVE_30_DAYS: 5,
  NOT_VIEWED_14_DAYS: 1,
  NOT_EXCHANGED_1_MONTH: 1,
  YES: 1
};

function parseObject(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_e) {
    return null;
  }
}

function normalizeValue(value, allowedValues, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const mapped = typeof value === "string" && LEGACY_VALUE_MAP[value] !== undefined
    ? LEGACY_VALUE_MAP[value]
    : Number(value);
  return allowedValues.includes(mapped) ? mapped : fallback;
}

export function normalizeBossFilters(source) {
  const raw = parseObject(source) || {};
  const criteria = parseObject(raw.criteria) || {};
  const merged = { ...criteria, ...raw };
  return {
    activeness: normalizeValue(
      merged.activeness !== undefined ? merged.activeness : merged.bossActiveLevel,
      BOSS_ACTIVE_OPTIONS.map((option) => option.value),
      BOSS_FILTER_DEFAULTS.activeness
    ),
    viewResume: normalizeValue(
      merged.viewResume !== undefined ? merged.viewResume : merged.bossNotViewed,
      BOSS_NOT_VIEWED_OPTIONS.map((option) => option.value),
      BOSS_FILTER_DEFAULTS.viewResume
    ),
    exchangeResume: normalizeValue(
      merged.exchangeResume !== undefined ? merged.exchangeResume : merged.bossResumeExchange,
      BOSS_RESUME_EXCHANGE_OPTIONS.map((option) => option.value),
      BOSS_FILTER_DEFAULTS.exchangeResume
    )
  };
}

export function extractBossFilters(condition) {
  const root = parseObject(condition) || {};
  const channels = Array.isArray(root.channelSearchConditions)
    ? root.channelSearchConditions
    : [];
  const bossCondition = channels.find((item) =>
    String(item?.channel || item?.channelName || item?.channelSubType || "")
      .toUpperCase()
      .includes("BOSS")
  );
  const conditionData = parseObject(bossCondition?.conditionData);
  return normalizeBossFilters({
    ...(root.criteria || {}),
    ...root,
    ...(conditionData || {})
  });
}

