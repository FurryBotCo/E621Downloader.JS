import E621Downloader from "..";
import { EventEmitter } from "tsee";

export default class RefreshManager extends EventEmitter<{
	"error": (err: Error | string, extra?: unknown, threadId?: number) => void;
	"warn": (info: string, threadId?: number) => void;
	"debug": (info: string, threadId?: number) => void;
}> {
	main: E621Downloader;
	constructor(main: E621Downloader) {
		super();
		this.main = main;
	}

	get cache() {
		return this.main.cache;
	}
	get opt() {
		return this.main.options;
	}

	async run(threads?: Parameters<E621Downloader["startDownload"]>[2]) {
		if (!this.cache) throw new TypeError("Missing CacheManager instance.");
		const c = this.cache.get();
		if (c.data.length === 0) throw new TypeError("No cached tags to refresh.");
		// we do this so we can refresh the cache
		const o = !!this.opt.overwriteExisting;
		this.opt.overwriteExisting = true;
		const res: Array<{
			tags: Array<string>;
			total: {
				old: number;
				new: number;
			};
			time: {
				start: number;
				end: number;
				total: number;
			};
			error: Error | null;
		}> = [];
		let cur = 0, i = 0;
		const d = Date.now();
		for await (const { tags: tg, lastFolder, lastDownloaded } of c.data) {
			i++;
			const tags = tg.map((t) => t.toLowerCase().trim()),
				posts = this.cache.getPosts(tags);
			console.log(`[${i}/${c.data.length}] Running a refresh with the tag${tags.length === 1 ? "" : "s"} "${tags.join(" ")}"`);
			if (lastDownloaded !== 0 && (lastDownloaded + 8.64e+7) > d) {
				console.log(`Skipping refresh with the tag${tags.length === 1 ? "" : "s"} "${tags.join(" ")}", due to the "lastDownloaded" timestmap being less than 24 hours.`);
				continue;
			}
			cur = Date.now();
			await this.main.startDownload(tags, lastFolder, threads)
				.then((total) => {
					const end = Date.now();
					res.push({
						tags,
						total: {
							old: posts.length,
							new: total
						},
						time: {
							start: cur,
							end,
							total: end - cur
						},
						error: null
					});
				})
				.catch((err) => {
					const end = Date.now();
					res.push({
						tags,
						total: {
							old: posts.length,
							new: posts.length
						},
						time: {
							start: cur,
							end,
							total: end - cur
						},
						error: err as Error
					});
				});
		}

		this.opt.overwriteExisting = o;

		return res;
	}
}
