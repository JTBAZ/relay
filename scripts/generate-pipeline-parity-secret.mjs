#!/usr/bin/env node
/**
 * Prints a random secret for RELAY_PIPELINE_PARITY_SECRET (copy into Relay .env).
 * Usage: node scripts/generate-pipeline-parity-secret.mjs
 */
import { randomBytes } from "node:crypto";

const secret = randomBytes(32).toString("base64url");
// eslint-disable-next-line no-console -- CLI output
console.log(secret);
