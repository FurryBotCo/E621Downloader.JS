// https://github.com/FurryBotCo/FurryBot/blob/master/src/util/Functions/Time.ts#L31

interface MsResponse {
	ms: number;
	s: number;
	m: number;
	h: number;
	d: number;
	w: number;
	mn: number;
	y: number;
}


/**
 * Convert milliseconds into readable time.
 *
 * @static
 * @param {number} time - The time to convert.
 * @param {boolean} [words=false] - If we should return full words or just letters.
 * @returns {(Promise<string | T.MsResponse>)}
 * @memberof Time
 * @example Time.ms(120000);
 * @example Time.ms(240000, true);
 */
export default function ms(time: number, words?: true, seconds?: boolean): string;
export default function ms(time: number, words?: false, seconds?: boolean): MsResponse;
export default function ms(time: number, words = false, seconds = true): string | MsResponse {
	if (time < 0) throw new TypeError("Negative time provided.");
	// @FIXME language :sweats:
	if (time === 0) return words ? "0 seconds" : "0s";
	const r = {
		s: 0,
		m: 0,
		h: 0,
		d: 0,
		w: 0,
		mn: 0,
		y: 0
	};

	while (time >= 1e3) {
		r.s++; time -= 1e3;
	}
	while (r.s >= 60) {
		r.m++; r.s -= 60;
	}
	while (r.m >= 60) {
		r.h++; r.m -= 60;
	}
	while (r.h >= 24) {
		r.d++; r.h -= 24;
	}
	// while (r.d >= 7) { r.w++; r.d -= 7; }
	// while (r.w >= 4 && r.d >= 2) { r.mn++; r.w -= 4; r.d -= 2; }
	while (r.d >= 30) {
		r.mn++; r.d -= 30;
	}
	while (r.mn >= 12) {
		r.y++; r.mn -= 12;
	}
	if (time > 0) r.s += time / 1000;

	Object.keys(r).map(k => r[k] = Math.floor(r[k]));

	const str: string[] = [];
	if (time > 0) str.push(`${time.toFixed(0)} millisecond${time === 1 ? "" : "s"}`);
	if (r.s > 0) str.push(`${r.s} second${r.s === 1 ? "" : "s"}`);
	if (r.m > 0) str.push(`${r.m} minute${r.m === 1 ? "" : "s"}`);
	if (r.h > 0) str.push(`${r.h} hour${r.h === 1 ? "" : "s"}`);
	if (r.d > 0) str.push(`${r.d} day${r.d === 1 ? "" : "s"}`);
	// if (r.w > 0) str.push(`${r.w} week${r.w === 1 ? "" : "s"}`);
	if (r.mn > 0) str.push(`${r.mn} month${r.mn === 1 ? "" : "s"}`);
	if (r.y > 0) str.push(`${r.y} year${r.y === 1 ? "" : "s"}`);

	if (words && str.length > 1) str[0] = `and ${str[0]}`;

	if (!seconds) {
		if (words) {
			const e = str.find(v => v.indexOf("second") !== -1);
			if (e) {
				str.splice(str.indexOf(e), 1);
				if (str.length < 1) str.push("less than 1 minute");
			}
		} else delete (r as any).s;
	}

	return words ? str.reverse().join(", ") : Object.keys(r).filter(k => r[k] > 0).map(k => `${Math.floor(r[k])}${k}`).reverse().reduce((a, b) => a + b, "");
}
