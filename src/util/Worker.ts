import { parentPort, isMainThread } from "worker_threads";
import { E621Downloader, Post } from "..";
import * as fs from "fs-extra";
import * as https from "https";
import URL from "url";
import * as pkg from "../../package.json";
import { performance } from "perf_hooks";
import "source-map-support/register";

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
	static processed = 0;
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
		this.sendToParent("ready", this.id + 1);
	}

	static async start(posts: Post[], range: [start: number, end: number]) {
		this.posts = posts;
		const start = performance.now();
		if (posts.length === 0) this.sendToParent("warn", "I got zero posts?");
		for (const [i, p] of posts.entries()) await this.download(p, [range[0] + i, range[1]]);
		const end = performance.now();
		if (this.processed !== this.posts.length) this.sendToParent("error", new Error(`Worker (${this.id}) finished before all posts were processed. Total: ${this.posts.length}, Processed: ${this.processed}`), {
			total: this.posts.length,
			processed: this.processed
		});
		this.sendToParent("thread-done", posts.length, parseFloat((end - start).toFixed(3)));
		this.sendToParent("finished");
	}

	static async download(info: Post, range: [start: number, end: number]) {
		const { id, url, md5, ext } = info;
		// so we can make the url if absent
		let v = url;
		if (v === null) v = this.constructURLFromMd5(md5);

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
							this.processed++;
							const end = performance.now();
							fs.writeFileSync(`${this.dir}/${id}.${ext}`, Buffer.concat(data));
							this.sendToParent("post-finish", id, parseFloat((end - start).toFixed(3)), range[0], range[1], info);
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
	parentPort!
		.on("message", (value) => {
			switch (value.event) {
				case "init": return Worker.init(value.data);
				case "start": return Worker.start(value.data, value.range);
			}
		});
}
