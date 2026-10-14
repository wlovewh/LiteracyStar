-- =============================================================
--  信息素养大赛综合平台 — 数据库初始化脚本
--  与模拟竞赛平台独立运行，仅共用 questions 表（双向同步）
-- =============================================================

CREATE DATABASE IF NOT EXISTS integrated_platform
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE integrated_platform;

-- -------------------------------------------------------------
-- 11.1 access_keys 访问密钥表
-- -------------------------------------------------------------
DROP TABLE IF EXISTS access_keys;
CREATE TABLE access_keys (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  key_value  VARCHAR(64) NOT NULL                   COMMENT '密钥值',
  key_type   TINYINT NOT NULL DEFAULT 2             COMMENT '1=管理员 2=用户',
  remark     VARCHAR(200) DEFAULT NULL              COMMENT '备注',
  expires_at DATETIME DEFAULT NULL                  COMMENT '有效期(NULL=永久)',
  status     TINYINT NOT NULL DEFAULT 1             COMMENT '0=禁用 1=启用',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_key_value (key_value),
  KEY idx_key_type (key_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='访问密钥表';

-- -------------------------------------------------------------
-- 11.2 resource_categories 资源分类表
-- -------------------------------------------------------------
DROP TABLE IF EXISTS resource_categories;
CREATE TABLE resource_categories (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  name       VARCHAR(50) NOT NULL                  COMMENT '分类名称',
  sort_order INT NOT NULL DEFAULT 0                COMMENT '排序',
  status     TINYINT NOT NULL DEFAULT 1            COMMENT '0=禁用 1=启用',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='资源分类表';

-- -------------------------------------------------------------
-- 11.3 resource_sites 资源网站表
-- -------------------------------------------------------------
DROP TABLE IF EXISTS resource_sites;
CREATE TABLE resource_sites (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  category_id INT UNSIGNED NOT NULL                COMMENT '所属分类',
  name        VARCHAR(100) NOT NULL                COMMENT '网站名称',
  url         VARCHAR(500) NOT NULL                COMMENT '网址',
  description VARCHAR(200) DEFAULT NULL            COMMENT '简短介绍',
  icon_url    VARCHAR(500) DEFAULT NULL            COMMENT '图标URL',
  sort_order  INT NOT NULL DEFAULT 0               COMMENT '排序',
  status      TINYINT NOT NULL DEFAULT 1           COMMENT '0=禁用 1=启用',
  visit_count INT UNSIGNED NOT NULL DEFAULT 0      COMMENT '访问次数(统计用)',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_category (category_id),
  KEY idx_sort (sort_order),
  CONSTRAINT fk_site_category FOREIGN KEY (category_id) REFERENCES resource_categories (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='资源网站表';

-- -------------------------------------------------------------
-- 11.4 chat_rooms 聊天室表
-- -------------------------------------------------------------
DROP TABLE IF EXISTS chat_rooms;
CREATE TABLE chat_rooms (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  team_id           INT UNSIGNED DEFAULT NULL            COMMENT '关联队伍ID',
  name              VARCHAR(100) DEFAULT NULL            COMMENT '聊天室名称',
  invite_code       VARCHAR(6) DEFAULT NULL              COMMENT '邀请码',
  invite_expires_at DATETIME DEFAULT NULL                COMMENT '邀请码有效期',
  max_members       INT NOT NULL DEFAULT 3               COMMENT '最大人数',
  retention_days    INT NOT NULL DEFAULT 30              COMMENT '消息保留天数(0=永久)',
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_invite_code (invite_code),
  KEY idx_team (team_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='聊天室表';

-- -------------------------------------------------------------
-- 11.5 chat_messages 聊天消息表
-- -------------------------------------------------------------
DROP TABLE IF EXISTS chat_messages;
CREATE TABLE chat_messages (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  room_id           INT UNSIGNED NOT NULL                   COMMENT '聊天室ID',
  sender_role       VARCHAR(20) NOT NULL DEFAULT 'member1'  COMMENT 'leader/member1/member2/guest',
  sender_name       VARCHAR(50) NOT NULL DEFAULT ''         COMMENT '发送者姓名',
  sender_student_id VARCHAR(50) DEFAULT NULL                COMMENT '发送者学号',
  message_type      VARCHAR(20) NOT NULL DEFAULT 'text'     COMMENT 'text/question/answer/system',
  content           TEXT                                    COMMENT '消息内容',
  extra             JSON DEFAULT NULL                       COMMENT '附加数据(题目卡片等)',
  quoted_message_id BIGINT UNSIGNED DEFAULT NULL            COMMENT '引用的消息ID',
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '发送时间',
  PRIMARY KEY (id),
  KEY idx_room_time (room_id, created_at),
  KEY idx_type (message_type),
  CONSTRAINT fk_msg_room FOREIGN KEY (room_id) REFERENCES chat_rooms (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='聊天消息表';

-- -------------------------------------------------------------
-- 11.6 quick_phrases 快速短语表
-- -------------------------------------------------------------
DROP TABLE IF EXISTS quick_phrases;
CREATE TABLE quick_phrases (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  content    VARCHAR(100) NOT NULL                COMMENT '短语内容',
  sort_order INT NOT NULL DEFAULT 0               COMMENT '排序',
  status     TINYINT NOT NULL DEFAULT 1           COMMENT '0=禁用 1=启用',
  PRIMARY KEY (id),
  KEY idx_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='快速短语表';

-- -------------------------------------------------------------
-- 数据库备份记录表
-- 说明：记录每次自动/手动备份的文件信息，供管理端查看与删除。
--       备份文件本身存放在 backend/backups/ 目录，此表只存元数据。
-- -------------------------------------------------------------
DROP TABLE IF EXISTS backup_records;
CREATE TABLE backup_records (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  filename    VARCHAR(200) NOT NULL                COMMENT '备份文件名',
  file_size   BIGINT UNSIGNED NOT NULL DEFAULT 0   COMMENT '文件大小(字节)',
  scope       VARCHAR(50) NOT NULL DEFAULT 'all'   COMMENT '备份范围',
  trigger_by  VARCHAR(20) NOT NULL DEFAULT 'auto'  COMMENT 'auto=定时 manual=手动',
  status      VARCHAR(20) NOT NULL DEFAULT 'ok'    COMMENT 'ok=成功 failed=失败',
  message     VARCHAR(500) DEFAULT NULL            COMMENT '失败原因或备注',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_backup_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='数据库备份记录表';

-- -------------------------------------------------------------
-- 平台设置表（题库检索开关、聊天保留时间等）
-- -------------------------------------------------------------
DROP TABLE IF EXISTS platform_settings;
CREATE TABLE platform_settings (
  `key`      VARCHAR(64) NOT NULL COMMENT '配置键',
  value      TEXT                 COMMENT '配置值',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='平台设置表';
