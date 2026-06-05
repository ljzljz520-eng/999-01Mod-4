# FAQuery - 固定资产编码查询系统

FAQuery 是一个现代化的 Web 应用程序，用于通过服务器 IP 和固定资产编码 (FACode) 快速查询对应的序列号 (SN)。系统采用前后端分离架构，完全容器化部署。

## ✨ 主要特性 (V6 Release)

*   **纯 MySQL 架构**: 内置 MySQL 8.0 容器，开箱即用，自动初始化测试数据。
*   **多环境支持**: 支持配置多个 MySQL 数据库连接（生产/测试环境），并在界面上一键切换。
*   **现代化 UI**: 响应式设计，渐变背景，全中文界面，极致的用户体验。
*   **全面校验**: 前端对所有输入进行严格校验，防止无效请求。
*   **智能错误翻译**: 自动将底层数据库错误翻译为友好的中文提示。
*   **完全容器化**: 基于 Docker Compose 的一键部署。

## 📚 文档中心 (Docs)

详细的文档资料请参阅 `docs/` 目录：

*   [📖 用户手册 (User Manual)](docs/user_manual.md) - 功能操作与使用指南
*   [🏗 系统架构 (Architecture)](docs/architecture.md) - 技术架构与组件说明
*   [📝 项目状态 (Project Status)](docs/project_status.md) - 历史迭代任务列表
*   [📅 更新日志 (Change Log)](docs/latest_walkthrough.md) - 最新版本变更记录

## 🛠️ 技术栈

*   **前端**: HTML5, Vanilla JavaScript (ES6+), Tailwind CSS (无构建依赖模式)
*   **后端**: PHP 8.2 (Apache), PDO MySQL
*   **数据库**: MySQL 8.0
*   **基础设施**: Docker, Docker Compose

## 🚀 快速开始

### 前提条件
*   已安装 Docker 和 Docker Compose。

### 部署步骤

1.  **克隆项目**
    ```bash
    git clone <repository-url>
    cd FAQuery
    ```

2.  **启动服务**
    ```bash
    docker compose up -d
    ```
    > 首次启动时，MySQL 容器会自动执行初始化脚本 (`mysql-init/init.sql`) 创建表和用户。

3.  **访问应用**
    打开浏览器访问: `http://localhost:3000`

### 使用指南

#### 1. 默认查询
系统默认连接到内置容器数据库，您可以直接尝试查询：
*   **服务器 IP 或域名**: `localhost`
*   **固定资产编码**: `FA001`
*   **预期结果**: `SN2024001`

#### 2. 添加外部数据库连接
点击右上角的 **齿轮图标** 进入“数据库连接管理”：
1.  点击 **+ 新增 MySQL 连接**。
2.  填写连接信息（支持粘贴 `mysql://` 格式的连接字符串进行自动解析）。
3.  点击 **创建连接**，然后点击 **启用** 即可切换查询源。

## 📂 目录结构

```
FAQuery/
├── docker-compose.yml      # 容器编排配置
├── mysql-init/
│   └── init.sql            # 数据库初始化脚本
├── frontend/               # 前端项目
│   ├── Dockerfile
│   ├── index.html
│   ├── src/
│   │   ├── main.js         # 核心逻辑 (UI, Connection, Query)
│   │   └── style.css       # 样式文件
│   └── nginx.conf          # (可选) Nginx 配置
└── backend/                # 后端项目
    ├── Dockerfile
    ├── api/
    │   └── query.php       # 查询 API 接口
    └── config/
        └── database.php    # 数据库连接类
```

## ⚠️ 常见问题

**Q: 遇到 400 错误怎么办？**
A: 系统会自动显示具体的错误原因（如 "系统默认数据库无法连接"）。如果是自定义连接，请检查用户名密码。

**Q: 如何重置数据库？**
A: 执行 `docker compose down -v` 删除数据卷，然后重新启动。

---
**License**: MIT
