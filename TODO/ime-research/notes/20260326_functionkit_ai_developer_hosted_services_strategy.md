# Function Kit：开发者自带 AI 服务（不用用户配置 Key）的策略方案

更新时间：2026-03-26  
范围：仅方案设计（不改实现）。重点解决：用户不配 key 也能用、多模态服务可落地、避免源码泄露密钥。

## 0. 背景：为什么“只用用户配置的 AI”不够

当前方向偏向：

- kit 通过 `ai.chat` 走 **用户在宿主配置的 OpenAI-compatible API**

但现实里：

- 大部分用户根本不会配 key（配了也可能很快失效/没额度）
- 很多能力（绘图/视频/语音/专用模型/私有知识）本质上必须由开发者运营服务

因此需要一套“**kit 开发者提供 AI 服务**”的正式通道，并且：

- 不能把开发者的密钥写进 kit（源码必然暴露）
- 不能把用户隐私默认交给开发者（必须可见、可控、可拒绝）
- 不能让 kit 绕过宿主的权限与网络约束（否则就是数据外流通道）

---

## 1. 目标与非目标

### 目标

- 用户 **不配置任何 key** 也能用（至少能走开发者服务或宿主免费路由）
- 同一个 kit 支持多 AI route：
  - `host-shared`（用户自配、宿主直连）
  - `kit-service`（开发者托管）
  - `local`（本地 demo/离线模型，未来可扩展）
- 宿主层面可以做：
  - 清晰告知与授权（像浏览器扩展权限一样）
  - 域名 allowlist
  - 速率/配额/失败回退
  - 最小必要数据下发（避免“为了方便把全部上下文给出去”）

### 非目标（先不做）

- 不承诺在第一版实现完整支付/订阅系统
- 不承诺实现通用 OAuth/SSO 框架（先预留接口）
- 不在 kit 侧提供“真正安全的密钥保险箱”（需要宿主 secure storage 支撑）

---

## 2. 关键约束：密钥不可能放在 kit

任何把开发者 API key 写进以下位置的做法都不成立：

- kit 代码（HTML/JS/CSS）
- kit manifest
- kit 静态资源
- 通过 runtime API 下发到 WebView 的任何可读字段

因此“开发者提供 AI”必须是：

- **开发者在自己服务器上持有密钥**
- kit/宿主只拿到 **用户级 token / license token / session token**（可撤销）

---

## 3. 建议架构：统一成“多 route 的 AI 调用”，而不是让 kit 直接随便联网

### 3.1 两条可行路径（建议优先走 A）

#### A) 统一 AI 原语：宿主提供 `ai.request`，route 可选择 `host-shared` / `kit-service`

- kit 只会调用 `ai.request`
- 宿主决定把请求发给：
  - 用户配置的 provider（host-shared）
  - kit 开发者服务（kit-service）
- kit 不需要自己拼 URL，不需要自己管跨域/证书/重试

优点：安全边界最清晰，宿主可控、可审计、可做统一弹窗授权与流量治理。  
缺点：宿主实现工作量更大，需要定义 route metadata 与适配层。

#### B) 允许 kit 通过 `network.fetch` 访问开发者域名（强约束 allowlist + 用户授权）

- kit 仍然走 `network.fetch`
- 但必须：
  - manifest 声明 `network.allowedHosts/allowedUrlPatterns`
  - 宿主首次使用时展示“将向这些域名发送数据”的授权
  - 宿主做速率限制与日志（debug 模式可见）

优点：实现成本低，开发者自由度高。  
缺点：AI 体验碎片化（每个 kit 自己定义协议），并且更容易成为“数据外流”通道。

结论：**A 是长期正确方向，B 可作为 MVP 过渡，但必须补 allowlist 与授权界面。**

---

## 4. Manifest 需要新增/扩展的声明（建议）

> 当前 manifest 里 `network` 只有 `mode/allowAbsoluteUrls`，不够用。  
> 需要把“开发者服务”变成可审计的静态声明，类似浏览器扩展权限。

### 4.1 `ai.routes`（建议新增）

```json
{
  "ai": {
    "routes": [
      {
        "id": "host-shared",
        "kind": "host-shared",
        "label": "Use my AI settings",
        "capabilities": ["chat.text", "json.structured"]
      },
      {
        "id": "kit-default",
        "kind": "kit-service",
        "label": "Use kit built-in service",
        "capabilities": ["chat.text", "image.generate"],
        "dataHandling": {
          "sendsUserText": true,
          "retention": "unknown"
        },
        "service": {
          "endpointId": "kit-ai-prod",
          "privacyPolicy": "..."
        }
      }
    ],
    "defaultRouteId": "kit-default"
  }
}
```

### 4.2 `network.endpoints`（建议扩展）

```json
{
  "network": {
    "mode": "host-proxy",
    "allowAbsoluteUrls": true,
    "endpoints": [
      {
        "id": "kit-ai-prod",
        "label": "Kit AI Service",
        "allowedHosts": ["api.vendor.example"],
        "allowedPaths": ["/v1/chat", "/v1/images"],
        "requiresUserConsent": true
      }
    ]
  }
}
```

关键点：

- allowlist 必须落在 manifest（静态、可审计）
- 宿主 UI 必须展示这些域名与用途，用户可以拒绝

---

## 5. 用户授权与可见性（像浏览器扩展一样）

### 5.1 首次使用弹窗/页面（建议）

当 kit 第一次尝试走 `kit-service` route 或访问某个 endpoint：

- 展示：
  - kit 名称 + 图标
  - 将访问的域名列表
  - 发送的数据类别（例如：选中文本/剪贴板文本/上下文摘要）
  - 隐私政策/条款入口（若声明）
- 允许用户选择：
  - 仅本次允许 / 总是允许 / 拒绝
  - 默认 route：优先用“我的 AI”还是“kit 服务”

### 5.2 可撤销

- 在功能件管理页提供：
  - 已授权域名
  - 当前默认 route
  - 清理登录态/清除 token

---

## 6. 认证与账号：不靠“把 key 塞给用户”

### 6.1 最小可行做法（MVP）

- kit 自己提供登录 UI（用户名/验证码/扫码等）
- kit 通过 `network.fetch` 向开发者服务换取 **用户级 token**
- token 存在 `storage.*`（注意：这不是“安全存储”，但可用作 MVP）

### 6.2 推荐做法（后续）

新增宿主能力：

- `secrets.*` 或 `credentials.*`：由宿主持久化、对 kit 只提供“句柄/引用”，避免 token 在 JS 世界裸奔
- `auth.open`：宿主打开系统浏览器/自定义 tab 完成 OAuth，再通过桥接回调把短期 token 交给宿主保存

---

## 7. 多模态（绘图/视频/音频）的落地提示

多模态服务会引入两个额外问题：

1) **上传**：把输入（图片/语音/文件）送到开发者服务  
2) **回写**：把生成的结果写回输入框/聊天（例如图片）

现有能力里：

- 回写图片已有 `input.commitImage`（已在项目里实现）
- 但“上传文件”目前缺少标准通道（后续要专门做 `file.upload`/`assets.*` 一类能力）

建议在 AI route 里提前把 “capabilities” 声明清楚，并在宿主侧对上传类能力做更严格的提示与限制。

---

## 8. 落地顺序建议（你审核后再动手）

1) 先定语义：AI 统一走 `ai.request`（推荐）还是继续让 kit 自己用 `network.fetch`
2) 无论选哪条路，都必须先补齐：
   - manifest 的 endpoint allowlist
   - 用户授权 UI 与可撤销入口
3) 最后再扩展到：
   - 账号体系（auth/secrets）
   - 多模态上传/资产管理
   - 计费/配额/灰度

