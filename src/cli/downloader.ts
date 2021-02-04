#!/usr/bin/env node

import E621Downloader, { Options } from "..";
import progress from "cli-progress";
import { Time } from "@uwu-codes/utils";

export default function downloader(o: { [k: string]: any; }) {
	const options: Options = {
		saveDirectory: o.saveDirectory,
		overwriteExisting: o.overwriteExisting,
		skipVideo: o.skipVideo,
		skipFlash: o.skipFlash,
		tagBlacklist: o.tagBlacklist && o.tagBlacklist.split(" "),
		cacheDir: o.cacheDir,
		useCache: o.useCache
	};

	if (o.username && o.apiKey) options.auth = {
		username: o.username,
		apiKey: o.apiKey
	};

	const e = new E621Downloader(options);
	const p = new progress.SingleBar({
		hideCursor: true
	})
	e
		.on("fetch-finish", (total, time) => {
			console.log(`Finished fetching ${total} posts in ${Time.ms(time, true, true, true)}`);
			p.start(total, 0, {
				speed: "N/A"
			});
		})
		.on("post-finish", (threadId, id, time, current, total) => p.increment(1))
		.on("error", (err, extra) => console.error("Error:", err))
		.on("ready", (threadId) => console.log(`Thread #${threadId} is ready.`))
		.on("start-recieved", (threadId, amount) => console.log(`[Thread #${threadId}]: Recieved start with ${amount} posts.`))
		.on("thread-done", (threadId, amount, time) => console.log(`[Thread #${threadId}]: Finished downloading ${amount} posts in ${Time.ms(time, true, true, true)}`))
		.on("skip", (id, reason, tag) => console.log(`Skipped post #${id} due to ${reason === "cache" ? "it being cached" :
			reason === "video" ? "it being a video, and skipVideo being true" :
				reason === "flash" ? "it being flash, and skipFlash being true" :
					reason === "fileExists" ? "the file existing, and overwriteExisting being set to false" :
						reason === "blacklisted" ? `it having a blacklisted tag (${tag})` :
							"unknown reason"
			}.`))
		.on("download-done", (total, skipped, time) => {
			console.log(`Finished downloading ${total} posts (skipped ${skipped}) in ${Time.ms(time, true, true, true)}`);
			p.stop();
		})
		.on("fetch-page", (page, count, time) => console.log(`Finished fetching page #${page} in ${Time.ms(time, true, true, true)} (had ${count} posts)`))
		.on("download-start", (tags, folder, dir, threads) => console.log(`Started download with tags "${tags.join(" ")}" into directory "${dir}", with ${threads} threads.`))
		.on("thread-spawn", (id, workerId) => console.log(`Spawned thread #${id} (Worker ID: ${workerId})`))
		.startDownload(o.tags && o.tags.split(" "), o.folder, Number(o.threads) as any || 1);

}
