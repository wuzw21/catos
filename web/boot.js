(function bootstrapPersonalOS() {
  const serverOrigin = "http://127.0.0.1:2333";

  function getServerPageUrl() {
    const marker = "/web/";
    const index = window.location.pathname.lastIndexOf(marker);
    const relativePath = index >= 0 ? window.location.pathname.slice(index) : "/web/index.html";
    return `${serverOrigin}${relativePath}${window.location.search}${window.location.hash}`;
  }

  async function ensureWritableMode() {
    if (window.location.protocol !== "file:") {
      return;
    }

    const targetUrl = getServerPageUrl();

    try {
      const response = await fetch(`${serverOrigin}/api/health`, {
        method: "GET",
        mode: "cors",
      });

      if (!response.ok) {
        throw new Error("server not ready");
      }

      if (sessionStorage.getItem("peos-last-server-url") !== targetUrl) {
        sessionStorage.setItem("peos-last-server-url", targetUrl);
        window.location.replace(targetUrl);
      }
    } catch {
      document.addEventListener("DOMContentLoaded", () => {
        const banner = document.createElement("div");
        banner.className = "boot-banner";
        banner.innerHTML = `
          <div class="boot-banner-copy">
            <strong>当前是本地文件模式。</strong>
            <span>保存、打卡、Todo 状态切换都需要通过本地服务打开。</span>
          </div>
          <a class="inline-link" href="${targetUrl}">打开可写版本</a>
        `;
        document.body.prepend(banner);
      });
    }
  }

  ensureWritableMode();
})();
