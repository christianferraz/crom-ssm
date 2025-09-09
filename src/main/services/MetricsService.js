import logger from '../utils/logger.js';
import SSHService from './SSHService.js';

class MetricsService {
    constructor(connection, sshConfig, webContents) {
        this.connection = connection;
        this.sshService = new SSHService(sshConfig);
        this.webContents = webContents;
        this.interval = null;
        this.lastNetStats = null;
        this.lastNetStatsTimestamp = null;
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
                cpu: "top -b -n 1 | grep '^%Cpu' | awk '{print $2+$4}'",
                system: "uname -srmo && cat /etc/os-release | grep PRETTY_NAME | cut -d '\"' -f 2 && lscpu | grep 'Model name:' | sed 's/Model name:[[:space:]]*//'",
                network: "cat /proc/net/dev"
            };

            const services = this.connection.monitoredServices || [];
            const serviceCommands = services.map(s => `systemctl is-active ${s.trim()}`);
            const servicePromises = serviceCommands.map(cmd => this.sshService.exec(cmd).catch(e => ({ stdout: 'failed' })));

            const [uptime, memory, disk, cpu, system, network, ...serviceResults] = await Promise.all([
                this.sshService.exec(commands.uptime),
                this.sshService.exec(commands.memory),
                this.sshService.exec(commands.disk),
                this.sshService.exec(commands.cpu),
                this.sshService.exec(commands.system),
                this.sshService.exec(commands.network),
                ...servicePromises
            ]);

            const metrics = {
                uptime: uptime.stdout.trim(),
                memory: this.parseMemory(memory.stdout),
                disk: this.parseDisk(disk.stdout),
                cpu: parseFloat(cpu.stdout.trim()).toFixed(1),
                system: this.parseSystem(system.stdout),
                network: this.parseNetwork(network.stdout),
                services: services.map((name, i) => ({ name, status: serviceResults[i].stdout }))
            };
            
            this.emitSuccess(metrics);
        } catch (error) {
            logger.error(`[Metrics] Erro ao buscar métricas: ${error.message}`);
            this.emitError(error);
            this.stopPolling();
        }
    }

    parseMemory(freeOutput) {
        const lines = freeOutput.split('\n');
        const memLine = lines[1].split(/\s+/);
        return { total: parseInt(memLine[1], 10), used: parseInt(memLine[2], 10), free: parseInt(memLine[3], 10) };
    }
    
    parseDisk(dfOutput) {
        const lines = dfOutput.split('\n');
        const diskLine = lines[1].split(/\s+/);
        return { total: diskLine[1], used: diskLine[2], available: diskLine[3], percent: diskLine[4] };
    }

    parseSystem(systemOutput) {
        const lines = systemOutput.trim().split('\n');
        const [kernel, arch] = lines[0].split(' ').filter(Boolean);
        return { kernel, arch, os: lines[1] || 'N/A', cpu: lines[2] || 'N/A' };
    }

    parseNetwork(netOutput) {
        const lines = netOutput.trim().split('\n');
        const interfaceLine = lines.find(line => /^\s*(eth|enp|ens)\d/.test(line));
        if (!interfaceLine) return { in: '0.0', out: '0.0' };

        const parts = interfaceLine.trim().split(/\s+/);
        const bytesIn = parseInt(parts[1], 10);
        const bytesOut = parseInt(parts[9], 10);
        const now = Date.now();

        if (!this.lastNetStats) {
            this.lastNetStats = { bytesIn, bytesOut };
            this.lastNetStatsTimestamp = now;
            return { in: '0.0', out: '0.0' };
        }

        const timeDiffSeconds = (now - this.lastNetStatsTimestamp) / 1000;
        const inRate = ((bytesIn - this.lastNetStats.bytesIn) / timeDiffSeconds / 1024).toFixed(1);
        const outRate = ((bytesOut - this.lastNetStats.bytesOut) / timeDiffSeconds / 1024).toFixed(1);

        this.lastNetStats = { bytesIn, bytesOut };
        this.lastNetStatsTimestamp = now;

        return { in: inRate >= 0 ? inRate : '0.0', out: outRate >= 0 ? outRate : '0.0' };
    }

    emitSuccess(data) {
        if (this.webContents && !this.webContents.isDestroyed()) {
            this.webContents.send('ssm:metrics:update', { status: 'success', data });
        }
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

export default MetricsService;