// This file creates an API endpoint (a URL our own frontend can send requests to): POST /api/chat
// In Next.js, a file at app/api/chat/route.ts automatically becomes the URL /api/chat,
// and exporting a function named POST means it handles POST requests to that URL.
//
// Its job is to be the "middleman" between the browser and the AI:
//   1. receive the user's message from the chat page
//   2. check the message is valid
//   3. pass it to generateResponse() (lib/services/species-chat.ts), which calls Claude
//   4. send the reply back to the browser
//
// Why not call Claude directly from the browser? Because that would require putting the secret
// API key in the browser, where anyone could steal it. This route runs on the server, so the key stays hidden.
//
// Request body:  { "message": "Is the axolotl endangered?" }
// Response body: { "response": "Yes — the axolotl is critically endangered..." }
// Error body:    { "error": "..." } with an HTTP status code (400 = your request was bad, 502 = the AI service failed)

import { generateResponse } from "@/lib/services/species-chat";
import { NextResponse } from "next/server"; // helper for sending JSON responses with a status code

export async function POST(request: Request) {
  // ----- Step 1: read the request body -----
  // "unknown" means "we don't trust this yet" — the request could contain anything, so TypeScript
  // forces us to check its type before using it.
  let message: unknown;
  try {
    // Parse the body as JSON. If the body isn't valid JSON (e.g. the text "hello"), request.json() throws an error.
    const body = (await request.json()) as { message?: unknown };
    message = body.message;
  } catch {
    // 400 Bad Request = "the problem is with what you sent us"
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  // ----- Step 2: validate the message -----
  // It must be text, and not just empty spaces. Otherwise also reply 400.
  if (typeof message !== "string" || message.trim() === "") {
    return NextResponse.json({ error: "`message` must be a non-empty string." }, { status: 400 });
  }

  // ----- Step 3: ask the AI and send the answer back -----
  try {
    // trim() removes extra spaces/newlines from the start and end of the message.
    const response = await generateResponse(message.trim());
    // Success: send { response: "..." } back to the browser (status 200 OK by default).
    return NextResponse.json({ response });
  } catch {
    // 502 Bad Gateway = "our server is fine, but the upstream service we depend on (the AI provider) failed".
    // generateResponse() already catches its own errors and returns a friendly message, so this is a
    // second safety net in case something unexpected still goes wrong.
    return NextResponse.json({ error: "The chatbot service is unavailable." }, { status: 502 });
  }
}
