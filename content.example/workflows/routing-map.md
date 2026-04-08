# Markdown 路由规则

## 目的

这份文档定义：当你输入一句话时，系统应该自动判断写到哪个 Markdown 文件。

目标不是让你手工指定路径，而是由系统先做路由，再告诉你写到了哪里。

统一的首页 / 随手记 / 购买 / 日程分流规则，见：

- `workflows/home-and-capture-routing-skill.md`

## 总原则

1. 优先写回已有文件，而不是重复新建文件。
2. 有明确前缀时，优先按协议路由。
3. 没有明确前缀时，按内容类型和最近上下文判断。
4. 如果是一条补充信息，默认优先补到最近那个同主题文件。
5. 每次写入后，都应该告诉你：写到了哪个文件、文件 id 是什么。
6. 标签默认按两层维护：一级标签用八维，二级标签用具体子领域。

## 一级路由优先级

### 1. 明确文件指向

如果你直接提到：

- todo id
- 具体文件名
- “补到刚才那个 todo”
- “写回这个探索文档”

默认直接写回那个文件。

### 2. 明确协议前缀

#### `run goal: ...`

默认路由：

- 先进入讨论，不直接写文件
- 需要落地时再写进计划、目标卡或日志

#### `todo: ...`

默认路由：

- 新建 `todos/<date>-<slug>.md`
- 同时登记到 `todos/index.md`

#### `finish: ...`

默认路由：

- 如果命中已有 todo，先写回 `todos/*.md`
- 同步 `todos/index.md`
- 同步 `web/data.js`
- `logs/daily/YYYY-MM-DD.md`
- 必要时同步 `logs/weekly/YYYY-WXX.md`
- 必要时同步对应 `dimensions/*/changes.md`

#### `research: ...`

默认路由：

- 新建或更新 `explorations/<slug>.md`

#### `archive: ...`

默认路由：

- 优先读取 `inbox/quick-capture.md` 中当天条目
- 提炼后写入 `logs/daily/YYYY-MM-DD.md`
- 必要时同步 `logs/weekly/YYYY-WXX.md`
- 命中已有 Todo 时回写对应 `todos/*.md`
- 明确是新待办时新建 `todos/*.md`
- 明确是“时间 + 任务”时优先同步 `schedules/weekly-schedule.md`
- 长期子领域变化写入 `iterations/*.md`
- 和 `猫` 相关内容写入 `private/cat-food-fun-index.md` / `private/cat-100-things.md`
- 购买 / 穿搭 / 护肤相关内容写入 `todos/2026-04-06-purchase-master.md` / `lists/wardrobe.md`

#### `eat: ...`

默认路由：

- `logs/daily/YYYY-MM-DD.md`

#### `train: ...`

默认路由：

- `logs/daily/YYYY-MM-DD.md`
- 必要时同步 `dimensions/05-fitness/changes.md`

#### `spend: ...`

默认路由：

- `logs/daily/YYYY-MM-DD.md`
- 必要时同步理财相关记录

#### `mood: ...`

默认路由：

- `logs/daily/YYYY-MM-DD.md`
- 必要时同步 `dimensions/02-life/changes.md`

#### `sleep: ...` / `wake: ...`

默认路由：

- `logs/daily/YYYY-MM-DD.md`

## 二级自动判断

### `帮我记录：...`

默认路由：

- 先写 `logs/daily/YYYY-MM-DD.md`
- 再提炼到 `logs/weekly/YYYY-WXX.md`
- 再同步到相关维度变化

### 没有前缀，但像今天发生的事

例如：

- “今天上午去打羽毛球”
- “晚上吃了盒马”
- “起床 11:30”

默认路由：

- 当日日志
- 如果内容里明确出现和 `猫` 一起吃饭、出去玩、约会或体验活动：
  - 追加到 `private/cat-food-fun-index.md`
  - 如果属于明显的高光时刻，再同步到 `private/cat-100-things.md`
- 如果内容里明确出现日期 / 周几 / 今天明天 + 时间段 + 动作：
  - 同步到 `schedules/weekly-schedule.md`

### 没有前缀，但像待办补充

例如：

- “准备道具：白纸、胶带”
- “再补两个拍照姿势”
- “这个 todo 改成高优先级”

默认路由：

- 最近一个同主题、未完成、仍活跃的 todo 文件

如果内容明显属于“购买”：

- 默认优先更新 `todos/2026-04-06-purchase-master.md`
- 不再为单个购买项新建独立 todo

### 没有前缀，但像探索补充

例如：

- “再加几个春天拍照关键词”
- “把这个链接放进拍照探索”

默认路由：

- 最近一个同主题 exploration 文件

## Todo 回写规则

这是最重要的一条：

如果你刚创建了一个 todo，然后继续说：

- “准备道具……”
- “再补一个子任务……”
- “这个先不做……”

系统默认：

1. 不新建文件
2. 回写刚才那个 todo 文件
3. 同时保留原 todo id 不变

## 自动识别时我会告诉你什么

每次自动路由后，我应该明确告诉你：

1. 写到了哪个文件
2. 文件 id 是什么
3. 如果是回写旧文件，要说明“没有新建”

## 特殊语义

- `猫` 默认指代女朋友
- 和 `猫` 有关的饮食 / 玩乐记录，默认先进入 `private/cat-food-fun-index.md`
- 和 `猫` 有关的特殊活动，进入 `private/cat-100-things.md`

## 标签规则

- 一级标签：固定使用八维
- 二级标签：使用更具体的子领域或主题
- 示例：
- `生活技能 / 饮食`
- `运动 / 篮球`
- `运动 / 羽毛球`
- `艺术 / 摄影`
- `生活技能 / 和猫`
- 后续如果一条内容既有维度又有明确主题，优先同时保留这两层标签

## 当前最常见路由表

| 输入类型 | 怎么判断 | 默认目标文件 |
| --- | --- | --- |
| todo 新建 | 明确 `todo:` | `todos/*.md` |
| todo 补充 | 像刚才那个 todo 的补充 | 最近同主题 todo 文件 |
| finish 命中 todo | 完成已有待办 | 对应 `todos/*.md` + 日志 |
| 今日真实记录 | 已发生的事实 | `logs/daily/*.md` |
| 今天 / 今晚 + 事项 | 强规则，直接进今日日程 | `schedules/weekly-schedule.md` 里的今天 |
| 睡觉 / 起床 | 作息字段 | `logs/daily/*.md` |
| 饮食 | 吃了什么 | `logs/daily/*.md` |
| 训练 | 训练 / 恢复 / 比赛 | `logs/daily/*.md` |
| 情绪 | 状态 / 精力 / 情绪 | `logs/daily/*.md` |
| 探索 | 明确要查资料 | `explorations/*.md` |
| 时间 + 任务 | 周几 / 日期 / 时间段 + 动作 | `schedules/weekly-schedule.md` |
| 购买 | 买 / 下单 / 待买 | `todos/2026-04-06-purchase-master.md` |
| 和猫吃喝玩 | 猫 + 吃喝玩 / 去哪里 | `private/cat-food-fun-index.md` |
| 和猫高光活动 | 值得回看、特殊活动 | `private/cat-100-things.md` |
| 行动领域沉淀 | 篮球 / 足球 / 健身 / 羽毛球 / 护肤关键词 | `iterations/*.md` |
| 长期工作阶段成果 | 阶段完成 / 明显进步 / 可验证结果 | `iterations/*.md` 的 `里程碑 / 成就归档` |
| 归档 | `inbox/quick-capture.md` -> 正式文档联动 | 多文件联动 |

## 当前随手记出口

随手记当前已经接通的正式出口：

- `logs/daily/YYYY-MM-DD.md`
- `logs/weekly/YYYY-WXX.md`
- `schedules/weekly-schedule.md`
- `todos/2026-04-06-purchase-master.md`
- `iterations/*.md`
- `private/cat-food-fun-index.md`
- `private/cat-100-things.md`

当前不把资产总表作为随手记主出口。

补充：

- 如果一句话里出现 `今天 / 今晚 / 今早 / 今日` 并带动作，优先沉淀到今日日程，而不是仅仅当成普通日志句子。
