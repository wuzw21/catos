# 云端部署、域名和移动端最小配置

当前实现是“云端 Backend + Web 前端同源部署 + 本地 JSON 数据文件”。没有单独数据库服务；云端必须给 `PEOS_CONTENT_ROOT` 配一个持久化目录，否则容器重启后数据会丢。

## 后端环境变量

生产环境至少配置：

```bash
HOST=0.0.0.0
PORT=2333
PEOS_CONTENT_ROOT=/data/peos-content
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
```

数据文件会写到：

```text
/data/peos-content/private/couple-workspace.json
```

随手记照片和自动总结引用图片会写到：

```text
/data/peos-content/private/couple-assets/
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
node scripts/init-content-root.js /data/peos-content
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
