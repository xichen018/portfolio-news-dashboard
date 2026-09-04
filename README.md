# Portfolio News Dashboard

中文个人投资工作台，用于记录持仓论点、失效条件、催化剂、新闻、关注账户、研究想法与月度交易纪律。

## 当前版本

- Vite/React 前端通过受 Nginx Basic Auth 保护的本地服务保存持仓，并代理 Grok 对话。
- 数据保存在当前浏览器的 localStorage，可从右上角导出或导入 JSON 备份。
- 页面中的初始内容均为设计示例，不代表实时行情或投资结论。
- 日报发布数据为行情和新闻主来源；Grok 对话可按需调用 xAI X Search，原帖只作为观点线索。

## Grok 对话

生产服务从 `/home/ubuntu/.config/daily-report/secrets.env` 读取 `XAI_API_KEY`，密钥不会发送至浏览器。默认模型为 `grok-4.3`，单次最多输出 1,200 token，全站每日最多 40 次请求。可通过 `XAI_MODEL` 和 `XAI_DAILY_REQUEST_LIMIT` 调整；X Search 内容不得自动视为已确认事实。

## 本地开发

```bash
npm ci
npm run dev
```

生产构建默认发布到 `/portfolio/`：

```bash
npm run build
```

## 部署

将 `dist/` 内容同步到 `/var/www/portfolio-news-dashboard/`。`deploy/nginx.conf` 是可嵌入现有站点的片段；`deploy/site.conf` 是当前 EC2 上保留原根路径反向代理的完整站点配置。修改配置后必须先执行 `sudo nginx -t`，再重载 Nginx。

## 下一阶段

接入数据源前，需要确认标的范围、新闻供应商、刷新频率、用户认证与服务端持久化方案。任何自动摘要都应保留来源链接、发布时间和抓取时间，并明确区分事实与分析。

详细边界与复用方案见 `docs/DATA_PIPELINE.md`。
