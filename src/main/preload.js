const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ssm', {
  // Navigation
  enterApp: () => ipcRenderer.send('navigate:to:main'),

  // ConnectionService methods
  listConnections: () => ipcRenderer.invoke('ssm:connections:list'),
  addConnection: (connectionData) => ipcRenderer.invoke('ssm:connections:add', connectionData),
  removeConnection: (id) => ipcRenderer.invoke('ssm:connections:remove', id),
  setPassword: (id, password) => ipcRenderer.invoke('ssm:connections:setPassword', id, password),

  // SSHService methods
  testConnection: (connectionData) => ipcRenderer.invoke('ssm:ssh:test', connectionData),

  // SFTPService methods
  sftpList: (connectionId, remotePath) => ipcRenderer.invoke('ssm:sftp:list', connectionId, remotePath),
  sftpReadFile: (connectionId, remotePath) => ipcRenderer.invoke('ssm:sftp:readFile', connectionId, remotePath),
  sftpReadFileAsBase64: (connectionId, remotePath) => ipcRenderer.invoke('ssm:sftp:readFileAsBase64', connectionId, remotePath),
  sftpWriteFile: (connectionId, remotePath, content) => ipcRenderer.invoke('ssm:sftp:writeFile', connectionId, remotePath, content),
  sftpDeleteFile: (connectionId, remotePath) => ipcRenderer.invoke('ssm:sftp:deleteFile', connectionId, remotePath),
  sftpDeleteDir: (connectionId, remotePath) => ipcRenderer.invoke('ssm:sftp:deleteDir', connectionId, remotePath),
  sftpCreateDir: (connectionId, remotePath) => ipcRenderer.invoke('ssm:sftp:createDir', connectionId, remotePath),
  sftpDownloadFile: (connectionId, remotePath) => ipcRenderer.invoke('ssm:sftp:downloadFile', connectionId, remotePath),

  // MetricsService methods
  startMetrics: (connectionId) => ipcRenderer.send('ssm:metrics:start', connectionId),
  stopMetrics: (connectionId) => ipcRenderer.send('ssm:metrics:stop', connectionId),
  onMetricsUpdate: (callback) => {
    const channel = 'ssm:metrics:update';
    ipcRenderer.on(channel, (event, data) => callback(data));
    // Return a cleanup function
    return () => ipcRenderer.removeAllListeners(channel);
  }
});