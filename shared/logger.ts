/**
 * Simple colored logger for x402 services
 */

export enum LogLevel {
	DEBUG = 0,
	INFO = 1,
	WARN = 2,
	ERROR = 3,
}

const colors = {
	reset: "\x1b[0m",
	bright: "\x1b[1m",
	dim: "\x1b[2m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	magenta: "\x1b[35m",
	cyan: "\x1b[36m",
	white: "\x1b[37m",
};

class Logger {
	private level: LogLevel = LogLevel.INFO;
	private serviceName: string;

	constructor(serviceName: string) {
		this.serviceName = serviceName;
		const envLevel = process.env.LOG_LEVEL?.toUpperCase();
		if (envLevel && envLevel in LogLevel) {
			this.level = LogLevel[envLevel as keyof typeof LogLevel];
		}
	}

	private format(level: string, color: string, message: string, data?: any) {
		const timestamp = new Date().toISOString();
		const prefix = `${colors.dim}${timestamp}${colors.reset} ${color}[${level}]${colors.reset} ${colors.cyan}[${this.serviceName}]${colors.reset}`;

		if (data !== undefined) {
			const dataStr =
				typeof data === "object" ? JSON.stringify(data, null, 2) : String(data);
			return `${prefix} ${message}\n${colors.dim}${dataStr}${colors.reset}`;
		}
		return `${prefix} ${message}`;
	}

	debug(message: string, data?: any) {
		if (this.level <= LogLevel.DEBUG) {
			console.log(this.format("DEBUG", colors.dim, message, data));
		}
	}

	info(message: string, data?: any) {
		if (this.level <= LogLevel.INFO) {
			console.log(this.format("INFO", colors.blue, message, data));
		}
	}

	success(message: string, data?: any) {
		if (this.level <= LogLevel.INFO) {
			console.log(this.format("SUCCESS", colors.green, message, data));
		}
	}

	warn(message: string, data?: any) {
		if (this.level <= LogLevel.WARN) {
			console.warn(this.format("WARN", colors.yellow, message, data));
		}
	}

	error(message: string, data?: any) {
		if (this.level <= LogLevel.ERROR) {
			console.error(this.format("ERROR", colors.red, message, data));
		}
	}
}

export function createLogger(serviceName: string): Logger {
	return new Logger(serviceName);
}

