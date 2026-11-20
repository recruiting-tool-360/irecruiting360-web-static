# BOSS 职位权益类型识别

## 1. 背景

BOSS 职位列表中，不同来源的职位对应不同的权益消耗方式：

- 普通账号单独购买的职位，消耗该职位自身的购买权益。
- VIP 账号创建的职位，消耗当前账号的 VIP 权益。

当前需求只需要区分职位权益来源，不需要区分急聘、优先曝光等具体权益类型。

## 2. 分类结果

| 分类 | 含义 |
|---|---|
| `PURCHASED` | 单独购买的职位，查看职位自身的权益消耗详情 |
| `VIP_CREATED` | VIP 账号创建的职位，查看当前账号的权益消耗 |
| `CLOSED` | 职位未开放 |
| `UNKNOWN` | 字段缺失、URL 无法解析或页面路径未识别 |

## 3. 核心判断字段

使用职位对象中的 `viewRightsUrl`。

该字段是 `bosszp://` 深链，真正的权益页面地址经过 URL 编码后放在 `h5url` 参数中。

解析 `h5url` 后，根据内层路径判断：

| `h5url` 内层路径 | 分类 |
|---|---|
| `/mpa/html/vip/paid_rights_use` | `PURCHASED` |
| `/mpa/v3/html/vip/privilege/boss` | `VIP_CREATED` |

业务含义：

- `/vip/paid_rights_use`：单个购买职位的权益消耗详情。
- `/vip/privilege/boss`：当前账号的权益消耗详情。

## 4. URL 解析

示例一，单独购买职位：

```text
bosszp://bosszhipin.pc/openPage?type=openRightH5&h5url=https%3A%2F%2Fm.zhipin.com%2Fmpa%2Fhtml%2Fvip%2Fpaid_rights_use%3Fbusiness%3D9%26type%3D0%26from%3DnativePc&ba=...
```

解码后的 `h5url`：

```text
https://m.zhipin.com/mpa/html/vip/paid_rights_use?business=9&type=0&from=nativePc
```

示例二，VIP 账号创建：

```text
bosszp://bosszhipin.pc/openPage?type=openRightH5&h5url=https%3A%2F%2Fm.zhipin.com%2Fmpa%2Fv3%2Fhtml%2Fvip%2Fprivilege%2Fboss%3Ffrom%3D0%26tab%3D1%26newFrom%3D%26anchor%3D&ba=...
```

解码后的 `h5url`：

```text
https://m.zhipin.com/mpa/v3/html/vip/privilege/boss?from=0&tab=1&newFrom=&anchor=
```

## 5. 推荐实现

```js
const BOSS_RIGHTS_SOURCE = Object.freeze({
  PURCHASED: "PURCHASED",
  VIP_CREATED: "VIP_CREATED",
  CLOSED: "CLOSED",
  UNKNOWN: "UNKNOWN"
});

function parseBossRightsSource(viewRightsUrl) {
  if (!viewRightsUrl) {
    return BOSS_RIGHTS_SOURCE.UNKNOWN;
  }

  try {
    const outer = new URL(viewRightsUrl);
    const h5url = outer.searchParams.get("h5url");

    if (!h5url) {
      return BOSS_RIGHTS_SOURCE.UNKNOWN;
    }

    const inner = new URL(h5url);
    const pathname = inner.pathname;

    if (pathname.includes("/vip/paid_rights_use")) {
      return BOSS_RIGHTS_SOURCE.PURCHASED;
    }

    if (pathname.includes("/vip/privilege/boss")) {
      return BOSS_RIGHTS_SOURCE.VIP_CREATED;
    }

    return BOSS_RIGHTS_SOURCE.UNKNOWN;
  } catch (error) {
    return BOSS_RIGHTS_SOURCE.UNKNOWN;
  }
}

function classifyBossJob(job) {
  const isOpen =
    Number(job?.jobStatus) === 0 ||
    Number(job?.jobStatus) === 2;

  if (!isOpen) {
    return BOSS_RIGHTS_SOURCE.CLOSED;
  }

  return parseBossRightsSource(job?.viewRightsUrl);
}
```

也可以额外返回 `h5url` 和路径，便于日志排查：

```js
function parseBossRightsPage(viewRightsUrl) {
  const result = {
    rightsSource: BOSS_RIGHTS_SOURCE.UNKNOWN,
    h5url: null,
    pathname: null
  };

  if (!viewRightsUrl) return result;

  try {
    const outer = new URL(viewRightsUrl);
    const h5url = outer.searchParams.get("h5url");

    if (!h5url) return result;

    const inner = new URL(h5url);
    result.h5url = h5url;
    result.pathname = inner.pathname;

    if (inner.pathname.includes("/vip/paid_rights_use")) {
      result.rightsSource = BOSS_RIGHTS_SOURCE.PURCHASED;
    } else if (inner.pathname.includes("/vip/privilege/boss")) {
      result.rightsSource = BOSS_RIGHTS_SOURCE.VIP_CREATED;
    }
  } catch (error) {
    // 保持 UNKNOWN，调用方按未知权益处理
  }

  return result;
}
```

## 6. 字段使用说明

以下字段可以帮助展示或排查，但不适合作为购买/VIP 来源的主判断：

| 字段 | 说明 |
|---|---|
| `paidJobEndDate` | 职位有效结束日期，购买职位和 VIP 职位都可能存在 |
| `jobWebStatus` | 通常与 `paidJobEndDate` 对应，表示有效期状态 |
| `remainDays` | 剩余有效天数，不能区分购买和 VIP |
| `hotPayStatus` | 付费或热门相关状态，可辅助观察，不作为主判断 |
| `showQuickTop` | 是否展示急聘/置顶能力，不属于当前分类需求 |
| `quickTopType` | 急聘/曝光类型，不属于当前分类需求 |
| `jobWebBar`、`jobWebBtn` | 页面操作入口，可能随产品策略变化 |

`ba.action` 在两个示例中相同：

```text
Boss-activity-jobmanagement-surplus-right-click
```

因此不能用 `ba.action` 区分购买职位和 VIP 职位。`ba.uid` 是账号维度信息，只适合排查，不适合当前职位权益分类。

## 7. 结果落库建议

建议持久化以下字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `rightsSource` | string | `PURCHASED / VIP_CREATED / CLOSED / UNKNOWN` |
| `viewRightsUrl` | string | BOSS 返回的原始深链 |
| `rightsH5Url` | string | 解析后的内层 H5 URL |
| `rightsPagePath` | string | 内层页面路径 |
| `rightsClassifiedAt` | number | 分类时间戳，便于后续复核 |

## 8. 边界条件

1. 职位未开放时返回 `CLOSED`。
2. `viewRightsUrl` 为空时返回 `UNKNOWN`，不要默认归入 `PURCHASED` 或 `VIP_CREATED`。
3. `h5url` 解析失败时返回 `UNKNOWN`，并保留原始 URL 便于排查。
4. 页面路径判断使用 `includes`，避免 BOSS 调整路径版本后立即失效。
5. URL 可能被单次 URL 编码，使用 `URL.searchParams` 获取 `h5url`，不要再手动多次 `decodeURIComponent`。
6. 如果后续出现新的权益页面路径，应先补充样本和路径映射，再纳入自动分类。

## 9. 当前样本结论

| 职位 | 内层路径 | 分类 |
|---|---|---|
| 产品经理 | `/vip/paid_rights_use` | `PURCHASED` |
| 后端开发工程师(10316) | `/vip/privilege/boss` | `VIP_CREATED` |

## 10. 待验证事项

当前结论基于两个明确样本和业务语义。后续建议验证：

1. 同一账号下有多个开放职位时，`viewRightsUrl` 是否随职位权益来源变化。
2. VIP 账号是否也会单独购买某个职位，以及此时返回哪个权益路径。
3. 单独购买职位在关闭后是否仍保留 `viewRightsUrl`。
4. BOSS 路径版本升级后，是否继续使用 `paid_rights_use` 和 `privilege/boss`。
