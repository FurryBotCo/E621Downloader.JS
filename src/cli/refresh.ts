#!/usr/bin/env node

import E621Downloader, { Options } from "..";
import progress from "cli-progress";
import ms from "../util/Time";

function refresh(o: { [k: string]: any; }) {
	const options: Options = {
		saveDirectory: o.saveDirectory,
		skipVideo: o.skipVideo,
		skipFlash: o.skipFlash,
		tagBlacklist: o.tagBlacklist && o.tagBlacklist.split(" "),
		cacheDir: o.cacheDir,
		useCache: true
	};

	if (o.username && o.apiKey) options.auth = {
		username: o.username,
		apiKey: o.apiKey
	};

	const e = new E621Downloader(options);
	const p = new progress.SingleBar({
		hideCursor: true
	});
	function log(...a) {
		process.stdout.clearLine(0);
		process.stdout.cursorTo(0);
		console.log(...a);
	}

	let i = 0, t = 0;
	e
		.on("fetch-finish", (total, time) => {
			log(`Finished fetching ${total} posts in ${ms(time, true)}`);
			p.start(total, 0, {
				speed: "N/A"
			});
			t = total;

		})
		.on("post-finish", (threadId, id, time, current, total) => {
			p.increment(1);
			i++;
			// log(`[${i}/${t}]: Finished downloading post #${id} in ${ms(time, true)}`);
		})
		.on("error", (err, extra) => console.error("Error:", err))
		.on("ready", (threadId) => log(`Thread #${threadId} is ready.`))
		.on("start-recieved", (threadId, amount) => log(`[Thread #${threadId}]: Recieved start with ${amount} posts.`))
		.on("thread-done", (threadId, amount, time) => log(`[Thread #${threadId}]: Finished downloading ${amount} posts in ${ms(time, true)}`))
		.on("skip", (id, reason, tag) => {
			p.increment(1);
			i++;
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
			log(`Finished downloading ${total} posts (skipped ${skipped}) in ${ms(time, true)}`);
		})
		.on("fetch-page", (page, count, time) => log(`Finished fetching page #${page} in ${ms(time, true)} (had ${count} posts)`))
		.on("download-start", (tags, folder, dir, threads) => {
			i = 0;
			log(`Started download with tags "${tags.join(" ")}" into directory "${dir}", with ${threads} threads.`);
		})
		.on("thread-spawn", (id, workerId) => log(`Spawned thread #${id} (Worker ID: ${workerId})`));

	e.refresh.run(Number(o.threads) as any).then(r => {
		for (const v of r) console.log(`[${v.tags.join(" ")}]: ${v.total.old === v.total.new ? "No Change." : `+${v.total.new - v.total.old}`}`);
	});
}
