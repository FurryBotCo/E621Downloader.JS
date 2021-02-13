import { E621Downloader, Post } from "..";
import * as pkg from "../../package.json";
import * as fs from "fs-extra";
import { AnyObject } from "@uwu-codes/utils";
import { parentPort, isMainThread } from "worker_threads";
import * as https from "https";
import { URL } from "url";
import { performance } from "perf_hooks";
import "source-map-support/register";

export interface ThreadOptions {
	id: number;
	total: number;
	tags: Array<string>;
	folder: string;
	options: E621Downloader["options"];
	dir: string;
}

class Worker {
	static id: number;
	static total: number;
	static tags: Array<string>;
	static folder: string;
	static options: E621Downloader["options"];
	static dir: string;
	static posts: Array<Post>;
	static processed = 0;
	static donePosts: Array<Post>;
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

	static async start(posts: Array<Post>, range: [start: number, end: number]) {
		this.posts = posts;
		const start = performance.now();
		if (posts.length === 0) this.sendToParent("warn", "I got zero posts?");
		for (const [i, p] of posts.entries()) await this.download(p, [range[0] + i, range[1]]);
		const end = performance.now();
		if (this.processed !== this.posts.length) {
			this.sendToParent("error", new Error(`Worker (${this.id}) finished before all posts were processed. Total: ${this.posts.length}, Processed: ${this.processed}`), {
				total: this.posts.length,
				processed: this.processed
			});
		}
		this.sendToParent("thread-done", posts.length, parseFloat((end - start).toFixed(3)));
		this.sendToParent("finished");
	}

	static async download(info: Post, range: [start: number, end: number]) {
		const { id, url, md5, ext } = info;
		// so we can make the url if absent
		let v = url;
		if (v === null) v = this.constructURLFromMD5(md5, ext);

		return new Promise<void>((a, b) => {
			const r = new URL(v!),
				start = performance.now();
			https
				.request({
					method: "GET",
					host: r.host,
					path: r.pathname,
					headers: {
						"User-Agent": `E621Downloader.JS/${pkg.version} (https://github.com/FurryBotCo/E621Downloader.JS)`
					}
				}, (res) => {
					const data: Array<Buffer> = [];
					res
						.on("error", b)
						.on("data", (d) => data.push(d))
						.on("end", () => {
							this.processed++;
							const end = performance.now();
							fs.writeFileSync(`${this.dir}/${id}.${ext}`, Buffer.concat(data));
							this.sendToParent("post-finish", id, parseFloat((end - start).toFixed(3)), range[0], range[1], info);
							return a();
						});
				})
				.end();
		});
	}

	static constructURLFromMD5(md5: string, ext = "png") {
		return `https://static1.e621.net/data/${md5.slice(0, 2)}/${md5.slice(2, 4)}/${md5}.${ext}`;
	}

	static sendToParent(event: string, ...data: Array<unknown>) {
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
		.on("message", (value: { event: string; data: AnyObject; range: [start: number, end: number]; }) => {
			switch (value.event) {
				case "init": return Worker.init(value.data as unknown as ThreadOptions);
				case "start": return Worker.start(value.data as unknown as Array<Post>, value.range);
			}
		});
}
