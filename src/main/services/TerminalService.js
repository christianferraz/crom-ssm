const { Client } = require('ssh2');
const logger = require('../utils/logger');

class TerminalService {
    constructor(sshConfig, webContents) {
        this.client = new Client();
        this.sshConfig = sshConfig;
        this.webContents = webContents;
        this.stream = null;
    }

    start() {
        this.client.on('ready', () => {
            logger.info(`[Terminal] Conexão SSH pronta para ${this.sshConfig.host}.`);
            this.client.shell((err, stream) => {
                if (err) {
                    logger.error(`[Terminal] Erro ao iniciar o shell: ${err.message}`);
                    this.webContents.send('ssm:terminal:data', `\r\n\x1b[31mErro ao iniciar o shell: ${err.message}\x1b[0m\r\n`);
                    return;
                }
                this.stream = stream;

                stream.on('close', () => {
                    logger.info(`[Terminal] Stream do shell fechado para ${this.sshConfig.host}.`);
                    this.client.end();
                }).on('data', (data) => {
                    this.webContents.send('ssm:terminal:data', data);
                }).stderr.on('data', (data) => {
                    this.webContents.send('ssm:terminal:data', data); // Enviar stderr também
                });

                logger.info(`[Terminal] Shell iniciado com sucesso para ${this.sshConfig.host}.`);
            });
        }).on('error', (err) => {
            logger.error(`[Terminal] Erro de conexão SSH: ${err.message}`);
            this.webContents.send('ssm:terminal:data', `\r\n\x1b[31mErro de conexão SSH: ${err.message}\x1b[0m\r\n`);
        }).connect(this.sshConfig);
    }

    write(data) {
        if (this.stream) {
            this.stream.write(data);
        } else {
            logger.warn('[Terminal] Tentativa de escrita em um stream nulo.');
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
            logger.info(`[Terminal] Enviado comando de finalização para o stream.`);
        }
        this.client.end();
        logger.info(`[Terminal] Cliente SSH para ${this.sshConfig.host} finalizado.`);
    }
}

module.exports = TerminalService;