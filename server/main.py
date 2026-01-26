from fastapi import FastAPI, Depends, HTTPException, status
from sqlalchemy.orm import Session
import models, schemas, crud
from database import SessionLocal, engine
from fastapi.middleware.cors import CORSMiddleware

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="FRP Manager API")

# CORS for Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.post("/clients/", response_model=schemas.Client)
def create_client(client: schemas.ClientCreate, db: Session = Depends(get_db)):
    return crud.create_client(db=db, client=client)

@app.get("/clients/", response_model=list[schemas.Client])
def read_clients(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.get_clients(db, skip=skip, limit=limit)

@app.get("/clients/{client_id}", response_model=schemas.Client)
def read_client(client_id: str, db: Session = Depends(get_db)):
    db_client = crud.get_client(db, client_id=client_id)
    if db_client is None:
        raise HTTPException(status_code=404, detail="Client not found")
    return db_client

@app.post("/clients/{client_id}/tunnels/", response_model=schemas.Tunnel)
def create_tunnel_for_client(
    client_id: str, tunnel: schemas.TunnelCreate, db: Session = Depends(get_db)
):
    return crud.create_tunnel(db=db, tunnel=tunnel, client_id=client_id)

@app.get("/clients/{client_id}/config")
def get_client_config(client_id: str, db: Session = Depends(get_db)):
    """
    Generate the TOML config for the client agent to download.
    """
    client = crud.get_client(db, client_id=client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # 生成配置内容
    config_lines = []
    
    # 通用部分 (通常来自服务端全局配置，目前硬编码或由Agent传递)
    # 实际上，Agent通常管理自己的通用部分 (如 server_addr 等)，
    # 但为了全面管理，我们可能希望强制下发。
    # 目前，我们仅返回 'proxies' 部分或特定配置。
    
    # 策略：返回一个JSON结构，由Agent转换为TOML或直接返回原始TOML字符串。
    # 新版 FRPC 使用 TOML。
    
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
