# memory-multimodal-ingest

[English](./README.md) | [简体中文](./README_CN.md)

这是一个给 OpenClaw 用的多模态记忆摄取插件，底层使用 LanceDB 做向量存储，使用 Gemini Embedding 2 做多模态 embedding。

当前 MVP 已经支持：

- 从本地路径或 HTTP(S) URL 摄取 `image / video / audio / PDF`
- 使用 `gemini-embedding-2-preview` 生成多模态向量
- 将向量和元数据写入 LanceDB
- 将原始文件复制到本地 blob 目录
- 用文本查询检索多模态记忆
- 提供 `openclaw memory-media` CLI 命令

当前已经落地的部分：

- OpenClaw 插件注册
- LanceDB 多模态存储
- 本地 blob 持久化
- 基于 Gemini Embedding 2 的文本到媒体检索
- `image / audio / video / pdf` 四类最小样本实测通过

当前还没有做的部分：

- 视频逐帧或分段抽帧
- PDF 分页切块
- 音频转录增强检索
- 大文件走 Files API
- 与 `memory-lancedb-pro` 的 recall broker 融合

本地已经验证通过的命令：

```bash
openclaw memory-media ingest /path/to/file
openclaw memory-media stats
openclaw memory-media search "query"
```

相关设计文档：

- [多模态插件框架](./docs/multimodal-plugin-framework.md)

默认配置示例：

```json
{
  "plugins": {
    "load": {
      "paths": [
        "/Users/yyc/.openclaw/workspace/plugins/memory-multimodal-ingest"
      ]
    },
    "entries": {
      "memory-multimodal-ingest": {
        "enabled": true,
        "config": {
          "embedding": {
            "apiKey": "${GEMINI_API_KEY}",
            "model": "gemini-embedding-2-preview",
            "apiBase": "https://generativelanguage.googleapis.com/v1beta",
            "dimensions": 3072
          },
          "dbPath": "/Users/yyc/.openclaw/memory/lancedb-multimodal",
          "blobPath": "/Users/yyc/.openclaw/memory/blobs",
          "maxInlineBytes": 8388608
        }
      }
    }
  }
}
```

示例命令：

```bash
openclaw memory-media ingest /path/to/example.png --preview-text "red square test"
openclaw memory-media ingest /path/to/example.pdf --preview-text "pdf doc test"
openclaw memory-media stats
openclaw memory-media search "red square test" --limit 3
```

推荐的推进顺序：

1. 保持这个插件独立演进
2. 把 `Embedding 2 + 文档 + CLI 修复` 作为小 PR 往母项目提
3. 再单独讨论是否把这个插件并入母项目或放到同组织下
