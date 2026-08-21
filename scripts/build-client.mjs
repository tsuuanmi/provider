/**
 * Build the browser client bundle `lib/client.js` in the DeepSeek Harness
 * module-loader format:
 *
 *   window.__ModuleLoader__.load({ id, factory: (require) => { …CJS bundle… } })
 *
 * The bundle externalizes the harness/platform modules (`@deepseek-ai/*`,
 * `react`, `react/jsx-runtime`, `clsx`) so they resolve through the client
 * module table's `require` at materialization — the same shape the harness's
 * own client plugins ship.
 *
 * @module scripts/build-client
 */
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const outfile = join(root, "lib", "client.js");

const banner = `window.__ModuleLoader__.load({
	id: "@tsuuanmi/provider",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
`;

const footer = `
		return module.exports;
	}
});
`;

const result = await build({
	entryPoints: [join(root, "src", "client", "index.ts")],
	bundle: true,
	format: "cjs",
	platform: "browser",
	target: "es2020",
	external: ["react", "react/jsx-runtime", "clsx", "@deepseek-ai/*"],
	banner: { js: banner },
	footer: { js: footer },
	write: false,
	logLevel: "silent",
	minify: false,
});

const code = result.outputFiles[0].text;
mkdirSync(dirname(outfile), { recursive: true });
writeFileSync(outfile, code);
console.log(`client bundle written: ${outfile} (${code.length} bytes)`);
