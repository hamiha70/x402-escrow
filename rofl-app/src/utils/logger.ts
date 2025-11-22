/**
 * Simple logger for ROFL app (no dependencies on main project)
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

function timestamp(): string {
	return new Date().toISOString();
}

export const logger = {
	info: (message: string, ...args: any[]) => {
		console.log(
			`${colors.dim}${timestamp()}${colors.reset} ${colors.blue}[INFO]${colors.reset} ${colors.cyan}[tee-rofl]${colors.reset} ${message}`,
			...args
		);
	},

	success: (message: string, ...args: any[]) => {
		console.log(
			`${colors.dim}${timestamp()}${colors.reset} ${colors.green}[SUCCESS]${colors.reset} ${colors.cyan}[tee-rofl]${colors.reset} ${message}`,
			...args
		);
	},

	warn: (message: string, ...args: any[]) => {
		console.warn(
			`${colors.dim}${timestamp()}${colors.reset} ${colors.yellow}[WARN]${colors.reset} ${colors.cyan}[tee-rofl]${colors.reset} ${message}`,
			...args
		);
	},

	error: (message: string, ...args: any[]) => {
		console.error(
			`${colors.dim}${timestamp()}${colors.reset} ${colors.red}[ERROR]${colors.reset} ${colors.cyan}[tee-rofl]${colors.reset} ${message}`,
			...args
		);
	},
};
