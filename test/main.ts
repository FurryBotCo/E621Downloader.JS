import E621Downloader from "../build/src";
const e = new E621Downloader({
	saveDirectory: `${__dirname}/files`
});
import ms from "ms";

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
		.on("ready", (threadId) => console.error(`Thread #${threadId} is ready.`))
		.on("start-recieved", (threadId, amount) => console.error(`[Thread #${threadId}]: Recieved start with ${amount} posts.`))
		.on("thread-done", (threadId, amount, time) => console.error(`[Thread #${threadId}]: Finished downloading ${amount} posts in ${ms(time, { long: true })}`))
		.on("post-finish", (threadId, id, time, current, total) => console.error(`[Thread #${threadId}][${current}/${total}]: Finished downloading post #${id} in ${ms(time, { long: true })}`))
		.on("download-done", (total, time) => console.error(`Finished downloading ${total} posts in ${ms(time, { long: true })}`))
		.on("fetch-page", (page, count, time) => console.error(`Finished fetching page #${page} in ${ms(time, { long: true })} (had ${count} posts)`))
		.on("fetch-finish", (total, time) => console.error(`Finished fetching ${total} posts in ${ms(time, { long: true })}`))
		.on("download-start", (tags, folder, dir, threads) => console.error(`Started download with tags "${tags.join(" ")}" into directory "${dir}", with ${threads} threads.`))
		.on("thread-spawn", (internalId, nodeId) => console.error(`Spawned thread #${internalId} (Worker ID: ${nodeId})`))
		.startDownload(["valkoinen"], "valkoinen", 3);
	console.log(v);
	process.exit(0);
});
