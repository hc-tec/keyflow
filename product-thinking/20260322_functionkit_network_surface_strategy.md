# Function Kit 网络接入方案（Android First / MVP）

> 编码：UTF-8
> 修订时间：2026-03-24T11:03:27+08:00
> 适用范围：Function Kit Runtime SDK、Android Host、Windows Host、PC Companion

## 0. 核心结论

网络这件事，当前阶段应该非常简单。

结论只有三条：

1. **直接给功能件开发者 `client.fetch()`**
2. **默认在 Android 本地执行**
3. **只有 Android 实在做不了时，才考虑转给 PC companion**

也就是说：

- 网络不是默认依赖电脑
- 网络不是默认依赖 host service
- 网络不是默认依赖 connector
- PC companion 不是通用 connector / relay / control plane
- **能力注册/发现可以存在于宿主内部，但不引入通用 capability invoke 平面**

**手机自己就应该能完成大部分网络请求。**

---

## 1. 为什么必须是 Android First

因为大部分用户没有：

- 一台长期在线的电脑
- 一套稳定运行的 companion
- 一条始终可用的手机到电脑链路

如果网络能力默认依赖电脑，那么功能件的基础可用性就垮了。

而现实里，大部分功能件访问的其实就是：

- SaaS API
- 自建 HTTP 服务
- 普通 Web 接口
- 云端 AI 服务

这些请求本来就应该直接在 Android 上完成。

所以这里的原则必须写死：

- **能在 Android 做的，就在 Android 做**
- **不要把“手机功能件”设计成“电脑遥控器”**

---

## 2. MVP 只提供一个接口：`client.fetch()`

SDK 直接提供：

```js
const response = await client.fetch("https://api.example.com/todos", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer xxx"
  },
  body: JSON.stringify({
    text: "今天待办"
  })
});

const data = await response.json();
```

对开发者来说，这就够了。

不要再加：

- connector
- profile
- operation
- 一堆能力抽象

开发者会用 `fetch`，事情就能推进。

---

## 2.1 但必须有最小权限声明

即使现在走极简路线，网络能力也不能完全不声明。

至少要约定一条：

- **功能件如果要调用 `client.fetch()`，就必须显式声明自己需要网络能力**

基于当前仓库，最现实的做法是：

- manifest 里的 `permissions.needsNetwork = true`

后面如果 runtime permission 要细化，再补：

- `network.fetch`

但不管哪种写法，核心约束都一样：

- **没有声明网络权限的功能件，不能调用 `client.fetch()`**

---

## 3. 这个 `fetch` 应该怎么实现

对开发者来说，它应该尽量像浏览器 `fetch`：

```ts
client.fetch(input: string, init?: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  text(): Promise<string>;
  json(): Promise<any>;
}>
```

但底层实现建议不要直接裸用 WebView 原生网络栈，而是：

- SDK 调 bridge
- Android host 真正发请求

这样做的好处是：

- 宿主能统一控制超时
- 宿主能统一做错误处理
- 宿主以后要加审计或限流不会推翻接口
- Windows 端也能复用同一套接口形态

关键点是：

- **接口像 fetch**
- **执行默认在 Android host**

---

## 4. 执行位置如何判定

网络请求的默认执行顺序应当是：

### 第一优先级：Android 本地执行

适用：

- 普通 HTTP API
- 云服务
- SaaS
- 自建接口

这是主线。

### 第二优先级：Windows 本地执行

适用：

- 用户当前就在 Windows 端使用输入法

这里的含义只是：

- **如果当前运行面本来就是 Windows Host，就由 Windows 自己发请求**

并不是：

- **Android 默认把网络请求转交给 PC**

### 第三优先级：PC companion 代发

只适合这些情况：

- Android 当前环境确实做不了
- 必须复用电脑上的网络环境
- 必须访问电脑所在内网

也就是说，PC companion 是：

- **补充路径**
- **只在手机确实做不了时才启用**

不是：

- **默认路径**

---

## 5. 电脑什么时候才应该参与

这里只列真正需要电脑参与的场景：

### 5.1 访问电脑本机资源

例如：

- 电脑文件系统
- 本机数据库
- 本机缓存

### 5.2 访问只有电脑能拿到的数据

例如：

- 微信消息读取
- 桌面软件桥接
- 浏览器当前页面上下文

### 5.3 访问只有电脑所在网络能访问的服务

例如：

- 企业内网
- 仅办公室网络可访问的服务

除了这些，普通网络请求默认都不该依赖电脑。

---

## 6. MVP 安全边界

这里也不要搞复杂。

先保留最必要的几条：

### 6.1 默认超时

- 默认 8s 到 15s

### 6.2 响应大小限制

- 避免功能件把大文件直接拉进来拖死输入法

### 6.3 方法限制

先支持：

- `GET`
- `POST`
- `PUT`
- `PATCH`
- `DELETE`

### 6.4 基础日志

宿主侧可以记录：

- kit id
- url
- method
- status
- duration

### 6.5 可选策略

如果以后需要，再加：

- 域名白名单
- 内网限制
- token 托管

但这些现在不应成为开发者的负担。

### 6.6 至少要能取消过期请求

输入法是连续交互场景。

用户一边输入，旧请求可能瞬间过时。

所以即使 MVP 很简单，也至少要满足：

- 宿主能识别请求是否已过期
- 新请求到来后，旧请求结果不能覆盖新结果
- 最好支持 `AbortSignal`

---

## 7. 凭据与密钥边界（MVP 规则）

先别复杂化，但边界必须写死。

MVP 直接分两类：

### 7.1 本地/自用功能件：允许开发者自己传 header

```js
await client.fetch(url, {
  headers: {
    Authorization: `Bearer ${token}`
  }
});
```

这条只适合：

- 本地开发
- 自用功能件
- 研究模式

### 7.2 公共/分发功能件：禁止在前端代码里内置真实密钥

公共生态下，如果需要访问需要鉴权的资源，正确方向只能是：

- 用户在宿主侧配置（宿主管理密钥/注入 header），或
- 走已注册 agent（由 agent/runner 自己持有凭据与执行环境）

但这属于后续增强，不做成 connector 平面把功能件开发复杂化。

---

## 8. 对当前仓库最现实的落地

如果现在往代码里做，我建议只做：

1. SDK 增加 `client.fetch()`
2. Android host bridge 增加 `network.fetch`
3. Android host 本地执行 HTTP 请求
4. Windows host 也支持同样接口
5. companion 只做可选 fallback

先别做：

- connector
- profile 系统
- operation 系统
- 复杂网络治理抽象

---

## 9. 最终判断

当前阶段，网络接入的正确方案就是：

- **给功能件一个简单的 `client.fetch()`**
- **默认在 Android 本地执行**
- **电脑只处理手机实在做不了的情况**
- **不引入额外 connector 平面把简单网络请求复杂化**

这才符合“输入法主要跑在手机上，而不是依赖一台长期在线电脑”的现实。
