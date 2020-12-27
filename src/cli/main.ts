#!/usr/bin/env node

import { program } from "commander";
import pkg from "../../package.json";

program
	.version(pkg.version)

program
	.command("download")
	.description("Download posts.")
	.requiredOption("--save-directory <dir>", "The directory to save images to.")
	.requiredOption("--tags <tags>", "A space separated list of tags")
	.option("--username <username>", "Your e621 username for authentication.")
	.option("--api-key <key>", "Your e621 api key for authntication.")
	.option("--overwrite-existing", "If existing files should be overwritten.")
	.option("--skip-video", "If video files should be skipped.")
	.option("--skip-flash", "If flash files should be skipped.")
	.option("--tag-blacklist <tags>", "Space separated list of tags that should be skipped while downloading posts")
	.option("--cache-file <file>", "The location to stort the cache file.")
	.option("--use-cache", "If the cache file should be used")
	.option("--folder", "The folder inside of saveDirectory to save this download inside. Defaults to first tag.")
	.option("--threads <num>", "The number of threads to use while downloading. A number between 1 and 3.", "1")
	.action((opts) => require("./downloader").default(opts));

program
	.command("refresh")
	.description("Refresh previously downloaded tags.")
	.requiredOption("--save-directory <dir>", "The directory to save images to.")
	.option("--username <username>", "Your e621 username for authentication.")
	.option("--api-key <key>", "Your e621 api key for authntication.")
	.option("--threads <num>", "The number of threads to use while downloading. A number between 1 and 3.", "1")
	.option("--skip-video", "If video files should be skipped.")
	.option("--skip-flash", "If flash files should be skipped.")
	.option("--tag-blacklist <tags>", "Space separated list of tags that should be skipped while downloading posts")
	.option("--cache-file <file>", "The location to stort the cache file.")
	.option("--threads <num>", "The number of threads to use while downloading. A number between 1 and 3.", "1")
	.action((opts) => require("./refresh").default(opts));

program.parse(process.argv);

if (process.argv.length === 2) program.help();
