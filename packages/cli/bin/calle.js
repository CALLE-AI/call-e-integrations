#!/usr/bin/env node
import { main } from "../lib/cli.js";

await main(process.argv.slice(2));
