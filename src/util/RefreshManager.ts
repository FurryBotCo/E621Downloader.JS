import { EventEmitter } from "tsee";
import E621Downloader from "..";
import deasync from "deasync";

export default class RefreshManager extends EventEmitter<{
	"error": (err: Error | string, extra?: any, threadId?: number) => void;
	"warn": (info: string, threadId?: number) => void;
	"debug": (info: string, threadId?: number) => void;
}> {
	main: E621Downloader;
	constructor(main: E621Downloader) {
		super();
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
			error: Error | null;
		}[] = [];
		let cur = 0;
		v: for await (const { tags: tg, lastFolder } of c.data) {
			const tags = tg.map(t => t.toLowerCase().trim());
			const posts = this.cache.getPosts(tags);
			cur = Date.now();
			console.log(`Running a refresh with the tag${tags.length === 1 ? "" : "s"} "${tags.join(" ")}"`);
			let c: () => void;
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
				.catch(async (err) => {
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
						error: err
					});
				});
		}

		this.opt.overwriteExisting = o;

		return res;
	}
}
