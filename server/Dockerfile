FROM docker.1ms.run/library/python:3.11-slim

# 使用阿里云镜像源（国内加速）+ 安装必要工具和 Docker CLI
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
        gnupg \
    && rm -rf /var/lib/apt/lists/*

# 添加 Docker 官方仓库并安装 docker-cli（使用阿里云镜像）
RUN install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://mirrors.aliyun.com/docker-ce/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && chmod a+r /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://mirrors.aliyun.com/docker-ce/linux/debian bookworm stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends docker-ce-cli \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 配置 pip 使用国内镜像源并安装依赖
COPY server/requirements.txt ./requirements.txt
RUN pip config set global.index-url https://mirrors.aliyun.com/pypi/simple/ \
    && pip config set global.trusted-host mirrors.aliyun.com \
    && pip install --upgrade pip \
    && pip install --no-cache-dir --timeout 120 -r requirements.txt

# 复制后端源码与 Agent 脚本
COPY server/ ./
COPY agent/ ./agent/

# 数据卷挂载点 (用于 SQLite 和 FRP)
VOLUME /app/data
VOLUME /opt/frp

# 暴露端口
EXPOSE 8000

# 以 root 运行（容器内安全，需要权限创建文件）
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
