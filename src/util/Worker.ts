import { parentPort, isMainThread } from "worker_threads";
import { E621Downloader, Post } from "..";
import * as fs from "fs-extra";
import * as https from "https";
import URL from "url";
import * as pkg from "../../package.json";
import { performance } from "perf_hooks";
import "source-map-support/register";
import CacheManager from "./CacheManager";
import { timingSafeEqual } from "crypto";

export type ThreadOptions = {
	id: number;
	total: number;
	tags: string[];
	folder: string;
	options: E621Downloader["options"];
	dir: string;
};

class Worker {
	static id: number;
	static total: number;
	static tags: string[];
	static folder: string;
	static options: E621Downloader["options"];
	static dir: string;
	static posts: Post[];
	static cache: CacheManager;
	static current = 0;
	static donePosts: Post[];
	static init(iOpt: ThreadOptions) {
		this.id = iOpt.id;
		this.total = iOpt.total;
		this.tags = iOpt.tags;
		this.folder = iOpt.folder;
		this.options = iOpt.options;
		this.dir = iOpt.dir;
		this.posts = []; // we get these in start
		this.donePosts = [];
		if (this.options.useCache) this.cache = new CacheManager(this.options.cacheFile);
		this.sendToParent("ready", this.id + 1);
	}

	static async start(posts: Post[], range: [start: number, end: number]) {
		this.posts = posts;
		const start = performance.now();
		for (const [i, p] of posts.entries()) await this.download(p, [range[0] + i, range[1]]);
		if (this.options.useCache) this.cache.update(this.tags, this.donePosts.map(v => ({ id: v.id, md5: v.md5 })), this.folder);
		const end = performance.now();
		this.sendToParent("thread-done", posts.length, parseFloat((end - start).toFixed(3)));
	}

	static get cacheObj() { return this.cache.get().data.find(v => v.tags.join(" ").toLowerCase() === this.tags.join(" ").toLowerCase()) }
	static cached(id: number) {
		const c = this.cacheObj?.posts?.map(v => v.id);
		if (!c || c.length === 0) return false;
		return c.includes(id);
	}

	static async download(info: Post, range: [start: number, end: number]) {
		const { id, url, md5, ext } = info;
		// so we can make the url if absent
		let v = url;
		if (v === null) v = this.constructURLFromMd5(md5);
		if (fs.existsSync(`${this.dir}/${id}.${ext}`) && !this.options.overwriteExisting) {
			this.current++;
			this.donePosts.push(info);
			return this.sendToParent("skip", id, "fileExists", range[0], range[1]);
		}
		else if (this.options.useCache && this.cached(id)) {
			this.current++;
			this.donePosts.push(info);
			return this.sendToParent("skip", id, "cache", range[0], range[1]);
		}
		else if (ext === "swf") {
			this.current++;
			this.donePosts.push(info);
			return this.sendToParent("skip", id, "flash", range[0], range[1]);
		}
		else if (ext === "webm") {
			this.current++;
			this.donePosts.push(info);
			return this.sendToParent("skip", id, "video", range[0], range[1]);
		}

		return new Promise<void>((a, b) => {
			const start = performance.now();
			https
				.request({
					...URL.parse(v!),
					headers: {
						"User-Agent": `E621Downloader.JS/${pkg.version} (https://github.com/FurryBotCo/E621Downloader.JS)`
					}
				}, (res) => {
					const data: Buffer[] = [];
					res
						.on("error", b)
						.on("data", (d) => data.push(d))
						.on("end", () => {
							this.current++;
							this.donePosts.push(info);
							if (this.options.useCache && (this.current % 10) === 0) this.cache.update(this.tags, this.donePosts.map(v => ({ id: v.id, md5: v.md5 })), this.folder);
							const end = performance.now();
							fs.writeFileSync(`${this.dir}/${id}.${ext}`, Buffer.concat(data));
							this.sendToParent("post-finish", id, parseFloat((end - start).toFixed(3)), range[0], range[1]);
							return a();
						})
				})
				.end();
		});
	}

	static constructURLFromMd5(md5: string) {
		return `https://static1.e621.net/data/${md5.slice(0, 2)}/${md5.slice(2, 4)}/${md5}.png`;
	}

	static sendToParent(event: string, ...data: any[]) {
		parentPort!.postMessage({
			event,
			data,
			fromId: this.id
		});
	}
}

// figure out if we're actually in a worker
if (!isMainThread) {
	parentPort!.on("message", (value) => {
		switch (value.event) {
			case "init": return Worker.init(value.data);
			case "start": return Worker.start(value.data, value.range);
		}
	});
}
