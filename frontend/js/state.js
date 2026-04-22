/**
 * 全局应用状态模块
 */

export const STATE = {
  registeredClients: [],
  frpProxies: [],
  disabledPorts: [],
  serverInfo: {},
  stats: {
    totalClients: 0,
    onlineClients: 0,
    machineTrafficIn: 0,
    machineTrafficOut: 0,
    activeProxies: 0,
    totalProxies: 0,
    onlineAgents: 0,
  },
  // 添加隧道上下文
  pendingTunnelClientId: null,
  // 日志 WS
  logWs: null,
  logPaused: false,
  logLines: [],
  logClientId: null,
};
