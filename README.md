# 浙财 AI 生态计划 · 只读快照

这是 [zc-ai-plan](../) 的**静态只读快照**：复用应用自身的前端与样式，
把 `/api/session`、`/api/board` 两个接口打桩成内联数据，因此无需服务端即可浏览。

- 页面由 `node sites-static/build.mjs` 从 `board.json` 生成
- 快照 revision：25（6 项资源 / 5 项安排 / 8 条进展）
- **只读**：所有编辑入口已隐藏，写请求返回 403
