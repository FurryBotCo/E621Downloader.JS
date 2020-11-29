import E621Downloader from "../build/src";
const e = new E621Downloader({
	saveDirectory: `${__dirname}/files`,
	cacheFile: `${__dirname}/files/cache.json`
});
import ms from "../src/ms";

process.nextTick(async () => {
	const v = await e
		/* .on("error", (...args) => console.error("error", ...args))
		.on("ready", (...args) => console.error("ready", ...args))
		.on("start-recieved", (...args) => console.error("start-recieved", ...args))
		.on("thread-done", (...args) => console.error("thread-done", ...args))
		.on("post-finish", (...args) => console.error("post-finish", ...args))
		.on("download-done", (...args) => console.error("download-done", ...args))
		.on("fetch-page", (...args) => console.error("fetch-page", ...args))
		.on("fetch-finish", (...args) => console.error("fetch-finish", ...args))
		.on("download-start", (...args) => console.error("download-start", ...args))
		.on("thread-spawn", (...args) => console.error("thread-spawn", ...args)) */
		.on("error", (err, extra) => console.error("Error:", err))
		.on("ready", (threadId) => console.log(`Thread #${threadId} is ready.`))
		.on("start-recieved", (threadId, amount) => console.log(`[Thread #${threadId}]: Recieved start with ${amount} posts.`))
		.on("thread-done", (threadId, amount, time) => console.log(`[Thread #${threadId}]: Finished downloading ${amount} posts in ${ms(time, true)}`))
		.on("post-finish", (threadId, id, time, current, total) => console.log(`[Thread #${threadId}][${current}/${total}]: Finished downloading post #${id} in ${ms(time, true)}`))
		.on("skip", (threadId, id, reason, current, total) => console.log(`[Thread #${threadId}][${current}/${total}]: Skipped post #${id} due to ${reason === "cache" ? "it being cached" :
				reason === "video" ? "it being a video, and skipVideo being true" :
					reason === "flash" ? "it being flash, and skipFlash being true" :
						reason === "fileExists" ? "the file existing, and overwriteExisting being set to false" :
							"unknown reasons"
			}.`))
		.on("download-done", (total, time) => console.log(`Finished downloading ${total} posts in ${ms(time, true)}`))
		.on("fetch-page", (page, count, time) => console.log(`Finished fetching page #${page} in ${ms(time, true)} (had ${count} posts)`))
		.on("fetch-finish", (total, time) => console.log(`Finished fetching ${total} posts in ${ms(time, true)}`))
		.on("download-start", (tags, folder, dir, threads) => console.log(`Started download with tags "${tags.join(" ")}" into directory "${dir}", with ${threads} threads.`))
		.on("thread-spawn", (internalId, nodeId) => console.log(`Spawned thread #${internalId} (Worker ID: ${nodeId})`))
		.startDownload(["valkoinen"], "valkoinen", 3);
	console.log(v);
	process.exit(0);
});
