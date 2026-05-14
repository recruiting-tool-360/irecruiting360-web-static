/**
 * 把 `[&AI_SEARCH&]` 消息的 HTML JD 卡片解析成结构化数据
 *
 * 输入：msg.content（含自然语言前缀 + [&AI_SEARCH&] + 内联 HTML JD 卡片）
 * 输出：
 *   {
 *     position: string,
 *     location: string,
 *     experience: string,
 *     education: string,
 *     salary: string,
 *     skills: string[],            // 专业技能 chips
 *     softSkills: string[],        // 软实力要求 chips
 *     relatedExperience: string[], // 相关经历 chips
 *   }
 *
 * 解析依据 msg.content 的固定 HTML 结构（见 ChatCard.vue 第 273 行 msgYYY 示例）：
 *   - 单值字段：`<div style='font-weight: bold'>职位：</div><div style='color: #333'>...</div>`
 *   - 多值字段：`<div style='font-weight: bold'>专业技能：</div><div style='display: flex; flex-wrap: wrap'>
 *                  <div>chip1</div><div>chip2</div>...
 *                </div>`
 *
 * 解析失败（不含 [&AI_SEARCH&] / 不含 HTML 结构）→ 返回 null。
 */

/** 标签文案 → 单值字段 key */
const FIELD_MAP = {
  职位: 'position',
  工作地点: 'location',
  工作经验: 'experience',
  学历要求: 'education',
  薪资范围: 'salary'
};

/** 标签文案 → chip 数组 key */
const TAG_MAP = {
  专业技能: 'skills',
  软实力要求: 'softSkills',
  相关经历: 'relatedExperience'
};

/**
 * @param {string} content msg.content
 * @returns {object | null}
 */
export function parseAISearchJD(content) {
  if (!content || typeof content !== 'string') return null;
  const idx = content.indexOf('[&AI_SEARCH&]');
  if (idx < 0) return null;

  const after = content.slice(idx + '[&AI_SEARCH&]'.length).trim();
  const htmlStart = after.indexOf('<div');
  if (htmlStart < 0) return null;
  const html = after.slice(htmlStart);

  // 浏览器端用 DOMParser；防御性兜底
  if (typeof DOMParser === 'undefined') return null;

  let doc;
  try {
    doc = new DOMParser().parseFromString(html, 'text/html');
  } catch {
    return null;
  }

  const profile = {
    position: '',
    location: '',
    experience: '',
    education: '',
    salary: '',
    skills: [],
    softSkills: [],
    relatedExperience: []
  };

  // 找所有 inline style 含 `font-weight: bold` 的 div 当 label
  const labels = doc.querySelectorAll('div[style]');
  labels.forEach((el) => {
    const style = el.getAttribute('style') || '';
    if (!/font-weight\s*:\s*bold/i.test(style)) return;

    const labelRaw = (el.textContent || '').trim();
    // 去掉中英文冒号
    const labelText = labelRaw.replace(/[：:]+\s*$/, '').trim();

    const fieldKey = FIELD_MAP[labelText];
    const tagKey = TAG_MAP[labelText];

    if (fieldKey) {
      const valueEl = el.nextElementSibling;
      if (valueEl) {
        profile[fieldKey] = (valueEl.textContent || '').trim();
      }
      return;
    }

    if (tagKey) {
      const container = el.nextElementSibling;
      if (!container) return;
      // 容器内每个直接子 div 是一条 chip
      const chips = Array.from(container.querySelectorAll(':scope > div'));
      profile[tagKey] = chips
        .map((c) => (c.textContent || '').trim())
        .filter(Boolean);
    }
  });

  // 至少要解析到 position 才认为成功
  if (!profile.position) return null;

  return profile;
}

/** 取 [&AI_SEARCH&] 之前的自然语言描述部分（去掉前后空白） */
export function getAISearchPrefix(content) {
  if (!content || typeof content !== 'string') return '';
  const idx = content.indexOf('[&AI_SEARCH&]');
  if (idx < 0) return content.trim();
  return content.slice(0, idx).trim();
}

export default { parseAISearchJD, getAISearchPrefix };
