// Package ws 提供 WebSocket 客户端功能
package ws

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"runtime"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// Message WebSocket 消息结构
type Message struct {
	Type string      `json:"type"`
	Data interface{} `json:"data,omitempty"`
}

// Client WebSocket 客户端
type Client struct {
	serverURL string
	clientID  string
	token     string
	version   string // Agent 版本

	conn         *websocket.Conn
	mu           sync.Mutex
	isRunning    bool
	reconnect    bool
	OnMessage    func(Message)
	OnConnect    func()
	OnDisconnect func()
}

// NewClient 创建新的 WebSocket 客户端
func NewClient(serverURL, clientID, token, version string) *Client {
	return &Client{
		serverURL: serverURL,
		clientID:  clientID,
		token:     token,
		version:   version,
		reconnect: true,
	}
}

// Connect 连接到服务端
func (c *Client) Connect() {
	c.isRunning = true

	for c.isRunning && c.reconnect {
		if err := c.connect(); err != nil {
			log.Printf("[WebSocket] 连接失败: %v, 3秒后重试...", err)
			time.Sleep(3 * time.Second)
			continue
		}

		// 连接成功，开始读取消息
		c.readLoop()

		if c.reconnect {
			log.Println("[WebSocket] 连接断开，3秒后重连...")
			time.Sleep(3 * time.Second)
		}
	}
}

func (c *Client) connect() error {
	// 构建带认证的请求头
	header := http.Header{}
	header.Add("X-Client-Token", c.token)
	header.Add("X-Client-ID", c.clientID)

	// 连接服务端
	dialer := websocket.DefaultDialer
	dialer.HandshakeTimeout = 10 * time.Second

	conn, _, err := dialer.Dial(c.serverURL, header)
	if err != nil {
		return err
	}

	c.mu.Lock()
	c.conn = conn
	c.mu.Unlock()

	log.Println("[WebSocket] 连接成功")

	// 获取系统信息
	hostname, _ := os.Hostname()

	// 发送注册消息（包含系统信息）
	c.Send("register", map[string]string{
		"client_id": c.clientID,
		"version":   c.version,
		"hostname":  hostname,
		"os":        runtime.GOOS,
		"arch":      runtime.GOARCH,
	})

	if c.OnConnect != nil {
		c.OnConnect()
	}

	return nil
}

func (c *Client) readLoop() {
	for {
		c.mu.Lock()
		conn := c.conn
		c.mu.Unlock()

		if conn == nil {
			return
		}

		_, data, err := conn.ReadMessage()
		if err != nil {
			log.Printf("[WebSocket] 读取消息失败: %v", err)
			return
		}

		var msg Message
		if err := json.Unmarshal(data, &msg); err != nil {
			log.Printf("[WebSocket] 消息解析失败: %v", err)
			continue
		}

		if c.OnMessage != nil {
			c.OnMessage(msg)
		}
	}
}

// Send 发送消息到服务端
func (c *Client) Send(msgType string, data interface{}) error {
	c.mu.Lock()
	conn := c.conn
	c.mu.Unlock()

	if conn == nil {
		return nil
	}

	msg := Message{
		Type: msgType,
		Data: data,
	}

	msgBytes, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	return conn.WriteMessage(websocket.TextMessage, msgBytes)
}

// Close 关闭连接
func (c *Client) Close() {
	c.isRunning = false
	c.reconnect = false

	c.mu.Lock()
	if c.conn != nil {
		c.conn.Close()
		c.conn = nil
	}
	c.mu.Unlock()

	if c.OnDisconnect != nil {
		c.OnDisconnect()
	}
}

// IsConnected 检查是否已连接
func (c *Client) IsConnected() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.conn != nil
}
