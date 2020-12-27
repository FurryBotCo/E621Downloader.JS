const E621Downloader = require("../build/src");
const progress = require("cli-progress");
const { default: ms } = require("../build/src/util/Time");

const e = new E621Downloader({
	useCache: true,
	cacheFile: "/home/donovan/FurryThings/E621Downloader/cache.json",
	saveDirectory: "/home/donovan/FurryThings/E621Downloader"
});
const p = new progress.SingleBar({
	hideCursor: true
});
function log(...a) {
	process.stdout.clearLine();
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
	.on("skip", (threadId, id, reason, current, total) => {
		p.increment(1);
		i++;
		log(`[${i}/${t}]: Skipped post #${id} due to ${reason === "cache" ? "it being cached" :
			reason === "video" ? "it being a video, and skipVideo being true" :
				reason === "flash" ? "it being flash, and skipFlash being true" :
					reason === "fileExists" ? "the file existing, and overwriteExisting being set to false" :
						"unknown reasons"
			}.`);
	})
	.on("download-done", (total, time) => {
		p.stop();
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
