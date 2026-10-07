#!/usr/bin/env node
import { main } from '../dist/cli.js';

main().catch((err) => {
  process.stderr.write(`tracevec: ${err && err.message ? err.message : err}\n`);
  process.exitCode = 1;
});
