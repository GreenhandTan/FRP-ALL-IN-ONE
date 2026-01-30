# =============================================================
# FRP Manager Agent 一键安装脚本 - Windows PowerShell
# =============================================================
# 使用方法 (以管理员身份运行 PowerShell):
#   irm http://YOUR_SERVER/api/frp/agent-install.ps1 | iex
#
# 此脚本会自动从 GitHub Releases 下载 Agent 二进制
# =============================================================

# 配置区域 (会被服务端动态替换)
$GITHUB_REPO = if ($env:GITHUB_REPO) { $env:GITHUB_REPO } else { "__GITHUB_REPO__" }
$AGENT_VERSION = if ($env:AGENT_VERSION) { $env:AGENT_VERSION } else { "__AGENT_VERSION__" }
$AGENT_SERVER_URL = if ($env:AGENT_SERVER_URL) { $env:AGENT_SERVER_URL } else { "__SERVER_URL__" }
$AGENT_CLIENT_ID = if ($env:AGENT_CLIENT_ID) { $env:AGENT_CLIENT_ID } else { "__CLIENT_ID__" }
$AGENT_TOKEN = if ($env:AGENT_TOKEN) { $env:AGENT_TOKEN } else { "__TOKEN__" }

$INSTALL_DIR = "C:\frp"
$AGENT_BINARY = "frp-agent.exe"
$SERVICE_NAME = "FRPManagerAgent"

# 颜色输出函数
function Write-Step { Write-Host "[STEP] $args" -ForegroundColor Cyan }
function Write-Info { Write-Host "[INFO] $args" -ForegroundColor Blue }
function Write-Success { Write-Host "[OK] $args" -ForegroundColor Green }
function Write-Warn { Write-Host "[WARN] $args" -ForegroundColor Yellow }
function Write-Err { Write-Host "[ERROR] $args" -ForegroundColor Red }

# 检查管理员权限
function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# 获取最新版本
function Get-LatestVersion {
    if ($AGENT_VERSION -eq "latest" -or $AGENT_VERSION -eq "__AGENT_VERSION__") {
        Write-Info "获取最新版本号..."
        try {
            $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$GITHUB_REPO/releases/latest"
            $script:AGENT_VERSION = $release.tag_name
            Write-Success "最新版本: $AGENT_VERSION"
        } catch {
            Write-Err "无法获取最新版本: $_"
            exit 1
        }
    }
}

# 创建安装目录
function Initialize-Directories {
    Write-Step "创建安装目录..."
    
    if (!(Test-Path $INSTALL_DIR)) {
        New-Item -ItemType Directory -Path $INSTALL_DIR -Force | Out-Null
    }
    
    if (!(Test-Path "$INSTALL_DIR\logs")) {
        New-Item -ItemType Directory -Path "$INSTALL_DIR\logs" -Force | Out-Null
    }
    
    Write-Success "目录创建完成: $INSTALL_DIR"
}

# 从 GitHub 下载 Agent
function Get-AgentBinary {
    Write-Step "从 GitHub 下载 Agent..."
    
    $binaryName = "frp-agent-windows-amd64.exe"
    $downloadUrl = "https://github.com/$GITHUB_REPO/releases/download/$AGENT_VERSION/$binaryName"
    $targetPath = "$INSTALL_DIR\$AGENT_BINARY"
    
    Write-Info "下载地址: $downloadUrl"
    
    try {
        # 使用 TLS 1.2
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        
        Invoke-WebRequest -Uri $downloadUrl -OutFile $targetPath -UseBasicParsing
        Write-Success "下载完成: $targetPath"
    } catch {
        Write-Err "下载失败: $_"
        exit 1
    }
}

# 创建 Windows 服务
function Install-AgentService {
    Write-Step "配置 Windows 服务..."
    
    # 先删除已存在的服务
    $existingService = Get-Service -Name $SERVICE_NAME -ErrorAction SilentlyContinue
    if ($existingService) {
        Write-Info "删除已存在的服务..."
        Stop-Service -Name $SERVICE_NAME -Force -ErrorAction SilentlyContinue
        sc.exe delete $SERVICE_NAME | Out-Null
        Start-Sleep -Seconds 2
    }
    
    # 创建批处理启动脚本
    $startScript = @"
@echo off
cd /d "$INSTALL_DIR"
"$INSTALL_DIR\$AGENT_BINARY" -server "$AGENT_SERVER_URL" -id "$AGENT_CLIENT_ID" -token "$AGENT_TOKEN" -frpc "$INSTALL_DIR\frpc.exe" -config "$INSTALL_DIR\frpc.toml" -log "$INSTALL_DIR\logs"
"@
    $startScript | Out-File -FilePath "$INSTALL_DIR\start-agent.bat" -Encoding ASCII
    
    # 保存配置信息
    $config = @"
# FRP Manager Agent 配置
GitHub_Repo=$GITHUB_REPO
Agent_Version=$AGENT_VERSION
Server_URL=$AGENT_SERVER_URL
Client_ID=$AGENT_CLIENT_ID
"@
    $config | Out-File -FilePath "$INSTALL_DIR\agent.conf" -Encoding UTF8
    
    # 尝试创建 Windows 服务 (使用 sc.exe)
    try {
        $binPath = "`"$INSTALL_DIR\$AGENT_BINARY`" -server `"$AGENT_SERVER_URL`" -id `"$AGENT_CLIENT_ID`" -token `"$AGENT_TOKEN`""
        
        sc.exe create $SERVICE_NAME binPath= $binPath start= auto displayname= "FRP Manager Agent"
        sc.exe description $SERVICE_NAME "FRP Manager 智能客户端代理"
        
        Write-Success "Windows 服务创建完成"
    } catch {
        Write-Warn "无法创建 Windows 服务，将使用启动脚本方式"
    }
}

# 创建开机启动快捷方式
function Set-AutoStart {
    Write-Step "配置开机自启动..."
    
    $startupFolder = [Environment]::GetFolderPath('Startup')
    $shortcutPath = "$startupFolder\FRP-Agent.lnk"
    
    try {
        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = "$INSTALL_DIR\start-agent.bat"
        $shortcut.WorkingDirectory = $INSTALL_DIR
        $shortcut.WindowStyle = 7  # 最小化运行
        $shortcut.Save()
        Write-Success "开机启动配置完成"
    } catch {
        Write-Warn "无法创建开机启动快捷方式"
    }
}

# 启动服务
function Start-AgentService {
    Write-Step "启动 Agent..."
    
    try {
        sc.exe start $SERVICE_NAME | Out-Null
        Start-Sleep -Seconds 2
        
        $service = Get-Service -Name $SERVICE_NAME -ErrorAction SilentlyContinue
        if ($service -and $service.Status -eq "Running") {
            Write-Success "服务启动成功"
        } else {
            Write-Warn "服务状态未知，尝试直接运行..."
            Start-Process -FilePath "$INSTALL_DIR\start-agent.bat" -WindowStyle Minimized
            Write-Success "Agent 已在后台启动"
        }
    } catch {
        Write-Warn "无法启动服务，尝试直接运行..."
        Start-Process -FilePath "$INSTALL_DIR\start-agent.bat" -WindowStyle Minimized
        Write-Success "Agent 已在后台启动"
    }
}

# 显示安装摘要
function Show-Summary {
    Write-Host ""
    Write-Host "================================================================" -ForegroundColor Green
    Write-Host "       FRP Manager Agent 安装完成！" -ForegroundColor Green
    Write-Host "================================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "安装目录: $INSTALL_DIR"
    Write-Host "客户端 ID: $AGENT_CLIENT_ID"
    Write-Host "服务端: $AGENT_SERVER_URL"
    Write-Host "版本: $AGENT_VERSION"
    Write-Host ""
    Write-Host "常用命令:" -ForegroundColor Cyan
    Write-Host "  查看状态: sc.exe query $SERVICE_NAME"
    Write-Host "  启动服务: sc.exe start $SERVICE_NAME"
    Write-Host "  停止服务: sc.exe stop $SERVICE_NAME"
    Write-Host "  查看日志: Get-Content $INSTALL_DIR\logs\*.log -Tail 50"
    Write-Host ""
    Write-Host "如果服务无法启动，可直接运行: $INSTALL_DIR\start-agent.bat" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "现在可以回到管理面板查看该客户端状态！" -ForegroundColor Cyan
    Write-Host ""
}

# 主函数
function Main {
    Write-Host ""
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host "       FRP Manager Agent 一键安装脚本 (Windows)" -ForegroundColor Cyan
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host ""
    
    # 检查管理员权限
    if (!(Test-Administrator)) {
        Write-Warn "建议以管理员身份运行以获得最佳效果"
        Write-Host "按任意键继续，或按 Ctrl+C 取消..." -ForegroundColor Yellow
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    }
    
    Write-Info "检测到平台: windows-amd64"
    
    Get-LatestVersion
    Initialize-Directories
    Get-AgentBinary
    Install-AgentService
    Set-AutoStart
    Start-AgentService
    Show-Summary
}

# 运行主函数
Main
