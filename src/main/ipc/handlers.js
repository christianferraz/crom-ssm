const { ipcMain } = require('electron');
const fs = require('fs/promises');
const connectionService = require('../services/ConnectionService');
const SSHService = require('../services/SSHService');
const SFTPService = require('../services/SFTPService');

async function getAuthConfig(connData, useRawPassword = false) {
    let authConfig = {
        host: connData.host,
        port: connData.port || 22,
        username: connData.user,
    };

    if (connData.authMethod === 'password') {
        authConfig.password = useRawPassword ? connData.password : await connectionService.getPassword(connData.id);
    } else if (connData.authMethod === 'key' && connData.keyPath) {
        try {
            authConfig.privateKey = await fs.readFile(connData.keyPath);
        } catch (error) {
            throw new Error(`Falha ao ler a chave privada em ${connData.keyPath}`);
        }
    } else {
        throw new Error('Método de autenticação inválido ou credenciais ausentes.');
    }
    
    return authConfig;
}

function registerIpcHandlers() {
  ipcMain.handle('ssm:connections:list', () => connectionService.list());
  ipcMain.handle('ssm:connections:add', (event, connectionData) => connectionService.add(connectionData));
  ipcMain.handle('ssm:connections:update', (event, id, data) => connectionService.update(id, data));
  ipcMain.handle('ssm:connections:remove', (event, id) => connectionService.remove(id));
  ipcMain.handle('ssm:connections:setPassword', (event, id, password) => connectionService.setPassword(id, password));

  ipcMain.handle('ssm:ssh:test', async (event, connectionData) => {
    const authConfig = await getAuthConfig(connectionData, true);
    const ssh = new SSHService(authConfig);
    try {
        await ssh.connect();
        await ssh.exec("echo 'SSM_SUCCESS'");
        return { success: true };
    } catch (error) {
        console.error(`SSH Test Error: ${error.message}`);
        throw error;
    } finally {
        ssh.end();
    }
  });

  ipcMain.handle('ssm:ssh:exec', async (event, connectionId, command) => {
    const conn = await connectionService.get(connectionId);
    if (!conn) throw new Error('Conexão não encontrada');
    
    const authConfig = await getAuthConfig(conn);
    const ssh = new SSHService(authConfig);

    try {
      await ssh.connect();
      return await ssh.exec(command);
    } catch (error) {
      console.error(`SSH Execution Error: ${error.message}`);
      throw error;
    } finally {
      ssh.end();
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

  ipcMain.handle('ssm:sftp:list', (evt, connId, remotePath) => sftpAction(connId, sftp => sftp.list(remotePath)));
  ipcMain.handle('ssm:sftp:readFile', (evt, connId, remotePath) => sftpAction(connId, sftp => sftp.readFile(remotePath)));
  ipcMain.handle('ssm:sftp:writeFile', (evt, connId, remotePath, content) => sftpAction(connId, sftp => sftp.writeFile(remotePath, content)));
}

module.exports = { registerIpcHandlers };