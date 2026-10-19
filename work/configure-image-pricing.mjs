import {readFile,writeFile} from 'node:fs/promises';
import {parse} from 'dotenv';
const raw=await readFile('.env','utf8'),env=parse(raw),pricing=JSON.parse(env.LIBRARY_EDITOR_MODEL_PRICING_JSON);
pricing['gpt-6-astra'].maxImageInputTokens=2048;
pricing['gpt-6-sol'].maxImageInputTokens=10000;
await writeFile('.env',raw.replace(/^LIBRARY_EDITOR_MODEL_PRICING_JSON=.*$/m,`LIBRARY_EDITOR_MODEL_PRICING_JSON=${JSON.stringify(pricing)}`));
console.log('Configured conservative per-image reservations; no credentials displayed.');
