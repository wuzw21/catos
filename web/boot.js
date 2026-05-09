(function bootstrapPersonalOS() {
  const serverOrigin = "http://127.0.0.1:2333";
  const legacyPages = new Set([
    "cat.html",
    "detail.html",
    "diary.html",
    "input.html",
    "iterations.html",
    "photos.html",
    "schedule.html",
    "system.html",
    "todo.html",
  ]);

  function isLegacyWebPage() {
    const filename = window.location.pathname.split("/").pop();
    return legacyPages.has(filename);
  }

  function getServerPageUrl() {
    const marker = "/web/";
    const index = window.location.pathname.lastIndexOf(marker);
    const relativePath = index >= 0 ? window.location.pathname.slice(index) : "/web/index.html";
    const canonicalPath = isLegacyWebPage() ? "/web/index.html" : relativePath;
    return `${serverOrigin}${canonicalPath}${window.location.search}${window.location.hash}`;
  }

  async function ensureWritableMode() {
    if (window.location.protocol !== "file:") {
      return;
    }

    if (isLegacyWebPage()) {
      window.location.replace(`./index.html${window.location.search}${window.location.hash}`);
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
            <strong>当前页面只能预览。</strong>
            <span>打开可写版本后，记录和生活卡会正常保存。</span>
          </div>
          <a class="inline-link" href="${targetUrl}">打开可写版本</a>
        `;
        document.body.prepend(banner);
      });
    }
  }

  ensureWritableMode();
})();
