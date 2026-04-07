(() => {
  "use strict";

  const kitId = "kit-store";
  const surface = "panel";
  const DEFAULT_CATALOG_SOURCE = "npm:@keyflow2/keyflow-kit-catalog";

  const featuredKitIds = new Set(["ai-smart-write", "clipboard-plus", "chat-auto-reply", "quick-phrases"]);

  const preview = {
    sources: [],
    packages: [],
    installed: []
  };

  let kit = null;
  let toastTimer = null;

  function safeText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function normalizeKitId(value) {
    const text = safeText(value);
    return text || null;
  }

  function formatBytes(bytes) {
    const value = typeof bytes === "number" ? bytes : typeof bytes === "string" ? Number(bytes) : NaN;
    if (!Number.isFinite(value) || value <= 0) return "";
    const kb = 1024;
    const mb = kb * 1024;
    if (value >= mb) return `${(value / mb).toFixed(1)}M`;
    if (value >= kb) return `${(value / kb).toFixed(1)}K`;
    return `${Math.round(value)}B`;
  }

  function buildLocalAssetUrl(assetPath) {
    const raw = safeText(assetPath).replace(/^\/+/, "");
    if (!raw) return null;
    return `https://function-kit.local/assets/${raw}`;
  }

  function resolveIconUrl(kitRecord) {
    const preferred = kitRecord?.preferredIconAssetPath ?? kitRecord?.icon ?? null;
    if (typeof preferred === "string" && preferred.trim()) {
      return buildLocalAssetUrl(preferred);
    }
    return null;
  }

  function emojiFor(kitIdValue) {
    const id = (kitIdValue ?? "").toString();
    if (id.includes("ocr")) return "📷";
    if (id.includes("clip") || id.includes("clipboard")) return "📋";
    if (id.includes("meme") || id.includes("dou")) return "🤡";
    if (id.includes("ai") || id.includes("chat") || id.includes("reply")) return "✨";
    return "🤖";
  }

  function deriveTagsFromRuntimePermissions(permissions) {
    const list = Array.isArray(permissions) ? permissions : [];
    const tags = [];
    if (list.includes("ai.request")) tags.push("AI");
    if (list.includes("network.fetch")) tags.push("效率");
    if (list.includes("storage.read") || list.includes("storage.write")) tags.push("系统");
    if (list.includes("files.pick")) tags.push("工具");
    return tags.slice(0, 2);
  }

  function safeCreateKit() {
    const sdk = globalThis.FunctionKitRuntimeSDK;
    if (!sdk || typeof sdk.createKit !== "function") {
      return null;
    }
    try {
      return sdk.createKit({
        kitId,
        surface,
        connect: { timeoutMs: 20000, retries: 2 },
        preview: {
          kitId,
          surface,
          grantAll: true,
          kits: preview.installed,
          catalogSources: preview.sources,
          catalogPackages: preview.packages
        }
      });
    } catch {
      return null;
    }
  }

  function getInstalledKits() {
    const list = kit?.kits?.list?.() ?? [];
    if (Array.isArray(list) && list.length > 0) return list;
    return preview.installed;
  }

  function getCatalogSources() {
    const sources = kit?.state?.catalog?.sources;
    if (Array.isArray(sources)) return sources;
    return preview.sources;
  }

  function getCatalogPackages() {
    const packages = kit?.state?.catalog?.packages;
    if (Array.isArray(packages) && packages.length > 0) return packages;
    return preview.packages;
  }

  const store = globalThis.PetiteVue.reactive({
    route: "home",
    tab: "discover",
    searchOpen: false,
    searchQuery: "",
    detailTab: "overview",
    selected: { kind: null, kitId: null },
    installed: [],
    catalogSources: preview.sources.slice(),
    catalogPackages: [],
    catalogAddUrl: "",
    importUrl: "",
    toast: { open: false, text: "" },
    reviews: [
      { name: "Alex", text: "回答户神器!", stars: 5 },
      { name: "Bob", text: "偶尔说废话", stars: 4 }
    ],
    securityLinks: [
      { label: "隐私政策", kind: "blue", icon: "upright" },
      { label: "问题反馈", kind: "blue", icon: "upright" },
      { label: "违规举报", kind: "danger", icon: "right" }
    ],

    get discoverItems() {
      const installed = Array.isArray(this.installed) ? this.installed : [];
      const installedById = new Map(
        installed
          .map((record) => {
            const id = normalizeKitId(record?.kitId ?? record?.id);
            return id ? [id, record] : null;
          })
          .filter(Boolean)
      );

      const packages = Array.isArray(this.catalogPackages) ? this.catalogPackages : [];
      return packages
        .map((pkg) => {
          const id = normalizeKitId(pkg?.kitId ?? pkg?.id);
          if (!id) return null;
          const title = (pkg?.name ?? pkg?.displayName ?? id).toString();
          const installedRecord = installedById.get(id) ?? null;
          const isInstalled = Boolean(installedRecord);
          const isEnabled = installedRecord?.enabled !== false;
          return {
            kind: "package",
            kitId: id,
            featured: featuredKitIds.has(id),
            title,
            iconUrl: null,
            iconClass: "kit-icon--meme",
            sub: {
              tag: (pkg?.tag ?? "娱乐").toString(),
              desc: (pkg?.description ?? "输入关键词即出图").toString()
            },
            action: isInstalled
              ? isEnabled
                ? { label: "打开", kind: "open" }
                : { label: "启用", kind: "enable" }
              : { label: "获取", kind: "install" },
            pkg
          };
        })
        .filter(Boolean);
    },

    get manageItems() {
      const installed = Array.isArray(this.installed) ? this.installed : [];
      return installed
        .map((record) => {
          const id = normalizeKitId(record?.kitId ?? record?.id);
          if (!id) return null;
          const title = (record?.displayName ?? record?.name ?? id).toString();
          const desc = (record?.description ?? "").toString();
          const enabled = record?.enabled !== false;
          return {
            kind: "installed",
            kitId: id,
            featured: featuredKitIds.has(id),
            title,
            iconUrl: resolveIconUrl(record),
            iconClass: id.includes("ocr") ? "kit-icon--ocr" : id.includes("clip") ? "kit-icon--clip" : "kit-icon--ai",
            sub: {
              tags: deriveTagsFromRuntimePermissions(record?.runtimePermissions),
              desc: desc || ""
            },
            action: enabled ? { label: "打开", kind: "open" } : { label: "启用", kind: "enable" },
            record
          };
        })
        .filter(Boolean);
    },

    get searchItems() {
      const query = safeText(this.searchQuery).toLowerCase();
      const base = this.tab === "discover" ? this.discoverItems : this.manageItems;
      if (!query) return base;
      return base.filter((item) => `${item.title} ${(item.sub && item.sub.desc) || ""}`.toLowerCase().includes(query));
    },

    get selectedItem() {
      const selectedKitId = this.selected?.kitId;
      const kind = this.selected?.kind;
      if (!selectedKitId || !kind) return null;
      if (kind === "package") {
        return this.discoverItems.find((item) => item.kitId === selectedKitId) ?? null;
      }
      return this.manageItems.find((item) => item.kitId === selectedKitId) ?? null;
    },

    get detailMeta() {
      const current = this.selectedItem;
      if (!current) return "";
      return current.kind === "installed" ? "IME 官方 · 4.8★" : "Catalog · 4.8★";
    },

    get overviewText() {
      const current = this.selectedItem;
      if (!current) return "";
      if (current.kind === "installed") {
        return (current.record?.description ?? current.sub?.desc ?? "").toString();
      }
      return (current.pkg?.description ?? current.sub?.desc ?? "").toString();
    },

    get versionTitle() {
      const current = this.selectedItem;
      if (!current) return "";
      if (current.kind === "package") {
        const versionText = safeText(current.pkg?.version ?? "");
        return versionText ? `版本 ${versionText}` : "版本";
      }
      return "版本";
    },

    get versionSize() {
      const current = this.selectedItem;
      if (!current) return "";
      if (current.kind === "package") {
        return formatBytes(current.pkg?.sizeBytes);
      }
      return "";
    },

    get detailPermissions() {
      const current = this.selectedItem;
      if (!current || current.kind !== "installed") return [];
      return Array.isArray(current.record?.runtimePermissions) ? current.record.runtimePermissions : [];
    },

    get permissionRisky() {
      return this.detailPermissions.some((permission) => this.isHighRiskPermission(permission));
    },

    stars(count) {
      const safeCount = Number.isFinite(count) ? count : Number(count ?? 0);
      const resolved = Math.max(0, Math.min(5, safeCount));
      return "★".repeat(resolved);
    },

    emojiFor(value) {
      return emojiFor(value);
    },

    permissionLabel(permission) {
      const map = {
        "network.fetch": "网络访问(拉取资源)",
        "ai.request": "网络访问(AI推理)",
        "context.read": "读取上下文",
        "input.insert": "写入输入框",
        "input.replace": "写入输入框",
        "files.pick": "读取本地文件",
        "files.download": "下载文件(缓存)",
        "kits.manage": "管理功能件(特权)",
        "storage.read": "读取存储",
        "storage.write": "写入存储"
      };
      return map[permission] ?? permission;
    },

    isHighRiskPermission(permission) {
      return ["kits.manage", "ai.request", "network.fetch", "send.intercept.ime_action"].includes(permission);
    },

    showToast(message) {
      const text = safeText(message) || "已完成";
      this.toast.text = text;
      this.toast.open = true;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        this.toast.open = false;
      }, 1400);
    },

    setRoute(route) {
      this.route = safeText(route) || "home";
    },

    setTab(tab) {
      const next = safeText(tab) || "discover";
      this.tab = next === "manage" ? "manage" : "discover";
    },

    setDetailTab(tab) {
      const next = safeText(tab) || "overview";
      const allowed = new Set(["overview", "permissions", "reviews", "security"]);
      this.detailTab = allowed.has(next) ? next : "overview";
    },

    openSearch() {
      this.searchOpen = true;
      setTimeout(() => document.getElementById("searchInput")?.focus(), 30);
    },

    closeSearch() {
      this.searchOpen = false;
      this.searchQuery = "";
    },

    openSettings() {
      refreshRuntimeSnapshot();
      this.setRoute("settings");
    },

    openImport() {
      this.setRoute("import");
    },

    backFromSubView() {
      this.setRoute("home");
      this.closeSearch();
    },

    backFromDetail() {
      this.setRoute("home");
    },

    openDetail(item) {
      const kind = safeText(item?.kind);
      const id = normalizeKitId(item?.kitId);
      if (!kind || !id) return;
      this.selected = { kind, kitId: id };
      this.setDetailTab("overview");
      this.setRoute("detail");
    },

    async handleCardAction(item) {
      const action = safeText(item?.action?.kind);
      if (action === "install") {
        await this.installPackage(item?.pkg);
        return;
      }
      if (action === "enable") {
        await this.enableKit(item?.kitId);
        return;
      }
      if (action === "open") {
        await this.openKit(item?.kitId);
        return;
      }
      this.openDetail(item);
    },

    async collapsePanel() {
      try {
        await kit?.panel?.updateState?.({ action: "collapse" });
      } catch {
        // ignore
      }
      this.showToast("已收起");
    },

    async openKit(targetKitId) {
      const id = normalizeKitId(targetKitId);
      if (!id) return;
      if (!kit?.kits?.open) {
        this.showToast("当前版本不支持打开功能件");
        return;
      }
      try {
        await kit.kits.open({ task: { title: `打开：${id}` }, kitId: id });
      } catch (error) {
        this.showToast(error?.message ?? "打开失败");
      }
    },

    async enableKit(targetKitId) {
      const id = normalizeKitId(targetKitId);
      if (!id) return;
      try {
        await kit?.kits?.updateSettings?.({ task: { title: `启用：${id}` }, kitId: id, patch: { enabled: true } });
        this.showToast("已启用");
        await syncData();
      } catch (error) {
        this.showToast(error?.message ?? "启用失败");
      }
    },

    async installPackage(pkg) {
      const resolvedPkg = pkg && typeof pkg === "object" ? pkg : null;
      const id = normalizeKitId(resolvedPkg?.kitId ?? resolvedPkg?.id);
      const url = safeText(resolvedPkg?.resolvedZipUrl ?? resolvedPkg?.zipUrl ?? "");
      const sha256 = safeText(resolvedPkg?.sha256 ?? "");
      const integrity = safeText(resolvedPkg?.integrity ?? resolvedPkg?.dist?.integrity ?? "");
      const installKey = safeText(resolvedPkg?.installKey ?? "");
      if (!id) {
        this.showToast("无法安装：缺少 kitId");
        return;
      }
      if (!url) {
        this.showToast("无法安装：缺少安装包 URL");
        return;
      }
      try {
        await kit?.kits?.install?.({
          task: { title: `安装：${resolvedPkg?.name ?? id}` },
          source: {
            kind: "url",
            url,
            sha256: sha256 || undefined,
            integrity: integrity || undefined,
            installKey: installKey || undefined
          }
        });
        this.showToast("已安装");
        await syncData();
      } catch (error) {
        this.showToast(error?.message ?? "安装失败");
      }
    },

    async uninstallKit(targetKitId) {
      const id = normalizeKitId(targetKitId);
      if (!id) return;
      try {
        await kit?.kits?.uninstall?.({ task: { title: `卸载：${id}` }, kitId: id });
        this.showToast("已卸载");
        this.setRoute("home");
        await syncData();
      } catch (error) {
        this.showToast(error?.message ?? "卸载失败");
      }
    },

    async uninstallSelected() {
      const current = this.selectedItem;
      if (!current) return;
      if (current.kind !== "installed" || current.record?.userInstalled !== true) {
        this.showToast("仅支持卸载外部导入的功能件");
        return;
      }
      await this.uninstallKit(current.kitId);
    },

    async setCatalogSources(sources) {
      const next = Array.isArray(sources) ? sources : [];
      try {
        await kit?.catalog?.setSources?.({ task: { title: "更新 Catalog 源" }, sources: next });
        this.catalogSources = next;
        this.showToast("已更新");
        await syncData();
        return true;
      } catch (error) {
        this.showToast(error?.message ?? "更新失败");
        return false;
      }
    },

    async addCatalogSource() {
      const value = safeText(this.catalogAddUrl);
      if (!value) return;
      if (!/^https?:\/\//i.test(value) && !/^npm:/i.test(value)) {
        this.showToast("请输入 URL 或 npm:xxx");
        return;
      }

      const sources = Array.isArray(this.catalogSources) ? [...this.catalogSources] : [];
      if (!sources.some((entry) => safeText(entry?.url) === value)) {
        sources.push({ url: value, enabled: true });
      }

      const ok = await this.setCatalogSources(sources);
      if (ok) {
        this.catalogAddUrl = "";
      }
    },

    async removeCatalogSource(url) {
      const target = safeText(url);
      if (!target) return;
      const sources = Array.isArray(this.catalogSources) ? this.catalogSources : [];
      await this.setCatalogSources(sources.filter((entry) => safeText(entry?.url) !== target));
    },

    async resetCatalogSources() {
      await this.setCatalogSources([{ url: DEFAULT_CATALOG_SOURCE, enabled: true }]);
    },

    async installImportUrl() {
      const value = safeText(this.importUrl);
      if (!value) {
        this.showToast("请输入 URL");
        return;
      }
      try {
        await kit?.kits?.install?.({ task: { title: "安装：URL" }, source: { kind: "url", url: value } });
        this.showToast("已安装");
        this.setRoute("home");
        await syncData();
      } catch (error) {
        this.showToast(error?.message ?? "安装失败");
      }
    },

    async installFromZip() {
      try {
        const pick = await kit?.files?.pick?.({ acceptMimeTypes: ["application/zip"], multiple: false });
        const fileId = pick?.files?.[0]?.fileId;
        if (!fileId) {
          this.showToast("已取消");
          return;
        }
        await kit?.kits?.install?.({ task: { title: "安装：本地 ZIP" }, source: { kind: "file", fileId } });
        this.showToast("已安装");
        this.setRoute("home");
        await syncData();
      } catch (error) {
        this.showToast(error?.message ?? "安装失败");
      }
    }
  });

  function refreshRuntimeSnapshot() {
    const installed = getInstalledKits();
    store.installed = Array.isArray(installed) ? [...installed] : [];

    const sources = getCatalogSources();
    store.catalogSources = Array.isArray(sources) ? [...sources] : [];

    const packages = getCatalogPackages();
    store.catalogPackages = Array.isArray(packages) ? [...packages] : [];
  }

  async function syncData() {
    if (!kit) {
      refreshRuntimeSnapshot();
      return;
    }

    try {
      await kit.kits.sync({ includeDisabled: true });
    } catch {
      // ignore
    }

    try {
      await kit.catalog.getSources({ task: { title: "读取 Catalog 源" } });
    } catch {
      // ignore
    }

    try {
      await kit.catalog.refresh({ task: { title: "刷新目录" } });
    } catch (error) {
      store.showToast(error?.message ?? "刷新目录失败");
    }

    refreshRuntimeSnapshot();
  }

  function initSwipeNavigation() {
    const homeView = document.getElementById("homeView");
    if (!homeView) return;

    let swipeStartX = null;
    let swipeStartY = null;

    homeView.addEventListener(
      "touchstart",
      (event) => {
        if (store.route !== "home") return;
        if (event.touches.length !== 1) return;
        const target = event.target;
        const tag = target?.tagName?.toUpperCase?.();
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        swipeStartX = event.touches[0].clientX;
        swipeStartY = event.touches[0].clientY;
      },
      { passive: true }
    );

    homeView.addEventListener(
      "touchend",
      (event) => {
        if (store.route !== "home") return;
        if (swipeStartX == null || swipeStartY == null) return;
        const touch = event.changedTouches?.[0];
        if (!touch) return;
        const dx = touch.clientX - swipeStartX;
        const dy = touch.clientY - swipeStartY;
        swipeStartX = null;
        swipeStartY = null;

        if (Math.abs(dx) < 60) return;
        if (Math.abs(dx) <= Math.abs(dy) * 1.2) return;

        if (dx < 0 && store.tab === "discover") {
          store.setTab("manage");
          return;
        }

        if (dx > 0 && store.tab === "manage") {
          store.setTab("discover");
        }
      },
      { passive: true }
    );
  }

  globalThis.PetiteVue.createApp(store).mount("#app");

  async function boot() {
    kit = safeCreateKit();
    try {
      await kit?.connect?.();
    } catch {
      // preview / disconnected ok
    }

    try {
      kit?.on?.("kits.sync", () => {
        refreshRuntimeSnapshot();
      });
      kit?.on?.("catalog.sync", () => {
        refreshRuntimeSnapshot();
      });
      kit?.on?.("catalog.sources.sync", () => {
        refreshRuntimeSnapshot();
      });
    } catch {
      // ignore
    }

    refreshRuntimeSnapshot();
    initSwipeNavigation();
    await syncData();
  }

  boot();
})();
