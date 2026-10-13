-- =============================================================
--  2026年福建省大学生信息素养大赛模拟竞赛平台
--  数据库初始化脚本  database/init.sql
--  MySQL 8.0 / utf8mb4
--  用法: mysql -u root -p < database/init.sql
-- =============================================================

CREATE DATABASE IF NOT EXISTS info_literacy
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE info_literacy;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- -------------------------------------------------------------
-- events 赛事表
-- -------------------------------------------------------------
DROP TABLE IF EXISTS events;
CREATE TABLE events (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  name        VARCHAR(100) NOT NULL                COMMENT '赛事名称',
  description TEXT                                 COMMENT '赛事描述',
  status      TINYINT NOT NULL DEFAULT 1           COMMENT '0=停用 1=启用',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_events_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='赛事表';

-- -------------------------------------------------------------
-- stages 环节表
-- -------------------------------------------------------------
DROP TABLE IF EXISTS stages;
CREATE TABLE stages (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  event_id   INT UNSIGNED NOT NULL                COMMENT '所属赛事',
  name       VARCHAR(100) NOT NULL                COMMENT '环节名称',
  sort_order INT NOT NULL DEFAULT 0               COMMENT '排序序号',
  config     JSON NOT NULL                        COMMENT '环节配置(见 3.2)',
  status     TINYINT NOT NULL DEFAULT 0           COMMENT '0=未开启 1=已开启 2=已结束',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_stages_event (event_id, sort_order),
  KEY idx_stages_status (status),
  CONSTRAINT fk_stages_event FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='环节表';

-- -------------------------------------------------------------
-- questions 题目表
-- -------------------------------------------------------------
DROP TABLE IF EXISTS questions;
CREATE TABLE questions (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  type       TINYINT NOT NULL                      COMMENT '1=单选 2=多选 3=判断',
  content    TEXT NOT NULL                         COMMENT '题干',
  option_a   VARCHAR(500) DEFAULT NULL             COMMENT '选项A',
  option_b   VARCHAR(500) DEFAULT NULL             COMMENT '选项B',
  option_c   VARCHAR(500) DEFAULT NULL             COMMENT '选项C',
  option_d   VARCHAR(500) DEFAULT NULL             COMMENT '选项D',
  option_e   VARCHAR(500) DEFAULT NULL             COMMENT '选项E',
  option_f   VARCHAR(500) DEFAULT NULL             COMMENT '选项F',
  answer     VARCHAR(10) NOT NULL                  COMMENT '正确答案 如 A / ABC',
  analysis   TEXT                                  COMMENT '解析',
  module     VARCHAR(50) DEFAULT NULL              COMMENT '知识模块',
  difficulty TINYINT NOT NULL DEFAULT 3            COMMENT '难度1-5',
  source     VARCHAR(50) DEFAULT NULL              COMMENT '来源',
  tags       VARCHAR(200) DEFAULT NULL             COMMENT '标签(逗号分隔)',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_questions_type (type),
  KEY idx_questions_module (module),
  KEY idx_questions_difficulty (difficulty),
  KEY idx_questions_source (source),
  FULLTEXT KEY ft_questions_content (content)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='题目表';

-- -------------------------------------------------------------
-- teams 队伍表
-- -------------------------------------------------------------
DROP TABLE IF EXISTS teams;
CREATE TABLE teams (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  name          VARCHAR(100) NOT NULL                COMMENT '队伍名称',
  leader_name   VARCHAR(50) NOT NULL                 COMMENT '队长姓名',
  leader_id     VARCHAR(50) NOT NULL                 COMMENT '队长学号(团队赛登录账号)',
  leader_phone  VARCHAR(20) DEFAULT NULL             COMMENT '队长联系电话',
  member1_name  VARCHAR(50) DEFAULT NULL             COMMENT '队员1姓名',
  member1_id    VARCHAR(50) DEFAULT NULL             COMMENT '队员1学号',
  member2_name  VARCHAR(50) DEFAULT NULL             COMMENT '队员2姓名',
  member2_id    VARCHAR(50) DEFAULT NULL             COMMENT '队员2学号',
  status        TINYINT NOT NULL DEFAULT 1           COMMENT '0=禁用 1=启用',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_teams_leader_id (leader_id),
  KEY idx_teams_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='队伍表';

-- -------------------------------------------------------------
-- answers 答题记录表
-- -------------------------------------------------------------
DROP TABLE IF EXISTS answers;
CREATE TABLE answers (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  stage_id     INT UNSIGNED NOT NULL                   COMMENT '环节ID',
  team_id      INT UNSIGNED NOT NULL                   COMMENT '队伍ID',
  student_id   VARCHAR(50) NOT NULL                    COMMENT '答题学生学号',
  question_id  INT UNSIGNED NOT NULL                   COMMENT '题目ID',
  user_answer  VARCHAR(10) DEFAULT NULL                COMMENT '学生答案',
  is_correct   TINYINT NOT NULL DEFAULT 2              COMMENT '0=错 1=对 2=未答',
  score_delta  DECIMAL(5,2) NOT NULL DEFAULT 0.00      COMMENT '本题得分变化',
  time_spent   INT NOT NULL DEFAULT 0                  COMMENT '用时(秒)',
  submit_order INT NOT NULL DEFAULT 0                  COMMENT '提交顺序(速度排名)',
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_answers_unique (stage_id, team_id, student_id, question_id),
  KEY idx_answers_stage_team (stage_id, team_id),
  KEY idx_answers_question (question_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='答题记录表';

-- -------------------------------------------------------------
-- stage_scores 环节成绩表
-- -------------------------------------------------------------
DROP TABLE IF EXISTS stage_scores;
CREATE TABLE stage_scores (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  stage_id    INT UNSIGNED NOT NULL                COMMENT '环节ID',
  team_id     INT UNSIGNED NOT NULL                COMMENT '队伍ID',
  student_id  VARCHAR(50) DEFAULT NULL             COMMENT '学号(个人环节用)',
  total_score DECIMAL(8,2) NOT NULL DEFAULT 0.00   COMMENT '总分',
  total_time  INT NOT NULL DEFAULT 0               COMMENT '总用时(秒)',
  `rank`      INT DEFAULT NULL                     COMMENT '排名',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_scores_scope (stage_id, team_id, student_id),
  KEY idx_scores_stage (stage_id, total_score DESC, total_time ASC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='环节成绩表';

-- -------------------------------------------------------------
-- cheat_logs 预警记录表
-- -------------------------------------------------------------
DROP TABLE IF EXISTS cheat_logs;
CREATE TABLE cheat_logs (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  stage_id   INT UNSIGNED DEFAULT NULL               COMMENT '环节ID',
  team_id    INT UNSIGNED DEFAULT NULL               COMMENT '队伍ID',
  student_id VARCHAR(50) DEFAULT NULL                COMMENT '学号',
  event_type VARCHAR(50) NOT NULL                    COMMENT '事件类型(切屏/退出全屏/复制)',
  duration   INT NOT NULL DEFAULT 0                  COMMENT '持续时间(秒)',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cheat_stage (stage_id),
  KEY idx_cheat_student (student_id),
  KEY idx_cheat_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='预警记录表';

-- -------------------------------------------------------------
-- stage_papers 抽题快照表（固定试卷 / 每人试题不同 的落地）
-- 说明：project.md 3.2 的 paperStrategy=fixed 需要持久化题目列表，
--       此处以扩展表承载，不改变原有七张表的字段定义。
-- -------------------------------------------------------------
DROP TABLE IF EXISTS stage_papers;
CREATE TABLE stage_papers (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  stage_id    INT UNSIGNED NOT NULL                COMMENT '环节ID',
  scope_key   VARCHAR(50) NOT NULL DEFAULT 'common' COMMENT '试卷归属: common 或 学号',
  question_id INT UNSIGNED NOT NULL                COMMENT '题目ID',
  sort_order  INT NOT NULL DEFAULT 0               COMMENT '卷内序号',
  option_map  JSON DEFAULT NULL                    COMMENT '选项乱序映射 {原始字母: 展示字母}',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_paper (stage_id, scope_key, question_id),
  KEY idx_paper_stage (stage_id, scope_key, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='环节抽题快照表';

-- -------------------------------------------------------------
-- system_logs 系统日志表（管理后台使用）
-- -------------------------------------------------------------
DROP TABLE IF EXISTS system_logs;
CREATE TABLE system_logs (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  level      VARCHAR(20) NOT NULL DEFAULT 'info'   COMMENT 'info/warn/error',
  module     VARCHAR(50) DEFAULT NULL              COMMENT '模块',
  message    VARCHAR(500) NOT NULL                 COMMENT '日志内容',
  detail     TEXT                                  COMMENT '详情',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_logs_level (level),
  KEY idx_logs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统日志表';

SET FOREIGN_KEY_CHECKS = 1;
