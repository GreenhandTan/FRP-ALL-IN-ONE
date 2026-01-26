FROM python:3.9-slim

# 安装 Docker CLI（用于重启 FRPS 容器）
RUN apt-get update && apt-get install -y \
    docker.io \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 安装依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制源码
COPY . .

# 数据卷挂载点 (用于 SQLite 和 FRP)
VOLUME /app/data
VOLUME /opt/frp

# 暴露端口
EXPOSE 8000

# 以 root 运行（容器内安全，需要权限创建文件）
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
