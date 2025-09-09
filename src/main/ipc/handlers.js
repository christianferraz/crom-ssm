import { dialog, ipcMain } from 'electron';
import { readFile } from 'fs/promises';
import { basename, join } from 'path';
import connectionService from '../services/ConnectionService.js';
import MetricsService from '../services/MetricsService.js';
import SFTPService from '../services/SFTPService.js';
import SSHService from '../services/SSHService.js';
import snippetService from '../services/SnippetService.js';
import TerminalService from '../services/TerminalService.js';
import logger from '../utils/logger.js';

let activeMetricsService = null;
const activeTerminals = new Map();

// Adiciona um mapa para armazenar sessões SSH ativas
const activeSSHSessions = new Map();
// Adiciona um mapa para armazenar sessões SFTP ativas
const activeSFTPSessions = new Map();

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
        try { authConfig.privateKey = await readFile(connData.keyPath); } 
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
  handle('ssm:connections:remove', async (evt, id) => {
    // Garante que a sessão relacionada seja encerrada
    console.log('Removendo conexão e fechando sessões associadas:', id);
    await closeSession(id);
    return connectionService.remove(id);
  });
  handle('ssm:connections:setPassword', (evt, id, p) => connectionService.setPassword(id, p));
  
  handle('ssm:ssh:test', async (event, connData) => {
    const authConfig = await getAuthConfig(connData, true);
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

  // Funções para gerenciar o ciclo de vida das sessões
  async function getOrStartSession(connectionId, serviceType) {
    const conn = await connectionService.get(connectionId);
    if (!conn) throw new Error('Conexão não encontrada');
    const authConfig = await getAuthConfig(conn);
    let sessionMap, ServiceClass;

    if (serviceType === 'ssh') {
      sessionMap = activeSSHSessions;
      ServiceClass = SSHService;
    } else if (serviceType === 'sftp') {
      sessionMap = activeSFTPSessions;
      ServiceClass = SFTPService;
    } else {
      throw new Error('Tipo de serviço inválido.');
    }

    if (!sessionMap.has(connectionId)) {
      const service = new ServiceClass(authConfig);
      await service.connect();
      sessionMap.set(connectionId, service);
      logger.info(`Sessão ${serviceType} para ID ${connectionId} criada e armazenada.`);
    }
    return sessionMap.get(connectionId);
  }

  async function closeSession(connectionId, serviceType = 'all') {
    if (serviceType === 'all' || serviceType === 'ssh') {
      const sshService = activeSSHSessions.get(connectionId);
      if (sshService) {
        sshService.end();
        activeSSHSessions.delete(connectionId);
        logger.info(`Sessão SSH para ID ${connectionId} encerrada.`);
      }
    }
    if (serviceType === 'all' || serviceType === 'sftp') {
      const sftpService = activeSFTPSessions.get(connectionId);
      if (sftpService) {
        sftpService.disconnect();
        activeSFTPSessions.delete(connectionId);
        logger.info(`Sessão SFTP para ID ${connectionId} encerrada.`);
      }
    }
  }

  // Agora, reescrevemos as funções sftpAction e sshAction para usar o gerenciamento de sessões
  const sftpAction = async (connectionId, action) => {
    const sftp = await getOrStartSession(connectionId, 'sftp');
    return action(sftp);
  };
  
  const sshAction = async (connectionId, command) => {
    const ssh = await getOrStartSession(connectionId, 'ssh');
    const result = await ssh.exec(command);
    return result.stdout;
  };

  // SFTP Handlers
  handle('ssm:sftp:list', (evt, id, p) => sftpAction(id, sftp => sftp.list(p)));
  handle('ssm:sftp:readFile', (evt, id, p) => sftpAction(id, sftp => sftp.readFile(p)));
  handle('ssm:sftp:readFileAsBase64', (evt, id, p) => sftpAction(id, sftp => sftp.readFile(p, 'base64')));
  handle('ssm:sftp:writeFile', (evt, id, p, c) => sftpAction(id, sftp => sftp.writeFile(p, c)));
  handle('ssm:sftp:deleteFile', (evt, id, p) => sftpAction(id, sftp => sftp.deleteFile(p)));
  handle('ssm:sftp:deleteDir', (evt, id, p) => sftpAction(id, sftp => sftp.deleteDir(p)));
  handle('ssm:sftp:createDir', (evt, id, p) => sftpAction(id, sftp => sftp.createDir(p)));
  handle('ssm:sftp:rename', (evt, id, op, np) => sftpAction(id, sftp => sftp.rename(op, np)));
  
  handle('ssm:sftp:downloadFile', async (evt, connId, remotePath) => {
      const defaultFileName = basename(remotePath);
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
    const fileName = basename(localPath);
    const remotePath = join(remoteDir, fileName).replace(/\\/g, '/');
    try {
        await sftpAction(connId, sftp => sftp.uploadFile(localPath, remotePath));
        return { success: true, fileName };
    } catch (error) {
        logger.error(`Falha no upload do arquivo '${localPath}' para '${remotePath}': ${error.message}`);
        return { success: false, error: error.message };
    }
  });

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
        activeMetricsService = new MetricsService(conn, authConfig, event.sender); 
        activeMetricsService.connectAndStartPolling(); 
    } 
  });
  ipcMain.on('ssm:metrics:stop', () => { 
    if (activeMetricsService) activeMetricsService.stopPolling(); 
    activeMetricsService = null; 
  });

  // Terminal Handlers
  ipcMain.on('ssm:terminal:create', async (event, connectionId, terminalId) => {
    //alterar aqui - christian  
    
    const conn = await connectionService.get(connectionId);
      if (conn) {
          const authConfig = await getAuthConfig(conn);
          const terminalService = new TerminalService(authConfig, event.sender, terminalId);
          activeTerminals.set(terminalId, terminalService);
          terminalService.start();
      }
  });
  ipcMain.on('ssm:terminal:stop', (event, terminalId) => {
    const service = activeTerminals.get(terminalId);
    if (service) {
      service.stop();
      activeTerminals.delete(terminalId);
    }
  });
  ipcMain.on('ssm:terminal:write', (event, terminalId, data) => {
    const service = activeTerminals.get(terminalId);
    if (service) service.write(data);
  });
  ipcMain.on('ssm:terminal:resize', (event, terminalId, { cols, rows }) => {
    const service = activeTerminals.get(terminalId);
    if (service) service.resize(cols, rows);
  });
  
  // Handlers para o front-end
  handle('ssm:session:close', (evt, id) => closeSession(id));
  handle('ssm:exec', (evt, id, cmd) => sshAction(id, cmd));

  // Snippets Handlers
  handle('ssm:snippets:list', () => snippetService.list());
  handle('ssm:snippets:add', (evt, snippet) => snippetService.add(snippet));
  handle('ssm:snippets:update', (evt, snippet) => snippetService.update(snippet));
  handle('ssm:snippets:remove', (evt, id) => snippetService.remove(id));
}

export { registerIpcHandlers };
