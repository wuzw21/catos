# Public Safe Checklist

这份清单用于准备第一次公开提交。

## 当前建议公开

- `README.md`
- `POSITIONING.md`
- `ARCHITECTURE.md`
- `OPEN_SOURCE.md`
- `content.example/`
- `config/`
- `schemas/`
- `scripts/`
- `skills/`
- `templates/`
- `web/`
- `workflows/`
- `package.json`
- `.gitignore`

这些属于系统层、规则层和展示层。

## 当前不建议公开

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
- `web/data.js`

原因：

- 包含真实身份信息
- 包含真实生活轨迹
- 包含私人关系内容
- 包含消费、健康、纪念日、照片等敏感数据
- `web/data.js` 是把上述内容汇总后的前端产物

## 首次公开提交建议

如果你只是想先把“系统骨架”发到 GitHub，推荐首次提交只包含：

```text
.gitignore
README.md
POSITIONING.md
ARCHITECTURE.md
OPEN_SOURCE.md
package.json
config/
content.example/
schemas/
scripts/
skills/
templates/
web/
workflows/
```

## 提交前检查

先运行：

```bash
git status --short
```

你应该看不到这些目录被 staged：

- `private/`
- `logs/`
- `photos/`
- `tasks/`
- `todos/`
- `soul.md`

## 推荐提交命令

如果你只提交公开安全版：

```bash
git init
git add .gitignore README.md POSITIONING.md ARCHITECTURE.md OPEN_SOURCE.md PUBLIC_SAFE_CHECKLIST.md package.json
git add config content.example schemas scripts skills templates web workflows
git commit -m "first commit"
git branch -M master
git remote add origin git@github.com:wuzw21/catos.git
git push -u origin master
```

## 推送前最后确认

执行：

```bash
git diff --cached --name-only
```

确认里面没有任何个人数据目录，再推送。
