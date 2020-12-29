import { EventEmitter } from "tsee";
import E621Downloader from "..";

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
		for await (const { tags, lastFolder } of c.data) {
			const posts = this.cache.getPosts(tags);
			cur = Date.now();
			console.log(`Running a refresh with the tag${tags.length === 1 ? "" : "s"} "${tags.join(" ")}"`);
			let c: () => void;
			this.main.startDownload(tags, lastFolder, threads)
				.catch(err => {
					res.push({
						tags,
						total: {
							old: posts.length,
							new: posts.length
						},
						time: {
							start: cur,
							end: Date.now(),
							total: 0
						},
						error: err
					});
					return c();
				});
			await new Promise<void>((a, b) => {
				const l = (total: number, time: number) => {
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
						},
						error: null
					});
				}
				this.main.once("download-done", l);
				// so we can resolve if we need to
				c = (() => {
					this.main.removeListener("download-done", l);
					return a();
				});
				return a();
			});
		}

		this.opt.overwriteExisting = o;

		return res;
	}
}
