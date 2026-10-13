-- =============================================================
--  种子数据  database/seed.sql
--  包含: 管理员账号、演示赛事、project.md 第四章的 7 个预置环节
--  用法: mysql -u root -p info_literacy < database/seed.sql
-- =============================================================

USE info_literacy;

-- -------------------------------------------------------------
-- 管理员账号: admin / admin123
-- 密码使用 bcrypt(10) 哈希，明文为 admin123
-- -------------------------------------------------------------
DROP TABLE IF EXISTS admins;
CREATE TABLE admins (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username   VARCHAR(50) NOT NULL COMMENT '管理员账号',
  password   VARCHAR(100) NOT NULL COMMENT 'bcrypt 哈希',
  real_name  VARCHAR(50) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_admins_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='管理员表';

INSERT INTO admins (username, password, real_name) VALUES
('admin', '$2a$10$JXOUfxiWobG0CML6gReuvutQVdx4ViYotI5RTzPWzh1LlG.NKQtuu', '系统管理员')
ON DUPLICATE KEY UPDATE password = VALUES(password);

-- -------------------------------------------------------------
-- 演示赛事
-- -------------------------------------------------------------
INSERT INTO events (id, name, description, status) VALUES
(1, '2026年福建省大学生信息素养大赛（校内模拟）',
 '面向福建省高职组信息素养大赛的校内模拟竞赛，覆盖省级初赛、决赛晋级赛、决赛排位赛共七个环节。', 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description);

-- -------------------------------------------------------------
-- 七个预置环节 (project.md 4.2)
-- 通用开关: allowReturn=false, shuffleOptions=true
-- -------------------------------------------------------------
DELETE FROM stages WHERE event_id = 1;

-- 环节1: 省级初赛-个人对抗
INSERT INTO stages (event_id, name, sort_order, status, config) VALUES (1, '省级初赛-个人对抗', 1, 0, '{
  "mode": "individual",
  "questionConfig": { "single": 6, "multiple": 2, "judge": 2, "shuffleOptions": true },
  "scoreConfig": { "singleScore": 2, "multipleScore": 2, "judgeScore": 2,
    "wrongDeduct": true, "wrongDeductScore": 1,
    "unansweredDeduct": false, "unansweredDeductScore": 0,
    "openedNotSubmitDeduct": false, "openedNotSubmitDeductScore": 0 },
  "timeConfig": { "totalTime": 600, "perQuestionTime": 0, "speedRanking": false, "speedRankingPercent": 50, "speedRankingRoundUp": false },
  "specialConfig": { "timeAccumulate": false, "firstPlayersNoDeduct": false, "allowSkip": true, "allowReturn": false, "questionDifferent": true },
  "paperStrategy": "random", "moduleFilter": [], "difficultyFilter": [],
  "allowViewAnswer": false
}');

-- 环节2: 省级初赛-团队对抗
INSERT INTO stages (event_id, name, sort_order, status, config) VALUES (1, '省级初赛-团队对抗', 2, 0, '{
  "mode": "team",
  "questionConfig": { "single": 6, "multiple": 2, "judge": 2, "shuffleOptions": true },
  "scoreConfig": { "singleScore": 4, "multipleScore": 4, "judgeScore": 4,
    "wrongDeduct": true, "wrongDeductScore": 1,
    "unansweredDeduct": false, "unansweredDeductScore": 0,
    "openedNotSubmitDeduct": false, "openedNotSubmitDeductScore": 0 },
  "timeConfig": { "totalTime": 900, "perQuestionTime": 0, "speedRanking": false, "speedRankingPercent": 50, "speedRankingRoundUp": false },
  "specialConfig": { "timeAccumulate": false, "firstPlayersNoDeduct": false, "allowSkip": true, "allowReturn": false, "questionDifferent": false },
  "paperStrategy": "random", "moduleFilter": [], "difficultyFilter": [],
  "allowViewAnswer": false
}');

-- 环节3: 省级决赛晋级赛-必答题
INSERT INTO stages (event_id, name, sort_order, status, config) VALUES (1, '省级决赛晋级赛-必答题', 3, 0, '{
  "mode": "team",
  "questionConfig": { "single": 12, "multiple": 4, "judge": 4, "shuffleOptions": true },
  "scoreConfig": { "singleScore": 3, "multipleScore": 5, "judgeScore": 1,
    "wrongDeduct": true, "wrongDeductScore": 1,
    "unansweredDeduct": false, "unansweredDeductScore": 0,
    "openedNotSubmitDeduct": false, "openedNotSubmitDeductScore": 0 },
  "timeConfig": { "totalTime": 1080, "perQuestionTime": 0, "speedRanking": false, "speedRankingPercent": 50, "speedRankingRoundUp": false },
  "specialConfig": { "timeAccumulate": false, "firstPlayersNoDeduct": false, "allowSkip": true, "allowReturn": false, "questionDifferent": false },
  "paperStrategy": "random", "moduleFilter": [], "difficultyFilter": [],
  "allowViewAnswer": false
}');

-- 环节4: 省级决赛晋级赛-抢答题
INSERT INTO stages (event_id, name, sort_order, status, config) VALUES (1, '省级决赛晋级赛-抢答题', 4, 0, '{
  "mode": "team",
  "questionConfig": { "single": 6, "multiple": 2, "judge": 2, "shuffleOptions": true },
  "scoreConfig": { "singleScore": 4, "multipleScore": 6, "judgeScore": 2,
    "wrongDeduct": true, "wrongDeductScore": 2,
    "unansweredDeduct": false, "unansweredDeductScore": 0,
    "openedNotSubmitDeduct": false, "openedNotSubmitDeductScore": 0 },
  "timeConfig": { "totalTime": 0, "perQuestionTime": 90, "speedRanking": true, "speedRankingPercent": 50, "speedRankingRoundUp": false, "buzzerWaitTime": 5 },
  "specialConfig": { "timeAccumulate": false, "firstPlayersNoDeduct": false, "allowSkip": false, "allowReturn": false, "questionDifferent": false },
  "paperStrategy": "random", "moduleFilter": [], "difficultyFilter": [],
  "allowViewAnswer": false, "buzzer": true
}');

-- 环节5: 省级决赛排位赛-个人接力
INSERT INTO stages (event_id, name, sort_order, status, config) VALUES (1, '省级决赛排位赛-个人接力', 5, 0, '{
  "mode": "individual",
  "questionConfig": { "single": 0, "multiple": 0, "judge": 0, "shuffleOptions": true, "relay": true,
    "relayPlan": [
      { "index": 1, "single": 3, "multiple": 1, "judge": 1 },
      { "index": 2, "single": 3, "multiple": 1, "judge": 1 },
      { "index": 3, "single": 4, "multiple": 3, "judge": 3 }
    ] },
  "scoreConfig": { "singleScore": 2.5, "multipleScore": 4, "judgeScore": 1,
    "wrongDeduct": true, "wrongDeductScore": 1,
    "unansweredDeduct": true, "unansweredDeductScore": 1,
    "openedNotSubmitDeduct": true, "openedNotSubmitDeductScore": 1 },
  "timeConfig": { "totalTime": 1080, "perQuestionTime": 0, "baseTimePerPlayer": 360, "speedRanking": false, "speedRankingPercent": 50, "speedRankingRoundUp": false },
  "specialConfig": { "timeAccumulate": true, "firstPlayersNoDeduct": true, "allowSkip": true, "allowReturn": false, "questionDifferent": true },
  "paperStrategy": "random", "moduleFilter": [], "difficultyFilter": [],
  "allowViewAnswer": false
}');

-- 环节6: 省级决赛排位赛-团队抢答
INSERT INTO stages (event_id, name, sort_order, status, config) VALUES (1, '省级决赛排位赛-团队抢答', 6, 0, '{
  "mode": "team",
  "questionConfig": { "single": 4, "multiple": 3, "judge": 3, "shuffleOptions": true },
  "scoreConfig": { "singleScore": 2.5, "multipleScore": 4, "judgeScore": 1,
    "wrongDeduct": true, "wrongDeductScore": null,
    "unansweredDeduct": false, "unansweredDeductScore": 0,
    "openedNotSubmitDeduct": false, "openedNotSubmitDeductScore": 0 },
  "timeConfig": { "totalTime": 0, "perQuestionTime": 60, "speedRanking": true, "speedRankingPercent": 50, "speedRankingRoundUp": true },
  "specialConfig": { "timeAccumulate": false, "firstPlayersNoDeduct": false, "allowSkip": false, "allowReturn": false, "questionDifferent": false },
  "paperStrategy": "random", "moduleFilter": [], "difficultyFilter": [],
  "allowViewAnswer": false, "buzzer": true
}');

-- 环节7: 省级决赛排位赛-AI专项
INSERT INTO stages (event_id, name, sort_order, status, config) VALUES (1, '省级决赛排位赛-AI专项', 7, 0, '{
  "mode": "team",
  "questionConfig": { "single": 4, "multiple": 3, "judge": 3, "shuffleOptions": true },
  "scoreConfig": { "singleScore": 2.5, "multipleScore": 4, "judgeScore": 1,
    "wrongDeduct": true, "wrongDeductScore": null,
    "unansweredDeduct": true, "unansweredDeductScore": null,
    "openedNotSubmitDeduct": true, "openedNotSubmitDeductScore": null },
  "timeConfig": { "totalTime": 600, "perQuestionTime": 0, "speedRanking": false, "speedRankingPercent": 50, "speedRankingRoundUp": false },
  "specialConfig": { "timeAccumulate": false, "firstPlayersNoDeduct": false, "allowSkip": true, "allowReturn": false, "questionDifferent": false },
  "paperStrategy": "random", "moduleFilter": ["人工智能"], "difficultyFilter": [],
  "allowViewAnswer": false
}');

-- -------------------------------------------------------------
-- 演示题目（覆盖各知识模块，供本地流程验证）
-- -------------------------------------------------------------
DELETE FROM questions WHERE source = '示例题库';

INSERT INTO questions (type, content, option_a, option_b, option_c, option_d, answer, analysis, module, difficulty, source, tags) VALUES
(1,'信息素养的核心能力不包括以下哪一项？','信息意识','信息能力','信息伦理','信息垄断','D','信息素养包含信息意识、信息能力、信息伦理，不包含信息垄断。','信息素养基础',1,'示例题库','概念'),
(1,'在检索中使用布尔逻辑算符，用于缩小检索范围的是？','OR','AND','NOT','NEAR','B','AND 表示逻辑与，可以缩小检索范围提高查准率。','信息检索',2,'示例题库','检索技术'),
(1,'下列哪项属于一次文献？','综述论文','学位论文','百科全书','文摘索引','B','学位论文是原创性研究成果，属于一次文献。','文献类型',3,'示例题库','文献'),
(1,'CNKI 是指？','中国知网','万方数据','维普资讯','超星发现','A','CNKI 是中国知识基础设施工程，即中国知网。','数据库知识',1,'示例题库','数据库'),
(1,'关于学术不端行为，下列说法正确的是？','引用他人成果需注明出处','可以随意篡改实验数据','可以一稿多投','可以代写论文','A','引用他人成果必须规范标注出处，其余均属学术不端。','学术规范',1,'示例题库','伦理'),
(1,'Python 中用于数据分析的主流库是？','pandas','django','flask','pygame','A','pandas 是 Python 生态中主流的数据分析库。','人工智能',2,'示例题库','工具'),
(2,'下列属于学术不端行为的有哪些？','抄袭剽窃','伪造数据','规范引用','一稿多投','ABD','抄袭、伪造数据、一稿多投均属学术不端，规范引用是正确做法。','学术规范',2,'示例题库','伦理'),
(2,'信息检索中常用的检索技术包括？','布尔逻辑检索','截词检索','位置检索','随机检索','ABC','布尔逻辑、截词、位置检索均为常用技术，随机检索不是。','信息检索',3,'示例题库','检索技术'),
(3,'信息素养是终身学习的基础能力。','正确','错误',NULL,NULL,'A','信息素养是终身学习的基础，说法正确。','信息素养基础',1,'示例题库','概念'),
(3,'网络上所有信息都是真实可靠的。','正确','错误',NULL,NULL,'B','网络信息良莠不齐，需要批判性评估。','信息评估',1,'示例题库','概念'),
(1,'评价信息源权威性时，最重要的依据是？','网页配色','作者与出版机构','页面访问量','广告数量','B','作者资质与出版机构是判断权威性的核心依据。','信息评估',2,'示例题库','评估'),
(1,'人工智能领域中，GPT 中的 "G" 代表？','Generative','General','Global','Graph','A','GPT 全称 Generative Pre-trained Transformer。','人工智能',2,'示例题库','AI'),
(1,'使用 AI 工具完成学术作业时，正确的做法是？','直接提交 AI 生成内容','标注使用情况并自行核验','隐瞒使用事实','伪造参考文献','B','应当如实标注 AI 使用情况并对内容负责。','人工智能',2,'示例题库','AI伦理'),
(1,'参考文献著录格式国家标准是？','GB/T 7714','GB/T 1234','ISO 9001','GB 50011','A','GB/T 7714《信息与文献 参考文献著录规则》。','学术规范',2,'示例题库','规范'),
(1,'开放获取(Open Access)期刊的特点是？','读者免费阅读','作者必须付费才能发表','仅限机构订阅','不经过同行评审','A','开放获取的核心特征是读者可免费获取全文。','数据库知识',3,'示例题库','OA'),
(2,'提升检索查全率的方法有？','使用 OR 连接同义词','使用上位词','使用截词符','限定字段检索','ABC','OR、上位词、截词符可扩大检索范围；字段限定会缩小范围。','信息检索',4,'示例题库','检索技术'),
(2,'关于知识产权，下列表述正确的有？','作品自创作完成即享有著作权','合理使用需注明出处','可以随意转载他人作品','专利需申请授权','ABD','随意转载他人作品可能构成侵权。','学术规范',3,'示例题库','伦理'),
(3,'使用他人观点时必须标注引用来源。','正确','错误',NULL,NULL,'A','引用他人观点必须规范标注来源。','学术规范',1,'示例题库','伦理'),
(1,'搜索引擎中 site: 限定符的作用是？','限定站点范围','限定文件类型','限定时间范围','限定语言','A','site: 用于将检索结果限定在指定站点或域名内。','信息检索',2,'示例题库','检索技术'),
(1,'判断网络信息时效性最直接的依据是？','页面字体','发布时间','图片数量','评论数量','B','发布时间是判断时效性的直接依据。','信息评估',1,'示例题库','评估');

-- -------------------------------------------------------------
-- 演示队伍（本地流程验证用）
-- -------------------------------------------------------------
INSERT INTO teams (name, leader_name, leader_id, leader_phone, member1_name, member1_id, member2_name, member2_id, status) VALUES
('星海队','张伟','2026001','13800000001','李娜','2026002','王强','2026003',1),
('逐光队','刘洋','2026004','13800000004','陈静','2026005','赵磊','2026006',1),
('启航队','孙悦','2026007','13800000007','周敏','2026008','吴昊','2026009',1)
ON DUPLICATE KEY UPDATE name = VALUES(name);
