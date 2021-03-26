#!/usr/bin/env node

import E621Downloader, { Options } from "..";
import progress from "cli-progress";
import { Time } from "@uwu-codes/utils";

export default function refresh(o: Options & { tagBlacklist: string; username: string; apiKey: string; tags: string; folder: string; threads: number; lastDownloadedThreshold: number; savePostInfo: boolean; }) {
	const options: Options = {
		saveDirectory: o.saveDirectory,
		skipVideo: o.skipVideo,
		skipFlash: o.skipFlash,
		tagBlacklist: o.tagBlacklist && o.tagBlacklist.split(" "),
		cacheDir: o.cacheDir,
		useCache: true,
		savePostInfo: o.savePostInfo
	};

	if (o.username && o.apiKey) {
		options.auth = {
			username: o.username,
			apiKey: o.apiKey
		};
	}

	const e = new E621Downloader(options),
		p = new progress.SingleBar({
			hideCursor: true
		});
	function log(...a: Array<unknown>) {
		process.stdout.clearLine(0);
		process.stdout.cursorTo(0);
		console.log(...a);
	}

	e
		.on("fetch-finish", (total, time) => {
			log(`Finished fetching ${total} posts in ${Time.ms(time, true, true, true)}`);
			p.start(total, 0, {
				speed: "N/A"
			});

		})
		.on("post-finish", () => {
			p.increment(1);
			// log(`[${i}/${t}]: Finished downloading post #${id} in ${Time.ms(time, true, true, true)}`);
		})
		.on("error", (err) => console.error("Error:", err))
		.on("ready", (threadId) => log(`Thread #${threadId} is ready.`))
		.on("start-recieved", (threadId, amount) => log(`[Thread #${threadId}]: Recieved start with ${amount} posts.`))
		.on("thread-done", (threadId, amount, time) => log(`[Thread #${threadId}]: Finished downloading ${amount} posts in ${Time.ms(time, true, true, true)}`))
		.on("skip", () => {
			p.increment(1);
			// because it can break stuff
			/* log(`[${i}/${t}]: Skipped post #${id} due to ${reason === "cache" ? "it being cached" :
				reason === "video" ? "it being a video, and skipVideo being true" :
					reason === "flash" ? "it being flash, and skipFlash being true" :
						reason === "fileExists" ? "the file existing, and overwriteExisting being set to false" :
							reason === "blacklisted" ? `it having a blacklisted tag (${tag})` :
								"unknown reasons"
				}.`); */
		})
		.on("download-done", (total, skipped, time) => {
			p.stop();
			log(`Finished downloading ${total} posts (skipped ${skipped}) in ${Time.ms(time, true, true, true)}`);
		})
		.on("fetch-page", (page, count, time) => log(`Finished fetching page #${page} in ${Time.ms(time, true, true, true)} (had ${count} posts)`))
		.on("download-start", (tags, folder, dir, threads) => {
			log(`Started download with tags "${tags.join(" ")}" into directory "${dir}", with ${threads} threads.`);
		})
		.on("thread-spawn", (id, workerId) => log(`Spawned thread #${id} (Worker ID: ${workerId})`));

	// eslint-disable-next-line @typescript-eslint/no-floating-promises
	e.refresh.run(Number(o.threads) as (1 | 2 | 3), o.lastDownloadedThreshold).then((r) => {
		for (const v of r) console.log(`[${v.tags.join(" ")}]: ${v.total.old === v.total.new ? "No Change." : `+${v.total.old - v.total.new}`}`);
	});
}
