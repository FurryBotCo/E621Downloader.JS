const E621Downloader = require("../build/src");
const { default: ms } = require("../build/src/util/Time");

const e = new E621Downloader({
	useCache: true,
	saveDirectory: "/home/donovan/Documents/E621Downloader/Files",
	skipFlash: true,
	skipVideo: true
});

let i = 0, t = 0;
e
	.on("fetch-finish", (total, time) => {
		console.log(`Finished fetching ${total} posts in ${ms(time, true)}`);
		t = total;

	})
	.on("post-finish", (threadId, id, time, current, total) => {
		i++;
		console.log(`[${i}/${t}]: Finished downloading post #${id} in ${ms(time, true)}`);
	})
	.on("error", (err, extra) => console.error("Error:", err))
	.on("ready", (threadId) => console.log(`Thread #${threadId} is ready.`))
	.on("start-recieved", (threadId, amount) => console.log(`[Thread #${threadId}]: Recieved start with ${amount} posts.`))
	.on("thread-done", (threadId, amount, time) => console.log(`[Thread #${threadId}]: Finished downloading ${amount} posts in ${ms(time, true)}`))
	.on("skip", (id, reason) => {
		i++;
		console.log(`[${i}/${t}]: Skipped post #${id} due to ${reason === "cache" ? "it being cached" :
			reason === "video" ? "it being a video, and skipVideo being true" :
				reason === "flash" ? "it being flash, and skipFlash being true" :
					reason === "fileExists" ? "the file existing, and overwriteExisting being set to false" :
						"unknown reasons"
			}.`);
	})
	.on("download-done", (total, time) => {
		console.log(`Finished downloading ${total} posts in ${ms(time, true)}`);
	})
	.on("fetch-page", (page, count, time) => console.log(`Finished fetching page #${page} in ${ms(time, true)} (had ${count} posts)`))
	.on("download-start", (tags, folder, dir, threads) => {
		i = 0;
		console.log(`Started download with tags "${tags.join(" ")}" into directory "${dir}", with ${threads} threads.`);
	})
	.on("thread-spawn", (id, workerId) => console.log(`Spawned thread #${id} (Worker ID: ${workerId})`))
	.on("cache-ypdate", (...args) => console.console.log("cacheUpdate", ...args))
	.on("debug", (...args) => console.debug("debug", ...args))
	.on("error", (...args) => console.error("error", ...args))
	.on("warn", (...args) => console.warn("warn", ...args));

process.nextTick(async () => {
	e.startDownload([
		"h0rs3"
	]);
});
