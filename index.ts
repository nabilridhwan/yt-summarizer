import {chromium} from 'playwright'
import {Ollama} from 'langchain/llms/ollama'
import {RunnableSequence} from "langchain/schema/runnable";
import {PromptTemplate} from "langchain/prompts";
import getVideoId from 'get-video-id';


const llm = new Ollama({
    model: 'llama2',
    temperature: 0.1,
})

async function main() {

    const browser = await chromium.launch({headless: true});
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' +
            ' AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
    });
    const page = await context.newPage();

    const link = process.argv[2];

    if(!link){
        console.log("Please provide a youtube link!")
        process.exit(1)
    }

    console.log("Going to youtube video")
    const {id} = getVideoId(link)
    await page.goto(link)
    const pagetitle = await page.title()

    console.log(`Got video page: ${pagetitle}`)

    console.log("Getting transcript...")
    // Open description window
    await page.waitForSelector("#expand", {state: 'attached'})
    await page.$("#expand").then((el) => el?.click())

    // Open transcript window
    await page.waitForSelector("button[aria-label='Show transcript']", {state: 'attached'})
    await page.$("button[aria-label='Show transcript']").then((el) => el?.click())

    // Get transcript
    await page.waitForSelector('.segment-text', {state: 'visible'})
    const elementText = await page.$$eval('.segment-text', (els) => els.map(e => e.textContent));

    console.log("Got transcript!")

    const transcript = elementText.join(" ")

    if (transcript.trim().length === 0) {
        console.log("Transcript is empty! Try another video! Exiting...")
        process.exit(1)
    }

    await generateAIKeyPoints({
        transcript,
        video_title: pagetitle,
        video_id: id || "unknown",
    })

    process.exit(0)
}


interface GenerateAIKeyPointsInput {
    transcript: string,
    video_title: string,
    video_id: string,
}

async function generateAIKeyPoints({transcript, video_title, video_id}: GenerateAIKeyPointsInput) {
    console.log("Generating AI key points ⭐")
    const chain = RunnableSequence.from([
        PromptTemplate.fromTemplate("Given a transcript of a video, give me key points of the video. Only give me the key points without extra words, characters or bullet points.\n\nTranscript: {transcript}"),
        llm,
    ]);
    const response = await chain.invoke({
        transcript: transcript,
    });
    console.log(response)
    console.log("\n\nDone! 😃")
    await cacheResults({
        transcript,
        video_title,
        video_id,
        output: response
    })
}


interface CacheResults extends GenerateAIKeyPointsInput {
    output: string,
}

import * as fs from 'fs/promises';
import * as path from 'path';

async function cacheResults(input: CacheResults) {
    console.log("✏️ Writing to cache...")
    const fileName = `${input.video_title.replace(" ", "_").replace(".", "")}__${input.video_id}.json`;
    const filePath = path.join('_cache', fileName);

    // Ensure _cache directory exists
    try {
        fs.access('_cache')
    } catch (e: unknown) {
        if ((e as any).code === 'ENOENT') {
            fs.mkdir('_cache');
        }
    }

    try {
        // Write data to file
        await fs.writeFile(filePath, JSON.stringify(input, null, 2));
        console.log(`Successfully wrote to ${filePath}`);
    } catch (e) {
        console.error('Error writing file', e);
    }
}


main();
