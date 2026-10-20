import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Creates a proof report without ever replacing an existing artifact. */
export async function createLargeLibraryProofReportWriter(path: string, initialReport: unknown): Promise<(report: unknown) => Promise<void>> {
  await mkdir(dirname(path), { recursive: true });
  // Reserve the evidence path before any model call; wx refuses to replace prior evidence.
  await writeFile(path, `${JSON.stringify(initialReport, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  return async report => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'w' });
  };
}
