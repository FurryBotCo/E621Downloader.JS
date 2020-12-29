const E621Downloader = require("../build/src");
const { default: ms } = require("../build/src/util/Time");

const e = new E621Downloader({
	useCache: true,
	saveDirectory: "/home/donovan/Documents/E621Downloader/Files"
});
function log(...a) {
	process.stdout.clearLine();
	process.stdout.cursorTo(0);
	console.log(...a);
}

log("Using cache file:", e.options.cacheFile);

let i = 0, t = 0;
e
	.on("fetch-finish", (total, time) => {
		log(`Finished fetching ${total} posts in ${ms(time, true)}`);
		t = total;

	})
	.on("post-finish", (threadId, id, time, current, total) => {
		i++;
		log(`[${i}/${t}]: Finished downloading post #${id} in ${ms(time, true)}`);
	})
	.on("error", (err, extra) => console.error("Error:", err))
	.on("ready", (threadId) => log(`Thread #${threadId} is ready.`))
	.on("start-recieved", (threadId, amount) => log(`[Thread #${threadId}]: Recieved start with ${amount} posts.`))
	.on("thread-done", (threadId, amount, time) => log(`[Thread #${threadId}]: Finished downloading ${amount} posts in ${ms(time, true)}`))
	.on("skip", (id, reason) => {
		i++;
		log(`[${i}/${t}]: Skipped post #${id} due to ${reason === "cache" ? "it being cached" :
			reason === "video" ? "it being a video, and skipVideo being true" :
				reason === "flash" ? "it being flash, and skipFlash being true" :
					reason === "fileExists" ? "the file existing, and overwriteExisting being set to false" :
						reason === "blacklisted" ? `it having a blacklisted tag (${tag})` :
							"unknown reasons"
			}.`);
	})
	.on("download-done", (total, time) => {
		log(`Finished downloading ${total} posts in ${ms(time, true)}`);
	})
	.on("fetch-page", (page, count, time) => log(`Finished fetching page #${page} in ${ms(time, true)} (had ${count} posts)`))
	.on("download-start", (tags, folder, dir, threads) => {
		i = 0;
		log(`Started download with tags "${tags.join(" ")}" into directory "${dir}", with ${threads} threads.`);
	})
	.on("thread-spawn", (id, workerId) => log(`Spawned thread #${id} (Worker ID: ${workerId})`));

process.nextTick(async () => {
	const r = await e.managers.refresh.run(3);
	for (const v of r) console.log(`[${v.tags.join(" ")}]: ${v.total.old === v.total.new ? "No Change." : `+${v.total.new - v.total.old}`}`);
});
