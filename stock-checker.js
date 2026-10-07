const fs = require("fs");

const RESTOCK_SECONDS = 30 * 60;

/*
	This must match the Offset NumberValue used by Roblox.

	If your Roblox Offset.Value is 0, you do not need to
	configure anything in GitHub.
*/
const STOCK_OFFSET =
	Number(
		process.env.STOCK_OFFSET || 0
	);

/*
	ROLE IDS
*/

const ROLE_IDS = {
	Hallow: "1557330740382015548",
	Legendary: "1557330490397167668",
	Mythic: "1557330592683794464",
	Void: "1557330593094574181",
};

/*
	MUST MATCH STOCKROLLER
*/

const RARITIES = [
	{
		name: "Default",
		weight: 43,
	},

	{
		name: "Unique",
		weight: 25,
	},

	{
		name: "Rare",
		weight: 14,
	},

	{
		name: "Insane",
		weight: 9,
	},

	{
		name: "Legendary",
		weight: 5,
	},

	{
		name: "Mythic",
		weight: 2.2,
	},

	{
		name: "Void",
		weight: 0.8,
	},

	{
		name: "Hallow",
		weight: 0.001,
	},
];

const TOTAL_WEIGHT =
	RARITIES.reduce(
		(total, rarity) =>
			total + rarity.weight,
		0
	);

/*
	SAME 32-BIT RNG AS STOCKROLLER
*/

function mix32(x) {
	x >>>= 0;

	x ^=
		x << 13;

	x >>>= 0;

	x ^=
		x >>> 17;

	x >>>= 0;

	x ^=
		x << 5;

	x >>>= 0;

	return x >>> 0;
}

function deterministicRandom(
	entry,
	slot,
	salt
) {
	const slotValue =
		Math.imul(
			slot,
			0x9E3779B9
		) >>> 0;

	let x =
		(
			(entry >>> 0)
			^ slotValue
			^ salt
		) >>> 0;

	x =
		mix32(x);

	x =
		mix32(
			(
				x
				^ 0x85EBCA6B
			) >>> 0
		);

	return (
		(x >>> 0)
		/ 4294967296
	);
}

/*
	ROLL RARITY
*/

function getRarity(
	entry,
	slot
) {
	const random =
		deterministicRandom(
			entry,
			slot,
			0xA341316C
		);

	const target =
		random
		* TOTAL_WEIGHT;

	let current = 0;

	for (const rarity of RARITIES) {
		current += rarity.weight;

		if (target <= current) {
			return rarity.name;
		}
	}

	return RARITIES[
		RARITIES.length - 1
	].name;
}

/*
	CURRENT 30-MINUTE ENTRY
*/

function getCurrentEntry() {
	const unix =
		Math.floor(
			Date.now() / 1000
		);

	return Math.floor(
		(
			unix
			+ STOCK_OFFSET
			* RESTOCK_SECONDS
		)
		/ RESTOCK_SECONDS
	);
}

/*
	STATE
*/

const STATE_FILE =
	"stock-state.json";

function loadState() {
	try {
		return JSON.parse(
			fs.readFileSync(
				STATE_FILE,
				"utf8"
			)
		);
	} catch {
		return {
			lastEntry: null,
		};
	}
}

function saveState(entry) {
	fs.writeFileSync(
		STATE_FILE,

		JSON.stringify(
			{
				lastEntry: entry,
			},
			null,
			2
		)
		+ "\n"
	);
}

/*
	MAIN
*/

async function main() {
	const entry =
		getCurrentEntry();

	const state =
		loadState();

	console.log(
		"Current entry:",
		entry
	);

	console.log(
		"Previously handled entry:",
		state.lastEntry
	);

	/*
		ALREADY HANDLED
	*/

	if (state.lastEntry === entry) {
		console.log(
			"This restock was already handled."
		);

		return;
	}

	/*
		ROLL ALL THREE STOCK RARITIES
	*/

	const stock = [];

	for (
		let slot = 1;
		slot <= 3;
		slot++
	) {
		stock.push(
			getRarity(
				entry,
				slot
			)
		);
	}

	console.log(
		"Current stock rarities:",
		stock.join(", ")
	);

	/*
		FIND RARITIES THAT NEED A PING
	*/

	const alertOrder = [
		"Hallow",
		"Void",
		"Mythic",
		"Legendary",
	];

	const alerts =
		alertOrder.filter(
			rarity =>
				stock.includes(rarity)
		);

	/*
		NOTHING IMPORTANT
	*/

	if (alerts.length === 0) {
		console.log(
			"No special stock."
		);

		saveState(entry);

		return;
	}

	/*
		GET DISCORD WEBHOOK SECRET
	*/

	const webhook =
		process.env.DISCORD_WEBHOOK_URL;

	if (!webhook) {
		throw new Error(
			"DISCORD_WEBHOOK_URL GitHub secret is missing."
		);
	}

	/*
		BUILD MESSAGE
	*/

	const lines = [];
	const roles = [];

	for (const rarity of alerts) {
		const roleID =
			ROLE_IDS[rarity];

		lines.push(
			`<@&${roleID}> A ${rarity} KFX is now on stock.`
		);

		roles.push(roleID);
	}

	const content =
		lines.join("\n");

	console.log(
		"Sending:"
	);

	console.log(content);

	/*
		SEND TO DISCORD
	*/

	const response =
		await fetch(
			webhook,
			{
				method: "POST",

				headers: {
					"Content-Type":
						"application/json",
				},

				body: JSON.stringify({
					content,

					allowed_mentions: {
						parse: [],
						roles,
					},
				}),
			}
		);

	/*
		ONLY SAVE THE ENTRY IF DISCORD ACCEPTS IT
	*/

	if (!response.ok) {
		const body =
			await response.text();

		throw new Error(
			`Discord webhook failed (${response.status}): ${body}`
		);
	}

	console.log(
		"Discord notification successful."
	);

	saveState(entry);
}

main().catch(error => {
	console.error(
		error
	);

	process.exit(1);
});
