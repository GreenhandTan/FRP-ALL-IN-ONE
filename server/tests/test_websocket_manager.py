import asyncio

from websocket_manager import ConnectionManager


class FakeWebSocket:
    def __init__(self):
        self.closed = False
        self.messages = []

    async def close(self, *args, **kwargs):
        self.closed = True

    async def send_json(self, message):
        self.messages.append(message)


def test_old_agent_session_cannot_disconnect_replacement():
    async def scenario():
        manager = ConnectionManager()
        old_socket = FakeWebSocket()
        new_socket = FakeWebSocket()

        await manager.connect_agent(old_socket, "client-1")
        await manager.connect_agent(new_socket, "client-1")

        assert old_socket.closed is True
        assert manager.agent_connections["client-1"] is new_socket

        removed = await manager.disconnect_agent("client-1", old_socket)
        assert removed is False
        assert manager.agent_connections["client-1"] is new_socket

        removed = await manager.disconnect_agent("client-1", new_socket)
        assert removed is True
        assert "client-1" not in manager.agent_connections

    asyncio.run(scenario())
