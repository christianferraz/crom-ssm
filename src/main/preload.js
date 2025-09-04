const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ssm', {
  // ConnectionService methods
  listConnections: () => ipcRenderer.invoke('ssm:connections:list'),
  addConnection: (connectionData) => ipcRenderer.invoke('ssm:connections:add', connectionData),
  updateConnection: (id, data) => ipcRenderer.invoke('ssm:connections:update', id, data),
  removeConnection: (id) => ipcRenderer.invoke('ssm:connections:remove', id),
  setPassword: (id, password) => ipcRenderer.invoke('ssm:connections:setPassword', id, password),

  // SSHService methods
  exec: (connectionId, command) => ipcRenderer.invoke('ssm:ssh:exec', connectionId, command),
  testConnection: (connectionData) => ipcRenderer.invoke('ssm:ssh:test', connectionData),

  // SFTPService methods
  sftpList: (connectionId, remotePath) => ipcRenderer.invoke('ssm:sftp:list', connectionId, remotePath),
  sftpReadFile: (connectionId, remotePath) => ipcRenderer.invoke('ssm:sftp:readFile', connectionId, remotePath),
  sftpWriteFile: (connectionId, remotePath, content) => ipcRenderer.invoke('ssm:sftp:writeFile', connectionId, remotePath, content),

  // Dummy methods for upcoming features to illustrate the API
  openTerminal: (id) => ipcRenderer.invoke('ssm:terminal:open', id)
});