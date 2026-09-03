# Portfolio News Dashboard

中文个人投资工作台，用于记录持仓论点、失效条件、催化剂、新闻、关注账户、研究想法与月度交易纪律。

## 当前版本

- 纯前端 Vite/React 应用，无账号系统和后端。
- 数据保存在当前浏览器的 localStorage，可从右上角导出或导入 JSON 备份。
- 页面中的初始内容均为设计示例，不代表实时行情或投资结论。
- 真实行情和新闻数据源尚未接入。

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
