# 官网 SEO 与发布运维

## 已实现的页面与职责

官网首页聚焦“开源 SSH 客户端与远程 AI 开发工作台”，保留既有截图与交互 Demo。新增页面均输出静态正文，不依赖 React hydration；主页链接到每篇教程，教程包含步骤、限制、截图、相关推荐和下载入口。

| 路径（相对站点根） | 用途 | 语言 |
| --- | --- | --- |
| `/`、`en/` | 产品介绍与教程索引 | 中 / 英 |
| `guides/remote-ai/`、`en/guides/remote-ai/` | SSH 上运行 CLI Agent，检查文件与审阅修改 | 中 / 英 |
| `guides/remote-agent-files/`、`en/guides/remote-agent-files/` | 粘贴截图、文件与文件夹及故障排查 | 中 / 英 |
| `download/`、`en/download/` | macOS、Windows、Linux 安装与升级 | 中 / 英 |
| `guides/remote-git/` | 差异审阅、选择性暂存、提交与同步 | 中文 |
| `guides/ssh-sftp/` | SSH 与 SFTP 文件工作区 | 中文 |
| `guides/self-hosting/` | Docker 自托管与访问边界 | 中文 |
| `demo/` | 虚构数据的交互体验 | 中文，noindex |

Demo 的 `noindex,follow` 避免模拟数据作为独立搜索落地内容。它保留自引用 canonical，查询参数版本也归到无参数 Demo URL；不要用 robots 禁止抓取，否则爬虫看不到 noindex。真实客户端 `web/` 与桌面 HTML 不是公开营销内容，不参与官网 sitemap。

## 正式地址和验证变量

在 GitHub Actions 仓库变量中配置：

| 变量 | 默认 / 用途 |
| --- | --- |
| `QTERM_SITE_URL` | `https://qiubai-lab.github.io/Qterm/`；完整 HTTPS 地址，必须有尾斜杠 |
| `QTERM_SITE_BASE` | 默认从 URL 推导；若设置则必须等于其 pathname |
| `QTERM_GOOGLE_SITE_VERIFICATION` | 可选，Search Console 提供的 HTML meta 验证 content 值 |
| `QTERM_BING_SITE_VERIFICATION` | 可选，Bing Webmaster Tools 的 HTML meta 验证 content 值 |

验证值为公开站点证明标记，不是账号访问令牌；不要将账号密码、API token 写入这些变量。未配置时不输出占位标记。

Vite 插件为每页生成 canonical、OG/Twitter 元信息、实际存在的双向 hreflang。只有首页包含 SoftwareApplication JSON-LD，信息与正文一致，不填虚构评价或把 Star 当评分。sitemap 仅列 11 个可索引 canonical URL，不使用每次构建时间伪造 lastmod。

默认项目路径不会生成 `/Qterm/robots.txt`，它不能控制域名爬虫。若切换到独立域名根目录，构建会自动输出根级 robots.txt 并声明 sitemap；域名绑定、DNS 与重定向仍须在实际托管环境完成。英文页面 canonical 指向自身，不指回中文版本。

## 首次发布与搜索平台设置

1. 将经审阅的变更合入 main；现有 Product site 工作流验证成功后发布 GitHub Pages。网站发布不需要创建桌面版本 tag。
2. 检查线上首页、英文页、教程、下载页和 `sitemap.xml`，确认 canonical 使用正式地址、内链无 404。不要把本地预览结果当作已上线。
3. 在 Google Search Console 添加 URL 前缀资源 `https://qiubai-lab.github.io/Qterm/`，选择 HTML 标签验证，将 content 值写入 `QTERM_GOOGLE_SITE_VERIFICATION`；重新部署后点击验证。独立域名也可使用 DNS 验证。
4. 验证后提交 `https://qiubai-lab.github.io/Qterm/sitemap.xml`，对首页和两篇核心教程进行 URL 检查，查看抓取、规范页与索引状态。
5. Bing Webmaster Tools 同样添加站点；使用它提供的验证方式或 meta 值，提交 sitemap。面向中国大陆的渠道可另行核实百度搜索资源平台的准入条件，不假定已有验证资格。
6. 保留验证标记并定期查看索引反馈。提交 sitemap 不保证收录，添加 schema 也不保证富媒体结果。

当前代码不包含 Search Console 账号访问、域名购买、GitHub About 写入、社区发帖或第三方分析脚本。它们需要实际账户上下文；没有将这些操作标为已执行。

## GitHub 展示材料

建议在仓库 About 设置以下简介，并将 Website 指向正式官网：

> Open-source SSH workspace for remote AI development. Terminals, SFTP files and Git review for macOS, Windows and Linux.

可选 topics：`ssh-client`、`terminal`、`sftp`、`remote-development`、`git`、`tauri`、`rust`、`developer-tools`。只保留与实际能力相符的标签。中英文 README 已互链；中文版保持原入口，英文用户可直接进入 English 网站与教程。

分享教程时直接链接对应页面而非只链接仓库。OG 分享图沿用 `site/public/qterm-social.png`。推荐演示顺序：连接已有服务器 → 粘贴截图 → 等待上传并检查输入 → 检查 Agent 修改 → 查看 Git diff → 选择性暂存。录制真实 Agent 演示前准备脱敏环境与可用账户；官网模拟 Demo 不应冒充真实 Agent 执行。

## 如何判断效果

第一周建立基线；发布后每周按相同口径记录，先观察 4–8 周，不承诺固定排名或增长比例。

| 维度 | 数据源与口径 |
| --- | --- |
| 是否被发现 | Search Console 的已索引页面、抓取问题、Google 选定 canonical |
| 非品牌需求 | 搜索查询中排除 Qterm / qiubai 等品牌变体，按页面和语言比较曝光、点击与 CTR |
| 内容效果 | 比较 remote-ai 与 remote-agent-files 两组教程的搜索点击和查询相关性 |
| 社区分发 | 使用稳定的 UTM source/medium/campaign 区分不同渠道，避免把参数版本放入 sitemap |
| 下载趋势 | GitHub release asset 下载计数的周差值；它不是唯一用户数，也不能证明安装成功 |

目前没有安装网站分析服务，因此不能声称已经统计 Demo、下载按钮或 GitHub 跳转点击。确定分析服务及隐私设置后，建议只采集以下无敏感内容事件：

- `demo_open`：来源页面与界面语言。
- `download_click`：来源页面、平台、目标类型（Release / 安装指南）。
- `repository_open`：来源页面。

不得记录终端输入、文件路径、凭证或私人服务器地址。点击不等于安装，安装也不等于持续使用。

## 内容维护和本地验收

新增内容先写静态 HTML（包含独立 title、description、一个 H1 和 `<!-- site:seo -->`），再登记 `scripts/site/pages.json`。语言版本只有内容对应时才配对。把新页面加入首页或相关教程的普通链接，确保不是孤立页面。

```sh
pnpm check
pnpm test:demo
pnpm build:site
pnpm check:site
pnpm preview:site
```

`check:site` 对真实构建产物检查所有页面的元信息、语言配对、schema、静态正文、资源、锚点、sitemap 和首页可达性，并继续执行原 desktop/demo 隔离检查。

独立域名根路径验证（预览与检查保持同一变量）：

```sh
QTERM_SITE_URL=https://qterm.example/ pnpm build:site
QTERM_SITE_URL=https://qterm.example/ pnpm check:site
```

完成后重新执行默认 `pnpm build:site`，避免误发布测试域名产物。浏览器至少检查中文首页、英文首页、长教程和下载页的 1280×900 与 390×844 布局，验证语言切换、目录锚点、下载出口及无 JS 正文。无需为此重建桌面安装包。

参考：[Google SEO 入门](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)、[多语言页面](https://developers.google.com/search/docs/specialty/international/localized-versions)、[sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)、[软件应用结构化数据](https://developers.google.com/search/docs/appearance/structured-data/software-app)。
