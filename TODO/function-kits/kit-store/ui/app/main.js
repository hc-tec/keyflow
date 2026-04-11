(() => {
  "use strict";

  const kitId = "kit-store";
  const surface = "panel";
  const DEFAULT_CATALOG_SOURCE = "npm:@keyflow2/keyflow-kit-catalog";
  const CATEGORY_LABELS = Object.freeze({
    ai: "AI",
    chat: "聊天",
    clipboard: "剪贴板",
    download: "下载",
    file: "文件",
    files: "文件",
    image: "图片",
    install: "安装",
    local: "本地",
    network: "联网",
    ocr: "识图",
    paste: "粘贴",
    productivity: "效率",
    reply: "回复",
    rewrite: "改写",
    snippet: "短语",
    store: "商店",
    summarize: "总结",
    system: "系统",
    template: "模板",
    tone: "语气",
    tool: "工具",
    tools: "工具",
    translate: "翻译",
    translation: "翻译",
    upload: "上传",
    wechat: "微信",
    writing: "写作"
  });

  const featuredKitIds = new Set(["ai-smart-write", "clipboard-plus", "chat-auto-reply", "quick-phrases"]);

  const preview = {
    sources: [],
    packages: [],
    installed: []
  };

  let kit = null;
  let toastTimer = null;
  let updateToastShown = false;

  function safeText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function normalizeSemver(value) {
    const raw = safeText(value);
    if (!raw) return "";
    if (raw.startsWith("v") || raw.startsWith("V")) return raw.slice(1);
    return raw;
  }

  function parseSemver(value) {
    const raw = normalizeSemver(value);
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/.exec(raw);
    if (!match) return null;
    const major = Number(match[1]);
    const minor = Number(match[2]);
    const patch = Number(match[3]);
    if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) return null;
    const prerelease = match[4] ? match[4].split(".") : [];
    return { major, minor, patch, prerelease };
  }

  function isNumericIdentifier(value) {
    return /^[0-9]+$/.test(value);
  }

  function comparePrereleaseIdentifiers(a, b) {
    if (a === b) return 0;
    const aNum = isNumericIdentifier(a);
    const bNum = isNumericIdentifier(b);
    if (aNum && bNum) return Number(a) - Number(b);
    if (aNum && !bNum) return -1;
    if (!aNum && bNum) return 1;
    return a < b ? -1 : 1;
  }

  function compareSemver(aValue, bValue) {
    const a = parseSemver(aValue);
    const b = parseSemver(bValue);
    if (!a || !b) return 0;
    if (a.major !== b.major) return a.major - b.major;
    if (a.minor !== b.minor) return a.minor - b.minor;
    if (a.patch !== b.patch) return a.patch - b.patch;

    const aPre = a.prerelease;
    const bPre = b.prerelease;
    if (aPre.length === 0 && bPre.length === 0) return 0;
    if (aPre.length === 0) return 1; // release > prerelease
    if (bPre.length === 0) return -1;

    const limit = Math.max(aPre.length, bPre.length);
    for (let i = 0; i < limit; i++) {
      const left = aPre[i];
      const right = bPre[i];
      if (left == null) return -1;
      if (right == null) return 1;
      const diff = comparePrereleaseIdentifiers(left, right);
      if (diff !== 0) return diff;
    }
    return 0;
  }

  function parseNpmSpecVersion(value) {
    const raw = safeText(value);
    if (!raw) return "";
    if (!/^npm:/i.test(raw)) return "";
    const rest = raw.slice(4);
    const at = rest.lastIndexOf("@");
    if (at <= 0 || at === rest.length - 1) return "";
    return safeText(rest.slice(at + 1));
  }

  function getInstalledVersion(record) {
    if (!record || typeof record !== "object") return "";
    const direct = safeText(record.version ?? record.manifest?.version ?? record.pkg?.version ?? "");
    if (direct) return direct;
    return parseNpmSpecVersion(record.installKey ?? record.source ?? record.installSource ?? "");
  }

  function getCatalogVersion(pkg) {
    if (!pkg || typeof pkg !== "object") return "";
    return safeText(pkg.version ?? pkg?.npm?.version ?? "");
  }

  function buildLatestPackageByKitId(packages) {
    const list = Array.isArray(packages) ? packages : [];
    const latest = new Map();
    for (const pkg of list) {
      const id = normalizeKitId(pkg?.kitId ?? pkg?.id);
      if (!id) continue;

      const existing = latest.get(id);
      if (!existing) {
        latest.set(id, pkg);
        continue;
      }

      const existingVersion = getCatalogVersion(existing);
      const nextVersion = getCatalogVersion(pkg);
      if (!existingVersion || !nextVersion) continue;
      if (compareSemver(nextVersion, existingVersion) > 0) {
        latest.set(id, pkg);
      }
    }
    return latest;
  }

  function computeUpdateCount(installed, packages) {
    const installedList = Array.isArray(installed) ? installed : [];
    const latestById = buildLatestPackageByKitId(packages);
    let count = 0;
    for (const record of installedList) {
      const id = normalizeKitId(record?.kitId ?? record?.id);
      if (!id) continue;
      if (id === kitId) continue; // store kit updates are shipped via APK
      const pkg = latestById.get(id) ?? null;
      if (!pkg) continue;
      const installedVersion = getInstalledVersion(record);
      const latestVersion = getCatalogVersion(pkg);
      if (!installedVersion || !latestVersion) continue;
      if (compareSemver(installedVersion, latestVersion) < 0) count++;
    }
    return count;
  }

  function normalizeKitId(value) {
    const text = safeText(value);
    return text || null;
  }

  function normalizeTextList(values) {
    if (!Array.isArray(values)) return [];
    const seen = new Set();
    const list = [];
    for (const value of values) {
      const text = safeText(value);
      if (!text) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(text);
    }
    return list;
  }

  function humanizeToken(value) {
    const raw = safeText(value);
    if (!raw) return "";
    if (/[^\x00-\x7F]/.test(raw)) return raw;
    return raw
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => (part.length <= 3 ? part.toUpperCase() : `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`))
      .join(" ");
  }

  function displayTagLabel(value) {
    const raw = safeText(value);
    if (!raw) return "";
    return CATEGORY_LABELS[raw.toLowerCase()] ?? humanizeToken(raw);
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

  function normalizeDownloadCount(value) {
    const num = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (!Number.isFinite(num) || num <= 0) return null;
    return Math.floor(num);
  }

  function trimTrailingDotZero(text) {
    return String(text).replace(/\.0(?=[a-zA-Z\u4e00-\u9fa5]?$)/, "");
  }

  function formatCompactCountValue(value) {
    const count = normalizeDownloadCount(value);
    if (count == null) return "";
    if (count >= 100000000) return trimTrailingDotZero((count / 100000000).toFixed(1)) + "亿";
    if (count >= 10000) return trimTrailingDotZero((count / 10000).toFixed(1)) + "万";
    if (count >= 1000) return trimTrailingDotZero((count / 1000).toFixed(1)) + "k";
    return String(count);
  }

  function buildLocalAssetUrl(assetPath) {
    const raw = safeText(assetPath).replace(/^\/+/, "");
    if (!raw) return null;
    return `https://function-kit.local/assets/${raw}`;
  }

  function resolveIconAssetPath(kitRecord) {
    const preferred = kitRecord?.preferredIconAssetPath ?? kitRecord?.icon ?? null;
    if (typeof preferred === "string" && preferred.trim()) return preferred.trim();
    const icons = kitRecord?.icons;
    if (!icons || typeof icons !== "object") return null;
    const sized = Object.entries(icons)
      .map(([size, path]) => ({ size: Number(size), path: safeText(path) }))
      .filter((item) => Number.isFinite(item.size) && item.size > 0 && item.path)
      .sort((a, b) => {
        const aBucket = a.size >= 128 ? 0 : 1;
        const bBucket = b.size >= 128 ? 0 : 1;
        if (aBucket !== bBucket) return aBucket - bBucket;
        return Math.abs(a.size - 128) - Math.abs(b.size - 128);
      });
    return sized[0]?.path ?? null;
  }

  function resolveIconUrl(kitRecord) {
    const raw = resolveIconAssetPath(kitRecord);
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (/^data:/i.test(raw)) return raw;
    return buildLocalAssetUrl(raw);
  }

  function isNpmSpec(value) {
    return /^npm:/i.test(safeText(value));
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

  function deriveCatalogTags(pkg) {
    const directTags = normalizeTextList(pkg?.tags).map(displayTagLabel);
    const categoryTags = normalizeTextList(pkg?.categories).map(displayTagLabel);
    const primaryTag = displayTagLabel(pkg?.tag);
    const permissionTags = deriveTagsFromRuntimePermissions(pkg?.runtimePermissions);
    return normalizeTextList([...directTags, ...categoryTags, primaryTag, ...permissionTags]).slice(0, 3);
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
    discoverSort: "default",
    discoverOnlyWithDownloads: false,
    detailTab: "overview",
    selected: { kind: null, kitId: null },
    installed: [],
    updateCount: 0,
    catalogSources: preview.sources.slice(),
    catalogPackages: [],
    catalogAddUrl: "",
    importUrl: "",
    syncing: false,
    busyByKitId: {},
    toast: { open: false, text: "" },
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
      const latestById = buildLatestPackageByKitId(packages);
      const seen = new Set();
      let items = packages
        .map((pkg) => {
          const id = normalizeKitId(pkg?.kitId ?? pkg?.id);
          if (!id) return null;
          if (id === kitId) return null;
          const latestPkg = latestById.get(id) ?? null;
          if (!latestPkg || latestPkg !== pkg) return null;
          if (seen.has(id)) return null;
          seen.add(id);
          const title = (pkg?.name ?? pkg?.displayName ?? id).toString();
          const installedRecord = installedById.get(id) ?? null;
          const isInstalled = Boolean(installedRecord);
          const isEnabled = installedRecord?.enabled !== false;
          const installedVersion = getInstalledVersion(installedRecord);
          const latestVersion = getCatalogVersion(latestPkg);
          const updateAvailable =
            Boolean(installedRecord) &&
            Boolean(installedVersion) &&
            Boolean(latestVersion) &&
            compareSemver(installedVersion, latestVersion) < 0;
          const tags = deriveCatalogTags(latestPkg);
          const downloadsLastWeek = normalizeDownloadCount(latestPkg?.downloads_last_week);
          return {
            kind: "package",
            kitId: id,
            featured: featuredKitIds.has(id),
            updateAvailable,
            installedVersion: installedVersion || null,
            latestVersion: latestVersion || null,
            title,
            iconUrl: resolveIconUrl(latestPkg),
            iconClass: "kit-icon--meme",
            downloadsLastWeek,
            sub: {
              tags,
              tag: tags[0] ?? "",
              desc: (latestPkg?.description ?? "从 catalog 下载并安装到输入法。").toString()
            },
            action: !isInstalled
              ? { label: "获取", kind: "install" }
              : updateAvailable
                ? { label: "更新", kind: "update" }
                : !isEnabled
                  ? { label: "启用", kind: "enable" }
                  : { label: "打开", kind: "open" },
            pkg: latestPkg
          };
        })
        .filter(Boolean);

      if (this.discoverOnlyWithDownloads) {
        items = items.filter((item) => (item?.downloadsLastWeek ?? 0) > 0);
      }

      const sortMode = safeText(this.discoverSort);
      if (sortMode === "downloads") {
        items = items.slice().sort((a, b) => {
          const ad = a?.downloadsLastWeek ?? -1;
          const bd = b?.downloadsLastWeek ?? -1;
          if (bd !== ad) return bd - ad;
          if (Boolean(b?.featured) !== Boolean(a?.featured)) return b?.featured ? 1 : -1;
          return String(a?.title ?? "").localeCompare(String(b?.title ?? ""));
        });
      }

      return items;
    },

    get manageItems() {
      const installed = Array.isArray(this.installed) ? this.installed : [];
      const latestById = buildLatestPackageByKitId(this.catalogPackages);
      return installed
        .map((record) => {
          const id = normalizeKitId(record?.kitId ?? record?.id);
          if (!id) return null;
          const pkg = latestById.get(id) ?? null;
          const title = (record?.displayName ?? record?.name ?? id).toString();
          const desc = (record?.description ?? "").toString();
          const enabled = record?.enabled !== false;
          const installedVersion = getInstalledVersion(record);
          const latestVersion = getCatalogVersion(pkg);
          const updateAvailable =
            id !== kitId &&
            Boolean(pkg) &&
            Boolean(installedVersion) &&
            Boolean(latestVersion) &&
            compareSemver(installedVersion, latestVersion) < 0;
          return {
            kind: "installed",
            kitId: id,
            featured: featuredKitIds.has(id),
            updateAvailable,
            installedVersion: installedVersion || null,
            latestVersion: latestVersion || null,
            title,
            iconUrl: resolveIconUrl(record),
            iconClass: id.includes("ocr") ? "kit-icon--ocr" : id.includes("clip") ? "kit-icon--clip" : "kit-icon--ai",
            sub: {
              tags: deriveTagsFromRuntimePermissions(record?.runtimePermissions),
              desc: desc || ""
            },
            action:
              id === kitId
                ? { label: "打开", kind: "open" }
                : updateAvailable
                  ? { label: "更新", kind: "update" }
                  : enabled
                    ? { label: "打开", kind: "open" }
                    : { label: "启用", kind: "enable" },
            record,
            pkg
          };
        })
        .filter(Boolean);
    },

    get searchItems() {
      const query = safeText(this.searchQuery).toLowerCase();
      const base = this.tab === "discover" ? this.discoverItems : this.manageItems;
      if (!query) return base;
      return base.filter((item) =>
        [
          item.title,
          (item.sub && item.sub.desc) || "",
          ...(((item.sub && item.sub.tags) || []).filter(Boolean)),
          (item.sub && item.sub.tag) || ""
        ]
          .join(" ")
          .toLowerCase()
          .includes(query)
      );
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
        const versionText = safeText(current.latestVersion ?? current.pkg?.version ?? "");
        if (current.updateAvailable && current.installedVersion && versionText) {
          return `已安装 ${current.installedVersion} · 最新 ${versionText}`;
        }
        return versionText ? `版本 ${versionText}` : "版本";
      }
      const installedVersion = safeText(current.installedVersion ?? "");
      const latestVersion = safeText(current.latestVersion ?? "");
      if (current.updateAvailable && installedVersion && latestVersion) {
        return `已安装 ${installedVersion} · 最新 ${latestVersion}`;
      }
      return installedVersion ? `版本 ${installedVersion}` : "版本";
    },

    get versionSize() {
      const current = this.selectedItem;
      if (!current) return "";
      if (current.kind === "package") {
        return formatBytes(current.pkg?.dist?.sizeBytes ?? current.pkg?.sizeBytes);
      }
      return "";
    },

    formatCompactCount(value) {
      return formatCompactCountValue(value);
    },

    get detailPermissions() {
      const current = this.selectedItem;
      if (!current) return [];
      const raw =
        current.kind === "installed"
          ? current.record?.runtimePermissions
          : current.pkg?.runtimePermissions ?? current.pkg?.manifest?.runtimePermissions;
      return normalizeTextList(Array.isArray(raw) ? raw : []);
    },

    get detailGrantedPermissions() {
      const current = this.selectedItem;
      if (!current || current.kind !== "installed") return [];
      const raw = current.record?.grantedPermissions;
      return normalizeTextList(Array.isArray(raw) ? raw : []);
    },

    get detailPermissionOverrides() {
      const current = this.selectedItem;
      if (!current || current.kind !== "installed") return {};
      const raw = current.record?.permissionOverrides;
      if (!raw || typeof raw !== "object") return {};
      return raw;
    },

    get permissionRisky() {
      return this.detailPermissions.some((permission) => this.isHighRiskPermission(permission));
    },

    emojiFor(value) {
      return emojiFor(value);
    },

    permissionLabel(permission) {
      const map = {
        "context.read": "读取上下文",
        "input.insert": "写入输入框(插入)",
        "input.replace": "写入输入框(替换)",
        "input.commitImage": "写入输入框(图片)",
        "input.observe.best_effort": "观察输入(尽力而为)",
        "candidates.regenerate": "候选项生成",
        "settings.open": "打开系统设置",
        "storage.read": "读取存储",
        "storage.write": "写入存储",
        "files.pick": "读取本地文件(选择器)",
        "files.download": "下载文件(缓存)",
        "panel.state.write": "修改面板状态(收起/展开)",
        "runtime.message.send": "跨 Kit 通信(发送)",
        "runtime.message.receive": "跨 Kit 通信(接收)",
        "network.fetch": "网络访问(拉取资源)",
        "ai.request": "网络访问(AI推理)",
        "ai.agent.list": "远程智能体(枚举)",
        "ai.agent.run": "远程智能体(执行)",
        "kits.manage": "管理功能件(特权)",
        "send.intercept.ime_action": "拦截发送动作(高风险)"
      };
      return map[permission] ?? permission;
    },

    permissionNote(permission) {
      const map = {
        "context.read": "读取当前应用与输入框上下文信息。",
        "input.insert": "把内容插入到输入框。",
        "input.replace": "把选中文本替换为新内容。",
        "input.commitImage": "向输入框提交图片(部分 App 可能不支持)。",
        "input.observe.best_effort": "在输入变化时获取快照，可能不稳定。",
        "candidates.regenerate": "请求宿主刷新候选项。",
        "settings.open": "跳转到系统设置页。",
        "storage.read": "读取功能件本地存储数据。",
        "storage.write": "写入功能件本地存储数据。",
        "files.pick": "通过系统文件选择器选取文件。",
        "files.download": "由宿主下载远程资源并缓存到本地(用于图标/README 等)。",
        "panel.state.write": "控制面板收起/展开等状态。",
        "runtime.message.send": "向其他功能件发送消息。",
        "runtime.message.receive": "接收其他功能件的消息。",
        "network.fetch": "访问网络请求文本/JSON 数据。",
        "ai.request": "通过网络请求 AI 推理。",
        "ai.agent.list": "读取已配置的远程智能体列表。",
        "ai.agent.run": "调用远程智能体执行任务。",
        "kits.manage": "允许安装/更新/卸载/启用其他功能件。",
        "send.intercept.ime_action": "在用户点击发送前拦截并做决策。"
      };
      return map[permission] ?? "";
    },

    permissionGranted(permission) {
      const current = this.selectedItem;
      const perm = safeText(permission);
      if (!current || !perm) return false;
      if (current.kind !== "installed") return true;

      const raw = current.record?.grantedPermissions;
      if (!Array.isArray(raw)) {
        // Backward compatibility: older hosts did not include grantedPermissions in kits.sync.
        return true;
      }
      return raw.includes(perm);
    },

    permissionCanToggle(permission) {
      const current = this.selectedItem;
      const perm = safeText(permission);
      if (!current || !perm || current.kind !== "installed") return false;
      if (!kit?.kits?.updateSettings) return false;
      if (this.isKitBusy(current.kitId)) return false;

      // Prevent users from bricking the download center.
      if (current.kitId === kitId && ["kits.manage", "files.download"].includes(perm)) {
        return false;
      }
      return true;
    },

    async setKitPermission(permission, enabled) {
      const current = this.selectedItem;
      const perm = safeText(permission);
      if (!current || current.kind !== "installed" || !perm) return;
      if (!this.permissionCanToggle(perm)) {
        this.showToast("该权限不可在此关闭");
        return;
      }

      try {
        this.setKitBusy(current.kitId, "保存中...");
        await kit?.kits?.updateSettings?.({
          task: { title: `${enabled ? "允许" : "禁用"}权限：${this.permissionLabel(perm)}` },
          kitId: current.kitId,
          patch: { permissionOverrides: { [perm]: enabled ? null : false } }
        });
        this.showToast("已更新");

        try {
          await kit?.kits?.sync?.({ includeDisabled: true });
        } catch {
          // ignore
        }
        refreshRuntimeSnapshot();
      } catch (error) {
        this.showToast(error?.message ?? "更新失败");
      } finally {
        this.clearKitBusy(current.kitId);
      }
    },

    isHighRiskPermission(permission) {
      return ["kits.manage", "ai.request", "network.fetch", "send.intercept.ime_action"].includes(permission);
    },

    isKitBusy(targetKitId) {
      const id = normalizeKitId(targetKitId);
      if (!id) return false;
      return Boolean(this.busyByKitId && this.busyByKitId[id]);
    },

    kitBusyLabel(targetKitId) {
      const id = normalizeKitId(targetKitId);
      if (!id) return "";
      return safeText(this.busyByKitId && this.busyByKitId[id]) || "处理中...";
    },

    setKitBusy(targetKitId, label) {
      const id = normalizeKitId(targetKitId);
      if (!id) return;
      const next = { ...(this.busyByKitId || {}) };
      next[id] = safeText(label) || "处理中...";
      this.busyByKitId = next;
    },

    clearKitBusy(targetKitId) {
      const id = normalizeKitId(targetKitId);
      if (!id) return;
      const current = this.busyByKitId || {};
      if (!(id in current)) return;
      const next = { ...current };
      delete next[id];
      this.busyByKitId = next;
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
      const allowed = new Set(["overview", "permissions", "security"]);
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

    async manualRefresh() {
      await syncData({ toastOnSuccess: true });
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
      const id = normalizeKitId(item?.kitId);
      if (id && this.isKitBusy(id)) {
        return;
      }
      if (action === "install") {
        await this.installPackage(item?.pkg, "install");
        return;
      }
      if (action === "update") {
        await this.installPackage(item?.pkg, "update");
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
        if (this.isKitBusy(id)) return;
        this.setKitBusy(id, "启用中...");
        await kit?.kits?.updateSettings?.({ task: { title: `启用：${id}` }, kitId: id, patch: { enabled: true } });
        this.showToast("已启用");
        await syncData();
      } catch (error) {
        this.showToast(error?.message ?? "启用失败");
      } finally {
        this.clearKitBusy(id);
      }
    },

    async installPackage(pkg, reason) {
      const resolvedPkg = pkg && typeof pkg === "object" ? pkg : null;
      const id = normalizeKitId(resolvedPkg?.kitId ?? resolvedPkg?.id);
      const url = safeText(resolvedPkg?.resolvedZipUrl ?? resolvedPkg?.zipUrl ?? resolvedPkg?.dist?.tarball ?? "");
      const sha256 = safeText(resolvedPkg?.sha256 ?? resolvedPkg?.dist?.sha256 ?? "");
      const integrity = safeText(resolvedPkg?.integrity ?? resolvedPkg?.dist?.integrity ?? "");
      const installKey = safeText(resolvedPkg?.installKey ?? "");
      const npmName = safeText(resolvedPkg?.npm?.name ?? "");
      const npmVersion = safeText(resolvedPkg?.npm?.version ?? resolvedPkg?.version ?? "");
      const npmSpec = npmName && npmVersion ? `npm:${npmName}@${npmVersion}` : "";
      if (!id) {
        this.showToast("无法安装：缺少 kitId");
        return;
      }
      if (id === kitId) {
        this.showToast("下载中心是内置组件，请通过更新 APK 升级");
        return;
      }
      if (this.isKitBusy(id)) {
        return;
      }

      const verb =
        safeText(reason) === "update" ? "更新" : safeText(reason) === "reinstall" ? "重新安装" : "安装";
      try {
        this.setKitBusy(
          id,
          verb === "更新" ? "更新中..." : verb === "重新安装" ? "重新安装中..." : "下载中..."
        );
        if (npmSpec) {
          try {
            await kit?.kits?.install?.({
              task: { title: `${verb}：${resolvedPkg?.name ?? id}` },
              source: {
                kind: "npm",
                spec: npmSpec,
                sha256: sha256 || undefined,
                integrity: integrity || undefined,
                installKey: installKey || undefined
              }
            });
          } catch (error) {
            if (!url) throw error;
            await kit?.kits?.install?.({
              task: { title: `${verb}：${resolvedPkg?.name ?? id}` },
              source: {
                kind: "url",
                url,
                sha256: sha256 || undefined,
                integrity: integrity || undefined,
                installKey: installKey || undefined
              }
            });
          }
        } else {
          if (!url) {
            this.showToast("无法安装：缺少安装包 URL");
            return;
          }
          await kit?.kits?.install?.({
            task: { title: `${verb}：${resolvedPkg?.name ?? id}` },
            source: {
              kind: "url",
              url,
              sha256: sha256 || undefined,
              integrity: integrity || undefined,
              installKey: installKey || undefined
            }
          });
        }
        this.showToast(verb === "更新" ? "已更新" : "已安装");
        await syncData();
      } catch (error) {
        this.showToast(error?.message ?? "安装失败");
      } finally {
        this.clearKitBusy(id);
      }
    },

    async uninstallKit(targetKitId) {
      const id = normalizeKitId(targetKitId);
      if (!id) return;
      try {
        if (this.isKitBusy(id)) return;
        this.setKitBusy(id, "卸载中...");
        await kit?.kits?.uninstall?.({ task: { title: `卸载：${id}` }, kitId: id });
        this.showToast("已卸载");
        this.setRoute("home");
        await syncData();
      } catch (error) {
        this.showToast(error?.message ?? "卸载失败");
      } finally {
        this.clearKitBusy(id);
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
        this.showToast("请输入 URL 或 npm:包名@版本");
        return;
      }
      const npmSpec = isNpmSpec(value);
      try {
        await kit?.kits?.install?.({
          task: { title: npmSpec ? "安装：npm" : "安装：URL" },
          source: npmSpec ? { kind: "npm", spec: value } : { kind: "url", url: value }
        });
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

    store.updateCount = computeUpdateCount(store.installed, store.catalogPackages);
  }

  let syncInFlight = null;
  async function syncData(options) {
    const opts = options && typeof options === "object" ? options : {};
    if (syncInFlight) {
      return syncInFlight;
    }

    store.syncing = true;
    syncInFlight = (async () => {
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
    })();

    try {
      await syncInFlight;
      if (opts.toastOnSuccess) {
        store.showToast("已刷新");
      }
    } finally {
      store.syncing = false;
      syncInFlight = null;
    }
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

    if (!updateToastShown && store.updateCount > 0) {
      updateToastShown = true;
      store.showToast(`发现 ${store.updateCount} 个更新`);
    }
  }

  boot();
})();
