import { DIMENSIONS, STRUCTURE_TYPE } from "./dimensions";

/**
 * 老数据兼容：`harnessPositionProfile.profile` 还没返回时，用 `[&AI_SEARCH&]`
 * 里解析出来的老结构（parseAISearchJD 返回值）映射成 13 维画像。
 *
 * 只映射语义能对上的字段，映射不到的维度交给 normalizeProfile 补「不限」。
 * 这里产出的 display_value 没有 dataTypeValue（老数据本来就没有 id）。
 */
const LEGACY_VALUE_GETTERS = {
  EXPECT_CITY: (p) => p.location,
  HIGHEST_EDUCATION: (p) => p.education,
  SALARY_RANGE: (p) => p.salary,
  SCHOOL: (p) => p.school,
  GENDER: (p) => p.gender,
  MAJOR: (p) => p.major,
  AGE: (p) => p.age,
  PROFESSIONAL_SKILLS: (p) => p.skills,
  SOFT_SKILLS: (p) => p.softSkills,
  // 老结构的「相关经历」在语义上对应标签化的「工作经历」
  WORK_EXPERIENCE: (p) => p.relatedExperience
};

export function legacyProfileFromParsed(parsed) {
  if (!parsed) return null;
  const structuredContent = [];
  const tagContent = [];

  for (const dimension of DIMENSIONS) {
    const getter = LEGACY_VALUE_GETTERS[dimension.key];
    if (!getter) continue;
    const raw = getter(parsed);
    const values = (Array.isArray(raw) ? raw : [raw])
      .map((v) => String(v ?? "").trim())
      .filter(Boolean);
    if (values.length === 0) continue;

    const item = {
      dimension: dimension.key,
      name: dimension.label,
      group: dimension.group,
      data_type: dimension.dataType,
      rule_type: dimension.defaultRule,
      weight: dimension.defaultRule === "WEIGHT_SCORE" ? 10 : null,
      sensitive: false,
      evidence: null,
      rule_text: null,
      display_value: values,
      dataTypeValue: null
    };
    if (dimension.structureType === STRUCTURE_TYPE.TAG) tagContent.push(item);
    else structuredContent.push(item);
  }

  if (structuredContent.length === 0 && tagContent.length === 0) return null;
  return { structuredContent, tagContent };
}
