# FRP-All-in-One 管理系统

基于 Web 的 FRP (Fast Reverse Proxy) 集中管理平台。旨在解决多台内网机器穿透管理难、配置文件修改繁琐的问题。

## ✨ 核心功能

- **集中管理**: 在一个 Web 界面管理所有 FRP 客户端。
- **自动化配置**: 客户端 Agent 自动拉取配置并热重载，无需手动 SSH 修改文件。
- **可视化仪表盘**: 实时监控客户端在线状态和活跃隧道。
- **一键配置**: 支持 TCP, UDP, HTTP 等多种协议隧道的一键添加。

## 🛠️ 技术栈

- **服务端**: Python (FastAPI) + SQLite
- **前端**: React + Vite + Tailwind CSS (v4)
- **客户端**: Python Agent (轻量级脚本)

## 🚀 快速开始 (本地开发)

### 1. 启动服务端
```bash
cd server
# 建议使用虚拟环境
pip install -r requirements.txt
./run.sh
# 服务端运行在 http://localhost:8000
```

### 2. 启动前端
```bash
cd frontend
npm install
npm run dev
# 前端运行在 http://localhost:5173 (或自动分配的端口)
```

### 3. 连接测试客户端
将 `agent/frp_agent.py` 复制到任意机器，修改配置后运行即可。

## 📖 部署指南

详细的生产环境部署（Linux/Nginx）请参考：
- **[部署指南 (DEPLOYMENT_GUIDE.md)](./DEPLOYMENT_GUIDE.md)** *(注：如果此文件不在根目录，请查看文档目录或 artifact)*

## 📂 项目结构

```
.
├── server/       # 后端 API 及数据库逻辑
├── frontend/     # React 前端界面
├── agent/        # 客户端自动同步脚本
└── README.md     # 项目说明文档
```

## 📝 协议

MIT License
