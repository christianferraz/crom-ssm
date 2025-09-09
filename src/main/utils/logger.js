import { app } from 'electron';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { format as _format, transports as _transports, createLogger } from 'winston';
import 'winston-daily-rotate-file';

const logDir = join(app.getPath('userData'), 'logs');

// Ensure log directory exists
if (!existsSync(logDir)) {
    mkdirSync(logDir);
}

const fileFormat = _format.combine(
    _format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    _format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
);

const consoleFormat = _format.combine(
    _format.colorize(),
    _format.timestamp({ format: 'HH:mm:ss' }),
    _format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
);

const logger = createLogger({
    level: 'info',
    format: fileFormat,
    transports: [
        new _transports.DailyRotateFile({
            filename: join(logDir, 'ssm-%DATE%-combined.log'),
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d',
        }),
        new _transports.DailyRotateFile({
            level: 'error',
            filename: join(logDir, 'ssm-%DATE%-error.log'),
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '30d',
        }),
    ],
});

// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
if (process.env.NODE_ENV !== 'production') {
    logger.add(new _transports.Console({
        format: consoleFormat,
        level: 'debug'
    }));
}

export default logger;