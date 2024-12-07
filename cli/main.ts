import { parse } from "../ts/index.ts";

async function main() {
	process.stdin.setRawMode?.(false);

	try {
		for await (const entry of parse(process.stdin)) {
			process.stdout.write(`${JSON.stringify(entry)}\n`);
		}
	} catch (error) {
		console.error("Error:", error);
		process.exit(1);
	}
}

main();
