import {
  DIMENSIONS,
  RULE_LABELS,
  STRUCTURE_TYPE,
  UNLIMITED_TEXT,
  WEIGHT_TOTAL
} from "./dimensions";

/** 未返回该维度时的默认权重（8 个默认 WEIGHT_SCORE 维度会再按 90 重分配） */
const DEFAULT_WEIGHT = 10;
/** 加分项 / 减分项默认分值及单项、合计上限 */
export const BONUS_DEFAULT = 10;
export const BONUS_MIN = 1;
export const BONUS_MAX = 10;
export const BONUS_TOTAL_MAX = 10;

function isPlainObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** 兼容 string / array 两种形态（后端 structuredContent 有时是 JSON 字符串） */
export function safeParseArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_e) {
      return [];
    }
  }
  return [];
}

function firstProfileArray(...values) {
  for (const value of values) {
    const parsed = safeParseArray(value);
    if (parsed.length > 0) return parsed;
  }
  return [];
}

/** 兼容后端把 positionProfile 序列化成 JSON 字符串下发 */
function parseProfileJson(value) {
  if (typeof value !== "string" || value.trim() === "") return value;
  try {
    return JSON.parse(value);
  } catch (_e) {
    return null;
  }
}

/**
 * 从 getChatHistory 各种包装里取出真正的 profile 对象。
 * 兼容：
 *   - 消息级 positionProfile（字符串 / 对象）
 *   - data.harnessPositionProfile.profile
 *   - data.profile
 *   - 直接传 profile
 *
 * 注意：positionProfile 外层的 structured / tagContent 是后端按固定维度整理后的最新数据，
 * 内层 profile.structuredContent / tagContent 可能只是旧快照；因此外层存在时优先使用。
 */
export function extractProfile(source) {
  if (!source) return null;
  const root = parseProfileJson(source);
  if (!isPlainObject(root)) return null;

  let wrapper = root;
  const positionProfile = parseProfileJson(root.positionProfile);
  const harnessProfile = parseProfileJson(root.harnessPositionProfile);
  if (isPlainObject(positionProfile)) wrapper = positionProfile;
  else if (isPlainObject(harnessProfile)) wrapper = harnessProfile;

  const nested = parseProfileJson(wrapper.profile ?? wrapper);
  if (!isPlainObject(nested)) return null;

  // 新接口会同时返回两种结构：外层 structured 是已整理好的结构化维度，
  // profile.structuredContent / profile.tagContent 是画像原始快照。结构化数据
  // 优先使用外层，标签数据在外层缺失时必须继续读取 profile 内层。
  const structured = firstProfileArray(
    wrapper.structured,
    wrapper.structuredContent,
    nested.structured,
    nested.structuredContent,
    root.structured,
    root.structuredContent
  );
  const tagContent = firstProfileArray(
    wrapper.tagContent,
    wrapper.tagContentContent,
    nested.tagContent,
    nested.tagContentContent,
    root.tagContent,
    root.tagContentContent
  );

  const profile = { ...nested };
  if (structured.length) profile.structured = structured;
  if (tagContent.length) profile.tagContent = tagContent;
  return profile;
}

export function ruleOf(item) {
  const value = item?.rule_type ?? item?.ruleType;
  return RULE_LABELS[value] ? value : null;
}

export function setRule(item, rule) {
  if (!item) return;
  item.rule_type = rule;
  delete item.ruleType;
}

export function weightOf(item) {
  const value = item?.weight;
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}

export function setWeight(item, weight) {
  if (!item) return;
  item.weight = weight;
}

/** 加分项 / 减分项分值字段；null 由界面按 0 分展示 */
export function scoreOf(item) {
  const value = item?.score;
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}

export function setScore(item, score) {
  if (!item) return;
  item.score = score;
}

export function displayOf(item) {
  const raw = item?.display_value ?? item?.displayValue;
  if (Array.isArray(raw)) return raw.filter((v) => v !== null && v !== undefined && v !== "");
  if (typeof raw === "string" && raw.trim() !== "") return [raw];
  return [];
}

export function setDisplay(item, list) {
  if (!item) return;
  const arr = (list || []).filter((v) => v !== null && v !== undefined && String(v) !== "");
  item.display_value = arr.length ? arr : [UNLIMITED_TEXT];
  delete item.displayValue;
}

/** dataTypeValue 统一成 [{ dataTypeId, dataTypeValueName }]；不同接口可能返回单对象 / 字符串 */
export function selectedOf(item) {
  const raw = item?.dataTypeValue ?? item?.data_type_value;
  const list = Array.isArray(raw) ? raw : isPlainObject(raw) ? [raw] : [];
  return list
    .map((opt) => {
      if (!isPlainObject(opt)) return null;
      const id = opt.dataTypeId ?? opt.id;
      const name = opt.dataTypeValueName ?? opt.name ?? opt.label;
      if (id === null || id === undefined || id === "") return null;
      return { dataTypeId: id, dataTypeValueName: name ?? String(id) };
    })
    .filter(Boolean);
}

export function setSelected(item, list) {
  if (!item) return;
  const arr = (list || []).filter((opt) => opt && opt.dataTypeId !== null && opt.dataTypeId !== undefined);
  item.dataTypeValue = arr.length ? arr : null;
}

export function isUnlimitedItem(item) {
  const display = displayOf(item);
  if (display.length === 1 && display[0] === UNLIMITED_TEXT) return true;
  return display.length === 0 && selectedOf(item).length === 0;
}

/* ===== 年龄 / 薪资区间 ===== */

export const AGE_MIN = 16;
export const AGE_MAX = 65;
export const SALARY_MIN = 1;
export const SALARY_MAX = 200;

/** "不限" / "18岁及以上" / "23岁及以下" / "18-23岁" → { unlimited, min, max } */
export function parseAgeDisplay(display) {
  const text = Array.isArray(display) ? display[0] : display;
  if (!text || text === UNLIMITED_TEXT) return { unlimited: true, min: null, max: null };
  const str = String(text);
  let m = str.match(/^(\d+)\s*岁及以上$/);
  if (m) return { unlimited: false, min: Number(m[1]), max: null };
  m = str.match(/^(\d+)\s*岁及以下$/);
  if (m) return { unlimited: false, min: null, max: Number(m[1]) };
  m = str.match(/^(\d+)\s*[-~]\s*(\d+)\s*岁$/);
  if (m) return { unlimited: false, min: Number(m[1]), max: Number(m[2]) };
  return { unlimited: true, min: null, max: null };
}

export function formatAgeDisplay({ min, max }) {
  if (min === null && max === null) return [UNLIMITED_TEXT];
  if (max === null) return [`${min}岁及以上`];
  if (min === null) return [`${max}岁及以下`];
  return [`${min}-${max}岁`];
}

/** "不限" / "3K以上" / "7K以下" / "3-7K" → { unlimited, min, max } */
export function parseSalaryDisplay(display) {
  const text = Array.isArray(display) ? display[0] : display;
  if (!text || text === UNLIMITED_TEXT) return { unlimited: true, min: null, max: null };
  const str = String(text);
  let m = str.match(/^(\d+)\s*[Kk]以上$/);
  if (m) return { unlimited: false, min: Number(m[1]), max: null };
  m = str.match(/^(\d+)\s*[Kk]以下$/);
  if (m) return { unlimited: false, min: null, max: Number(m[1]) };
  m = str.match(/^(\d+)\s*[-~]\s*(\d+)\s*[Kk]$/);
  if (m) return { unlimited: false, min: Number(m[1]), max: Number(m[2]) };
  return { unlimited: true, min: null, max: null };
}

export function formatSalaryDisplay({ min, max }) {
  if (min === null && max === null) return [UNLIMITED_TEXT];
  if (max === null) return [`${min}K以上`];
  if (min === null) return [`${max}K以下`];
  return [`${min}-${max}K`];
}

/* ===== 归一化 ===== */

function createDefaultItem(dimension) {
  const rule = dimension.defaultRule;
  const item = {
    dimension: dimension.key,
    name: dimension.label,
    group: dimension.group,
    data_type: dimension.dataType,
    rule_type: rule,
    weight: rule === "WEIGHT_SCORE" ? DEFAULT_WEIGHT : null,
    score: null,
    sensitive: false,
    evidence: null,
    rule_text: null,
    display_value: [UNLIMITED_TEXT],
    dataTypeValue: null
  };
  if (rule === "BONUS" || rule === "PENALTY") item.score = BONUS_DEFAULT;
  return item;
}

function normalizeItem(raw, dimension) {
  const item = { ...raw };
  // 性别改为单选：历史画像若同时选了男、女，语义等同于「不限」。
  if (dimension.source === "local-gender") {
    const genders = [...new Set(displayOf(item).filter((value) => value !== UNLIMITED_TEXT))];
    setDisplay(item, genders.length > 1 ? [UNLIMITED_TEXT] : genders);
    setSelected(item, []);
  }
  // 标签化维度固定「仅展示」，后端历史数据即使有其它规则也强制纠正
  if (dimension.structureType === STRUCTURE_TYPE.TAG) setRule(item, "DISPLAY_ONLY");
  if (!ruleOf(item)) setRule(item, dimension.defaultRule);
  const rule = ruleOf(item);
  if (rule === "WEIGHT_SCORE") {
    if (weightOf(item) === null) setWeight(item, DEFAULT_WEIGHT);
    setScore(item, null);
  } else if (rule === "BONUS" || rule === "PENALTY") {
    const score = scoreOf(item);
    setWeight(item, null);
    if (score !== null) {
      setScore(item, Math.min(BONUS_MAX, Math.max(BONUS_MIN, score)));
    }
  } else {
    setWeight(item, null);
    setScore(item, null);
  }
  if (!Array.isArray(item.display_value) && typeof item.display_value !== "string") {
    const display = displayOf(item);
    setDisplay(item, display);
  }
  // 兼容读取时 structuredContent 是字符串的情况：保持原样，其它字段不动
  return item;
}

/**
 * 归一化画像：始终返回 13 个维度（顺序固定），缺失维度补默认项。
 *
 * @returns {{
 *   items: Array<object>,
 *   missingCount: number,
 *   source: object|null
 * }}
 */
export function normalizeProfile(source) {
  const profile = extractProfile(source);
  const structured = safeParseArray(profile?.structured).length
    ? safeParseArray(profile.structured)
    : safeParseArray(profile?.structuredContent);
  const tags = safeParseArray(profile?.tagContent);

  const rawItems = [...structured, ...tags].filter(isPlainObject);
  const dimensionKeys = new Set(DIMENSIONS.map((item) => item.key));
  const keyByDataType = new Map(DIMENSIONS.map((item) => [Number(item.dataType), item.key]));
  const byDimension = new Map();
  for (const item of rawItems) {
    // dimension 优先；缺失时按 data_type 兜底，映射到固定的 13 个维度。
    const dataTypeKey = keyByDataType.get(Number(item.data_type));
    const key = item.dimension ?? item.key ?? dataTypeKey;
    if (key && dimensionKeys.has(key) && !byDimension.has(key)) byDimension.set(key, item);
  }

  let missingCount = 0;
  const items = DIMENSIONS.map((dimension) => {
    const existing = byDimension.get(dimension.key);
    if (!existing) {
      missingCount += 1;
      return createDefaultItem(dimension);
    }
    return normalizeItem(existing, dimension);
  });

  return { items, missingCount, source: profile };
}

export function cloneItems(items) {
  return JSON.parse(JSON.stringify(items || []));
}

/* ===== 权重 ===== */

export function totalWeight(items) {
  return (items || []).reduce((sum, item) => {
    if (ruleOf(item) !== "WEIGHT_SCORE") return sum;
    return sum + (weightOf(item) || 0);
  }, 0);
}

/**
 * 权重评分维度平均分配 90 分：floor(90/N)，余数依次给前 N 个。
 * 只在规则类型变化 / 缺失维度进入编辑态时调用。
 */
export function redistributeWeights(items) {
  const weighted = (items || []).filter((item) => ruleOf(item) === "WEIGHT_SCORE");
  if (weighted.length === 0) return;
  const base = Math.floor(WEIGHT_TOTAL / weighted.length);
  let remainder = WEIGHT_TOTAL - base * weighted.length;
  weighted.forEach((item) => {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    setWeight(item, base + extra);
  });
}

export function validateWeights(items) {
  const sum = totalWeight(items);
  return { valid: sum === WEIGHT_TOTAL, sum };
}

export function isBonusRule(rule) {
  return rule === "BONUS" || rule === "PENALTY";
}

/** 加分项、减分项分别累计，任一分组超过 10 分即不可保存 */
export function validateScoreTotals(items) {
  const totals = { BONUS: 0, PENALTY: 0 };
  for (const item of items || []) {
    const rule = ruleOf(item);
    if (!isBonusRule(rule)) continue;
    totals[rule] += scoreOf(item) ?? 0;
  }
  const bonusValid = totals.BONUS <= BONUS_TOTAL_MAX;
  const penaltyValid = totals.PENALTY <= BONUS_TOTAL_MAX;
  return {
    valid: bonusValid && penaltyValid,
    bonusSum: totals.BONUS,
    penaltySum: totals.PENALTY,
    bonusValid,
    penaltyValid
  };
}

/* ===== 序列化 ===== */

/**
 * 转成 updateHarnessProfile 的 profile 入参：数组、完整对象、只保留 snake_case 已知字段。
 * 结构化维度进 structured，标签化维度进 tagContent。
 */
export function toSaveArrays(items) {
  const structured = [];
  const tagContent = [];
  for (const dimension of DIMENSIONS) {
    const item = (items || []).find((x) => x?.dimension === dimension.key);
    if (!item) continue;
    const rule = ruleOf(item) || dimension.defaultRule;
    const normalized = { ...item };
    normalized.dimension = dimension.key;
    normalized.name = item.name || dimension.label;
    normalized.group = item.group || dimension.group;
    normalized.data_type = Number(item.data_type ?? dimension.dataType);
    normalized.rule_type = rule;
    normalized.weight = rule === "WEIGHT_SCORE" ? weightOf(item) : null;
    normalized.score = isBonusRule(rule) ? scoreOf(item) : null;
    const unlimited = isUnlimitedItem(item);
    normalized.display_value = unlimited ? [UNLIMITED_TEXT] : displayOf(item);
    normalized.dataTypeValue = selectedOf(item).length ? selectedOf(item) : null;
    if (unlimited) normalized.evidence = UNLIMITED_TEXT;
    delete normalized.displayValue;
    delete normalized.ruleType;
    if (dimension.structureType === STRUCTURE_TYPE.TAG) tagContent.push(normalized);
    else structured.push(normalized);
  }
  return { structured, tagContent };
}
