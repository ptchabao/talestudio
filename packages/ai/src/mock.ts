import { shotCount, type AdBrief, type Character, type Format, type Script, type Shot, type Style } from "@talestudio/core";
import type { FactChecker, GeneratedAsset, HighlightFinder, IdentityChecker, ImageGenerator, LipSyncer, ScriptWriter, SpeechSynthesizer, Transcriber, VideoGenerator } from "./types";
import { splitSources } from "./anthropic";
import { gradientFrame } from "./render";

/**
 * Deterministic, zero-cost providers for local dev, CI and demos.
 * Images are SVG cards so the storyboard UI is fully usable without any API key.
 */
/** Simulated provider latency (AI_MOCK_LATENCY_MS) so progress UI and cancellation can be exercised locally. */
const latency = () => {
  const ms = Number(process.env.AI_MOCK_LATENCY_MS ?? 0);
  return ms > 0 ? new Promise((r) => setTimeout(r, ms * (0.5 + Math.random()))) : Promise.resolve();
};

const PALETTE = ["#7c3aed", "#2563eb", "#db2777", "#ea580c", "#059669", "#0891b2"];
const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);

function svgCard(w: number, h: number, title: string, body: string, seed: number): Uint8Array {
  const a = PALETTE[seed % PALETTE.length]!;
  const b = PALETTE[(seed + 2) % PALETTE.length]!;
  const words = body.split(" ");
  const lines: string[] = [];
  for (let i = 0; i < words.length && lines.length < 4; i += 9) lines.push(words.slice(i, i + 9).join(" "));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/>
<text x="40" y="70" font-family="system-ui,sans-serif" font-size="34" font-weight="700" fill="#fff">${esc(title)}</text>
${lines.map((l, i) => `<text x="40" y="${130 + i * 34}" font-family="system-ui,sans-serif" font-size="22" fill="#ffffffd0">${esc(l)}</text>`).join("")}
</svg>`;
  return new TextEncoder().encode(svg);
}

const MOCK_COPY = {
  en: {
    heroBio: "A curious girl who never says no to a mystery.",
    guideBio: "The old lighthouse keeper, who knows more than he says.",
    beats: ["discovers", "follows", "hesitates before", "confronts", "laughs with", "says goodbye to"],
    caption: (who: string, beat: string, title: string) => `${who} ${beat} the mystery of "${title}".`,
    line: (n: number) => `Line ${n}: what happens next?`,
    ending: "And that was only the beginning.",
  },
  fr: {
    heroBio: "Une fille curieuse qui ne dit jamais non à un mystère.",
    guideBio: "Le vieux gardien du phare, qui en sait plus qu'il ne le dit.",
    beats: ["découvre", "suit", "hésite devant", "affronte", "rit avec", "dit au revoir à"],
    caption: (who: string, beat: string, title: string) => `${who} ${beat} le mystère de « ${title} ».`,
    line: (n: number) => `Réplique ${n} : et ensuite ?`,
    ending: "Et ce n'était que le début.",
  },
};

const MOCK_AD_COPY = {
  en: { hook: "Stop scrolling.", benefit: (p: string) => `Meet ${p}.`, presenter: "A confident presenter in her thirties.", caption: (i: number, n: number, brand: string) => (i === 0 ? `Hook: an unexpected first image for ${brand}.` : i === n - 1 ? "Call to action with the logo." : `The product in use, benefit ${i}.`) },
  fr: { hook: "Arrêtez de scroller.", benefit: (p: string) => `Découvrez ${p}.`, presenter: "Une présentatrice assurée d'une trentaine d'années.", caption: (i: number, n: number, brand: string) => (i === 0 ? `Accroche : une première image inattendue pour ${brand}.` : i === n - 1 ? "Appel à l'action avec le logo." : `Le produit en situation, bénéfice ${i}.`) },
};

function mockAd(req: Parameters<ScriptWriter["write"]>[0]): Script {
  const n = shotCount(req.durationSec);
  const copy = MOCK_AD_COPY[req.language === "fr" ? "fr" : "en"];
  const b = req.brief as AdBrief;
  const presenter: Character = { id: "presenter", name: "Ama", appearance: "a confident West African woman in her thirties, short natural hair, mustard linen shirt", voice: "female, warm, energetic", bio: copy.presenter };
  const shots: Shot[] = Array.from({ length: n }, (_, index) => ({
    index,
    durationSec: 5,
    camera: index === 0 ? "fast push-in, close-up" : index === n - 1 ? "static product hero shot" : "handheld medium shot",
    visual: index === n - 1 ? `${b.product} on a clean surface with the ${b.brand} logo` : `${presenter.name} enjoying ${b.product} in a bright modern setting`,
    characterIds: index === n - 1 ? [] : [presenter.id],
    speakerId: index === n - 1 ? null : presenter.id,
    line: index === 0 ? copy.hook : index === n - 1 ? b.callToAction : copy.benefit(b.product.slice(0, 40)),
    caption: copy.caption(index, n, b.brand),
  }));
  return { logline: `${b.brand} — ${req.premise.slice(0, 120)}`, characters: [presenter], shots };
}

export class MockScriptWriter implements ScriptWriter {
  async write(req: Parameters<ScriptWriter["write"]>[0]) {
    await latency();
    if (req.format === "ad" && req.brief) return { script: mockAd(req), costUsd: 0, provider: "mock" };
    if (req.format === "news" || req.format === "podcast") return { script: mockTalk(req), costUsd: 0, provider: "mock" };
    const n = shotCount(req.durationSec);
    const copy = MOCK_COPY[req.language === "fr" ? "fr" : "en"];
    // Reuse the series' recurring cast like the real writer must; invent one only for the first episode.
    const recurring = req.project.characters;
    const characters: Character[] =
      recurring.length >= 2
        ? recurring.slice(0, 2)
        : [
            { id: "hero", name: "Mira", appearance: "a curious 12-year-old girl with a yellow raincoat and short black hair", voice: "young girl, bright", bio: copy.heroBio },
            { id: "guide", name: "Old Tobin", appearance: "an elderly lighthouse keeper with a white beard and navy wool coat", voice: "old man, warm, gravelly", bio: copy.guideBio },
          ];
    const [hero, guide] = [characters[0]!, characters[1]!];
    const beats = ["discovers", "follows", "hesitates before", "confronts", "laughs with", "says goodbye to"];
    const shots: Shot[] = Array.from({ length: n }, (_, index) => {
      const speaker = index % 2 === 0 ? (index % 4 === 0 ? hero.id : guide.id) : null;
      return {
        index,
        durationSec: 5,
        camera: index === 0 ? "wide establishing shot, slow push-in" : index % 3 === 0 ? "close-up, static" : "medium shot, gentle pan",
        visual: `${hero.name} ${beats[index % beats.length]} the mystery of "${req.title}" — ${req.premise.slice(0, 80)}`,
        characterIds: speaker === guide.id ? [hero.id, guide.id] : [hero.id],
        speakerId: speaker,
        line: speaker ? copy.line(index + 1) : index === n - 1 ? copy.ending : null,
        caption: copy.caption(hero.name, copy.beats[index % copy.beats.length]!, req.title),
      };
    });
    const script: Script = { logline: req.premise.slice(0, 140), characters, shots };
    return { script, costUsd: 0, provider: "mock" };
  }
}

/**
 * Mock frames are real JPEGs (ffmpeg gradients) so the whole render path — FFmpeg assembly, subtitles,
 * every format — runs for real in dev and CI. Falls back to SVG cards if ffmpeg is missing.
 */
export class MockImageGenerator implements ImageGenerator {
  async character(c: Character, _style: Style): Promise<GeneratedAsset> {
    await latency();
    const jpg = await gradientFrame(c.id.length * 7, 768, 1024).catch(() => null);
    return jpg ? { bytes: jpg, contentType: "image/jpeg", costUsd: 0, provider: "mock" } : { bytes: svgCard(768, 1024, c.name, c.appearance, c.id.length), contentType: "image/svg+xml", costUsd: 0, provider: "mock" };
  }
  async keyframe(shot: Shot, style: Style, _refs: unknown, aspect: Format = "16:9"): Promise<GeneratedAsset> {
    await latency();
    const [w, h] = FRAME_SIZE[aspect];
    const jpg = await gradientFrame(shot.index, w, h).catch(() => null);
    return jpg ? { bytes: jpg, contentType: "image/jpeg", costUsd: 0, provider: "mock" } : { bytes: svgCard(w, h, `Shot ${shot.index + 1} · ${style}`, `${shot.camera}. ${shot.visual}`, shot.index), contentType: "image/svg+xml", costUsd: 0, provider: "mock" };
  }
  async variant(input: { prompt: string; aspect: "portrait" | Format }): Promise<GeneratedAsset> {
    await latency();
    const [w, h] = input.aspect === "portrait" ? [768, 1024] : FRAME_SIZE[input.aspect];
    const seed = [...input.prompt].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 997, 7);
    const jpg = await gradientFrame(seed, w, h).catch(() => null);
    return jpg ? { bytes: jpg, contentType: "image/jpeg", costUsd: 0, provider: "mock" } : { bytes: svgCard(w, h, "Reference", input.prompt, seed), contentType: "image/svg+xml", costUsd: 0, provider: "mock" };
  }
}

const FRAME_SIZE: Record<Format, [number, number]> = { "16:9": [1280, 720], "9:16": [720, 1280], "1:1": [1024, 1024] };

/** Mock identity check: always the same character. */
export class MockIdentityChecker implements IdentityChecker {
  async check() {
    await latency();
    return { same: true, score: 0.95, issues: "", costUsd: 0, provider: "mock" };
  }
}

/** In mock mode a "clip" is the keyframe itself; the renderer turns stills into a slideshow. */
export class MockVideoGenerator implements VideoGenerator {
  async animate(input: { imageUrl: string }): Promise<GeneratedAsset> {
    await latency();
    return { url: input.imageUrl, contentType: "image/jpeg", costUsd: 0, provider: "mock" };
  }
}

export class MockSpeechSynthesizer implements SpeechSynthesizer {
  async speak(): Promise<GeneratedAsset> {
    await latency();
    return { bytes: new Uint8Array(), contentType: "audio/mpeg", costUsd: 0, provider: "mock" };
  }
}

export class MockLipSyncer implements LipSyncer {
  async sync(input: { videoUrl: string }): Promise<GeneratedAsset> {
    await latency();
    return { url: input.videoUrl, contentType: "video/mp4", costUsd: 0, provider: "mock" };
  }
}

const fr = (lang: string) => lang === "fr";

/** Podcast or news segment: hosts/presenter talking on set, lines built from the premise or verified claims. */
function mockTalk(req: Parameters<ScriptWriter["write"]>[0]): Script {
  const n = shotCount(req.durationSec);
  const news = req.format === "news";
  const recurring = req.project.characters;
  const host: Character = recurring[0] ?? (news
    ? { id: "anchor", name: "Efua", appearance: "a Ghanaian news anchor in her forties, navy blazer, short natural hair", voice: "female, clear, authoritative", bio: fr(req.language) ? "Présentatrice du journal." : "News anchor." }
    : { id: "host", name: "Kwame", appearance: "a Togolese podcast host in his thirties, round glasses, olive shirt, studio headphones", voice: "male, warm, curious", bio: fr(req.language) ? "Animateur de l'émission." : "Show host." });
  const guest: Character | null = news ? null : (recurring[1] ?? { id: "guest", name: "Adjoa", appearance: "a young Beninese entrepreneur, braided hair, white blouse", voice: "female, lively", bio: fr(req.language) ? "Invitée de l'épisode." : "Episode guest." });
  const verified = (req.claims ?? []).filter((c) => c.status === "verified").map((c) => c.claim);
  const lines = news
    ? [fr(req.language) ? "Bonsoir, voici l'essentiel." : "Good evening, here is the essential.", ...verified.map((c) => c.slice(0, 80)), fr(req.language) ? "Restez avec nous." : "Stay with us."]
    : [fr(req.language) ? "Bienvenue dans l'émission !" : "Welcome to the show!", fr(req.language) ? `Aujourd'hui : ${req.title}.` : `Today: ${req.title}.`, fr(req.language) ? "Racontez-nous tout." : "Tell us everything.", fr(req.language) ? "Tout a commencé par une idée simple." : "It all started with a simple idea."];
  const shots: Shot[] = Array.from({ length: n }, (_, index) => {
    const speaker = news || index % 2 === 0 || !guest ? host : guest;
    const line = lines[index % lines.length] ?? null;
    return {
      index,
      durationSec: 5,
      camera: index === 0 ? "wide shot of the set, slow push-in" : "medium close-up, static",
      visual: `${speaker.name} speaking at a microphone on a modern ${news ? "news" : "podcast"} set`,
      characterIds: guest && !news ? [host.id, guest.id] : [host.id],
      speakerId: speaker.id,
      line,
      caption: fr(req.language) ? `${speaker.name} prend la parole.` : `${speaker.name} speaks.`,
    };
  });
  return { logline: req.premise.slice(0, 140), characters: guest ? [host, guest] : [host], shots };
}

export class MockTranscriber implements Transcriber {
  async transcribe(input: { durationSec: number; language: string }) {
    await latency();
    const words = fr(input.language)
      ? ["on parle", "de création", "de vidéo", "en Afrique de l'Ouest", "et de", "ce qui marche vraiment", "sur les réseaux"]
      : ["we talk", "about creativity", "video", "in West Africa", "and", "what really works", "on social media"];
    const segments = [];
    for (let t = 0, i = 0; t < input.durationSec; t += 6, i++) {
      segments.push({ start: t, end: Math.min(input.durationSec, t + 6), text: `${words[i % words.length]} ${words[(i + 3) % words.length]} (${i + 1}).` });
    }
    return { segments, costUsd: 0, provider: "mock" };
  }
}

export class MockHighlightFinder implements HighlightFinder {
  async find(input: Parameters<HighlightFinder["find"]>[0]) {
    await latency();
    const total = input.segments.at(-1)?.end ?? 0;
    const len = Math.min(30, Math.max(10, total / (input.count * 2)));
    const step = total / input.count;
    const highlights = Array.from({ length: input.count }, (_, i) => {
      const start = Math.floor(i * step);
      return {
        start,
        end: Math.min(total, start + len),
        title: fr(input.language) ? `Moment fort ${i + 1}` : `Highlight ${i + 1}`,
        hook: fr(input.language) ? `Le passage à ne pas manquer (${i + 1}).` : `The bit you can't miss (${i + 1}).`,
        reason: "mock",
        selected: true,
      };
    }).filter((h) => h.end - h.start >= 5);
    return { highlights, costUsd: 0, provider: "mock" };
  }
}

/** Deterministic checker: the first sentence of each source is "verified" with an exact quote; the premise stays unverified. */
export class MockFactChecker implements FactChecker {
  async check(input: Parameters<FactChecker["check"]>[0]) {
    await latency();
    const sources = splitSources(input.sources);
    const claims = sources.map((src, i) => {
      const text = src.split("\n").filter((l) => !/^https?:\/\//.test(l.trim())).join(" ").replace(/^(Extrait|Excerpt)\s*:\s*/i, "").trim() || src;
      const sentence = (text.split(/(?<=[.!?])\s/)[0] ?? text).slice(0, 200);
      return { claim: sentence, status: "verified" as const, sourceIndex: i + 1, quote: sentence, note: fr(input.language) ? "Citation exacte de la source." : "Exact quote from the source." };
    });
    claims.push({ claim: input.premise.slice(0, 200), status: "unverified" as never, sourceIndex: null as never, quote: null as never, note: fr(input.language) ? "Aucune source fournie ne le confirme." : "No provided source confirms it." });
    return { claims, costUsd: 0, provider: "mock" };
  }
}
