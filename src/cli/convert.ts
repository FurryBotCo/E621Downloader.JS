#!/usr/bin/env node

import CacheConverter from "../util/CacheConverter";
import * as fs from "fs-extra";
import { AnyObject } from "@uwu-codes/utils";

export default function convert(o: AnyObject<string>) {
	if (!o.dir) throw new Error("dir is required.");
	if (!fs.existsSync(o.dir)) throw new Error("Provided directory does not exist.");
	const v = Number(o.version);
	if (isNaN(v)) CacheConverter.fromUnknown(o.dir);
	else CacheConverter.useVersion(o.dir, v);
}
