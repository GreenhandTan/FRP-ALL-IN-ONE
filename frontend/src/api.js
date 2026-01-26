import axios from 'axios';

// 生产环境使用相对路径 (通过Nginx代理)，开发环境可修改为 http://localhost:8000
const API_URL = '';

export const api = axios.create({
  baseURL: API_URL,
});

export const getClients = async () => {
  const response = await api.get('/clients/');
  return response.data;
};

export const createClient = async (name) => {
  const response = await api.post('/clients/', { name });
  return response.data;
};

export const createTunnel = async (clientId, tunnelData) => {
  const response = await api.post(`/clients/${clientId}/tunnels/`, tunnelData);
  return response.data;
};
