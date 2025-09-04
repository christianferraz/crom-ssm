const SSHService = require('./SSHService');
const logger = require('../utils/logger');

class MetricsService {
    constructor(connectionConfig, webContents) {
        this.sshService = new SSHService(connectionConfig);
        this.webContents = webContents;
        this.interval = null;
    }

    async connectAndStartPolling(intervalMs = 5000) {
        try {
            await this.sshService.connect();
            logger.info(`[Metrics] Conectado a ${this.sshService.config.host} para polling de métricas.`);
            
            this.fetchAndEmitMetrics(); // Fetch immediately on start
            this.interval = setInterval(() => this.fetchAndEmitMetrics(), intervalMs);
        } catch (error) {
            logger.error(`[Metrics] Falha ao conectar para polling: ${error.message}`);
            this.emitError(error);
        }
    }

    async fetchAndEmitMetrics() {
        try {
            const commands = {
                uptime: "uptime",
                memory: "free -m",
                disk: "df -h /",
                cpu: "top -b -n 1 | grep '^%Cpu' | awk '{print $2+$4}'"
            };

            const [uptime, memory, disk, cpu] = await Promise.all([
                this.sshService.exec(commands.uptime),
                this.sshService.exec(commands.memory),
                this.sshService.exec(commands.disk),
                this.sshService.exec(commands.cpu),
            ]);

            const metrics = {
                uptime: uptime.stdout.trim(),
                memory: this.parseMemory(memory.stdout),
                disk: this.parseDisk(disk.stdout),
                cpu: parseFloat(cpu.stdout.trim()).toFixed(1)
            };
            
            this.webContents.send('ssm:metrics:update', { status: 'success', data: metrics });
        } catch (error) {
            logger.error(`[Metrics] Erro ao buscar métricas: ${error.message}`);
            this.emitError(error);
            this.stopPolling();
        }
    }

    parseMemory(freeOutput) {
        const lines = freeOutput.split('\n');
        const memLine = lines[1].split(/\s+/);
        return {
            total: parseInt(memLine[1], 10),
            used: parseInt(memLine[2], 10),
            free: parseInt(memLine[3], 10),
        };
    }
    
    parseDisk(dfOutput) {
        const lines = dfOutput.split('\n');
        const diskLine = lines[1].split(/\s+/);
        return {
            total: diskLine[1],
            used: diskLine[2],
            available: diskLine[3],
            percent: diskLine[4],
        };
    }

    emitError(error) {
        if (this.webContents && !this.webContents.isDestroyed()) {
            this.webContents.send('ssm:metrics:update', { status: 'error', message: error.message });
        }
    }
    
    stopPolling() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
            this.sshService.end();
            logger.info(`[Metrics] Polling interrompido para ${this.sshService.config.host}.`);
        }
    }
}

module.exports = MetricsService;