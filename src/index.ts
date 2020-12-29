import * as fs from "fs-extra";
import { EventEmitter } from "tsee";
import { threadId, Worker } from "worker_threads";
import path from "path";
import * as https from "https";
import chunk from "chunk";
import pkg from "../package.json";
import "source-map-support/register";
import { performance } from "perf_hooks";
import CacheManager from "./util/CacheManager";
import RefreshManager from "./util/RefreshManager";


export interface Options extends Partial<Omit<E621Downloader["options"], "saveDirectory">> {
	saveDirectory: E621Downloader["options"]["saveDirectory"];
};

type OmitFirstArg<T> = T extends (x: any, ...args: infer P) => infer R ? (...args: P) => R : never;

export type VALID_ERROR_CODES = `ERR_${"MAX_TAGS" | "ALREADY_ACTIVE" | "INVALID_THREADS" | "INVALID_THREADS_2" | "NO_POSTS"}`;
export class E621Error<T extends VALID_ERROR_CODES = VALID_ERROR_CODES> extends Error {
	code: T;
	constructor(code: T, message?: string) {
		super(message);
		this.code = code;
		this.name = "E621Error";
	}
}

export interface Post {
	id: number;
	url: string | null;
	ext: string;
	md5: string;
	tags: string[];
};

type Events = {
	"error": (location: "main" | "cache" | "refresh", err: Error | string, extra?: any, threadId?: number) => void;
	"warn": (location: "main" | "cache" | "refresh", info: string, threadId?: number) => void;
	"debug": (location: "main" | "cache" | "refresh", info: string, threadId?: number) => void;
	"ready": (id: number, workerId: number) => void;
	"start-recieved": (threadId: number, amount: number) => void;
	"thread-done": (threadId: number, amount: number, time: number) => void;
	"post-finish": (threadId: number, id: number, time: number, current: number, total: number, post: Post) => void;
	"skip": (id: number, reason: "cache" | "fileExists" | "video" | "flash" | "blacklisted", tag?: string) => void;
	"download-done": (total: number, time: number) => void;
	"fetch-page": (page: number, count: number, time: number) => void;
	"fetch-finish": (total: number, time: number) => void;
	"download-start": (tags: string[], folder: string, dir: string, threads: 1 | 2 | 3, usingAuth: boolean) => void;
	"thread-spawn": (id: number, workerId: number) => void;
	"cache-update": (threadId: number, ...args: Parameters<CacheManager["update"]>) => void;
};


class E621Downloader extends EventEmitter<Events> {
	options: {
		/**
		 * The directory to download images to (they will be in subdirectories)
		 * 
		 * The directory MUST already exist.
		 */
		saveDirectory: string;
		/**
		 * Authentication for e621's api
		 * 
		 * May be required if you are downloading images on e621's {@link https://e621.net/help/global_blacklist|Global Blacklist}
		 */
		auth: {
			/**
			 * Your e621 username
			 */
			username: string;
			/**
			 * Your e621 api key
			 * 
			 * Go to {@link https://e621.net/users/home|Account} -> Manage API Access for this
			 */
			apiKey: string;
		} | {
			/**
			 * Premade basic authentication string
			 * 
			 * Use username & apiKey if you don't know what this is
			 */
			basic: string;
		} | null;
		/**
		 * If we should overwrite existing files
		 */
		overwriteExisting: boolean;
		/**
		 * If we should skip video files
		 */
		skipVideo: boolean;
		/**
		 * If we should skip flash files
		 */
		skipFlash: boolean;
		/**
		 * Tags to skip while downloading posts
		 */
		tagBlacklist: string[];
		/**
		 * The directory to save cache things in
		 */
		cacheDir: string;
		/**
		 * If the stored cache files should be minified (true by default)
		 */
		minifyCache: boolean;
		/**
		 * If we should cache downloaded posts (the post ids)
		 */
		useCache: boolean;
	};
	threads: Map<number, Worker>;
	private managers: {
		cache: CacheManager;
		refresh: RefreshManager;
	};
	private current: {
		active: boolean;
		resolve: (() => void) | null;
		reject: ((err: Error) => void) | null;
		total: number;
		postsPerWorker: Map<number, number>;
		start: number;
		end: number;
		posts: {
			id: number;
			md5: string;
		}[];
		tags: string[];
		folder: string | null;
		done: Post[];
		threadCount: number;
		finishedCount: number;
	};
	constructor(opts: Options) {
		super();
		if (!opts) throw new TypeError("Missing options.");
		if (!opts.saveDirectory) throw new TypeError("Missing \"saveDirectory\" option.");
		this.options = {
			saveDirectory: path.resolve(opts.saveDirectory),
			auth: opts.auth || null,
			overwriteExisting: !!(opts.overwriteExisting ?? true),
			skipVideo: !!(opts.skipVideo ?? true),
			skipFlash: !!(opts.skipFlash ?? true),
			tagBlacklist: opts.tagBlacklist || [],
			cacheDir: opts.cacheDir || path.resolve(`${opts.saveDirectory}${opts.saveDirectory.endsWith("E621Downloader/Files") ? "/.." : ""}/cache`),
			useCache: !!(opts.useCache ?? true),
			minifyCache: !!(opts.minifyCache ?? true)
		};
		if (!fs.existsSync(this.options.saveDirectory)) throw new TypeError(`saveDirectory "${this.options.saveDirectory}" does not exist on disk.`);
		if (!fs.existsSync(this.options.cacheDir)) fs.mkdirpSync(this.options.cacheDir);
		this.threads = new Map();
		this.reset();
		const cache = new CacheManager(this.options.cacheDir, this.options.minifyCache);
		this.managers = {
			cache,
			refresh: undefined as any // we have to do this weird due to the way RefreshManager works
		};
		this.managers.refresh = new RefreshManager(this);

		this.cache
			.on("debug", (...args) => this.emit("debug", "cache", ...args))
			.on("error", (...args) => this.emit("error", "cache", ...args))
			.on("warn", (...args) => this.emit("warn", "cache", ...args));

		this.refresh
			.on("debug", (...args) => this.emit("debug", "refresh", ...args))
			.on("error", (...args) => this.emit("error", "refresh", ...args))
			.on("warn", (...args) => this.emit("warn", "refresh", ...args));


	}

	get cache() { return this.managers.cache; }
	get refresh() { return this.managers.refresh; }


	get cacheObj() { return !this.current ? null : this.cache.get().data.find(v => v.tags.join(" ").toLowerCase() === this.current.tags.join(" ").toLowerCase()) }
	cached(id: number) {
		return this.cache.isCached(id, this.current.tags);
	}
	addToCache(post: Post, ten = true) {
		this.current.done.push(post);
		if (this.options.useCache) {
			if (ten && (this.current.done.length % 10) !== 0) return;
			this.cache.update(this.current.tags, this.current.done, this.current.folder!);
		}
	}

	private get auth() { return this.options.auth === null ? null : ((this.options.auth as any).basic as string || Buffer.from(`${(this.options.auth as any).username}:${(this.options.auth as any).apiKey}`).toString("base64")) || null }

	/**
	 * Start a download.
	 * @param {string[]} tags - The tags to use. 
	 * @param {string} [folder] - The folder to save files to. (not a full path, put inside the Options.saveDirectory folder)
	 * @param {(1 | 2 | 3)} [threads=1] - The number of simultaneous downloads to run. Hard limit of 3 maximum. This is the limit an e621 admin {@link https://e621.download/threads.png|asked us to use}. If you manually edit the code and get blocked, we do not take responsibility for that.
	 * @param {string[]} [blacklistedTags] - Tags that will cause a post to be skipped if found on it.
	 */
	async startDownload(tags: string[], folder?: string, threads: (1 | 2 | 3) = 1, blacklistedTags?: string[]) {
		if (!tags || !Array.isArray(tags) || tags.length === 0 || tags.join(" ").length === 0) throw new TypeError("A list of tags is required.");
		if (!blacklistedTags || !Array.isArray(blacklistedTags)) blacklistedTags = [];
		// bravo if you manage to hit this without doing it on purpose, how specific do you need to be?
		if (tags.length > 40) throw new E621Error("ERR_MAX_TAGS", "A maximum of 40 tags are allowed.");
		if (this.current.active) throw new E621Error("ERR_ALREADY_ACTIVE", "A download is already active. If this is an issue, run the `reset` function.");
		if (isNaN(threads) || !threads || threads < 1) throw new E621Error("ERR_INVALID_THREADS", "Threads must be a number between 1 and 3.");
		if (threads > 3) throw new E621Error("ERR_INVALID_THREADS_2", "You cannot use more than 3 threads. This is a limit that an e621 admin asked us to put in place. See https://e621.download/threads.png")
		folder = this.sanitizeFolderName(folder || tags[0]);
		// tags are case insensitive, so we store them as lowercase to avoid duplicates
		tags = tags.map(t => t.toLowerCase());
		blacklistedTags = blacklistedTags.map(t => t.toLowerCase());
		const dir = path.resolve(`${this.options.saveDirectory}/${folder}`);
		if (!fs.existsSync(dir)) fs.mkdirSync(dir);
		this.emit("download-start", tags, folder, dir, threads, this.auth !== null);

		this.reset(folder);
		for (let i = 0; i < threads; i++) {
			const w = new Worker(`${__dirname}/util/Worker.${__filename.split(".").slice(-1)[0]}`);
			this.threads.set(i, w);
			w
				.on("message", this.handleWorkerMessage.bind(this))
				.postMessage({
					event: "init",
					data: {
						id: i,
						total: threads,
						tags,
						folder,
						options: this.options,
						dir
					}
				});

			this.emit("thread-spawn", i, w.threadId);
		}

		this.current.start = performance.now();
		this.current.tags = tags;
		const p = await this.fetchPosts(tags, this.auth, 1, null);
		if (p.length === 0) throw new E621Error("ERR_NO_POSTS", `No posts were found for the tag(s) "${tags.join(" ")}".`);

		// this makes the original files
		this.cache.update(tags, [], folder);

		// I wanted to do a for loop, but it continued on before the loop got done
		// and this doesn't require splicing, which can be messy
		const list = p.filter(post => {
			if (this.options.useCache && this.cached(post.id)) {
				this.addToCache(post); // why not
				this.emit("skip", post.id, "cache");
				return false;
			}

			if (fs.existsSync(`${this.options.saveDirectory}/${folder}${post.id}.${post.ext}`) && !this.options.overwriteExisting) {
				this.addToCache(post);
				this.emit("skip", post.id, "fileExists");
				return false;
			}

			if (post.ext === "swf" && this.options.skipFlash) {
				this.addToCache(post);
				this.emit("skip", post.id, "flash");
				return false;
			}

			if (post.ext === "webm" && this.options.skipVideo) {
				this.addToCache(post);
				this.emit("skip", post.id, "video");
				return false;
			}

			for (const t of post.tags) {
				if (blacklistedTags!.includes(t.toLowerCase())) {
					this.addToCache(post);
					this.emit("skip", post.id, "blacklisted", t);
					return false;
				}
			}

			return true;
		});

		Object.assign(this.current, {
			total: list.length,
			posts: list.map(l => ({
				id: l.id,
				md5: l.md5
			}))
		});

		if (!list || list.length === 0) {
			// we assume all posts are cached or disgarded for some reason
			this.emit("warn", "main", `Download of tag(s) "${tags.join(" ")}" had no left over posts after all checks were ran.`);
			this.complete(false);
			return list.length;
		}
		if (list.length < threads) this.emit("warn", "main", `Download of tag(s) "${tags.join(" ")}" has less tags than threads, some threads will be unused.`);
		const posts = chunk(list, Math.ceil(list.length / threads));
		for (const [i, w] of this.threads) {
			if (!posts[i]) {
				this.emit("warn", "main", `There seem to be no posts to give to thread #${i}. This might be a bug.`);
				this.current.postsPerWorker.set(i, 0);
				w.postMessage({
					event: "start",
					data: [],
					range: [0, 0]
				});
			} else {
				this.current.postsPerWorker.set(i, posts[i].length);
				w.postMessage({
					event: "start",
					data: posts[i] || [],
					range: this.count(posts, i)
				});
			}
		}

		await new Promise<void>((resolve, reject) => Object.assign(this.current, { resolve, reject }));

		return list.length;
	}

	get stopDownload() { return this.reset; }

	count(arr: any[], num: number): [start: number, end: number] {
		let a = 0, b = 0;
		for (let i = 0; i < num; i++) a += arr[i].length;
		for (let i = 0; i <= num; i++) b += arr[i].length;
		return [a + 1, b];
	}

	reset(folder?: string | null) {
		if (!folder) folder = null;
		for (const [i, w] of this.threads) {
			w.terminate();
			this.threads.delete(i);
		}

		this.current = {
			active: false,
			resolve: null,
			reject: null,
			total: 0,
			postsPerWorker: new Map(),
			start: 0,
			end: 0,
			posts: [],
			tags: [],
			folder,
			done: [],
			threadCount: 0,
			finishedCount: 0
		};
	}

	private handleWorkerMessage<T extends keyof Events>(value: {
		event: T;
		fromId: number;
		data: Parameters<Events[T]>;
	}) {
		// I have to specifically narrow the types myself because typescript refuses to do so
		switch (value.event) {
			case "ready": {
				const v = value.data as unknown as Parameters<OmitFirstArg<Events["ready"]>>;
				this.emit("ready", value.fromId, ...v);
				break;
			}

			case "thread-done": {
				const v = value.data as unknown as Parameters<OmitFirstArg<Events["thread-done"]>>;
				this.emit("thread-done", value.fromId, ...v);
				break;
			}

			case "post-finish": {
				const v = value.data as unknown as Parameters<OmitFirstArg<Events["post-finish"]>>;
				this.emit("post-finish", value.fromId, ...v);
				this.addToCache(v[4]);
				break;
			}

			case "debug": {
				const v = value.data as unknown as Parameters<OmitFirstArg<Events["debug"]>>;
				this.emit("debug", "main", v[0], value.fromId);
				break;
			}

			case "error": {
				const v = value.data as unknown as Parameters<OmitFirstArg<Events["error"]>>;
				this.emit("error", "main", v[0], v[1] || undefined, value.fromId);
				break;
			}

			case "warn": {
				const v = value.data as unknown as Parameters<OmitFirstArg<Events["warn"]>>;
				this.emit("warn", "main", v[0], value.fromId);
				break;
			}

			// internal event only
			case "finished": {
				this.cache.update(this.current.tags, this.current.done, this.current.folder!, true);
				return this.endHandler(value.fromId);
				break;
			}
		}
	}

	private async endHandler(id: number) {
		await new Promise((a, b) => setTimeout(a, 100));
		const t = this.threads.get(id);
		if (!t) this.emit("warn", "main", `Worker (#${id}) done without thread reference`);
		this.current.finishedCount++;
		if (this.current.finishedCount >= this.current.threadCount) this.complete();
	}

	/**
	 * Run the completion functions
	 * @param {boolean} [p]  - if we should try to resolve the current promise
	 */
	private async complete(p = true) {
		this.current.end = performance.now();
		this.emit("download-done", this.current.total, parseFloat((this.current.end - this.current.start).toFixed(3)));
		if (this.options.useCache) this.cache.update(this.current.tags, this.current.posts, this.current.folder || this.current.tags[0]);
		if (p) {
			if (!this.current.resolve) {
				this.emit("error", "main", new Error("Complete called without resolve function being present. This IS a bug."));
			}
			else this.current.resolve!();
		}
		this.reset();
	}

	static sanitizeFolderName(name: string) {
		return name.replace(/[^a-z0-9_\-]/gi, "_").replace(/_{2,}/g, "_").toLowerCase().trim();
	}

	get sanitizeFolderName() { return E621Downloader.sanitizeFolderName; }

	private async fetchPosts(tags: string[], auth: string | null, page: number, lastId?: number | null) {
		const posts: Post[] = [];
		return new Promise<Post[]>((a, b) => {
			const start = performance.now();
			https.request({
				method: "GET",
				hostname: "e621.net",
				path: `/posts.json?tags=${encodeURIComponent(tags.join(" "))}${lastId ? `&page=b${lastId}` : ""}&limit=320`,
				headers: {
					"User-Agent": `E621Downloader.JS/${pkg.version} (https://github.com/FurryBotCo/E621Downloader.JS)`,
					...(auth ? ({
						Authorization: `Basic ${auth}`
					}) : ({}))
				}
			}, (res) => {
				const data: any[] = [];

				res
					.on("data", (d) => data.push(d))
					.on("error", (err) => b(err))
					.on("end", async () => {
						const d = JSON.parse(Buffer.concat(data).toString());
						if (d.success === false) {
							if (d.message === "SessionLoader::AuthenticationFailure") return this.emit("error", "main", "Authentication failed.");
							else return this.emit("error", d.message, d);
						}

						posts.push(...d.posts.map(p => ({
							id: p.id,
							url: p.file.url,
							ext: p.file.ext,
							md5: p.file.md5,
							tags: Object.keys(p.tags).map(v => p.tags[v]).reduce((a, b) => a.concat(b))
						})));
						this.emit("fetch-page", page, d.posts.length, parseFloat((performance.now() - start).toFixed(3)));
						if (d.posts.length === 320) {
							await new Promise((c, d) => setTimeout(c, 1e3)); // wait for 1 second (more than needed)
							await this.fetchPosts(tags, auth, page + 1, d.posts[d.posts.length - 1].id).then(v => posts.push(...v));
						}

						if (page === 1) this.emit("fetch-finish", posts.length, parseFloat((performance.now() - start).toFixed(3)));

						return a(posts);
					});
			})
				.end();
		});
	}
}

export { E621Downloader };
module.exports = E621Downloader;
export default E621Downloader;
