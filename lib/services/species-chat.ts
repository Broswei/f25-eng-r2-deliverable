// This file is the "service layer" of the chatbot: the ONLY place that talks to the AI model.
// Keeping it separate from the API route (app/api/chat/route.ts) means that if we ever switched
// AI providers (e.g. to OpenAI or Gemini), we would only have to change this one file.
//
// Full request flow:
//   chat page (browser)  --POST /api/chat-->  route.ts (our server)  --generateResponse()-->  this file  --> Claude API
//
// This code only ever runs on the server, so the secret API key is never sent to the user's browser.

// The official Anthropic SDK (a library that wraps Claude's HTTP API in easy-to-call functions).
// Installed with: npm install @anthropic-ai/sdk
import Anthropic from "@anthropic-ai/sdk";

// Create the client ONCE, outside the function, so every request reuses the same client
// instead of building a new one each time a message is sent.
// With no arguments, it automatically reads the secret key from the ANTHROPIC_API_KEY variable in .env
// (so the key is never hardcoded in the code or committed to GitHub).
const client = new Anthropic();

// The "system prompt" is a set of instructions the model follows for every conversation.
// The user never sees it. It gives the chatbot its personality and its rules:
//   1. Only answer questions about animals/species (habitat, diet, conservation status, etc.)
//   2. Keep answers short and use Markdown formatting (the chat page renders Markdown with ReactMarkdown)
//   3. Politely refuse off-topic questions (e.g. "Explain quicksort")
const SYSTEM_PROMPT = `You are a friendly expert on animals and species for the Biodiversity Hub app.
Answer questions about species: habitat, diet, behavior, speed, size, conservation status, and other animal facts.
Keep answers concise and use Markdown when helpful (short lists, bold key facts).
If the user asks about anything unrelated to animals or species, politely say you can only help with species-related questions.`;

// Takes the user's message, sends it to Claude, and returns Claude's reply as plain text.
// "async" + Promise<string> means this function takes time (a network request) and eventually gives back a string.
export async function generateResponse(message: string): Promise<string> {
  try {
    // Send the request to Claude. "await" pauses here until Claude's answer comes back.
    const response = await client.beta.messages.create({
      model: "claude-opus-5", // which Claude model to use
      max_tokens: 16000, // upper limit on the length of the reply (a "token" is roughly ¾ of a word)
      system: SYSTEM_PROMPT, // the rules defined above
      // The conversation so far. We send just the user's latest message (each question is answered on its own).
      messages: [{ role: "user", content: message }],
      // Safety net: if the model declines a request, Anthropic's server automatically retries it
      // on a backup model. "betas" turns on this newer API feature; "fallbacks: 'default'" lets
      // Anthropic pick the backup model. (Optional — these two lines can be removed.)
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });

    // stop_reason says WHY the model stopped writing. "refusal" means it declined to answer
    // for safety reasons, so we show a friendly message instead of an empty reply.
    if (response.stop_reason === "refusal") {
      return "Sorry, I can't help with that. Try asking me about an animal or species!";
    }

    // Claude's reply comes back as a LIST of "content blocks" (text, and possibly other kinds of blocks).
    // We keep only the text blocks, glue them together into one string, and trim extra whitespace.
    const text = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();

    // If for some reason there was no text at all, return a friendly message instead of an empty bubble.
    // (|| means "if the left side is empty/falsy, use the right side")
    return text || "Sorry, I couldn't come up with an answer. Please try again.";
  } catch (error) {
    // If ANYTHING goes wrong (missing/invalid API key, no internet, Claude is overloaded, ...),
    // we don't let the app crash. We log the real error on the server (for us developers to debug)
    // and return a safe, friendly message for the user.
    console.error("Species chat error:", error);
    return "Sorry, I'm having trouble connecting right now. Please try again later.";
  }
}
