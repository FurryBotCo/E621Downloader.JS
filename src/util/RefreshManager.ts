import E621Downloader, { Options } from "..";
import CacheManager, { Cache } from "./CacheManager";

export default class RefreshManager {
	main: E621Downloader;
	constructor(main: E621Downloader) {
		this.main = main;
	}

	get cache() { return this.main.cache; }
	get opt() { return this.main.options; }

	async run(threads?: Parameters<E621Downloader["startDownload"]>[2]) {
		if (!this.cache) throw new TypeError("Missing CacheManager instance.");
		const c = this.cache.get();
		if (c.data.length === 0) throw new TypeError("No cached tags to refresh.");
		// we do this so we can refresh the cache
		const o = !!this.opt.overwriteExisting;
		this.opt.overwriteExisting = true;
		const res: {
			tags: string[];
			total: {
				old: number;
				new: number;
			};
			time: {
				start: number;
				end: number;
				total: number;
			};
		}[] = [];
		let cur = 0;
		for await (const { tags, lastFolder, posts } of c.data) {
			cur = Date.now();
			console.log(`Running a refresh with the tag${tags.length === 1 ? "" : "s"} "${tags.join(" ")}"`);
			this.main.startDownload(tags, lastFolder, threads);
			await new Promise<void>((a, b) => {
				this.main.once("download-done", (total, time) => {
					res.push({
						tags,
						total: {
							old: posts.length,
							new: total
						},
						time: {
							start: cur,
							end: Date.now(),
							total: time
						}
					});
					return a();
				});
			});
		}

		this.opt.overwriteExisting = o;

		return res;
	}
}
