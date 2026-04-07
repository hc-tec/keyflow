# PDF → 可读文本归档：复现流程与命名约定

> 编码：UTF-8  
> 创建时间：2026-03-20T23:35:00+08:00  
> 目的：把“读过的 PDF”沉淀成可检索、可复现、可长期回溯的文本与结论；即使大模型清空上下文，也能靠这些文件快速恢复脉络。

## 1. 产物约定（两件套）

每读一份 PDF，固定产出两类文件，并登记到 `product-thinking/INDEX.md`：

1. **原始提取归档（raw）**：尽量不改动抽取文本本体，只在顶部补“元数据与复现信息”。  
   - 文件名：`YYYYMMDD_pdf_text_extract_<topic>_raw-vN.md`  
   - 例：`product-thinking/20260320_pdf_text_extract_ime-cross-platform_raw-v1.md`
2. **我的主见/结论**：基于 raw 的阅读笔记与决策建议。  
   - 文件名：`<topic>.md`（或 `YYYYMMDD_<topic>.md`）  
   - 例：`product-thinking/cross-platform-ime.md`

## 2. raw 文件必须包含的“可回溯信息”

建议 raw 文件顶部固定包含：

- 源 PDF 绝对路径（或仓库相对路径）
- `SHA256`、文件大小、修改时间
- 提取器名称/版本（以及脚本路径）
- **复现命令**（一行即可）
- Python 版本、OS 版本
- 提取质量说明（页数/是否含 OCR/异常）

这些信息能解决两个典型问题：

- “这个 raw 到底对应哪个 PDF 版本？”（用哈希与 mtime 锁定）
- “以后怎么复现同样的提取结果？”（用命令与版本锁定）

## 3. 提取方式（本仓库默认）

本仓库当前采用 `knowledge-absorber` 的提取脚本（已在 raw 示例里记录脚本路径与版本）：

- 复现命令示例（按你的实际 PDF 路径替换）：
  - `python <USER_HOME>\.codex\skills\knowledge-absorber\scripts\content_ingester.py "<PDF路径>"`

如遇到 PDF 内包含大量扫描页（图片）导致文本缺失，再考虑 OCR 流程（建议另起 `raw-v2` 并记录 OCR 工具链与参数）。

## 4. 编码要求（UTF-8）

- `product-thinking/` 下所有 Markdown 统一 **UTF-8** 编码。
- PowerShell 输出到文件时，避免默认编码坑：优先用能显式指定 UTF-8 的方式（或直接用 `apply_patch` 生成文件）。


