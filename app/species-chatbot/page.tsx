/* eslint-disable */
"use client";
import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

export default function SpeciesChatbot() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [message, setMessage] = useState("");
  // chatLog = every message in the conversation, in order. Each one records who sent it ("user" or "bot")
  // and its text. The chat history box below loops over this list to draw the message bubbles.
  const [chatLog, setChatLog] = useState<{ role: "user" | "bot"; content: string }[]>([]);
  // loading = true while we're waiting for the chatbot's reply. We use it to:
  //   - show "Thinking..." in the chat box
  //   - disable the text box and button (so the user can't send again mid-reply)
  //   - change the button text to "Sending..."
  const [loading, setLoading] = useState(false);
  const handleInput = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  };

  // Runs when the user clicks "Enter" or presses the Enter key.
  // It sends the message to our API route (app/api/chat/route.ts) and adds the reply to the chat.
  const handleSubmit = async () => {
    // Remove spaces/newlines at the start and end, so "   " counts as empty.
    const text = message.trim();
    // Do nothing if the message is empty, or if we're still waiting on a previous reply
    // (this prevents accidental double-sends from double-clicking).
    if (!text || loading) return;

    // 1. Show the user's message immediately (before the reply arrives), so the app feels responsive.
    //    We use the "(log) => [...log, newItem]" form: it takes the latest list and returns a NEW list with
    //    the message added at the end. React needs a new list (not a modified old one) to notice the change.
    setChatLog((log) => [...log, { role: "user", content: text }]);
    // 2. Clear the text box.
    setMessage("");
    // 3. Turn on the loading state ("Thinking...", disabled inputs).
    setLoading(true);

    try {
      // 4. Send the message to our own server at /api/chat.
      //    - method POST = we're sending data
      //    - the Content-Type header tells the server the body is JSON
      //    - JSON.stringify turns { message: "hi" } into the text '{"message":"hi"}'
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      // 5. Turn the server's JSON reply back into an object. On success it has "response";
      //    on failure (status 400 or 502) it has "error".
      const data = (await res.json()) as { response?: string; error?: string };
      // res.ok is true for success codes (200-299). Show the reply on success, or the error message otherwise.
      // If neither exists, fall back to a generic message.
      const reply = (res.ok ? data.response : data.error) ?? "Something went wrong.";
      // 6. Add the bot's reply to the chat.
      setChatLog((log) => [...log, { role: "bot", content: reply }]);
    } catch {
      // fetch() itself failed — e.g. the user's internet dropped or the server is down.
      setChatLog((log) => [...log, { role: "bot", content: "Network error. Please try again." }]);
    } finally {
      // "finally" ALWAYS runs, whether the request succeeded or failed,
      // so the inputs can never get stuck in the disabled/loading state.
      setLoading(false);
    }
  };

  return (
    <>
      <TypographyH2>Species Chatbot</TypographyH2>
      <div className="mt-4 flex gap-4">
        <div className="mt-4 rounded-lg bg-foreground p-4 text-background">
          <TypographyP>
            The Species Chatbot is a feature to be implemented that is specialized to answer questions about animals.
            Ideally, it will be able to provide information on various species, including their habitat, diet,
            conservation status, and other relevant details. Any unrelated prompts will return a message to the user
            indicating that the chatbot is specialized for species-related queries only.
          </TypographyP>
          <TypographyP>
            To use the Species Chatbot, simply type your question in the input field below and hit enter. The chatbot
            will respond with the best available information.
          </TypographyP>
        </div>
      </div>
      {/* Chat UI, ChatBot to be implemented */}
      <div className="mx-auto mt-6">
        {/* Chat history */}
        <div className="h-[400px] space-y-3 overflow-y-auto rounded-lg border border-border bg-muted p-4">
          {chatLog.length === 0 ? (
            <p className="text-sm text-muted-foreground">Start chatting about a species!</p>
          ) : (
            chatLog.map((msg, index) => (
              <div key={index} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] whitespace-pre-wrap rounded-2xl p-3 text-sm ${
                    msg.role === "user"
                      ? "rounded-br-none bg-primary text-primary-foreground"
                      : "rounded-bl-none border border-border bg-foreground text-primary-foreground"
                  }`}
                >
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              </div>
            ))
          )}
          {/* While waiting for a reply, show "Thinking..." under the last message.
              ("condition && <element>" means: only render the element when the condition is true) */}
          {loading && <p className="text-sm text-muted-foreground">Thinking...</p>}
        </div>
        {/* Textarea and submission */}
        <div className="mt-4 flex flex-col items-end">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onInput={handleInput}
            // Keyboard shortcut, like most chat apps: Enter sends the message, Shift+Enter adds a new line.
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault(); // stop the textarea from inserting a newline
                void handleSubmit(); // "void" = we intentionally don't wait for the async function here
              }
            }}
            // Grey out the text box while waiting for a reply.
            disabled={loading}
            rows={1}
            placeholder="Ask about a species..."
            className="w-full resize-none overflow-hidden rounded border border-border bg-background p-2 text-sm text-foreground focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void handleSubmit()}
            // Disable the button while waiting; "disabled:opacity-50" (Tailwind) makes it look faded when disabled.
            disabled={loading}
            className="mt-2 rounded bg-primary px-4 py-2 text-background transition hover:opacity-90 disabled:opacity-50"
          >
            {/* Button text changes while a message is being sent */}
            {loading ? "Sending..." : "Enter"}
          </button>
        </div>
      </div>
    </>
  );
}
