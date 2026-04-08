# 开源拆分说明

这个项目适合开源的不是“你的真实个人仓库”，而是“个人系统框架”。

## 推荐拆分

### 公开仓库

保留这些内容：

- `web/`
- `scripts/`
- `schemas/`
- `templates/`
- `workflows/`
- `skills/`
- `config/`
- `package.json`
- `README.md`

这些属于系统层、展示层和自动化层。

### 私有数据目录

把真实个人数据放到独立内容目录，或者仓库外路径：

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

## 现在已经支持的分离方式

脚本层已经支持通过环境变量切换数据根目录：

```bash
PEOS_CONTENT_ROOT=/absolute/path/to/your-private-content npm run serve
PEOS_CONTENT_ROOT=/absolute/path/to/your-private-content npm run sync
```

默认不设置时，仍然读取当前仓库根目录，兼容你现在的用法。

## 推荐目录形态

```text
personal-evolution-os/
  web/
  scripts/
  schemas/
  templates/
  workflows/
  config/
  README.md

/Users/you/peos-content/
  soul.md
  logs/
  todos/
  tasks/
  schedules/
  iterations/
  private/
  ...
```

## 迁移步骤

1. 保持当前仓库代码不动。
2. 复制一份真实数据到仓库外，例如 `/Users/you/peos-content/`。
3. 启动时加上 `PEOS_CONTENT_ROOT`。
4. 确认首页、Todo、领域、日记都能正常读写。
5. 再把公开仓库里的真实私人数据删掉或替换成 demo。

## 开源时不要公开

- 真实照片
- 日志正文
- 和猫相关私人内容
- 金额、资产、健康数据
- 真实探索记录和生活痕迹

## 最终目标

做成：

- 一个公开的系统仓库
- 一个私有的数据目录
- 一个可以给别人 fork 的模板版
