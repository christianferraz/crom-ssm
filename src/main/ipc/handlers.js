const { ipcMain, dialog } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const connectionService = require('../services/ConnectionService');
const SFTPService = require('../services/SFTPService');
const MetricsService = require('../services/MetricsService');
const TerminalService = require('../services/TerminalService');
const SSHService = require('../services/SSHService');
const logger = require('../utils/logger');

let activeMetricsService = null;
let activeTerminalService = null;

async function getAuthConfig(connData, useRawPassword = false) {
    let authConfig = {
        host: connData.host, port: connData.port || 22, username: connData.user,
    };
    if (connData.authMethod === 'password') {
        const password = useRawPassword ? connData.password : await connectionService.getPassword(connData.id);
        if (password) { // Only add password if it exists
            authConfig.password = password;
        }
    } else if (connData.authMethod === 'key' && connData.keyPath) {
        try { authConfig.privateKey = await fs.readFile(connData.keyPath); } 
        catch (error) { throw new Error(`Falha ao ler a chave privada em ${connData.keyPath}`); }
    } else if (connData.authMethod !== 'key' && connData.authMethod !== 'password') {
      throw new Error('Método de autenticação inválido ou credenciais ausentes.');
    }
    return authConfig;
}

const handle = (channel, listener) => {
    ipcMain.handle(channel, async (event, ...args) => {
        logger.info(`IPC[handle]: Recebido '${channel}' com args: ${JSON.stringify(args)}`);
        try {
            const result = await listener(event, ...args);
            const resultLog = (channel.includes('readFile') || channel.includes('processList')) ? `{ success: true, dataLength: result?.length || 0 }` : JSON.stringify(result);
            logger.info(`IPC[handle]: Sucesso em '${channel}'. Resultado: ${resultLog}`);
            return result;
        } catch (error) {
            logger.error(`IPC[handle]: Erro em '${channel}'. Erro: ${error.stack}`);
            throw error;
        }
    });
};

function registerIpcHandlers() {
  // Connection Handlers
  handle('ssm:connections:list', () => connectionService.list());
  handle('ssm:connections:add', (evt, d) => connectionService.add(d));
  handle('ssm:connections:update', (evt, id, d) => connectionService.update(id, d));
  handle('ssm:connections:remove', (evt, id) => connectionService.remove(id));
  handle('ssm:connections:setPassword', (evt, id, p) => connectionService.setPassword(id, p));
  
  handle('ssm:ssh:test', async (event, connData) => {
    const authConfig = await getAuthConfig(connData, true);
    // If password is not provided for password auth, and it's an existing connection, try fetching it.
    if(connData.id && connData.authMethod === 'password' && !connData.password) {
        authConfig.password = await connectionService.getPassword(connData.id);
    }
    const sftp = new SFTPService(authConfig);
    try { 
        await sftp.connect(); 
        return { success: true };
    } finally { 
        sftp.disconnect(); 
    }
  });

  // SFTP Handlers
  const sftpAction = async (connectionId, action) => {
    const conn = await connectionService.get(connectionId);
    if (!conn) throw new Error('Conexão não encontrada');
    const authConfig = await getAuthConfig(conn);
    const sftp = new SFTPService(authConfig);
    try { 
        await sftp.connect(); 
        return await action(sftp);
    } finally { 
        sftp.disconnect(); 
    }
  };
  
  handle('ssm:sftp:list', (evt, id, p) => sftpAction(id, sftp => sftp.list(p)));
  handle('ssm:sftp:readFile', (evt, id, p) => sftpAction(id, sftp => sftp.readFile(p)));
  handle('ssm:sftp:readFileAsBase64', (evt, id, p) => sftpAction(id, sftp => sftp.readFile(p, 'base64')));
  handle('ssm:sftp:writeFile', (evt, id, p, c) => sftpAction(id, sftp => sftp.writeFile(p, c)));
  handle('ssm:sftp:deleteFile', (evt, id, p) => sftpAction(id, sftp => sftp.deleteFile(p)));
  handle('ssm:sftp:deleteDir', (evt, id, p) => sftpAction(id, sftp => sftp.deleteDir(p)));
  handle('ssm:sftp:createDir', (evt, id, p) => sftpAction(id, sftp => sftp.createDir(p)));
  handle('ssm:sftp:rename', (evt, id, op, np) => sftpAction(id, sftp => sftp.rename(op, np)));
  
  handle('ssm:sftp:downloadFile', async (evt, connId, remotePath) => {
      const defaultFileName = path.basename(remotePath);
      const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath: defaultFileName });
      if (canceled || !filePath) {
        logger.warn(`Download do arquivo '${remotePath}' cancelado pelo usuário.`);
        return { success: false, reason: 'canceled' };
      }
      await sftpAction(connId, sftp => sftp.downloadFile(remotePath, filePath));
      logger.info(`Arquivo '${remotePath}' baixado com sucesso para '${filePath}'.`);
      return { success: true, path: filePath };
  });

  handle('ssm:sftp:uploadFile', async (evt, connId, remoteDir) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openFile'] });
    if (canceled || filePaths.length === 0) {
        return { success: false, reason: 'canceled' };
    }
    const localPath = filePaths[0];
    const fileName = path.basename(localPath);
    const remotePath = path.join(remoteDir, fileName).replace(/\\/g, '/');
    try {
        await sftpAction(connId, sftp => sftp.uploadFile(localPath, remotePath));
        return { success: true, fileName };
    } catch (error) {
        logger.error(`Falha no upload do arquivo '${localPath}' para '${remotePath}': ${error.message}`);
        return { success: false, error: error.message };
    }
  });

  // SSH Exec Action for one-off commands
  const sshAction = async (connectionId, command) => {
    const conn = await connectionService.get(connectionId);
    if (!conn) throw new Error('Conexão não encontrada');
    const authConfig = await getAuthConfig(conn);
    const ssh = new SSHService(authConfig);
    try {
        await ssh.connect();
        const result = await ssh.exec(command);
        return result.stdout;
    } finally {
        ssh.end();
    }
  };

  // Process Handlers
  handle('ssm:process:list', (evt, connId) => sshAction(connId, "ps -eo pid,user,%cpu,%mem,comm --sort=-%cpu"));
  handle('ssm:process:kill', (evt, connId, pid) => {
    const safePid = parseInt(pid, 10);
    if (isNaN(safePid)) {
        throw new Error('PID inválido.');
    }
    return sshAction(connId, `kill -9 ${safePid}`);
  });
  
  // Metrics Handlers
  ipcMain.on('ssm:metrics:start', async (event, connectionId) => { 
    if (activeMetricsService) activeMetricsService.stopPolling(); 
    const conn = await connectionService.get(connectionId); 
    if (conn) { 
        const authConfig = await getAuthConfig(conn); 
        activeMetricsService = new MetricsService(authConfig, event.sender); 
        activeMetricsService.connectAndStartPolling(); 
    } 
  });
  ipcMain.on('ssm:metrics:stop', () => { 
    if (activeMetricsService) activeMetricsService.stopPolling(); 
    activeMetricsService = null; 
  });

  // Terminal Handlers
  ipcMain.on('ssm:terminal:start', async (event, connectionId) => { 
    if (activeTerminalService) activeTerminalService.stop(); 
    const conn = await connectionService.get(connectionId); 
    if (conn) { 
        const authConfig = await getAuthConfig(conn); 
        activeTerminalService = new TerminalService(authConfig, event.sender); 
        activeTerminalService.start(); 
    } 
  });
  ipcMain.on('ssm:terminal:stop', () => { 
    if (activeTerminalService) activeTerminalService.stop(); 
    activeTerminalService = null; 
  });
  ipcMain.on('ssm:terminal:write', (event, data) => { 
    if (activeTerminalService) activeTerminalService.write(data); 
  });
  ipcMain.on('ssm:terminal:resize', (event, { cols, rows }) => { 
    if (activeTerminalService) activeTerminalService.resize(cols, rows); 
  });
}

module.exports = { registerIpcHandlers };