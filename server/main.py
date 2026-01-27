from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
import models, schemas, crud, auth
from database import SessionLocal, engine
from fastapi.middleware.cors import CORSMiddleware
from datetime import timedelta
from typing import List

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="FRP Manager API")

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # 生产环境建议限制
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 数据库自动初始化 + 默认管理员
@app.on_event("startup")
def init_database():
    """确保所有表都已创建，并创建默认管理员"""
    models.Base.metadata.create_all(bind=engine)
    
    # 创建默认管理员（如果不存在）
    db = SessionLocal()
    try:
        if not crud.is_system_initialized(db):
            default_admin = schemas.UserCreate(username="admin", password="123456")
            crud.create_admin(db, default_admin)
            print("[OK] 默认管理员已创建 (admin / 123456)")
        else:
            print("[OK] 管理员账号已存在")
    finally:
        db.close()
    
    print("[OK] 数据库表已初始化")

# 依赖项
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = auth.jwt.decode(token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = schemas.TokenData(username=username)
    except auth.JWTError:
        raise credentials_exception
    user = crud.get_admin_by_username(db, username=token_data.username)
    if user is None:
        raise credentials_exception
    return user

# 系统状态接口（无需认证）
@app.get("/api/system/status")
def get_system_status(db: Session = Depends(get_db)):
    """返回系统状态"""
    frps_deployed = crud.get_config(db, models.ConfigKeys.FRPS_VERSION) is not None
    return {
        "initialized": True,  # 系统总是已初始化（有默认管理员）
        "frps_deployed": frps_deployed
    }

# 修改密码接口
@app.post("/api/auth/change-password")
async def change_password(
    old_password: str,
    new_password: str,
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user)
):
    """修改当前用户密码"""
    # 验证旧密码
    if not auth.verify_password(old_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="旧密码不正确"
        )
    
    # 更新密码
    crud.update_admin_password(db, current_user.id, new_password)
    return {"message": "密码修改成功"}

@app.post("/token", response_model=schemas.Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = crud.get_admin_by_username(db, form_data.username)
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/clients/", response_model=schemas.Client)
def create_client(client: schemas.ClientCreate, db: Session = Depends(get_db), current_user: models.Admin = Depends(get_current_user)):
    return crud.create_client(db=db, client=client)

@app.get("/clients/", response_model=List[schemas.Client])
def read_clients(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.Admin = Depends(get_current_user)):
    return crud.get_clients(db, skip=skip, limit=limit)

@app.get("/clients/{client_id}", response_model=schemas.Client)
def read_client(client_id: str, db: Session = Depends(get_db), current_user: models.Admin = Depends(get_current_user)):
    db_client = crud.get_client(db, client_id=client_id)
    if db_client is None:
        raise HTTPException(status_code=404, detail="Client not found")
    return db_client

@app.post("/clients/{client_id}/tunnels/", response_model=schemas.Tunnel)
def create_tunnel_for_client(
    client_id: str, tunnel: schemas.TunnelCreate, db: Session = Depends(get_db), current_user: models.Admin = Depends(get_current_user)
):
    return crud.create_tunnel(db=db, tunnel=tunnel, client_id=client_id)

@app.get("/clients/{client_id}/config")
def get_client_config(client_id: str, db: Session = Depends(get_db)):
    """
    生成供客户端Agent下载的TOML配置。
    此接口不需要认证 (Agent只持有Token，不持有JWT)，或者我们为Client也实现Bearer认证？
    目前的 Client 模型有 'auth_token'，简单起见我们这里验证 Client Token。
    或者保持开放但隐晦 (UUID路径)。
    为安全起见，简单验证一下 Client 存在即可。Agent脚本通常是自动运行的。
    """
    client = crud.get_client(db, client_id=client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # 生成配置内容
    config_data = {
        "proxies": []
    }
    
    for tunnel in client.tunnels:
        proxy = {
            "name": tunnel.name,
            "type": tunnel.type.value,
            "localIP": tunnel.local_ip,
            "localPort": tunnel.local_port,
        }
        if tunnel.remote_port:
            proxy["remotePort"] = tunnel.remote_port
        if tunnel.custom_domains:
            proxy["customDomains"] = [d.strip() for d in tunnel.custom_domains.split(",")]
        
        config_data["proxies"].append(proxy)
            
    return config_data

# FRPS 配置生成接口
@app.post("/api/frp/deploy-server")
async def deploy_frp_server(
    port: int = 7000,
    auth_token: str = None,
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user)
):
    """
    生成 FRPS 配置文件
    FRPS 本身由 docker-compose 管理，这里只生成配置
    """
    import frp_deploy
    
    # 生成配置（不再下载安装）
    result = frp_deploy.generate_frps_config(port, auth_token)
    
    if result["success"]:
        # 保存配置到数据库
        info = result["info"]
        crud.set_config(db, models.ConfigKeys.FRPS_VERSION, info["version"])
        crud.set_config(db, models.ConfigKeys.FRPS_PORT, str(info["port"]))
        crud.set_config(db, models.ConfigKeys.FRPS_AUTH_TOKEN, info["auth_token"])
        crud.set_config(db, models.ConfigKeys.SERVER_PUBLIC_IP, info["public_ip"])
    
    return result

# FRPC 脚本生成接口
@app.get("/api/frp/generate-client-script")
async def generate_frpc_script(
    db: Session = Depends(get_db),
    current_user: models.Admin = Depends(get_current_user)
):
    """
    生成 FRPC 自动部署脚本
    """
    # 从数据库读取 FRPS 配置
    version = crud.get_config(db, models.ConfigKeys.FRPS_VERSION)
    port = crud.get_config(db, models.ConfigKeys.FRPS_PORT)
    auth_token = crud.get_config(db, models.ConfigKeys.FRPS_AUTH_TOKEN)
    server_ip = crud.get_config(db, models.ConfigKeys.SERVER_PUBLIC_IP)
    
    if not all([version, port, auth_token, server_ip]):
        raise HTTPException(
            status_code=400,
            detail="FRPS 尚未部署，请先完成服务端配置"
        )
    
    # 生成 Shell 脚本
    script = f"""#!/bin/bash
# FRP Client 自动部署脚本
# 生成时间: $(date)

set -e

echo "开始部署 FRP Client..."

# 1. 下载 FRP
FRP_VERSION="{version}"
DOWNLOAD_URL="https://github.com/fatedier/frp/releases/download/v${{FRP_VERSION}}/frp_${{FRP_VERSION}}_linux_amd64.tar.gz"
INSTALL_DIR="/opt/frp"

echo "正在下载 FRP v${{FRP_VERSION}}..."
wget -O /tmp/frp.tar.gz $DOWNLOAD_URL

# 2. 解压
echo "正在解压..."
mkdir -p $INSTALL_DIR
tar -xzf /tmp/frp.tar.gz -C /tmp/
cp -r /tmp/frp_${{FRP_VERSION}}_linux_amd64/* $INSTALL_DIR/
rm -rf /tmp/frp.tar.gz /tmp/frp_${{FRP_VERSION}}_linux_amd64

# 3. 创建配置文件
echo "正在创建配置文件..."
cat > $INSTALL_DIR/frpc.toml << 'EOF'
serverAddr = "{server_ip}"
serverPort = {port}
auth.token = "{auth_token}"

# Admin API (用于热重载)
webServer.addr = "127.0.0.1"
webServer.port = 7400
EOF

# 4. 创建 systemd service
echo "正在创建系统服务..."
cat > /etc/systemd/system/frpc.service << 'EOF'
[Unit]
Description=FRP Client
After=network.target

[Service]
Type=simple
ExecStart=$INSTALL_DIR/frpc -c $INSTALL_DIR/frpc.toml
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# 5. 启动服务
echo "正在启动服务..."
systemctl daemon-reload
systemctl enable frpc
systemctl start frpc

echo "✅ FRP Client 部署完成！"
echo "服务状态: systemctl status frpc"
"""
    
    return {"script": script}
