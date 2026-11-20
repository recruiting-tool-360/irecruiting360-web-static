# BOSS 账号权益与竞招职位权益接口字段说明

日期：2026-11-13

## 1. 文档范围

本文整理 BOSS 账号权益页和竞招职位权益页对应的两个接口，说明返回字段、页面展示映射及取值注意事项。

两个接口属于不同层级：

| 接口 | 层级 | 页面用途 |
| --- | --- | --- |
| `/wapi/zpblock/privilege/my/detail` | 账号级 | 我的权益、权益使用量 |
| `/wapi/zpblock/privilege/paid/detail?page=1&business=9&type=0` | 职位级 | 单个竞招职位的权益详情 |

账号级数据用于汇总展示，职位级数据用于具体职位卡片，两者不能互相覆盖。

## 2. 接口概览

### 2.1 账号权益接口

```http
GET /wapi/zpblock/privilege/my/detail?_t=<timestamp>
```

接口返回账号当前的权益状态和权益使用量，主要字段位于：

```text
zpData.currentPrivilegeUsed
zpData.otherPrivilegeUsed
zpData.privilegeRightsTable
```

### 2.2 竞招职位权益接口

```http
GET /wapi/zpblock/privilege/paid/detail?page=1&business=9&type=0
```

参数说明：

| 参数 | 说明 |
| --- | --- |
| `page` | 分页页码 |
| `business=9` | 查询竞招职位权益 |
| `type=0` | 页面查询类型 |

接口返回购买或已开通的竞招职位列表，主要字段位于：

```text
zpData.jobPrivilegeList
```

## 3. 账号权益接口字段

### 3.1 权益类型映射

`zpData.currentPrivilegeUsed.privileges` 是账号权益使用量数组。

| `countType` | 权益名称 | 用途 |
| --- | --- | --- |
| `1` | 今日查看权益消耗 | 查看权益已用量和上限 |
| `2` | 今日沟通权益消耗 | 沟通权益已用量和上限 |
| `4` | 在线普通职位 | 在线普通职位权益已用量和上限 |
| `7` | 在线竞招职位 | 在线竞招职位权益已用量和上限 |

推荐使用 `countType` 识别权益类型，不要只依赖中文 `name`。

### 3.2 数量字段

账号权益数量目前是展示字符串，没有独立数字字段。

| 字段 | 类型 | 说明 | 示例 |
| --- | --- | --- | --- |
| `used` | `string` | 已消耗数量 | `"0个"` |
| `limit` | `string` | 权益上限 | `"共20个"` |
| `usedCount` | `string` | 拼接后的展示文本 | `"0个（共20个）"` |

页面可以直接展示 `usedCount`；需要计算进度时，需要先把 `used` 和 `limit` 中的数字解析出来。

### 3.3 当前样本

| 权益 | `countType` | `used` | `limit` | `usedCount` |
| --- | ---: | --- | --- | --- |
| 今日查看权益消耗 | `1` | `"0个"` | `"共20个"` | `"0个（共20个）"` |
| 今日沟通权益消耗 | `2` | `"0个"` | `"共3个"` | `"0个（共3个）"` |
| 在线竞招职位 | `7` | `"0个"` | `"共0个"` | `"0个（共0个）"` |
| 在线普通职位 | `4` | `"0个"` | `"共26个"` | `"0个（共26个）"` |

### 3.4 其他权益使用量

账号页“其他权益使用量”中的竞招职位数量位于：

```text
zpData.otherPrivilegeUsed.privileges
```

当前样本：

| 字段 | 值 | 说明 |
| --- | --- | --- |
| `name` | `"竞招职位"` | 展示名称 |
| `usedCount` | `"1"` | 页面展示数量 |
| `used` | `null` | 没有单独已用量 |
| `limit` | `null` | 没有权益上限 |
| `business` | `9` | 竞招职位业务类型 |
| `countType` | `0` | 不用于识别账号基础权益 |

`zpData.onlineJobCount` 是顶层在线职位数量字段。当前样本值为 `1`，但它不能替代 `countType=7` 的在线竞招职位权益用量。需要展示账号页“在线竞招职位”已用量和上限时，仍应读取：

```text
zpData.currentPrivilegeUsed.privileges[countType=7]
```

### 3.5 权益对比表

`zpData.privilegeRightsTable.cols` 保存“基础权益”和“VIP账号”的对比数据。

| 列索引 | 列标题 | 用途 |
| ---: | --- | --- |
| `0` | 权益类型 | 行名称 |
| `1` | 基础权益 | 基础权益值 |
| `2` | VIP账号 | VIP 权益值 |

当前样本的行顺序：

| 行索引 | 权益类型 | 基础权益 | VIP账号 |
| ---: | --- | --- | --- |
| `0` | 在线竞招职位 | `0个` | `3个（0+3）` |
| `1` | 每日查看总量 | `20个` | `120个（20+100）` |
| `2` | 每日沟通总量 | `3个` | `60个（3+57）` |
| `3` | 查看沟通使用范围 | `非集招职位` | `非集招职位` |
| `4` | 特权数 | `0个` | `12个` |

如果后续存在动态行，应先读取 `cols[0].colValues` 中的名称，再按名称匹配行。

## 4. 竞招职位权益接口字段

### 4.1 职位列表

`zpData.jobPrivilegeList` 中每个对象代表一个竞招职位。

| 字段 | 类型 | 页面用途 |
| --- | --- | --- |
| `positionName` | `string` | 职位名称 |
| `jobStatus` | `number` | 职位状态 |
| `jobPriceTypeDescList` | `array<string>` | 版本和到期时间 |
| `jobDayUsedPrivilegeList` | `array<object>` | 职位权益使用明细 |
| `jobDetailUrl` | `string` | 职位详情跳转链接 |

当前样本中的页面映射：

| 页面内容 | 字段 |
| --- | --- |
| 页面标题“竞招职位” | `zpData.headTitle` |
| “竞招职位-产品经理” | `jobPrivilegeList[].positionName` |
| “招聘中” | `jobPrivilegeList[].jobStatus` |
| “基础版 2027.01.08 到期” | `jobPrivilegeList[].jobPriceTypeDescList` |

当前样本中 `jobStatus=0` 对应“招聘中”。该枚举需要结合更多状态样本确认，生产代码不应只根据这一个样本扩展完整状态映射。

`jobPriceTypeDescList` 是数组，展示时应遍历全部内容，不要固定只取 `[0]`。

### 4.2 单个职位的权益明细

职位卡片中的曝光、回聊、查看和沟通数据都位于：

```text
zpData.jobPrivilegeList[].jobDayUsedPrivilegeList
```

通用字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `privilegeDesc` | `string` | 权益名称 |
| `privilegeCount` | `number` | 权益总量 |
| `privilegeUsedCount` | `number` | 已使用数量 |
| `privilegeUnit` | `string/null` | 单位，例如“次” |
| `style` | `number` | 展示样式 |
| `iconClass` | `string` | 图标标识 |

当前样本映射：

| 页面项目 | `privilegeUsedCount` | `privilegeCount` | 页面展示 |
| --- | ---: | ---: | --- |
| 累计曝光数 | `2539` | `0` | `2539次` |
| 今日消耗回聊权益 | `2` | `10` | `2/10` |
| 今日消耗查看权益 | `11` | `20` | `11/20` |
| 今日消耗沟通权益 | `0` | `10` | `0/10` |

图标映射：

| `iconClass` | 权益 |
| --- | --- |
| `icon_taiyang` | 累计曝光数 |
| `icon_jinrixiaohaohuifuquanyi` | 今日消耗回聊权益 |
| `icon_view` | 今日消耗查看权益 |
| `icon_vip_meirigoutongzongliang` | 今日消耗沟通权益 |

### 4.3 展示规则

`style=1` 表示累计量，当前样本用于累计曝光数：

```text
展示值 = privilegeUsedCount + privilegeUnit
```

例如：

```text
2539 + "次" = "2539次"
```

累计量没有有效总量，不需要计算进度条。

`style=0` 表示额度消耗，当前样本用于回聊、查看和沟通：

```text
展示值 = privilegeUsedCount + "/" + privilegeCount
进度 = privilegeUsedCount / privilegeCount
```

例如：

```text
11 + "/" + 20 = "11/20"
11 / 20 = 55%
```

当 `privilegeCount` 为 `0` 时，应避免除零，并隐藏或禁用进度条。

## 5. 容易混淆的字段

竞招职位外层对象还有以下字段：

```text
browseCount
contactCount
browseTimes
exposureCount
```

当前样本中这些字段均为 `0`，但页面显示的累计曝光数为 `2539`。因此当前职位卡片不能使用外层 `exposureCount` 等字段生成权益明细，应使用 `jobDayUsedPrivilegeList`。

两个接口中的同名称权益也可能代表不同统计范围：

| 场景 | 数据范围 | 推荐字段 |
| --- | --- | --- |
| 账号权益汇总 | 账号级 | `currentPrivilegeUsed.privileges` |
| 单个竞招职位详情 | 职位级 | `jobPrivilegeList[].jobDayUsedPrivilegeList` |

例如账号接口样本为查看 `0/20`、沟通 `0/3`，竞招职位接口样本为查看 `11/20`、沟通 `0/10`。两处数据分别服务于账号汇总和具体职位，不能直接判定为同一数据或互相覆盖。

## 6. 推荐取值逻辑

账号级权益：

```js
const accountPrivileges = data.zpData.currentPrivilegeUsed.privileges;

const viewPrivilege = accountPrivileges.find(
  (item) => item.countType === 1
);
const chatPrivilege = accountPrivileges.find(
  (item) => item.countType === 2
);
const onlineCompetitiveJobPrivilege = accountPrivileges.find(
  (item) => item.countType === 7
);
```

账号页“其他权益使用量”中的竞招职位：

```js
const otherPrivileges = data.zpData.otherPrivilegeUsed.privileges;
const competitiveJobPrivilege = otherPrivileges.find(
  (item) => item.business === 9
);
```

竞招职位列表和职位级明细：

```js
const jobs = data.zpData.jobPrivilegeList;

const jobUsage = jobs[0]?.jobDayUsedPrivilegeList ?? [];
const exposure = jobUsage.find(
  (item) => item.privilegeDesc === "累计曝光数"
);
const reply = jobUsage.find(
  (item) => item.privilegeDesc === "今日消耗回聊权益"
);
const view = jobUsage.find(
  (item) => item.privilegeDesc === "今日消耗查看权益"
);
const chat = jobUsage.find(
  (item) => item.privilegeDesc === "今日消耗沟通权益"
);
```

`jobDayUsedPrivilegeList` 没有 `countType` 或 `business` 字段。当前可以使用 `privilegeDesc` 或 `iconClass` 匹配具体权益，并保留找不到时的降级展示。

## 7. 边界与待确认事项

1. 账号权益数量是带单位的字符串，需要展示原文或自行解析数字。
2. `jobPrivilegeList` 是分页列表，当前返回中没有总数字段；`jobPrivilegeList.length` 只能表示当前页职位数量。
3. `jobStatus=0` 对应“招聘中”的结论只基于当前样本，其他状态需要补充样本后再整理。
4. `onlineJobCount` 的完整业务语义需要继续确认，不应替代账号级竞招职位权益字段。
5. 竞招职位权益明细优先读取 `jobDayUsedPrivilegeList`，不要使用外层全为 `0` 的汇总字段。
6. 文档示例不保存账号 UID、职位 ID、`securityId`、Cookie、Token 等敏感信息。

## 8. 相关文档

- [BOSS 职位权益类型识别](./boss-job-rights-classification.md)
