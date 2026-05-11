# 云端部署、域名和移动端私用配置

当前实现是“云端 Backend + Web 前端同源部署 + 本地 JSON 数据文件”。没有单独数据库服务；云端必须给 `PEOS_CONTENT_ROOT` 配一个持久化目录，否则容器重启后数据会丢。

本仓库的 Codex/Agent 能力不是单独的公网服务。后端会在服务器本机按需执行 `codex exec`，所以生产服务器必须安装 Codex CLI，并且运行 Web 服务的同一个 Linux 用户要完成 Codex 登录。

## 推荐拓扑：两人私用，有域名

当前域名可以直接使用：

- `catandcat.cn` 和 `www.catandcat.cn` 的公网 DNS 指向 `39.106.104.33`。
- 公网 IP `39.106.104.33` 对外只需要开放 SSH、80、443。
- 私有 IP `172.24.60.250` 只适合云内网或管理网络访问，不作为手机入口。
- Node 后端由 systemd 常驻运行在服务器 `2333`。
- Caddy 监听 80/443，自动签发 HTTPS 证书，并反代到 `127.0.0.1:2333`。

手机访问：

```text
https://catandcat.cn/web/index.html
```

域名 HTTPS 模式下生产环境变量使用：

```bash
PEOS_COOKIE_SECURE=1
PEOS_REQUIRE_HTTPS=1
```

如果将来不用域名、只走 Tailscale 私有 HTTP，再切回 `PEOS_COOKIE_SECURE=0`、`PEOS_REQUIRE_HTTPS=0`。

## IP / 域名对应关系

```text
catandcat.cn        -> 39.106.104.33 -> Caddy :443 -> 127.0.0.1:2333
www.catandcat.cn    -> 39.106.104.33 -> Caddy :443 -> 127.0.0.1:2333
39.106.104.33       -> 公网管理入口，只开放 SSH/80/443
172.24.60.250       -> 阿里云私网地址，只在对应私网/VPC 场景使用
127.0.0.1:2333      -> 服务器本机 Node 服务入口，不给手机直接访问
```

实时守护：

```bash
sudo systemctl status peos
sudo systemctl restart peos
sudo systemctl status caddy
sudo systemctl reload caddy
```

## 一键服务器安装脚本

仓库内提供了服务器安装脚本和 systemd 模板：

- `scripts/deploy/setup-tailscale-server.sh`
- `scripts/deploy/check-server.sh`
- `deploy/peos.env.example`
- `deploy/peos.service.template`

服务器默认目录：

```text
/srv/peos/app       # 仓库代码
/srv/peos/content   # 持久私有数据
/etc/peos/peos.env  # 生产环境变量
```

在服务器上执行：

```bash
sudo bash scripts/deploy/setup-tailscale-server.sh
```

如果服务器上还没有仓库，可以先 clone：

```bash
sudo mkdir -p /srv/peos
sudo git clone https://github.com/wuzw21/catos.git /srv/peos/app
cd /srv/peos/app
sudo bash scripts/deploy/setup-tailscale-server.sh
```

如果要指定仓库或分支：

```bash
sudo PEOS_REPO_URL=https://github.com/wuzw21/catos.git \
  PEOS_BRANCH=master \
  bash scripts/deploy/setup-tailscale-server.sh
```

脚本会安装 Node 22、git、Codex CLI、Tailscale，创建 `peos` 服务用户，安装 npm 依赖，构建 Web 前端，初始化 `/srv/peos/content`，并安装 `peos.service`。

域名部署还需要安装 Caddy 并配置反代：

```bash
sudo dnf install -y caddy
sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
{
  email admin@catandcat.cn
}

catandcat.cn, www.catandcat.cn {
  encode gzip zstd

  header {
    X-Robots-Tag "noindex, nofollow, noarchive"
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Content-Type-Options "nosniff"
    Referrer-Policy "same-origin"
  }

  reverse_proxy 127.0.0.1:2333
}
EOF
sudo systemctl enable --now caddy
```

第一次运行后必须编辑生产环境变量，把占位符换成真实值：

```bash
sudo nano /etc/peos/peos.env
sudo systemctl restart peos
```

至少替换：

```bash
PEOS_COUPLE_SESSION_SECRET=一段很长的随机字符串
PEOS_COUPLE_YOU_NAME=你的昵称
PEOS_COUPLE_PARTNER_NAME=小猫的昵称
PEOS_COUPLE_YOU_PASSWORD=你的强访问码
PEOS_COUPLE_PARTNER_PASSWORD=小猫的强访问码
```

可以用这条命令生成 session secret：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Codex 登录和验证

Web 服务由 `peos` 用户运行，所以 Codex 也要用 `peos` 用户登录：

```bash
sudo -u peos -H codex login
```

登录后验证非交互执行：

```bash
sudo -u peos -H codex exec --ephemeral --skip-git-repo-check -C /srv/peos/app "Return exactly: pong"
```

如果这一步失败，日总结 Agent、随手记 Agent 分析等功能会报 `codex exec failed` 或退回本地规则。

完整部署检查：

```bash
sudo bash /srv/peos/app/scripts/deploy/check-server.sh --with-codex
```

不检查 Codex，仅检查 Web 服务：

```bash
sudo bash /srv/peos/app/scripts/deploy/check-server.sh
```

## Tailscale 和防火墙

脚本会安装并启用 `tailscaled`。如果没有通过 `TAILSCALE_AUTHKEY` 自动加入 Tailnet，手动执行：

```bash
sudo tailscale up --hostname=peos-couple
```

查看服务器 Tailnet 地址：

```bash
tailscale ip -4
tailscale status
```

防火墙原则：

- 云安全组不要开放公网 `2333`。
- 只开放 SSH 管理端口。
- 服务器本机如果启用了 UFW，只允许 `tailscale0` 访问 `2333`。

UFW 手动规则示例：

```bash
sudo ufw allow OpenSSH
sudo ufw allow in on tailscale0 to any port 2333 proto tcp
sudo ufw deny in to any port 2333 proto tcp
```

## 后端环境变量

生产环境至少配置：

```bash
HOST=0.0.0.0
PORT=2333
PEOS_CONTENT_ROOT=/srv/peos/content
PEOS_COOKIE_SECURE=1
PEOS_REQUIRE_HTTPS=1
PEOS_COUPLE_SESSION_SECRET=换成一段很长的随机字符串
PEOS_COUPLE_YOU_NAME=你的昵称
PEOS_COUPLE_PARTNER_NAME=对方昵称
PEOS_COUPLE_YOU_PASSWORD=换成强访问码
PEOS_COUPLE_PARTNER_PASSWORD=换成另一个强访问码
# 可选：登录失败限速。默认 10 分钟内 6 次失败后锁 15 分钟
PEOS_LOGIN_RATE_LIMIT_MAX_FAILURES=6
PEOS_LOGIN_RATE_LIMIT_WINDOW_MS=600000
PEOS_LOGIN_RATE_LIMIT_LOCK_MS=900000
# 可选：凌晨 4 点自动刷新日总结。默认开启，默认总结前一天
PEOS_COUPLE_DAILY_SUMMARY_CRON=1
PEOS_COUPLE_DAILY_SUMMARY_HOUR=4
PEOS_COUPLE_DAILY_SUMMARY_CRON_TARGET=yesterday
# 可选：让日总结调用 Codex/Agent；不配置时使用本地规则生成
PEOS_COUPLE_DAILY_SUMMARY_AGENT=1
CODEX_HOME=/home/peos/.codex
```

数据文件会写到：

```text
/srv/peos/content/private/couple-workspace.json
```

随手记照片和自动总结引用图片会写到：

```text
/srv/peos/content/private/couple-assets/
```

登录说明：

- Web 端使用 `HttpOnly` Cookie。
- iOS 第一版建议用 Safari 添加到主屏幕，仍然使用同一套 `HttpOnly` Cookie。
- Expo 壳或后续原生请求也可以使用登录接口返回的 `sessionToken`，请求时放到 `Authorization: Bearer <token>`。
- Session token 是后端签名 token，默认 14 天有效；服务重启后仍然有效。
- 生产环境务必配置 `PEOS_COUPLE_SESSION_SECRET`，否则会用当前账号密码哈希派生本地开发 secret。
- 默认只能修改“当前登录账号自己”的完成状态；如果确实要一个人代改另一个人的完成状态，可配置 `PEOS_COUPLE_ALLOW_CROSS_USER_STATUS=1`。
- 后端会给页面和接口加 `noindex` 响应头，`/__content/*` 未登录不能访问。

如果还要保留原有 Markdown 系统的页面和回写能力，第一次部署前先初始化内容目录：

```bash
PEOS_CONTENT_ROOT=/srv/peos/content node scripts/init-content-root.js /srv/peos/content
```

后续如果换成 Postgres / Supabase，前端可以继续调用 `/api/couple/*`，只替换 `scripts/couple-store.js` 的存储实现。

## 部署方式

推荐先用支持持久磁盘的云服务：

- VPS：DigitalOcean / Hetzner / 阿里云 / 腾讯云，最稳。
- 容器平台：Fly.io / Railway / Render，但要确认有 persistent volume。

Docker 启动示例：

```bash
docker build -t peos-couple .
docker run -d \
  --name peos-couple \
  -p 2333:2333 \
  -v /srv/peos-content:/data/peos-content \
  -e HOST=0.0.0.0 \
  -e PORT=2333 \
  -e PEOS_CONTENT_ROOT=/data/peos-content \
  -e PEOS_COOKIE_SECURE=1 \
  -e PEOS_REQUIRE_HTTPS=1 \
  -e PEOS_COUPLE_SESSION_SECRET='long-random-secret' \
  -e PEOS_COUPLE_YOU_PASSWORD='your-password' \
  -e PEOS_COUPLE_PARTNER_PASSWORD='partner-password' \
  peos-couple
```

注意：Docker 方式要额外处理容器内 Codex CLI 登录和持久化 `CODEX_HOME`。当前两人私用部署优先推荐 systemd 方式，因为 Codex CLI、数据目录和服务用户权限更直接。

## 域名

1. 在 Cloudflare、Namecheap、阿里云或腾讯云买域名。
2. 把域名 DNS 托管到 Cloudflare，后续 HTTPS 和代理更省事。
3. 如果是 VPS，添加 `A` 记录：

```text
app.example.com -> 你的服务器公网 IP
```

4. 在服务器上用 Nginx/Caddy 反代到 `127.0.0.1:2333`。
5. 开 HTTPS。Caddy 最省事，Nginx 可以配 Certbot。

Caddy 示例：

```caddyfile
app.example.com {
  header {
    X-Robots-Tag "noindex, nofollow, noarchive"
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
  }
  reverse_proxy 127.0.0.1:2333
}
```

打开：

```text
https://app.example.com/web/index.html
```

## 当前 API 契约

登录和会话：

- `GET /api/couple/session`
- `POST /api/couple/login`
- `POST /api/couple/logout`
- `GET /api/couple/state?date=YYYY-MM-DD`
- `GET /api/couple/state?date=YYYY-MM-DD&since=REVISION&wait=1&timeoutMs=25000`

核心编辑：

- `POST /api/couple/schedule/upsert`
- `POST /api/couple/schedule/toggle`
- `POST /api/couple/schedule/delete`
- `POST /api/couple/todos/upsert`
- `POST /api/couple/todos/toggle`
- `POST /api/couple/todos/delete`
- `POST /api/couple/checkins/upsert`
- `POST /api/couple/checkins/toggle`
- `POST /api/couple/checkins/delete`
- `POST /api/couple/deadlines/upsert`
- `POST /api/couple/deadlines/delete`
- `POST /api/couple/status`
- `POST /api/couple/capture`
- `POST /api/couple/daily-summary/refresh`
- `POST /api/couple/personal-page`

`POST /api/couple/capture` 可传：

```json
{
  "date": "2026-05-08",
  "text": "今天一起完成了部署检查",
  "mode": "analysis",
  "visibility": "shared",
  "location": "北京",
  "assets": [
    {
      "name": "photo.jpg",
      "dataUrl": "data:image/jpeg;base64,..."
    }
  ]
}
```

Web 使用 HttpOnly Cookie。移动端登录接口也会返回 `sessionToken`，移动端存起来后请求时加：

```http
Authorization: Bearer <sessionToken>
```

协作同步建议：

1. 首屏调用 `GET /api/couple/state?date=YYYY-MM-DD`。
2. 记录返回的 `state.revision`。
3. 后续用 `since=revision&wait=1` 做长轮询。
4. 如果返回 `changed: false`，继续下一轮。
5. 如果返回 `state`，更新本地视图并记录新的 `state.revision`。

## 移动端第一版：iOS 添加到主屏幕

iOS 第一版不需要先打包 App，直接用私有 HTTPS Web App：

1. iPhone 用 Safari 打开：

```text
https://app.example.com/web/index.html
```

2. 登录大猫/小猫账号。
3. Safari 分享按钮选择“添加到主屏幕”。
4. 桌面图标会以独立 Web App 打开，隐藏浏览器地址栏。

这条路线没有 App Store 审核、没有 TestFlight 90 天过期，也不需要给别人分发。关键是服务器必须是 HTTPS，并且 `PEOS_COOKIE_SECURE=1`、`PEOS_REQUIRE_HTTPS=1`、`PEOS_COUPLE_SESSION_SECRET` 都要配置。

Android 第一版也可以直接用 Chrome 打开同一个地址，然后选择“安装应用”或“添加到主屏幕”。安装包路线先不做；后续如果确实需要推送、系统相册或原生小组件，再单独补 Expo / 原生壳。

## 手机端验收

- 未登录打开 `/web/index.html` 只能看到登录页。
- 登录后刷新、关闭、从主屏幕重新打开仍保持登录。
- `__content/private/*` 未登录返回 401。
- 日总结 Agent、随手记、月历弹层、长期记忆在手机宽度下可用。
- 登录失败连续尝试会触发 429 限速。
