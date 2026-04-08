# 首页与随手记 Routing Skill

## 核心定位

- 首页永远是输入层、索引层、展示层。
- 首页不是正式主存，不承担长期数据治理。
- 随手记也是输入层，不是最终归档位置。

## 首页原则

- 首页只保留短平快入口：
  - 重要日程
  - 日计划
  - 每天打卡
  - 今日核心贡献
  - 随手记
- 真正的正式信息，必须写回唯一主存。

## 唯一主存

| 内容 | 主存文件 |
| --- | --- |
| 重要日程 / DDL | `lists/deadlines.md` |
| 纪念日 | `lists/memorial-days.md` |
| 购买计划 | `todos/2026-04-06-purchase-master.md` |
| 衣柜与妆台 | `lists/wardrobe.md` |
| Todo 明细 | `todos/*.md` |
| 日程周视图 | `schedules/weekly-schedule.md` |
| 今日日志 | `logs/daily/YYYY-MM-DD.md` |
| 周志 | `logs/weekly/YYYY-WXX.md` |
| 行动领域沉淀 | `iterations/*.md` |
| 和猫的吃喝玩 | `private/cat-food-fun-index.md` |
| 和猫的高光活动 | `private/cat-100-things.md` |
| 原始随手记 | `inbox/quick-capture.md` |

## 随手记识别范围

随手记允许出现混合内容：

- todo
- finish
- purchase
- 时间 + 任务
- 单日真实记录
- 经验 / 方法 / 技巧
- 图片
- URL
- 和猫相关活动

一个输入可以命中多个目标，不限制单写回。

## 分流优先级

### 1. 明确结构化前缀优先

- `todo:`
- `finish:`
- `research:`
- `sleep:`
- `wake:`

### 2. 明确主存类内容优先

- 购买 -> `todos/2026-04-06-purchase-master.md`
- 日程句子 -> `schedules/weekly-schedule.md`
- 和猫的吃喝玩 -> `private/cat-food-fun-index.md`

### 3. 日常真实发生的事

- 先写 `logs/daily/YYYY-MM-DD.md`
- 有周价值时再提炼到 `logs/weekly/YYYY-WXX.md`

### 4. 长期行动领域沉淀

- 篮球 / 足球 / 羽毛球 / 护肤这类经验，不直接靠关键词硬匹配
- 优先调用本地 Codex 判断是否沉淀到 `iterations/*.md`

## 模型与规则的分工

规则负责：

- 购买
- 日程
- DDL / 纪念日
- 和猫的显式索引
- Todo 命中与回写

模型负责：

- 经验是否值得沉淀到行动领域
- 应该进入 `最近变化 / 当前问题 / 经验沉淀 / 下一步` 哪一栏
- 混合语义里哪个部分更像长期知识，而不是短期流水

如果首页对“上一条随手记”执行单条沉淀，并且需要调用 AI 判断：

- 前端必须异步发起
- 后端后台执行
- 前端轮询结果
- 不阻塞首页输入

## 日程路由

只要输入里明显出现：

- 日期
- 周几
- 今天 / 明天
- 上午 / 中午 / 下午 / 晚上

并且后面跟着一个动作，就优先尝试写入：

- `schedules/weekly-schedule.md`

例如：

- `今天晚上 去投篮`
- `周四晚上 去东操音乐跑`
- `明天下午 做 3 小时科研`
- `04-12 晚上 和猫去看电影`

默认拆成：

- 日期
- 分段
- 事项

补充规则：

- 如果句子里明确出现 `今天 / 今晚 / 今早 / 今日`，优先直接沉到今日日程。
- 这里的“今日日程”实际主存是 `schedules/weekly-schedule.md` 中今天那一天的 `日程` 栏。

## 购买

- `购买` 默认进入统一购买入口，不再为单个购买项单独造多个表
- 衣服、护肤品、化妆品、鞋，可以同时联动衣柜与妆台索引

## 当前随手记路由表

| 内容类型 | 判断信号 | 默认出口 |
| --- | --- | --- |
| 原始输入 | 文字 / 图片 / 临时想法 | `inbox/quick-capture.md` |
| 今天发生的事 | 已发生事实 | `logs/daily/YYYY-MM-DD.md` |
| 对本周有意义 | 有周推进价值 | `logs/weekly/YYYY-WXX.md` |
| 时间 + 事项 | 周几 / 日期 / 时间段 + 动作 | `schedules/weekly-schedule.md` |
| 购买 | 买 / 下单 / 待买 | `todos/2026-04-06-purchase-master.md` |
| 领域经验 | 篮球 / 足球 / 健身 / 羽毛球 / 护肤关键词 | `iterations/*.md` |
| 和猫普通活动 | 猫 + 吃喝玩 / 去哪里 | `private/cat-food-fun-index.md` |
| 和猫高光活动 | 值得回看、特殊活动 | `private/cat-100-things.md` |

说明：

- 行动领域沉淀现在支持关键词直达。
- 当前不把资产总表作为随手记主出口。

## 领域沉淀

像下面这种内容，优先让本地 Codex 判断：

- `投篮：肩膀对准+释放`
- `足球长传发力还是断`
- `护肤后这两天没长新痘`

如果值得沉淀，再写到：

- `iterations/basketball.md`
- `iterations/football.md`
- `iterations/badminton.md`
- `iterations/skincare.md`

## 和猫

- `猫` 默认指代女朋友
- 和猫吃饭、玩乐、约会、去哪里 -> `private/cat-food-fun-index.md`
- 明显值得反复回看、属于高光活动 -> `private/cat-100-things.md`

## 不允许的情况

- 不要把首页当最终数据库
- 不要把随手记原文直接复制到所有地方
- 不要为了归档制造重复信息
- 不要给一个购买需求同时新建多个 Todo 和多个清单项

## 输出要求

每次自动写回后，要能说明：

1. 写到了哪个文件
2. 有没有新建文件
3. 是否同时联动了多个主存
