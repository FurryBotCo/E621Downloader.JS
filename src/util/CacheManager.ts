import * as fs from "fs-extra";
import E621Downloader from "..";
import deasync from "deasync";
import crypto from "crypto";

export interface Cache {
	version: typeof CacheManager["VERSION"];
	data: {
		tags: string[];
		lastDownloaded: number;
		lastFolder: string;
		posts: {
			id: number;
			md5: string;
		}[];
	}[];
}

class OwOError extends Error {
	constructor(message?: string) {
		super(message);
		this.name = "OwOError";
	}
}

export default class CacheManager {
	static VERSION = 1 as const;
	file: string;
	private RETRY = 0;
	constructor(file: string) {
		this.file = file;
	}

	async waitForNodeToNotBeStupid(cb: (err: Error | null, res: void) => void) {
		return new Promise((a, b) => setTimeout(() => cb(null), 1e3));
	}

	get(): Cache {
		if (!this.file) throw new TypeError("Invalid cache file.");
		let o: Cache;
		try {
			o = fs.readJSONSync(this.file)
			if (typeof o.version !== "number") throw new OwOError("OwO *notices your invalid cache file*");
		} catch (e) {

			if (e.message.indexOf("ENOENT") !== -1) console.log("Cache file does not exist, creating it..");
			else console.error("Error parsing cache file:", e);
			if (fs.existsSync(this.file)) fs.renameSync(this.file, `${this.file.replace(/\.json/, "")}-${Date.now()}.old.json`);
			let d: Cache["data"];
			// this assumes the file is using the old `{ key: string[] }` format
			if (e instanceof OwOError && o!) d = Object.keys(o as any).map(v => ({
				tags: v.split(" "),
				lastDownloaded: 0, // we could *maybe* figure this out but it's easier to just not
				lastFolder: E621Downloader.sanitizeFolderName(v.split(" ")[0]), // we make it the tags because we don't know what it was
				posts: [] // we throw away old posts because we don't have the md5
			}));
			o = {
				version: 1,
				data: d! ?? []
			};
			const fd = fs.openSync(this.file, "r+");
			fs.writeFileSync(fd, JSON.stringify(o));
			fs.fsyncSync(fd);
			fs.closeSync(fd);
		}
		this.RETRY = 0;

		return o;
	}

	update(tags: string[] | string, posts: Cache["data"][number]["posts"], folder: string) {
		if (Array.isArray(tags)) tags = tags.join(" ");
		const c = this.get();
		const o = JSON.parse(JSON.stringify(c));
		const j = c.data.find(v => v.tags.join(" ") === tags);
		// if (j) c.data.splice(c.data.indexOf(j), 1);
		const v = j || {
			tags: tags.split(" "),
			lastDownloaded: 0,
			lastFolder: folder,
			posts: []
		};
		v.lastDownloaded = Date.now();
		v.lastFolder = folder;
		v.posts = this.unique(...[
			...v.posts,
			...posts
		]);
		if (j) c.data[c.data.indexOf(j)] = v;
		else c.data.push(v);
		// just in case
		c.data = this.unique(...c.data);
		if (JSON.stringify(c) === JSON.stringify(o)) return; // don't touch the file if we don't need to
		const fd = fs.openSync(this.file, "r+");
		fs.writeFileSync(fd, JSON.stringify(c));
		fs.fsyncSync(fd);
		fs.closeSync(fd);
	}



	unique<T>(...v: T[]): T[] {
		// we have to stringify & parse because of objects and such
		return Array.from(new Set(v.map(j => JSON.stringify(j)))).map(v => JSON.parse(v));
	}
}
