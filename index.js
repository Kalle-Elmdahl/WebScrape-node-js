const puppeteer = require("puppeteer")
const prompt = require("prompt")

const fs = require('fs')

const baseURL = "https://www.pawpeds.com/db"
let browser

prompt.start({ noHandleSIGINT: true })

process.on("SIGINT", () => {
	console.log("Programmet avbrutet")
	process.exit()
})

init()

async function init() {
	try {
		browser = await puppeteer.launch({})
		const { amount } = await prompt
			.get([
				{
					description: "Hur många länkar",
					name: "amount",
					required: true,
					message: "Maximalt 55 länkar",
					conform: number => Number.isInteger(Number(number)) && Number(number) <= 55,
				},
			])
			.catch(() => {
				process.exit()
			})

		const prompts = new Array(Number(amount)).fill(true).map((_, i) => ({
			description: `Länk ${i + 1}`,
			name: "links" + i,
		}))

		const ids = Object.entries(await prompt.get(prompts)).map(([_, value]) =>
			new URLSearchParams(value.split("?")[1]).get("id")
		)

		console.log("\nVänta\n")

		const names = []
		for await (const id of ids) {
			const name = (await getName(id)).split(",")[0]
			names.push(name)
		}

		console.log("Kolla på dessa katter? \n" + names.join("\n"))

		const { numberOfGenerations } = await prompt.get([
			{
				description: "Hur många generationer",
				name: "numberOfGenerations",
				required: true,
				message: "Maximalt 10 generationer",
				conform: number => Number.isInteger(Number(number)) && Number(number) <= 10,
			},
		])

		const data = []

		for await (const [index, id] of ids.entries()) {
			console.log("Hämtar data för katt " + (index + 1))
			const ancestors = await getAncestors({ id, numberOfGenerations })

			const uniqueAncestors = getUnique(ancestors.map(({ id }) => id)).map(id =>
				ancestors.find(anc => anc.id === id)
			)
			data.push(uniqueAncestors)
			console.log("Lyckades...")
		}

		console.log("Hittar matchningar")

		const flattenedData = data.reduce((acc, val) => acc.concat(val), [])

		const duplicates = getDuplicates(flattenedData.map(({ id }) => id))
			.map(id => flattenedData.find(data => data.id === id))
			.map(({ id, name }) => ({id, name}))


		const finalData = duplicates.map(dup => ({
			...dup,
			hits: data
				.map((entry, index) => ({
					name: names[index],
					id: ids[index],
					generation: entry.find(ancestor => ancestor.id === dup.id)?.generation,
				}))
				.filter(entry => entry.generation != null),
		}))

        console.log("saving")

        const jsonContent = JSON.stringify(finalData);        
        fs.writeFile("output.json", jsonContent, 'utf8', (err) => {
            if (err) {
                console.log("An error occured while writing JSON Object to File.");
                return console.log(err);
            }
        
            console.log("JSON file has been saved.");
        });
		/* displayFinalData(finalData) */
	} catch (e) {
		console.log(e)
	} finally {
		browser.close()
	}
}

async function getName(id) {
    console.log("Getting name for id: " + id)
	const page = await browser.newPage()

	await page.goto(
		`${baseURL}?${new URLSearchParams({
			id,
			a: "p",
			g: 1,
			p: "sib",
		}).toString()}`
	)

	const nameElement = await page.waitForSelector("body > div.centered > table > tbody > tr:nth-child(1)")
	const name = await page.evaluate(element => element.textContent, nameElement)
	return name
}

async function getAncestors({ id = "1058710", numberOfGenerations = 5 }) {
	const ancestors = []

	const page = await browser.newPage()

	await page.goto(
		`${baseURL}?${new URLSearchParams({
			id,
			a: "p",
			g: numberOfGenerations,
			p: "sib",
		}).toString()}`
	)

	const [_, __, ...rowHandles] = await page.$$("body > div.centered > table > tbody > tr")

	for (const row of rowHandles) {
		const columns = await row.$$("td")
		for await (const [index, column] of columns.entries()) {
			const startIndex = numberOfGenerations - columns.length
			try {
				const { link, name } = await column.evaluate(column => ({
					link: column.querySelector("a").getAttribute("href"),
					name: column.querySelector("a").innerText,
				}))

				const id = new URLSearchParams(link).get("id")
				ancestors.push({
					id,
					name,
					generation: startIndex + (index + 1),
				})
			} catch (e) {
				if (!e.message.includes("Cannot read properties of null")) throw e
			}
		}
	}

	return ancestors
}

function displayFinalData(finalData) {
	console.table(
		finalData.map(({ name, hits }) => ({
			name: name,
			...hits.map(hit => hit.name + " in generation " + hit.generation),
		}))
	)
}

function getDuplicates(arr) {
	return arr.filter((e, i, a) => a.indexOf(e) !== i)
}

function getUnique(arr) {
	return arr.filter((e, i, a) => a.indexOf(e) === i)
}