# FRP Manager Agent - Makefile
# 用于交叉编译各平台版本

BINARY_NAME=frp-agent
VERSION=1.0.0
BUILD_TIME=$(shell date +%Y-%m-%d_%H:%M:%S)
LDFLAGS=-ldflags "-s -w -X main.version=$(VERSION) -X main.buildTime=$(BUILD_TIME)"

.PHONY: all clean linux-amd64 linux-arm64 darwin-amd64 darwin-arm64 windows-amd64 deps

# 默认目标：构建所有平台
all: deps linux-amd64 linux-arm64 darwin-amd64 darwin-arm64 windows-amd64
	@echo "✅ 所有平台构建完成，产物在 dist/ 目录"
	@ls -la dist/

# 下载依赖
deps:
	@echo "📦 下载依赖..."
	go mod tidy
	go mod download

# Linux AMD64 (最常用)
linux-amd64:
	@echo "🔨 构建 Linux AMD64..."
	GOOS=linux GOARCH=amd64 go build $(LDFLAGS) -o dist/$(BINARY_NAME)-linux-amd64 ./cmd/frp-agent

# Linux ARM64 (树莓派, ARM服务器)
linux-arm64:
	@echo "🔨 构建 Linux ARM64..."
	GOOS=linux GOARCH=arm64 go build $(LDFLAGS) -o dist/$(BINARY_NAME)-linux-arm64 ./cmd/frp-agent

# macOS Intel
darwin-amd64:
	@echo "🔨 构建 macOS AMD64..."
	GOOS=darwin GOARCH=amd64 go build $(LDFLAGS) -o dist/$(BINARY_NAME)-darwin-amd64 ./cmd/frp-agent

# macOS Apple Silicon
darwin-arm64:
	@echo "🔨 构建 macOS ARM64..."
	GOOS=darwin GOARCH=arm64 go build $(LDFLAGS) -o dist/$(BINARY_NAME)-darwin-arm64 ./cmd/frp-agent

# Windows
windows-amd64:
	@echo "🔨 构建 Windows AMD64..."
	GOOS=windows GOARCH=amd64 go build $(LDFLAGS) -o dist/$(BINARY_NAME)-windows-amd64.exe ./cmd/frp-agent

# 仅构建当前平台（开发用）
dev:
	@echo "🔨 构建当前平台..."
	go build $(LDFLAGS) -o dist/$(BINARY_NAME) ./cmd/frp-agent

# 运行测试
test:
	go test -v ./...

# 清理
clean:
	rm -rf dist/
	@echo "🧹 清理完成"

# 帮助
help:
	@echo "FRP Manager Agent 构建脚本"
	@echo ""
	@echo "目标:"
	@echo "  all           - 构建所有平台"
	@echo "  dev           - 仅构建当前平台（开发用）"
	@echo "  linux-amd64   - 构建 Linux AMD64"
	@echo "  linux-arm64   - 构建 Linux ARM64"
	@echo "  darwin-amd64  - 构建 macOS Intel"
	@echo "  darwin-arm64  - 构建 macOS Apple Silicon"
	@echo "  windows-amd64 - 构建 Windows"
	@echo "  clean         - 清理构建产物"
	@echo ""
	@echo "示例:"
	@echo "  make all      - 构建所有平台"
	@echo "  make dev      - 快速构建当前平台进行测试"
