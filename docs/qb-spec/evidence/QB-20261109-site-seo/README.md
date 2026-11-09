# 官网 SEO 验收 — 2026-11-09

本次证据来自本地生产预览 `http://localhost:4173/Qterm/`，不代表已经发布到公网或被搜索引擎收录。

## 检查结果

- `pnpm check` 通过：310 个测试文件通过、1 个跳过；1,802 个 Vitest 用例通过、2 个跳过。Node 脚本测试无失败。ESLint、TypeScript、桌面前端构建通过。
- `pnpm test:demo` 通过：14 个文件、41 个测试。
- 最终 `node --test scripts/site/seo.node-test.mjs`：6 个通过，覆盖域名/base 一致性、语言 canonical、索引规则、schema、root robots、验证标记转义及缺失元信息拒绝。
- 默认子路径与 `QTERM_SITE_URL=https://qterm.example/` 根路径均构建并通过 `pnpm check:site`。最终交付已恢复默认正式 URL。
- 真实产物检查覆盖 12 个 HTML 入口（11 个可索引页面及 Demo）：静态正文、独立元信息、双向语言配对、链接/资源/锚点、结构化数据、sitemap 与首页链接可达性；原 desktop/demo 隔离检查继续通过。
- `pnpm check:source-size` 通过，0 ratchet reminders；`git diff --check` 通过。
- 构建保留既有的超过 500 kB chunk 提示；营销页不加载这些 Demo/应用模块。

## 浏览器验收

通过 BetterWright 对全部 11 个内容页分别在 1280×900 和 390×900 视口打开：返回 200，H1 正常，无水平溢出。另在 390×844 检查中文首页、英文下载锚点和中文长教程。

实际点击验证：中文首页 → English → Download；英文教程目录 → `#run`；英文教程 → 中文对应页 → 下载页。下载页提供三个平台的 Release 出口，没有触发软件下载。

中文首页的空 `img` 是原有隐藏 image-viewer dialog 的占位元素，不是内容截图加载失败。源码与产物检查保留无脚本静态正文；Vitest 的渐进增强测试验证未执行脚本时 11 个功能面板均存在且未隐藏。浏览器包装层不支持 `page.route`，因此没有将拦截脚本的尝试记为真实浏览器禁用 JavaScript 验证。

截图均已打开检查：

- [英文首页，1280×900](home-en.png)
- [中文首页，390×844](home-zh-mobile.png)
- [中文教程，390×844](guide-mobile.png)

## 外部配置状态

未提交或推送 Git 变更；未触发线上部署。GitHub CLI 当前未登录；没有 Search Console / Bing 的验证值或账号数据。已提供 Actions 验证变量接线和 [运维说明](../../../site-seo.md)，没有把这些账号操作、实际收录、曝光增长或统计服务接入标为完成。
