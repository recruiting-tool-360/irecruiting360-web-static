# AI 寻聘助手 V2.1 后端 DDL 与回退 SQL

## 执行顺序

| 顺序 | SQL 范围 | 执行时点 |
|---|---|---|
| 1 | `1.1`、`1.3`、`2.2` | 现在可执行 |
| 2 | `1.2` | 新代码全量发布且旧实例全部停止后执行 |
| 3 | `1.4`、`2.3` | 代码回滚并处理完新功能产生的数据后执行 |

## 1. i快招后端

### 1.1 现有表修改 SQL

```sql
ALTER TABLE `search_task`
  ADD COLUMN `task_kind` varchar(16) NOT NULL DEFAULT 'SEARCH'
    COMMENT '任务类型：SEARCH/REPLY',
  ADD COLUMN `task_scope_key` varchar(160) DEFAULT NULL
    COMMENT '任务幂等范围键',
  ADD COLUMN `channel_account_id` varchar(64) DEFAULT NULL
    COMMENT '渠道账号ID',
  ADD COLUMN `external_company_id` varchar(128) DEFAULT NULL
    COMMENT '渠道公司ID',
  ADD COLUMN `day_plan_id` varchar(64) DEFAULT NULL
    COMMENT '业务日计划ID',
  ADD COLUMN `headcount_id` bigint DEFAULT NULL
    COMMENT '系统职位ID',
  ADD COLUMN `business_date` date DEFAULT NULL
    COMMENT '业务日期',
  ADD COLUMN `config_snapshot_json` json DEFAULT NULL
    COMMENT '任务配置快照',
  ADD COLUMN `lease_owner` varchar(64) DEFAULT NULL
    COMMENT '任务租约持有者：clientSessionId',
  ADD COLUMN `lease_epoch` bigint NOT NULL DEFAULT 0
    COMMENT '任务租约代次',
  ADD COLUMN `lease_expires_at` datetime(3) DEFAULT NULL
    COMMENT '任务租约过期时间';

ALTER TABLE `search_task_channel`
  ADD COLUMN `external_job_id` varchar(128) DEFAULT NULL
    COMMENT '渠道职位ID',
  ADD COLUMN `execution_snapshot_json` json DEFAULT NULL
    COMMENT '手动搜索职位执行快照',
  ADD COLUMN `scan_cursor_json` json DEFAULT NULL
    COMMENT '预筛游标与幂等状态',
  ADD COLUMN `prefilter_total_count` int unsigned NOT NULL DEFAULT 0
    COMMENT '进入列表预筛的候选人累计数',
  MODIFY COLUMN `search_condition_id` bigint DEFAULT NULL
    COMMENT '搜索条件ID；回复任务职位执行单元为空';

ALTER TABLE `search_task_channel`
  ADD UNIQUE KEY `uk_task_channel_scope`
    (`search_task_id`, `external_job_id`),
  ADD KEY `idx_task_business_channel`
    (`search_task_id`, `business_channel`, `channel_sub_type`);

ALTER TABLE `condition_resume`
  ADD COLUMN `score_batch_no` int NOT NULL DEFAULT 0
    COMMENT '候选人所属评分批次号',
  ADD COLUMN `communication_type` tinyint DEFAULT NULL
    COMMENT '沟通类型：NULL未沟通；0自动；1手动';

UPDATE `condition_resume`
SET `communication_type` = 1
WHERE `immediate_chat_flag` = 1
  AND `communication_type` IS NULL;

ALTER TABLE `resume_score_record`
  ADD COLUMN `reply_candidate_id` bigint unsigned DEFAULT NULL
    COMMENT '回复候选人ID，对应reply_task_candidate.id',
  ADD KEY `idx_reply_candidate` (`reply_candidate_id`);
```

### 1.2 新代码发布后执行 SQL

```sql
UPDATE `search_task`
SET `task_kind` = 'SEARCH',
    `task_scope_key` = CONCAT('LEGACY:', `id`)
WHERE `task_kind` = 'SEARCH'
  AND (`task_scope_key` IS NULL OR `task_scope_key` = '');

ALTER TABLE `search_task`
  MODIFY COLUMN `task_scope_key` varchar(160) NOT NULL
    COMMENT '任务幂等范围键',
  ADD UNIQUE KEY `uk_task_scope`
    (`business_date`, `task_kind`, `channel_account_id`, `task_scope_key`);

ALTER TABLE `search_task_channel`
  DROP INDEX `uk_task_channel`;
```

### 1.3 新增表 SQL

```sql
CREATE TABLE `ai_client_instance` (
  `client_instance_id` varchar(64) NOT NULL COMMENT '客户端安装实例ID',
  `tenant_id` bigint NOT NULL COMMENT 'i快招租户ID',
  `company_id` varchar(64) NOT NULL COMMENT '招聘企业ID',
  `user_id` bigint DEFAULT NULL COMMENT '最近使用用户ID',
  `device_id` varchar(128) DEFAULT NULL COMMENT '脱敏设备标识',
  `app_version` varchar(32) DEFAULT NULL COMMENT '客户端版本',
  `platform` varchar(16) DEFAULT NULL COMMENT '客户端平台',
  `capability_json` json DEFAULT NULL COMMENT '客户端能力声明',
  `first_seen_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '首次注册时间',
  `last_seen_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '最近活跃时间',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (`tenant_id`, `company_id`, `client_instance_id`),
  KEY `idx_tenant_company_device` (`tenant_id`, `company_id`, `device_id`),
  KEY `idx_last_seen` (`last_seen_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='客户端安装实例';

CREATE TABLE `ai_client_session` (
  `id` char(36) NOT NULL COMMENT '客户端会话ID',
  `client_instance_id` varchar(64) NOT NULL COMMENT '客户端安装实例ID',
  `open_request_id` varchar(64) DEFAULT NULL COMMENT '会话创建幂等请求ID',
  `tenant_id` bigint NOT NULL COMMENT 'i快招租户ID',
  `company_id` varchar(64) NOT NULL COMMENT '招聘企业ID',
  `user_id` bigint NOT NULL COMMENT 'i快招用户ID',
  `session_epoch` bigint NOT NULL DEFAULT 1 COMMENT '会话隔离版本',
  `channel_state_version` bigint NOT NULL DEFAULT 0 COMMENT '渠道状态版本',
  `channel_code` varchar(32) NOT NULL DEFAULT 'BOSS' COMMENT '渠道编码',
  `channel_account_id` varchar(64) DEFAULT NULL COMMENT '渠道账号ID',
  `external_user_id` varchar(128) DEFAULT NULL COMMENT '渠道账号原始ID',
  `external_company_id` varchar(128) DEFAULT NULL COMMENT '渠道公司ID',
  `active_owner_key` char(64) DEFAULT NULL COMMENT '活动执行互斥键',
  `channel_login_state` varchar(24) NOT NULL DEFAULT 'UNKNOWN' COMMENT '渠道登录状态',
  `state` varchar(32) NOT NULL DEFAULT 'SSO_AUTHENTICATED' COMMENT '客户端及渠道执行状态',
  `adapter_version` varchar(32) DEFAULT NULL COMMENT '渠道适配器版本',
  `job_snapshot_version` bigint NOT NULL DEFAULT 0 COMMENT '完整职位列表同步版本',
  `current_task_id` varchar(64) DEFAULT NULL COMMENT '当前任务ID',
  `current_task_lease_epoch` bigint DEFAULT NULL COMMENT '当前任务租约代次',
  `last_heartbeat_at` datetime(3) DEFAULT NULL COMMENT '最近心跳时间',
  `started_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '会话开始时间',
  `closed_at` datetime(3) DEFAULT NULL COMMENT '会话关闭时间',
  `close_reason` varchar(128) DEFAULT NULL COMMENT '会话关闭原因',
  `last_error_code` varchar(64) DEFAULT NULL COMMENT '最近错误码',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_open_request` (`open_request_id`),
  UNIQUE KEY `uk_active_owner` (`active_owner_key`),
  KEY `idx_tenant_company_user_state` (`tenant_id`, `company_id`, `user_id`, `state`),
  KEY `idx_company_instance_started` (`tenant_id`, `company_id`, `client_instance_id`, `started_at`),
  KEY `idx_channel_account` (`company_id`, `channel_code`, `channel_account_id`, `state`),
  KEY `idx_heartbeat` (`last_heartbeat_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='客户端运行会话';

CREATE TABLE `channel_account` (
  `id` varchar(64) NOT NULL COMMENT '渠道账号ID',
  `tenant_id` bigint NOT NULL COMMENT 'i快招租户ID',
  `company_id` varchar(64) NOT NULL COMMENT '招聘企业ID',
  `channel_code` varchar(32) NOT NULL COMMENT '渠道编码',
  `external_user_id` varchar(128) NOT NULL COMMENT '渠道账号稳定ID',
  `display_name` varchar(128) DEFAULT NULL COMMENT '渠道账号展示名',
  `external_company_id` varchar(128) DEFAULT NULL COMMENT '渠道公司ID',
  `external_company_name` varchar(255) DEFAULT NULL COMMENT '渠道公司名称',
  `account_status` varchar(24) NOT NULL DEFAULT 'UNKNOWN' COMMENT '账号状态',
  `identity_verified` tinyint NOT NULL DEFAULT 0 COMMENT '身份是否已验证',
  `capability_json` json DEFAULT NULL COMMENT '账号能力声明',
  `rights_source` varchar(32) NOT NULL DEFAULT 'UNKNOWN' COMMENT '账号权益来源',
  `communication_quota_total` int unsigned DEFAULT NULL COMMENT '账号沟通权益总量',
  `communication_quota_used` int unsigned DEFAULT NULL COMMENT '账号沟通权益已用量',
  `communication_quota_remaining` int unsigned DEFAULT NULL COMMENT '账号沟通权益剩余量',
  `quota_confidence` varchar(16) NOT NULL DEFAULT 'UNKNOWN' COMMENT '权益置信度',
  `business_date` date DEFAULT NULL COMMENT '权益业务日',
  `allocation_batch_no` int NOT NULL DEFAULT 0 COMMENT '权益分配批次',
  `collect_status` varchar(24) NOT NULL DEFAULT 'FAILED' COMMENT '采集状态',
  `job_snapshot_version` bigint NOT NULL DEFAULT 0 COMMENT '完整职位列表同步版本',
  `source_client_session_id` char(36) DEFAULT NULL COMMENT '采集来源客户端会话ID',
  `source_version` bigint NOT NULL DEFAULT 0 COMMENT '账号聚合版本',
  `entitlement_captured_at` datetime(3) DEFAULT NULL COMMENT '权益采集时间',
  `last_job_sync_sent_at` datetime(3) DEFAULT NULL COMMENT '职位列表事件发送时间',
  `channel_ext_json` json DEFAULT NULL COMMENT '渠道扩展数据',
  `ext_schema_version` int NOT NULL DEFAULT 1 COMMENT '扩展数据结构版本',
  `adapter_version` varchar(32) DEFAULT NULL COMMENT '渠道适配器版本',
  `first_seen_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '首次识别时间',
  `last_seen_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '最近识别时间',
  `valid` tinyint NOT NULL DEFAULT 1 COMMENT '是否有效',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_company_channel_external_user` (`tenant_id`, `company_id`, `channel_code`, `external_user_id`),
  KEY `idx_company_channel_status` (`tenant_id`, `company_id`, `channel_code`, `account_status`, `valid`),
  KEY `idx_last_seen` (`channel_code`, `last_seen_at`),
  KEY `idx_job_snapshot_version` (`tenant_id`, `company_id`, `channel_code`, `job_snapshot_version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='渠道账号当前态';
```

```sql
CREATE TABLE `ai_recruit_day_plan` (
  `id` varchar(64) NOT NULL COMMENT '日计划ID',
  `tenant_id` bigint NOT NULL COMMENT 'i快招租户ID',
  `company_id` varchar(64) NOT NULL COMMENT '招聘企业ID',
  `channel_code` varchar(32) NOT NULL COMMENT '渠道编码',
  `channel_account_id` varchar(64) NOT NULL COMMENT '渠道账号ID',
  `external_company_id` varchar(128) NOT NULL COMMENT '渠道公司ID',
  `owner_client_session_id` char(36) DEFAULT NULL COMMENT '当前执行客户端会话ID',
  `business_date` date NOT NULL COMMENT '业务日期',
  `plan_version` bigint NOT NULL DEFAULT 1 COMMENT '日计划版本',
  `execution_context_version` bigint NOT NULL DEFAULT 0 COMMENT '执行上下文版本',
  `status` varchar(32) NOT NULL DEFAULT 'CREATED' COMMENT '日计划状态',
  `execution_context_json` json NOT NULL COMMENT '自动任务职位执行上下文',
  `position_order_json` json NOT NULL COMMENT '自动任务职位执行顺序',
  `current_search_task_id` varchar(64) DEFAULT NULL COMMENT '当前搜索任务ID',
  `current_reply_task_id` varchar(64) DEFAULT NULL COMMENT '当前回复任务ID',
  `next_reply_at` datetime(3) DEFAULT NULL COMMENT '下次回复任务触发时间',
  `started_at` datetime(3) DEFAULT NULL COMMENT '计划开始执行时间',
  `search_completed_at` datetime(3) DEFAULT NULL COMMENT '自动搜索完成时间',
  `completed_at` datetime(3) DEFAULT NULL COMMENT '计划完成时间',
  `last_error_code` varchar(64) DEFAULT NULL COMMENT '最近错误码',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_company_channel_account_date`
    (`tenant_id`, `company_id`, `channel_code`, `channel_account_id`, `external_company_id`, `business_date`),
  KEY `idx_day_plan_owner` (`owner_client_session_id`, `status`),
  KEY `idx_day_plan_due` (`status`, `next_reply_at`),
  KEY `idx_day_plan_company_date` (`company_id`, `business_date`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='渠道账号业务日执行计划';

CREATE TABLE `reply_task_candidate` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `company_id` varchar(64) NOT NULL COMMENT '招聘企业ID',
  `search_task_id` bigint NOT NULL COMMENT '回复任务ID',
  `search_task_channel_id` bigint NOT NULL COMMENT '任务职位执行单元ID',
  `conversation_id` varchar(128) NOT NULL COMMENT '渠道会话ID',
  `candidate_ref` varchar(128) DEFAULT NULL COMMENT '脱敏候选人引用',
  `result_status` varchar(32) NOT NULL COMMENT '回复处理状态',
  `action_state_json` json DEFAULT NULL COMMENT '回复动作状态',
  `resume_blind_id` bigint DEFAULT NULL COMMENT '简历摘要ID',
  `latest_resume_detail_id` bigint DEFAULT NULL COMMENT '最新附件详情ID',
  `resume_file_id` varchar(128) DEFAULT NULL COMMENT '附件文件ID',
  `detail_status` varchar(32) DEFAULT NULL COMMENT '附件处理状态',
  `score` decimal(5,2) DEFAULT NULL COMMENT '最近评分',
  `score_json` json DEFAULT NULL COMMENT '最近评分摘要',
  `score_record_id` bigint DEFAULT NULL COMMENT '最近评分记录ID',
  `import_status` varchar(32) DEFAULT NULL COMMENT '导入状态',
  `import_result_json` json DEFAULT NULL COMMENT '导入结果',
  `last_action_at` datetime(3) DEFAULT NULL COMMENT '最近动作完成时间',
  `error_code` varchar(64) DEFAULT NULL COMMENT '错误码',
  `error_message` varchar(1024) DEFAULT NULL COMMENT '错误摘要',
  `valid` tinyint NOT NULL DEFAULT 1 COMMENT '是否有效',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_reply_candidate`
    (`company_id`, `search_task_id`, `search_task_channel_id`, `conversation_id`),
  KEY `idx_reply_task_status` (`company_id`, `search_task_id`, `result_status`, `update_time`),
  KEY `idx_reply_job_status` (`company_id`, `search_task_channel_id`, `result_status`, `update_time`),
  KEY `idx_reply_resume_blind` (`resume_blind_id`),
  KEY `idx_reply_latest_detail` (`latest_resume_detail_id`),
  KEY `idx_reply_score_record` (`score_record_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='回复任务候选人当前态';

CREATE TABLE `sync_outbox` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `event_id` char(36) NOT NULL COMMENT '事件ID',
  `event_type` varchar(64) NOT NULL COMMENT '事件类型',
  `aggregate_type` varchar(64) NOT NULL COMMENT '聚合类型',
  `aggregate_id` varchar(64) NOT NULL COMMENT '聚合业务ID',
  `aggregate_version` bigint NOT NULL COMMENT '聚合版本',
  `trace_id` varchar(64) NOT NULL COMMENT '链路追踪ID',
  `payload_json` json NOT NULL COMMENT '事件载荷',
  `status` varchar(24) NOT NULL DEFAULT 'PENDING' COMMENT '投递状态',
  `retry_count` int unsigned NOT NULL DEFAULT 0 COMMENT '重试次数',
  `next_retry_at` datetime(3) DEFAULT NULL COMMENT '下次重试时间',
  `last_error` varchar(1024) DEFAULT NULL COMMENT '最近错误摘要',
  `sent_at` datetime(3) DEFAULT NULL COMMENT '投递成功时间',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sync_outbox_event` (`event_id`),
  KEY `idx_dispatch` (`status`, `next_retry_at`),
  KEY `idx_aggregate` (`aggregate_type`, `aggregate_id`, `aggregate_version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='事务性发件箱';

CREATE TABLE `sync_inbox` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `event_id` char(36) NOT NULL COMMENT '同步请求事件ID',
  `company_id` varchar(64) NOT NULL COMMENT '招聘企业ID',
  `consumer` varchar(64) NOT NULL COMMENT '消费者标识',
  `event_type` varchar(64) NOT NULL COMMENT '命令类型',
  `event_version` int NOT NULL DEFAULT 1 COMMENT '同步事件结构版本',
  `occurred_at` datetime(3) NOT NULL COMMENT '招聘侧事件实际发生时间',
  `aggregate_type` varchar(64) NOT NULL COMMENT '聚合类型',
  `aggregate_id` varchar(64) NOT NULL COMMENT '聚合业务ID',
  `aggregate_version` bigint NOT NULL COMMENT '聚合版本',
  `trace_id` varchar(64) NOT NULL COMMENT '链路追踪ID',
  `payload_json` json NOT NULL COMMENT '完整同步命令业务数据',
  `processed_at` datetime(3) NOT NULL COMMENT '处理成功时间',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_consumer_event` (`consumer`, `event_id`),
  KEY `idx_sync_current` (`company_id`, `consumer`, `aggregate_id`, `aggregate_version`, `id`),
  KEY `idx_consumer_processed` (`consumer`, `processed_at`),
  KEY `idx_trace` (`trace_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='同步命令幂等及最新配置/绑定事件源';
```

### 1.4 回退 SQL

存在以下任一数据时，回退 SQL 会失败或产生错误状态，必须先清理或归档对应新功能数据：

- `search_task_channel.search_condition_id IS NULL`。
- 同一 `search_task_id + business_channel + channel_sub_type` 存在多条职位执行单元。

```sql
DROP TABLE IF EXISTS `sync_inbox`;
DROP TABLE IF EXISTS `sync_outbox`;
DROP TABLE IF EXISTS `reply_task_candidate`;
DROP TABLE IF EXISTS `ai_recruit_day_plan`;
DROP TABLE IF EXISTS `channel_account`;
DROP TABLE IF EXISTS `ai_client_session`;
DROP TABLE IF EXISTS `ai_client_instance`;

ALTER TABLE `resume_score_record`
  DROP INDEX `idx_reply_candidate`,
  DROP COLUMN `reply_candidate_id`;

ALTER TABLE `condition_resume`
  DROP COLUMN `communication_type`,
  DROP COLUMN `score_batch_no`;

ALTER TABLE `search_task_channel`
  DROP INDEX `uk_task_channel_scope`,
  DROP INDEX `idx_task_business_channel`,
  MODIFY COLUMN `search_condition_id` bigint NOT NULL
    COMMENT '本渠道实际执行条件ID',
  ADD UNIQUE KEY `uk_task_channel`
    (`search_task_id`, `business_channel`, `channel_sub_type`);

ALTER TABLE `search_task_channel`
  DROP COLUMN `prefilter_total_count`,
  DROP COLUMN `scan_cursor_json`,
  DROP COLUMN `execution_snapshot_json`,
  DROP COLUMN `external_job_id`;

ALTER TABLE `search_task`
  DROP INDEX `uk_task_scope`;

ALTER TABLE `search_task`
  DROP COLUMN `lease_expires_at`,
  DROP COLUMN `lease_epoch`,
  DROP COLUMN `lease_owner`,
  DROP COLUMN `config_snapshot_json`,
  DROP COLUMN `business_date`,
  DROP COLUMN `headcount_id`,
  DROP COLUMN `day_plan_id`,
  DROP COLUMN `external_company_id`,
  DROP COLUMN `channel_account_id`,
  DROP COLUMN `task_scope_key`,
  DROP COLUMN `task_kind`;
```

## 2. 招聘后端

### 2.1 现有表修改 SQL

无。

### 2.2 新增表 SQL

```sql
CREATE TABLE `ai_recruit_channel_account` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `projection_key` varchar(192) NOT NULL COMMENT '账号或客户端投影键',
  `projection_scope` varchar(16) NOT NULL COMMENT '投影范围：ACCOUNT/CLIENT',
  `company_id` varchar(64) NOT NULL COMMENT '招聘企业ID',
  `channel_code` varchar(32) NOT NULL COMMENT '渠道编码',
  `channel_account_id` varchar(64) DEFAULT NULL COMMENT 'i快招渠道账号ID',
  `external_user_id` varchar(128) DEFAULT NULL COMMENT '渠道账号原始ID',
  `external_company_id` varchar(128) DEFAULT NULL COMMENT '渠道公司ID',
  `external_company_name` varchar(255) DEFAULT NULL COMMENT '渠道公司名称',
  `display_name` varchar(128) DEFAULT NULL COMMENT '渠道账号展示名',
  `business_date` date DEFAULT NULL COMMENT '权益业务日',
  `rights_source` varchar(32) NOT NULL DEFAULT 'UNKNOWN' COMMENT '账号权益来源',
  `communication_quota_total` int unsigned DEFAULT NULL COMMENT '账号沟通权益总量',
  `communication_quota_used` int unsigned DEFAULT NULL COMMENT '账号沟通权益已用量',
  `communication_quota_remaining` int unsigned DEFAULT NULL COMMENT '账号沟通权益剩余量',
  `quota_confidence` varchar(16) NOT NULL DEFAULT 'UNKNOWN' COMMENT '权益置信度',
  `allocation_batch_no` int NOT NULL DEFAULT 0 COMMENT '权益分配批次',
  `collect_status` varchar(24) NOT NULL DEFAULT 'FAILED' COMMENT '采集状态',
  `entitlement_captured_at` datetime(3) DEFAULT NULL COMMENT '权益采集时间',
  `last_synced_at` datetime(3) DEFAULT NULL COMMENT '最近同步时间',
  `source_version` bigint NOT NULL DEFAULT 0 COMMENT '账号权益版本',
  `client_instance_id` varchar(64) DEFAULT NULL COMMENT '客户端安装实例ID',
  `user_id` varchar(64) NOT NULL COMMENT '招聘用户ID',
  `client_session_id` char(36) DEFAULT NULL COMMENT '最近客户端会话ID',
  `session_epoch` bigint DEFAULT NULL COMMENT '最近会话版本',
  `channel_state_version` bigint NOT NULL DEFAULT 0 COMMENT '渠道状态版本',
  `state` varchar(32) NOT NULL DEFAULT 'UNKNOWN' COMMENT '客户端及渠道执行状态',
  `channel_login_state` varchar(24) NOT NULL DEFAULT 'UNKNOWN' COMMENT '渠道登录状态',
  `last_channel_snapshot_at` datetime(3) DEFAULT NULL COMMENT '最近渠道数据采集时间',
  `adapter_version` varchar(32) DEFAULT NULL COMMENT '渠道适配器版本',
  `app_version` varchar(32) DEFAULT NULL COMMENT '客户端版本',
  `device_id` varchar(128) DEFAULT NULL COMMENT '脱敏设备标识',
  `last_heartbeat_at` datetime(3) DEFAULT NULL COMMENT '最近心跳时间',
  `last_session_event_at` datetime(3) DEFAULT NULL COMMENT '最近会话事件时间',
  `closed_at` datetime(3) DEFAULT NULL COMMENT '最近会话关闭时间',
  `close_reason` varchar(128) DEFAULT NULL COMMENT '最近会话关闭原因',
  `last_error_code` varchar(64) DEFAULT NULL COMMENT '最近错误码',
  `last_error_message` varchar(512) DEFAULT NULL COMMENT '最近错误摘要',
  `channel_ext_json` json DEFAULT NULL COMMENT '渠道扩展数据',
  `ext_schema_version` int NOT NULL DEFAULT 1 COMMENT '扩展数据结构版本',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_company_channel_projection` (`company_id`, `channel_code`, `projection_key`),
  KEY `idx_company_channel_account` (`company_id`, `channel_code`, `channel_account_id`, `external_company_id`),
  KEY `idx_client_session` (`client_session_id`),
  KEY `idx_session_state` (`company_id`, `channel_code`, `state`, `last_heartbeat_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='招聘渠道账号及会话当前态';

CREATE TABLE `ai_recruit_position_config` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `company_id` varchar(64) NOT NULL COMMENT '招聘企业ID',
  `headcount_id` bigint NOT NULL COMMENT '系统职位ID',
  `ai_enabled` tinyint NOT NULL DEFAULT 0 COMMENT 'AI寻聘开关',
  `filter_mode` varchar(32) NOT NULL DEFAULT 'FILTER_ONLY' COMMENT '筛选模式',
  `position_harness_profile_id` varchar(64) DEFAULT NULL COMMENT '当前生效职位画像主体ID',
  `profile_content_hash` varchar(80) DEFAULT NULL COMMENT '画像内容摘要',
  `score_line` decimal(5,2) NOT NULL COMMENT '职位画像分数线',
  `expected_resume_count` int unsigned NOT NULL DEFAULT 0 COMMENT '期望简历数',
  `reply_resume_enabled` tinyint NOT NULL DEFAULT 0 COMMENT '回复并求简历开关',
  `channel_filters_json` json DEFAULT NULL COMMENT '渠道筛选配置',
  `chat_limit_override` int unsigned DEFAULT NULL COMMENT '职位沟通上限覆盖值',
  `sort_order` int NOT NULL DEFAULT 0 COMMENT '职位执行顺序',
  `config_version` bigint NOT NULL DEFAULT 1 COMMENT '配置版本',
  `synced_config_version` bigint DEFAULT NULL COMMENT '已同步配置版本',
  `sync_status` varchar(24) NOT NULL DEFAULT 'SYNCING' COMMENT '同步状态',
  `last_sync_error` varchar(1024) DEFAULT NULL COMMENT '最近同步错误',
  `updated_by` varchar(64) NOT NULL COMMENT '最近编辑用户ID',
  `last_synced_at` datetime(3) DEFAULT NULL COMMENT '最近同步成功时间',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_company_headcount` (`company_id`, `headcount_id`),
  KEY `idx_company_ai_enabled` (`company_id`, `ai_enabled`, `sort_order`, `headcount_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='系统职位AI寻聘配置';
```

```sql
CREATE TABLE `ai_recruit_job_binding` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `company_id` varchar(64) NOT NULL COMMENT '招聘企业ID',
  `headcount_id` bigint NOT NULL COMMENT '系统职位ID',
  `channel_code` varchar(32) NOT NULL COMMENT '渠道编码',
  `channel_account_id` varchar(64) NOT NULL COMMENT '渠道账号ID',
  `external_user_id` varchar(128) NOT NULL COMMENT '渠道账号原始ID',
  `external_company_id` varchar(128) NOT NULL COMMENT '渠道公司ID',
  `external_job_id` varchar(128) NOT NULL COMMENT '渠道职位ID',
  `job_name` varchar(255) DEFAULT NULL COMMENT '渠道职位名称快照',
  `rights_source` varchar(32) NOT NULL DEFAULT 'UNKNOWN' COMMENT '职位权益来源',
  `binding_status` varchar(32) NOT NULL DEFAULT 'CHANNEL_NOT_LOGGED_IN' COMMENT '绑定状态',
  `binding_version` bigint NOT NULL DEFAULT 1 COMMENT '绑定版本',
  `synced_binding_version` bigint DEFAULT NULL COMMENT '已同步绑定版本',
  `sync_status` varchar(24) NOT NULL DEFAULT 'SYNCING' COMMENT '同步状态',
  `last_sync_error` varchar(1024) DEFAULT NULL COMMENT '最近同步错误',
  `invalid_reason` varchar(128) DEFAULT NULL COMMENT '绑定失效原因',
  `last_verified_at` datetime(3) DEFAULT NULL COMMENT '最近校验时间',
  `last_synced_at` datetime(3) DEFAULT NULL COMMENT '最近同步成功时间',
  `channel_ext_json` json DEFAULT NULL COMMENT '渠道扩展数据',
  `ext_schema_version` int NOT NULL DEFAULT 1 COMMENT '扩展数据结构版本',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_company_headcount_channel` (`company_id`, `headcount_id`, `channel_code`),
  UNIQUE KEY `uk_company_channel_job`
    (`company_id`, `channel_code`, `channel_account_id`, `external_company_id`, `external_job_id`),
  KEY `idx_company_channel_account` (`company_id`, `channel_code`, `channel_account_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='系统职位与渠道职位绑定';

CREATE TABLE `ai_recruit_channel_job_projection` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `company_id` varchar(64) NOT NULL COMMENT '招聘企业ID',
  `channel_code` varchar(32) NOT NULL COMMENT '渠道编码',
  `channel_account_id` varchar(64) NOT NULL COMMENT '渠道账号ID',
  `external_user_id` varchar(128) NOT NULL COMMENT '渠道账号原始ID',
  `external_company_id` varchar(128) NOT NULL COMMENT '渠道公司ID',
  `external_job_id` varchar(128) NOT NULL COMMENT '渠道职位ID',
  `present_in_latest_list` tinyint NOT NULL DEFAULT 1 COMMENT '是否在最近完整职位列表中',
  `channel_job_snapshot_id` varchar(64) DEFAULT NULL COMMENT '最近职位逻辑快照ID',
  `job_name` varchar(255) DEFAULT NULL COMMENT '渠道职位名称',
  `job_status` varchar(24) NOT NULL DEFAULT 'UNKNOWN' COMMENT '归一化职位状态',
  `rights_source` varchar(32) NOT NULL DEFAULT 'UNKNOWN' COMMENT '职位权益来源',
  `business_date` date DEFAULT NULL COMMENT '权益业务日',
  `job_privilege_count` int unsigned DEFAULT NULL COMMENT '职位权益总量',
  `job_privilege_used_count` int unsigned DEFAULT NULL COMMENT '职位权益已用量',
  `channel_remaining_count` int unsigned DEFAULT NULL COMMENT '渠道剩余权益',
  `quota_confidence` varchar(16) NOT NULL DEFAULT 'UNKNOWN' COMMENT '权益置信度',
  `allocated_limit` int unsigned NOT NULL DEFAULT 0 COMMENT 'AI沟通分配上限',
  `ai_used_count` int unsigned NOT NULL DEFAULT 0 COMMENT 'AI沟通已用展示值',
  `allocation_batch_no` int NOT NULL DEFAULT 0 COMMENT '权益分配批次',
  `collect_status` varchar(24) NOT NULL DEFAULT 'FAILED' COMMENT '采集状态',
  `source_client_session_id` char(36) DEFAULT NULL COMMENT '采集来源客户端会话ID',
  `job_snapshot_version` bigint NOT NULL DEFAULT 0 COMMENT '完整职位列表同步版本',
  `source_version` bigint NOT NULL DEFAULT 0 COMMENT '职位当前态版本',
  `last_synced_at` datetime(3) DEFAULT NULL COMMENT '最近同步成功时间',
  `channel_ext_json` json DEFAULT NULL COMMENT '渠道扩展数据',
  `ext_schema_version` int NOT NULL DEFAULT 1 COMMENT '扩展数据结构版本',
  `adapter_version` varchar(32) DEFAULT NULL COMMENT '渠道适配器版本',
  `create_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `update_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_company_channel_job`
    (`company_id`, `channel_code`, `channel_account_id`, `external_company_id`, `external_job_id`),
  KEY `idx_company_channel_account_status` (`company_id`, `channel_code`, `channel_account_id`, `job_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='渠道职位与职位权益当前态';
```

### 2.3 回退 SQL

```sql
DROP TABLE IF EXISTS `ai_recruit_channel_job_projection`;
DROP TABLE IF EXISTS `ai_recruit_job_binding`;
DROP TABLE IF EXISTS `ai_recruit_position_config`;
DROP TABLE IF EXISTS `ai_recruit_channel_account`;
```
