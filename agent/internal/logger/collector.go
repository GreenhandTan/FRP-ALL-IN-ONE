// Package logger 提供日志采集功能
package logger

import (
	"bufio"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Collector 日志采集器
type Collector struct {
	logDir   string
	clientID string

	buffer    []string
	bufferMu  sync.Mutex
	maxBuffer int

	logFile  *os.File
	fileMu   sync.Mutex

	isRunning bool
	OnLog     func(string) // 实时推送回调
}

// NewCollector 创建新的日志采集器
func NewCollector(logDir, clientID string) *Collector {
	return &Collector{
		logDir:    logDir,
		clientID:  clientID,
		maxBuffer: 1000, // 最多缓存 1000 条日志
	}
}

// Start 启动日志采集器
func (c *Collector) Start() error {
	c.isRunning = true

	// 确保日志目录存在
	if err := os.MkdirAll(c.logDir, 0755); err != nil {
		return fmt.Errorf("创建日志目录失败: %v", err)
	}

	// 创建/打开日志文件
	if err := c.rotateLogFile(); err != nil {
		return err
	}

	// 启动定时刷新协程
	go c.flushLoop()

	log.Printf("[Logger] 日志采集器已启动，目录: %s", c.logDir)
	return nil
}

// Stop 停止日志采集器
func (c *Collector) Stop() {
	c.isRunning = false
	c.flush()

	c.fileMu.Lock()
	if c.logFile != nil {
		c.logFile.Close()
	}
	c.fileMu.Unlock()
}

// AddLine 添加一行日志
func (c *Collector) AddLine(line string) {
	timestamp := time.Now().Format("2006-01-02 15:04:05")
	formattedLine := fmt.Sprintf("[%s] %s", timestamp, line)

	// 添加到缓冲区
	c.bufferMu.Lock()
	if len(c.buffer) >= c.maxBuffer {
		// 缓冲区满，移除最旧的
		c.buffer = c.buffer[1:]
	}
	c.buffer = append(c.buffer, formattedLine)
	c.bufferMu.Unlock()

	// 实时推送
	if c.OnLog != nil {
		c.OnLog(formattedLine)
	}
}

// GetRecentLogs 获取最近的日志
func (c *Collector) GetRecentLogs(count int) []string {
	c.bufferMu.Lock()
	defer c.bufferMu.Unlock()

	if count > len(c.buffer) {
		count = len(c.buffer)
	}

	result := make([]string, count)
	copy(result, c.buffer[len(c.buffer)-count:])
	return result
}

// 定时刷新到文件
func (c *Collector) flushLoop() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	// 每天零点轮转日志文件
	lastDate := time.Now().Format("2006-01-02")

	for c.isRunning {
		select {
		case <-ticker.C:
			c.flush()

			// 检查是否需要轮转
			currentDate := time.Now().Format("2006-01-02")
			if currentDate != lastDate {
				c.rotateLogFile()
				lastDate = currentDate
			}
		}
	}
}

// 刷新缓冲区到文件
func (c *Collector) flush() {
	c.bufferMu.Lock()
	lines := make([]string, len(c.buffer))
	copy(lines, c.buffer)
	c.bufferMu.Unlock()

	if len(lines) == 0 {
		return
	}

	c.fileMu.Lock()
	defer c.fileMu.Unlock()

	if c.logFile == nil {
		return
	}

	for _, line := range lines {
		c.logFile.WriteString(line + "\n")
	}
	c.logFile.Sync()
}

// 轮转日志文件
func (c *Collector) rotateLogFile() error {
	c.fileMu.Lock()
	defer c.fileMu.Unlock()

	// 关闭旧文件
	if c.logFile != nil {
		c.logFile.Close()
	}

	// 创建新的日志文件
	date := time.Now().Format("2006-01-02")
	filename := filepath.Join(c.logDir, fmt.Sprintf("frpc-%s-%s.log", c.clientID, date))

	file, err := os.OpenFile(filename, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return fmt.Errorf("打开日志文件失败: %v", err)
	}

	c.logFile = file
	log.Printf("[Logger] 日志文件: %s", filename)

	return nil
}

// ReadLogFile 读取指定日期的日志文件
func (c *Collector) ReadLogFile(date string) ([]string, error) {
	filename := filepath.Join(c.logDir, fmt.Sprintf("frpc-%s-%s.log", c.clientID, date))

	file, err := os.Open(filename)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var lines []string
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}

	return lines, scanner.Err()
}
