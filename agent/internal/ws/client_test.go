package ws

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestSendSerializesConcurrentWrites(t *testing.T) {
	const messageCount = 100
	received := make(chan Message, messageCount)
	serverErrors := make(chan error, 1)

	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			serverErrors <- err
			return
		}
		defer conn.Close()

		for i := 0; i < messageCount; i++ {
			_, payload, err := conn.ReadMessage()
			if err != nil {
				serverErrors <- err
				return
			}
			var msg Message
			if err := json.Unmarshal(payload, &msg); err != nil {
				serverErrors <- err
				return
			}
			received <- msg
		}
	}))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial websocket: %v", err)
	}

	client := NewClient(wsURL, "client-1", "token", "test")
	client.conn = conn
	defer client.Close()

	var wg sync.WaitGroup
	for i := 0; i < messageCount; i++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			if err := client.Send("metric", index); err != nil {
				t.Errorf("send %d: %v", index, err)
			}
		}(i)
	}
	wg.Wait()

	for i := 0; i < messageCount; i++ {
		select {
		case msg := <-received:
			if msg.Type != "metric" {
				t.Fatalf("unexpected message type: %s", msg.Type)
			}
		case err := <-serverErrors:
			t.Fatalf("server read failed: %v", err)
		case <-time.After(5 * time.Second):
			t.Fatal(fmt.Errorf("timed out waiting for message %d", i+1))
		}
	}
}
