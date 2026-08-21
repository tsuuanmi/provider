import type { UserConfig } from 'tsdown'

export default [
	{
		entry: {
			index: 'src/index.ts',
			invariant: 'src/invariant.ts',
		},
		outDir: 'lib',
		format: ['esm'],
		platform: 'node',
		target: 'es2024',
		fixedExtension: false,
		dts: true,
		clean: true,
		deps: {
			neverBundle: [
				'@earendil-works/pi-ai',
				'@deepseek-ai/schemastery',
				'@deepseek-ai/cordis',
				'@deepseek-ai/dsh-atomic-write',
				'@deepseek-ai/dsh-brand',
				'@deepseek-ai/dsh-commands',
				'@deepseek-ai/dsh-credentials',
				'@deepseek-ai/dsh-home-paths',
				'@deepseek-ai/dsh-invariants',
				'@deepseek-ai/dsh-llm',
				'@deepseek-ai/dsh-llm-pi-ai',
				'@deepseek-ai/dsh-settings',
			],
		},
	},
] satisfies UserConfig[]
