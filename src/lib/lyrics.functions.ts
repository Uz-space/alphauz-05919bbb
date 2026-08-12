import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type LyricsResult = { found: boolean; lyrics: string };

export const fetchLyrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown): { trackId: string; title: string; artist: string } => {
    const d = input as { trackId?: unknown; title?: unknown; artist?: unknown };
    if (
      typeof d.trackId !== "string" ||
      typeof d.title !== "string" ||
      typeof d.artist !== "string"
    ) {
      throw new Error("Invalid input");
    }
    return { trackId: d.trackId, title: d.title, artist: d.artist };
  })
  .handler(async ({ data, context }): Promise<LyricsResult> => {
    const { supabase, userId } = context;

    // return cached lyrics if present
    const { data: existing } = await supabase
      .from("tracks")
      .select("lyrics")
      .eq("id", data.trackId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existing?.lyrics && existing.lyrics.trim().length > 0) {
      return { found: true, lyrics: existing.lyrics };
    }

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    const artist = data.artist && data.artist !== "Unknown artist" ? data.artist : "";
    const prompt = `Return the FULL, ACCURATE original lyrics of this song. Be precise — no paraphrasing, no summaries, no translations. Preserve line breaks and stanza breaks (blank line between stanzas).

Song title: "${data.title}"${artist ? `\nArtist: "${artist}"` : ""}

Respond in strict JSON with this exact shape and nothing else:
{"found": boolean, "lyrics": "the exact lyrics with \\n line breaks, or empty string if you are not sure"}

Rules:
- If you are not 100% sure of the correct song or its lyrics, set found=false and lyrics="".
- Do NOT invent or guess lyrics.
- Do NOT include the title, artist name, "Verse 1", "Chorus" markers, or any commentary — lyrics only.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "openai/gpt-5.5",
        messages: [
          {
            role: "system",
            content:
              "You are a precise lyrics retrieval assistant. Only return lyrics you know verbatim. Never invent.",
          },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`AI gateway error ${res.status}: ${text.slice(0, 200)}`);
    }

    const json = await res.json();
    const content: string = json?.choices?.[0]?.message?.content ?? "";

    let parsed: LyricsResult = { found: false, lyrics: "" };
    try {
      const obj = JSON.parse(content);
      if (obj && typeof obj === "object") {
        parsed = {
          found:
            Boolean(obj.found) && typeof obj.lyrics === "string" && obj.lyrics.trim().length > 0,
          lyrics: typeof obj.lyrics === "string" ? obj.lyrics : "",
        };
      }
    } catch {
      parsed = { found: false, lyrics: "" };
    }

    if (parsed.found) {
      await supabase
        .from("tracks")
        .update({ lyrics: parsed.lyrics })
        .eq("id", data.trackId)
        .eq("user_id", userId);
    }

    return parsed;
  });
