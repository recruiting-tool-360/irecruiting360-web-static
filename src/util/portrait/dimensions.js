/**
 * 职位画像：13 个固定评估维度。
 *
 * 约定（与后端/参考实现 ihraas 对齐）：
 *   - 只展示这 13 个，接口缺哪个就补「不限」，不允许新增/删除
 *   - structureType：1=结构化（可选 6 种规则），2=标签化（固定仅展示）
 *   - dataType：调用 /ihire/profile/knowledge/search 时传给后端的 dataType
 *   - defaultRule：接口没返回该维度时使用的默认规则类型
 */
export const WEIGHT_TOTAL = 90;
export const UNLIMITED_TEXT = "不限";

export const RULE_TYPES = [
  { value: "HARD_REQUIREMENT", label: "硬性要求" },
  { value: "VETO", label: "一票否决" },
  { value: "WEIGHT_SCORE", label: "权重评分" },
  { value: "BONUS", label: "加分项" },
  { value: "PENALTY", label: "减分项" },
  { value: "DISPLAY_ONLY", label: "仅展示" }
];

export const RULE_LABELS = RULE_TYPES.reduce((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

export const STRUCTURE_TYPE = {
  STRUCTURED: 1,
  TAG: 2
};

export const DIMENSIONS = [
  {
    key: "GENDER",
    label: "性别",
    dataType: 1,
    structureType: STRUCTURE_TYPE.STRUCTURED,
    group: "BASIC",
    source: "local-gender",
    multi: false,
    defaultRule: "DISPLAY_ONLY"
  },
  {
    key: "AGE",
    label: "年龄",
    dataType: 2,
    structureType: STRUCTURE_TYPE.STRUCTURED,
    group: "BASIC",
    source: "range-age",
    multi: false,
    defaultRule: "DISPLAY_ONLY"
  },
  {
    key: "HIGHEST_EDUCATION",
    label: "最高学历",
    dataType: 3,
    structureType: STRUCTURE_TYPE.STRUCTURED,
    group: "EDUCATION",
    source: "initialize",
    initKey: "HIGHEST_EDUCATION",
    multi: true,
    defaultRule: "WEIGHT_SCORE"
  },
  {
    key: "SCHOOL",
    label: "院校",
    dataType: 5,
    structureType: STRUCTURE_TYPE.STRUCTURED,
    group: "EDUCATION",
    source: "remote",
    multi: true,
    defaultRule: "WEIGHT_SCORE"
  },
  {
    key: "MAJOR",
    label: "专业",
    dataType: 4,
    structureType: STRUCTURE_TYPE.STRUCTURED,
    group: "EDUCATION",
    source: "remote",
    multi: true,
    defaultRule: "WEIGHT_SCORE"
  },
  {
    key: "FIRST_EDUCATION",
    label: "第一学历",
    dataType: 13,
    structureType: STRUCTURE_TYPE.STRUCTURED,
    group: "EDUCATION",
    source: "initialize",
    initKey: "FIRST_EDUCATION",
    multi: true,
    defaultRule: "WEIGHT_SCORE"
  },
  {
    key: "EXPECT_CITY",
    label: "意向工作城市",
    dataType: 6,
    structureType: STRUCTURE_TYPE.STRUCTURED,
    group: "INTENTION",
    source: "area",
    multi: true,
    defaultRule: "WEIGHT_SCORE"
  },
  {
    key: "SALARY_RANGE",
    label: "薪资范围",
    dataType: 7,
    structureType: STRUCTURE_TYPE.STRUCTURED,
    group: "INTENTION",
    source: "range-salary",
    multi: false,
    defaultRule: "WEIGHT_SCORE"
  },
  {
    key: "COMPANY_HISTORY",
    label: "历任公司",
    dataType: 8,
    structureType: STRUCTURE_TYPE.STRUCTURED,
    group: "EXPERIENCE",
    source: "remote",
    multi: true,
    defaultRule: "WEIGHT_SCORE"
  },
  {
    key: "WORK_STABILITY",
    label: "工作稳定性",
    dataType: 9,
    structureType: STRUCTURE_TYPE.STRUCTURED,
    group: "EXPERIENCE",
    source: "initialize",
    initKey: "WORK_STABILITY",
    multi: false,
    defaultRule: "WEIGHT_SCORE"
  },
  {
    key: "PROFESSIONAL_SKILLS",
    label: "专业技能",
    dataType: 10,
    structureType: STRUCTURE_TYPE.TAG,
    group: "TAG",
    source: "remote",
    multi: true,
    defaultRule: "DISPLAY_ONLY"
  },
  {
    key: "SOFT_SKILLS",
    label: "软实力要求",
    dataType: 11,
    structureType: STRUCTURE_TYPE.TAG,
    group: "TAG",
    source: "remote",
    multi: true,
    defaultRule: "DISPLAY_ONLY"
  },
  {
    key: "WORK_EXPERIENCE",
    label: "工作经历",
    dataType: 12,
    structureType: STRUCTURE_TYPE.TAG,
    group: "TAG",
    source: "remote",
    multi: true,
    defaultRule: "DISPLAY_ONLY"
  }
];

export const DIMENSION_MAP = DIMENSIONS.reduce((acc, item) => {
  acc[item.key] = item;
  return acc;
}, {});

export function getDimension(key) {
  return DIMENSION_MAP[key] || null;
}
