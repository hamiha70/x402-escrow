/**
 * Simple logger for ROFL app (no dependencies)
 */

const colors = {
	reset: "\x1b[0m",
	dim: "\x1b[2m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	cyan: "\x1b[36m",
};

export function createLogger(name: string) {
	const timestamp = () => new Date().toISOString();

	return {
		info: (message: string) => {
			console.log(
				`${colors.dim}${timestamp()}${colors.reset} ${colors.blue}[INFO]${colors.reset} ${colors.cyan}[${name}]${colors.reset} ${message}`
			);
		},
		error: (message: string) => {
			console.error(
				`${colors.dim}${timestamp()}${colors.reset} ${colors.red}[ERROR]${colors.reset} ${colors.cyan}[${name}]${colors.reset} ${message}`
			);
		},
		warn: (message: string) => {
			console.warn(
				`${colors.dim}${timestamp()}${colors.reset} ${colors.yellow}[WARN]${colors.reset} ${colors.cyan}[${name}]${colors.reset} ${message}`
			);
		},
		success: (message: string) => {
			console.log(
				`${colors.dim}${timestamp()}${colors.reset} ${colors.green}[SUCCESS]${colors.reset} ${colors.cyan}[${name}]${colors.reset} ${message}`
			);
		},
	};
}

