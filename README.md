# Personal Evolution OS

一个由本地 AI 驱动的个人数据操作系统。

PEOS 不只是笔记仓库，也不只是 Todo 工具。  
它的核心是把自然语言输入持续沉淀成结构化的个人数据，并稳定回写到 Markdown。

## 核心定位

- 你只负责说话、记录、补充想法
- 本地 AI 负责判断内容该进入哪里
- 系统自动写回日志、Todo、日程、领域和私人页
- 长期形成可复盘、可检索、可演化的个人数据库

一句话：

> Say it once. Let local AI organize your life.

## 这不是在解决什么

它不是：

- 一个普通 Markdown 站点
- 一个 Obsidian 主题
- 一个待办清单网页
- 一个单纯的个人主页

它真正解决的是：

- 如何把零碎输入变成长期结构化数据
- 如何让 AI 参与整理，而不是只参与聊天
- 如何把“记录”变成“可持续维护的个人系统”

## 护城河

真正的护城河不在 UI，而在这几层：

1. 本地 AI 路由
2. 稳定的 Markdown 回写
3. 个人长期数据闭环
4. 日志 / Todo / 日程 / 领域 / 私人页的联动
5. 随着时间积累形成的真实人生数据库

## 工作流

### 1. 输入

你可以：

- 直接和系统对话
- 在首页写随手记
- 用协议输入，例如：
  - `todo: ...`
  - `finish: ...`
  - `research: ...`
  - `eat: ...`
  - `sleep: ...`
  - `wake: ...`

### 2. 路由

系统根据规则和本地 AI 判断内容是：

- 今日日志
- 日程项
- Todo
- 某个领域
- 和猫的私人记录
- 购买总表
- 饮食 / 训练 / 作息数据

### 3. 回写

结果不会停留在聊天里，而是写回结构化 Markdown。

### 4. 展示

前端从 Markdown 数据层同步生成：

- 首页 `今日`
- Todo
- 领域
- 日程
- 日记
- 和猫
- 照片

## 仓库结构

### 系统层

- `web/`
- `scripts/`
- `schemas/`
- `templates/`
- `workflows/`
- `config/`
- `skills/`

### 数据层

- `soul.md`
- `assets/`
- `dimensions/`
- `explorations/`
- `inbox/`
- `iterations/`
- `lists/`
- `logs/`
- `metrics/`
- `notes/`
- `photos/`
- `plans/`
- `private/`
- `profile/`
- `schedules/`
- `tasks/`
- `todos/`

## 数据与系统分离

这个仓库已经支持把系统代码和个人数据拆开。

默认情况下，脚本仍然读取当前仓库根目录里的数据。  
如果你想把真实数据移到仓库外，使用：

```bash
PEOS_CONTENT_ROOT=/absolute/path/to/your-private-content npm run serve
PEOS_CONTENT_ROOT=/absolute/path/to/your-private-content npm run sync
```

这样可以做到：

- GitHub 公开的是系统仓库
- 仓库外保留你的真实日志、照片和私人数据

更完整的拆分建议见 [OPEN_SOURCE.md](./OPEN_SOURCE.md)。

## 怎么打开

### 推荐方式

如果你只是想先跑仓库自带的公开示例：

```bash
npm run init:demo
npm run serve:demo
```

然后打开：

```text
http://127.0.0.1:2333/web/index.html
```

### 使用当前仓库里的数据

在项目根目录运行：

```bash
npm run serve
```

然后打开：

```text
http://127.0.0.1:2333/web/index.html
```

### 如果你用了外部数据目录

```bash
node scripts/init-content-root.js /absolute/path/to/your-private-content
PEOS_CONTENT_ROOT=/absolute/path/to/your-private-content npm run serve
```

然后同样打开：

```text
http://127.0.0.1:2333/web/index.html
```

### 同步前端数据

如果你改了 Markdown，想立即同步到前端：

```bash
npm run sync
```

## 相关文档

- [START_HERE.md](./START_HERE.md)
- [POSITIONING.md](./POSITIONING.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [OPEN_SOURCE.md](./OPEN_SOURCE.md)

## 协议

- `todo: ...` 记录待办
- `finish: ...` 记录完成
- `research: ...` 发起探索
- `eat: ...` 记录饮食
- `train: ...` 记录训练
- `spend: ...` 记录花费
- `mood: ...` 记录状态
- `sleep: ...` / `wake: ...` 记录作息

规则入口：

- `workflows/input-rules.md`
- `workflows/routing-map.md`
- `workflows/archive.md`

## 公开示例说明

仓库里的 `content.example/` 是一套空模板内容目录，不包含作者数据。

它的作用是：

- 提供完整目录结构
- 提供最小可运行的空内容文件
- 作为你初始化自己内容目录时的参考模板

如果你要真正使用这套系统，建议把自己的真实数据放在仓库外，然后通过：

- 首页随手记
- 协议输入
- 直接对话补充 `soul.md`

逐步写进你自己的内容目录。

第一次打开时，最推荐的顺序是：

1. 补 `soul.md`
2. 补 `profile/personal-info.md`
3. 在首页写今天的日计划、打卡和随手记

## 对外介绍时可以怎么说

PEOS is a local-first personal data system powered by AI curation.  
Instead of manually organizing notes, logs, todos, and schedules, you speak naturally and let a local AI route and write everything back into structured Markdown.
