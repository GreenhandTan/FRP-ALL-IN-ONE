// Package frpc 提供 FRPC 进程托管功能
package frpc

import (
	"bufio"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"sync"
	"time"

	"github.com/frp-manager/agent/internal/logger"
)

// Manager FRPC 进程管理器
type Manager struct {
	frpcPath     string
	configPath   string
	logCollector *logger.Collector

	process *exec.Cmd
	doneCh  chan struct{}
	stdout  io.ReadCloser
	stderr  io.ReadCloser
	mu      sync.Mutex

	isRunning bool
	OnStatus  func(status string)
}

// NewManager 创建新的 FRPC 管理器
func NewManager(frpcPath, configPath string, logCollector *logger.Collector) *Manager {
	return &Manager{
		frpcPath:     frpcPath,
		configPath:   configPath,
		logCollector: logCollector,
	}
}

// Start 启动 FRPC 进程
func (m *Manager) Start() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.isRunning {
		return fmt.Errorf("FRPC 已在运行中")
	}

	// 检查 frpc 二进制是否存在
	if _, err := os.Stat(m.frpcPath); os.IsNotExist(err) {
		return fmt.Errorf("frpc 二进制不存在: %s", m.frpcPath)
	}

	// 检查配置文件是否存在
	if _, err := os.Stat(m.configPath); os.IsNotExist(err) {
		return fmt.Errorf("配置文件不存在: %s", m.configPath)
	}

	log.Printf("[FRPC] 启动中: %s -c %s", m.frpcPath, m.configPath)

	// 创建进程
	m.process = exec.Command(m.frpcPath, "-c", m.configPath)

	// 获取输出管道
	stdout, err := m.process.StdoutPipe()
	if err != nil {
		return fmt.Errorf("获取 stdout 失败: %v", err)
	}
	m.stdout = stdout

	stderr, err := m.process.StderrPipe()
	if err != nil {
		return fmt.Errorf("获取 stderr 失败: %v", err)
	}
	m.stderr = stderr

	// 启动进程
	if err := m.process.Start(); err != nil {
		return fmt.Errorf("启动进程失败: %v", err)
	}

	m.isRunning = true
	log.Printf("[FRPC] 进程已启动, PID: %d", m.process.Process.Pid)

	// 启动日志采集协程
	go m.streamLogs(stdout, "stdout")
	go m.streamLogs(stderr, "stderr")

	// 创建 done channel 用于通知进程退出
	m.doneCh = make(chan struct{})

	// 监控进程状态
	go m.watchProcess()

	if m.OnStatus != nil {
		m.OnStatus("running")
	}

	return nil
}

// Stop 停止 FRPC 进程
func (m *Manager) Stop() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.isRunning || m.process == nil {
		return nil
	}

	log.Println("[FRPC] 正在停止...")

	// 发送终止信号
	if err := m.process.Process.Signal(os.Interrupt); err != nil {
		// 如果 Interrupt 失败，强制杀死
		m.process.Process.Kill()
	}

	// 等待进程退出（通过 check watchProcess 的 doneCh）
	select {
	case <-m.doneCh:
		log.Printf("[FRPC] 进程已停止")
	case <-time.After(3 * time.Second):
		log.Println("[FRPC] 等待超时，强制杀死进程")
		m.process.Process.Kill()

		// 再次等待
		select {
		case <-m.doneCh:
			log.Printf("[FRPC] 进程已停止 (Killed)")
		case <-time.After(1 * time.Second):
			log.Println("[FRPC] 进程停止超时，不再等待")
		}
	}

	m.process = nil
	m.isRunning = false

	// 等待端口释放
	time.Sleep(500 * time.Millisecond)

	if m.OnStatus != nil {
		m.OnStatus("stopped")
	}

	return nil
}

// Restart 重启 FRPC 进程
func (m *Manager) Restart() error {
	log.Println("[FRPC] 重启中...")

	// 先解锁以便 Stop 可以获取锁
	if err := m.Stop(); err != nil {
		log.Printf("[FRPC] 停止失败: %v", err)
	}

	// 额外等待确保端口完全释放
	time.Sleep(1 * time.Second)

	return m.Start()
}

// UpdateConfig 更新配置并重载
func (m *Manager) UpdateConfig(newConfig string) error {
	log.Println("[FRPC] 正在更新配置...")

	// 备份旧配置
	backupPath := m.configPath + ".bak"
	if data, err := os.ReadFile(m.configPath); err == nil {
		os.WriteFile(backupPath, data, 0644)
	}

	// 写入新配置
	if err := os.WriteFile(m.configPath, []byte(newConfig), 0644); err != nil {
		return fmt.Errorf("写入配置失败: %v", err)
	}

	log.Println("[FRPC] 配置已更新，准备重载...")

	// 尝试通过 Admin API 热重载
	// 只有当进程在运行，且 Admin API 端口可达时，才进行热重载
	if m.IsRunning() && m.checkAdminAPIAvailable() {
		log.Println("[FRPC] Admin API 可用，尝试热重载...")
		if err := m.hotReload(); err != nil {
			log.Printf("[FRPC] 热重载失败: %v, 将回退到重启进程", err)
			return m.Restart()
		}
		log.Println("[FRPC] 热重载成功")
		return nil
	}

	// 其他情况（进程未运行，或 Admin API 不可用），直接重启/启动
	log.Println("[FRPC] 进程未运行或 Admin API 不可用，执行重启...")
	if m.IsRunning() {
		return m.Restart()
	}
	return m.Start()
}

// checkAdminAPIAvailable 检查 Admin API 端口是否可达
func (m *Manager) checkAdminAPIAvailable() bool {
	timeout := 100 * time.Millisecond
	conn, err := net.DialTimeout("tcp", "127.0.0.1:7400", timeout)
	if err != nil {
		return false
	}
	if conn != nil {
		conn.Close()
		return true
	}
	return false
}

// hotReload 通过 Admin API 热重载配置
func (m *Manager) hotReload() error {
	// FRPC Admin API 默认监听 127.0.0.1:7400
	client := &http.Client{
		Timeout: 2 * time.Second,
	}

	// 尝试 PUT /api/v1/reload (新版 API)
	req, _ := http.NewRequest("PUT", "http://127.0.0.1:7400/api/v1/reload", nil)
	resp, err := client.Do(req)

	if err == nil && resp.StatusCode == http.StatusOK {
		resp.Body.Close()
		return nil
	}
	if resp != nil {
		resp.Body.Close()
	}

	// 如果失败（例如 404），尝试旧版 API /api/reload
	log.Println("[FRPC] v1 API 失败，尝试旧版 API /api/reload")
	resp, err = client.Get("http://127.0.0.1:7400/api/reload")
	if err != nil {
		return fmt.Errorf("请求失败: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("热重载失败: %d, %s", resp.StatusCode, string(body))
	}

	return nil
}

// IsRunning 检查 FRPC 是否在运行
func (m *Manager) IsRunning() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.isRunning
}

// 流式读取日志
func (m *Manager) streamLogs(reader io.Reader, source string) {
	scanner := bufio.NewScanner(reader)
	for scanner.Scan() {
		line := scanner.Text()
		// 发送到日志采集器
		if m.logCollector != nil {
			m.logCollector.AddLine(line)
		}
	}
}

// 监控进程状态
func (m *Manager) watchProcess() {
	defer close(m.doneCh) // 通知 Stop 协程进程已退出

	if m.process == nil {
		return
	}

	err := m.process.Wait()

	m.mu.Lock()
	m.isRunning = false
	m.mu.Unlock()

	if err != nil {
		// 如果是被 Signal Killed，也会返回 err
		log.Printf("[FRPC] 进程退出: %v", err)
	} else {
		log.Println("[FRPC] 进程已退出")
	}

	if m.OnStatus != nil {
		m.OnStatus("stopped")
	}
}
