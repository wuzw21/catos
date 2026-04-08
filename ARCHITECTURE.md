# Architecture

## 总体结构

项目分成两层：

1. 系统层
2. 数据层

## 系统层

系统层负责：

- 前端页面
- 本地 API
- 输入协议
- AI 路由
- Markdown 同步

主要目录：

- `web/`
- `scripts/`
- `schemas/`
- `templates/`
- `workflows/`
- `config/`

## 数据层

数据层负责保存真实个人内容：

- 日志
- Todo
- 日程
- 领域
- 私人页
- 购买
- 饮食
- 照片

主要目录：

- `logs/`
- `todos/`
- `tasks/`
- `schedules/`
- `iterations/`
- `private/`
- `lists/`
- `photos/`

## 输入到展示的链路

### 1. 输入层

来源：

- 首页随手记
- 直接协议输入
- 结构化编辑

### 2. 路由层

路由方法：

- 明确协议优先
- 已有文件上下文优先
- 本地 AI 参与判断
- 必要时规则兜底

### 3. 写回层

写回目标：

- `logs/daily/*.md`
- `todos/*.md`
- `tasks/*.md`
- `schedules/*.md`
- `iterations/*.md`
- `private/*.md`

### 4. 同步层

`scripts/sync-web-data.js` 会把 Markdown 汇总成 `web/data.js`。

### 5. 展示层

前端页面读取 `web/data.js` 展示：

- 今日
- Todo
- 领域
- 日程
- 日记
- 和猫
- 照片

## 数据与索引分离

当前已经支持通过环境变量切换内容根目录：

```bash
PEOS_CONTENT_ROOT=/absolute/path/to/private-content npm run serve
```

含义是：

- 仓库内保留系统代码
- 内容根目录保留真实数据
- 前端构建结果仍输出到仓库里的 `web/data.js`

## 关键脚本

- `scripts/web-server.js`
- `scripts/sync-web-data.js`
- `scripts/archive-capture.js`
- `scripts/codex-route-capture.js`
- `scripts/daily-log-generator.js`
- `scripts/start-new-day.js`

## 当前最关键的系统能力

不是页面，而是这三个能力：

1. AI 能判断一句话该去哪
2. 系统能稳定写回同一批 Markdown
3. 前端能把这些真实数据重新组织成“今日 / Todo / 领域 / 日记”
