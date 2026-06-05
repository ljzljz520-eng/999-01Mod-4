# FAQuery 项目任务清单

## 项目概述
开发一个 PHP 接口项目，用于查询 SQLite 数据库中 `facode2sn` 表的数据，并提供一个前端测试页面。

---

## 任务列表

### 1. 项目初始化
- [/] 创建 `/FAQuery` 目录结构
- [/] 创建 `docker-compose.yml` 配置文件
- [/] 创建 `.gitignore` 和 `.dockerignore` 文件
- [/] 创建 `README.md` 项目说明文档

---

### 2. 后端 API 开发 (PHP)
- [/] 创建 `backend/Dockerfile`
- [ ] 创建 PHP 配置文件
- [/] 开发 FACode 查询 API 接口 (`/api/query.php`)
  - [/] 连接 SQLite 数据库
  - [/] 接收 `facode` 参数
  - [/] 查询 `facode2sn` 表
  - [/] 返回 JSON 格式结果（有数据返回 SN，无数据返回 null）
- [/] 实现 SQL 注入防护

---

### 3. 前端测试页面开发
- [/] 创建 `frontend/Dockerfile`
- [/] 开发测试调用接口的 HTML 页面
  - [/] 输入对端 IP 地址
  - [/] 输入 FACode 查询参数
  - [/] 显示调用的完整 API 命令
  - [/] 显示 API 返回值
- [/] 使用现代 UI 框架美化界面
- [/] 实现响应式设计（PC/移动端适配）

---

### 4. Docker 容器化
- [/] 配置 PHP-FPM + Nginx 后端容器 (使用 Apache + PHP)
- [/] 配置前端 Nginx 容器
- [/] 配置容器网络和端口映射
- [/] 挂载 SQLite 数据库文件作为 Volume

---

### 5. 测试与验证
- [x] 测试 API 接口正常返回
- [x] 测试前端页面功能
- [x] 验证 Docker 一键启动
- [x] 验证 PC 端和移动端显示效果

---

### 6. 文档完善
- [x] 更新 `README.md` 完整文档
- [x] 创建 `walkthrough.md` 项目逻辑梳理
- [x] 创建 `docs/api.md` API 文档

---

### 7. [V2] 数据库功能增强
- [x] 修改 `backend/Dockerfile` 安装 MySQL 扩展
- [x] 升级 `database.php` 支持环境变量配置和多驱动切换
- [x] 更新 `docker-compose.yml` 添加环境变量配置
- [x] 验证 MySQL 连接功能（可选 - 已验证代码逻辑及扩展安装）

### 8. [V2] 前端历史记录功能
- [x] 更新 `index.html` 增加历史记录列表 UI
- [x] 更新 `main.js` 实现历史记录的存储(localStorage)与渲染
- [x] 实现历史记录的删除与快速重查功能
- [x] 验证历史记录的持久化和交互

---

### 9. [V3] 界面数据库配置功能
- [x] 创建前端数据库配置 Modal UI
- [x] 实现配置存储与请求头注入逻辑 (main.js)
- [x] 升级后端 `database.php` 支持动态 Header 连接配置
- [x] 验证界面配置生效与切换功能
