import { Client } from 'ssh2';
import logger from '../utils/logger.js';

class TerminalService {
    constructor(sshConfig, webContents, terminalId) {
        this.client = new Client();
        this.sshConfig = sshConfig;
        this.webContents = webContents;
        this.terminalId = terminalId;
        this.stream = null;
    }

    start() {
        this.client.on('ready', () => {
            logger.info(`[Terminal-${this.terminalId}] Conexão SSH pronta para ${this.sshConfig.host}.`);
            this.client.shell((err, stream) => {
                if (err) {
                    error(`[Terminal-${this.terminalId}] Erro ao iniciar o shell: ${err.message}`);
                    this.webContents.send('ssm:terminal:data', { id: this.terminalId, data: `\r\n\x1b[31mErro ao iniciar o shell: ${err.message}\x1b[0m\r\n` });
                    return;
                }
                this.stream = stream;

                stream.on('close', () => {
                    info(`[Terminal-${this.terminalId}] Stream do shell fechado para ${this.sshConfig.host}.`);
                    this.client.end();
                }).on('data', (data) => {
                    this.webContents.send('ssm:terminal:data', { id: this.terminalId, data });
                }).stderr.on('data', (data) => {
                    this.webContents.send('ssm:terminal:data', { id: this.terminalId, data });
                });

                info(`[Terminal-${this.terminalId}] Shell iniciado com sucesso para ${this.sshConfig.host}.`);
            });
        }).on('error', (err) => {
            error(`[Terminal-${this.terminalId}] Erro de conexão SSH: ${err.message}`);
            this.webContents.send('ssm:terminal:data', { id: this.terminalId, data: `\r\n\x1b[31mErro de conexão SSH: ${err.message}\x1b[0m\r\n` });
        }).connect(this.sshConfig);
    }

    write(data) {
        if (this.stream) {
            this.stream.write(data);
        } else {
            warn(`[Terminal-${this.terminalId}] Tentativa de escrita em um stream nulo.`);
        }
    }

    resize(cols, rows) {
        if (this.stream) {
            this.stream.setWindow(rows, cols);
        }
    }

    stop() {
        if (this.stream) {
            this.stream.end();
            info(`[Terminal-${this.terminalId}] Enviado comando de finalização para o stream.`);
        }
        this.client.end();
        info(`[Terminal-${this.terminalId}] Cliente SSH para ${this.sshConfig.host} finalizado.`);
    }
}

export default TerminalService;