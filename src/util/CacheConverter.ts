import * as fs from "fs-extra";
export namespace V2Structure {
	// main.json
	export interface Main {
		version: 2;
		data: {
			id: string;
			tags: string;
			lastDownloaded: number;
			lastFolder: string;
		}[];
	}

	// array
	// data/*.json
	export interface Data {
		id: number;
		md5: string;
	}
}

export namespace V3Structure {
	// main.json
	export interface Main {
		version: 3;
		data: {
			id: string;
			tags: string;
			lastDownloaded: number;
			lastFolder: string;
		}[];
	}

	// array
	// data/*.json
	export interface Data {
		id: number;
		// from legacy conversions
		ext: string | null;
		md5: string;
		info: null | {
			fav: number;
			score: number;
			rating: "s" | "q" | "e";
			sources: string[];
			tags: string[];
		};
	}
}

// V1 CANNOT be converted, you must start over.
export default class CacheConverter {
	static fromUnknown(dir: string) {
		if (!fs.existsSync(`${dir}/main.json`)) throw new TypeError("Could not find main.json inside the provided directory.");
		const main = fs.readJsonSync(`${dir}/main.json`) as (V2Structure.Main | V3Structure.Main);
		if (typeof main.version !== "number") throw new TypeError("Unable to determine version number.");
		this.useVersion(dir, main.version);
	}

	static useVersion(dir: string, v: number) {
		switch (v) {
			case 2: return this.fromV2(dir);
			case 3: return this.fromV3(dir);
			default: throw new TypeError(`Unsupported cache version "${v}"`);
		}
	}
	static fromV2(dir: string) {
		const dt = Date.now();
		if (!fs.existsSync(`${dir}/main.json`)) throw new TypeError("Could not find main.json inside the provided directory.");
		const main = fs.readJsonSync(`${dir}/main.json`) as V2Structure.Main;
		const nMain = {
			...main,
			version: 3
		} as V3Structure.Main;
		fs.mkdirpSync(`${dir}/data-new`);
		let dataConverted = 0;
		if (!fs.existsSync(`${dir}/data`)) console.warn("Could not find data directory inside the specified directory, not converting data files.");
		else {
			for (const d of nMain.data) {
				if (!fs.existsSync(`${dir}/data/${d.id}.json`)) console.warn(`Could not find data file for "${d.id}" inside the data folder, inside the provided directory. This entry will be removed from the converted files.`);
				else {
					dataConverted++;
					const r = fs.readJSONSync(`${dir}/data/${d.id}.json`) as (V2Structure.Data | V3Structure.Data)[];
					const l = r.map(v => ({
						id: v.id,
						ext: (v as V3Structure.Data).ext || null,
						md5: v.md5,
						info: (v as V3Structure.Data).info || null
					}));
					fs.writeJSONSync(`${dir}/data-new/${d.id}.json`, l);
				}
			}
		}

		fs.writeJSONSync(`${dir}/main-new.json`, nMain);

		fs.renameSync(`${dir}/main.json`, `${dir}/main.backup-${dt}.json`);
		fs.renameSync(`${dir}/main-new.json`, `${dir}/main.json`);

		fs.renameSync(`${dir}/data`, `${dir}/data-${dt}.backup`);
		fs.renameSync(`${dir}/data-new`, `${dir}/data`);

		console.log(`Successfully converted files in "${dir}" from CacheV2 to CacheV3, a total of ${dataConverted} data files were converted.`);
	}

	static fromV3(dir: string) {
		console.log(`Cache is already the latest version, no conversion needed.`);
	}
}
