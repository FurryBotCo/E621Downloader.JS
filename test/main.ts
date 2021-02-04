import E621Downloader from "../build/src";
const e = new E621Downloader({
	saveDirectory: `${__dirname}/files`,
	cacheDir: `${__dirname}/files/cache`,
	overwriteExisting: false,
	useCache: true,
	savePostInfo: true
});
import { Time } from "@uwu-codes/utils";

process.env.INVALID_CACHE_ERROR = "1";

process.nextTick(async () => {
	let i = 0, t = 0;
	const v = await e
		.on("fetch-finish", (total, time) => {
			console.log(`Finished fetching ${total} posts in ${Time.ms(time, true, true, true)}`);
			t = total;

		})
		.on("post-finish", (threadId, id, time, current, total) => {
			i++;
			console.log(`[${i}/${t}]: Finished downloading post #${id} in ${Time.ms(time, true, true, true)}`);
		})
		.on("error", (loc, err, extra) => console.error(`Error[${loc}]:`, err))
		.on("warn", (loc, info, extra) => console.warn(`Warn[${loc}]:`, info))
		.on("ready", (threadId) => console.log(`Thread #${threadId} is ready.`))
		.on("start-recieved", (threadId, amount) => console.log(`[Thread #${threadId}]: Recieved start with ${amount} posts.`))
		.on("thread-done", (threadId, amount, time) => console.log(`[Thread #${threadId}]: Finished downloading ${amount} posts in ${Time.ms(time, true, true, true)}`))
		.on("skip", (id, reason, tag) => {
			i++;
			console.log(`[${i}/${t}]: Skipped post #${id} due to ${reason === "cache" ? "it being cached" :
				reason === "video" ? "it being a video, and skipVideo being true" :
					reason === "flash" ? "it being flash, and skipFlash being true" :
						reason === "fileExists" ? "the file existing, and overwriteExisting being set to false" :
							reason === "blacklisted" ? `it having a blacklisted tag (${tag})` :
								"unknown reasons"
				}.`);
		})
		.on("download-done", (total, skipped, time) => {
			console.log(`Finished downloading ${total} posts (skipped ${skipped}) in ${Time.ms(time, true, true, true)}`);
		})
		.on("fetch-page", (page, count, time) => console.log(`Finished fetching page #${page} in ${Time.ms(time, true, true, true)} (had ${count} posts)`))
		.on("download-start", (tags, folder, dir, threads) => {
			i = 0;
			console.log(`Started download with tags "${tags.join(" ")}" into directory "${dir}", with ${threads} threads.`);
		})
		.on("thread-spawn", (id, workerId) => console.log(`Spawned thread #${id} (Worker ID: ${workerId})`))
		.startDownload(["joel_mustard"], "joel_mustard", 3);
	console.log(v);
	process.exit(0);
});
