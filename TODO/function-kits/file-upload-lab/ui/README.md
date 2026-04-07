# File Upload Lab

> 编码：UTF-8
> 目标：在 Android Function Kit Host 上验证「本地文件选择 + `network.fetch bodyRef` 上传」闭环。

## 能力

- `files.pick`：宿主弹出系统文件选择器，返回 `fileId`（不把 bytes 走 bridge）。
- `network.fetch`：支持 `init.bodyRef={type:\"file\",fileId}`，宿主从 file store 读取并流式写入请求 body。

## 运行方式

1. 打开功能件 `File Upload Lab`
2. 点「选择文件」
3. 填写上传 URL（默认 `https://httpbin.org/post`，如网络不可用请换自己的服务）
4. 点「上传」

## 协议约定（本 kit 用到的字段）

### UI -> Host：`files.pick`

```json
{
  "multiple": false,
  "acceptMimeTypes": ["image/*", "text/plain"]
}
```

### Host -> UI：`files.pick.result`

```json
{
  "ok": true,
  "canceled": false,
  "files": [{ "fileId": "file-...", "name": "a.png", "mimeType": "image/png", "sizeBytes": 12345 }]
}
```

### UI -> Host：`network.fetch`（上传）

```json
{
  "url": "https://example.com/upload",
  "init": {
    "method": "POST",
    "headers": { "Content-Type": "image/png" },
    "bodyRef": { "type": "file", "fileId": "file-..." }
  }
}
```

