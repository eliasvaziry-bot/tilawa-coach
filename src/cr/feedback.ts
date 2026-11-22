// Call-and-response feedback: entry timing (latency-compensated), duration, melody (pitch-contour DTW).
// Melody always comes second to correctness (non-negotiable 12): tajweed checks (M5) are shown first when present.
import { activeRegions, judgeInput, levels, type InputVerdict } from '../audio/dsp/onsets.ts';
import { frameDb, percentile } from '../audio/dsp/energy.ts';
import { hzToCents, medianPitch, pitchTrack } from '../audio/dsp/pitch.ts';
import { centre, dtw } from '../audio/dsp/dtw.ts';

export type Confidence = 'high' | 'medium' | 'low';

export interface CrFeedback {
  heard: boolean;
  input: InputVerdict;
  inputMessage: string;
  entryMs: number | null; // + late / − early, relative to the cue, latency-compensated
  entry: 'on time' | 'early' | 'late' | 'not heard';
  durRatio: number | null; // your voiced length / call length
  length: 'good length' | 'too short' | 'too long' | 'not heard';
  melodyCents: number | null; // mean |cents| after removing the key difference
  melody: 'close' | 'fair' | 'different' | 'not measured';
  confidence: Confidence;
  score: number; // 0..100 (timing 30, length 30, melody 40) — shown with its parts, never alone
}

export interface FeedbackInput {
  call: Float32Array; // 16 kHz call audio (at the played speed)
  response: Float32Array; // 16 kHz response
  responseStartMs: number; // response[0] time relative to the cue (negative = recording began before the cue)
  noiseFloorDb: number;
  latencyMs: number;
}

/** Voiced span measured the SAME way for call and response: frames within 35 dB of the signal's own loud level. */
const voicedSpan = (x: Float32Array) => {
  const db = frameDb(x, 16000, 10, 20);
  if (!db.length) return null;
  const thr = Math.max(percentile(db, 95) - 35, -55);
  const regions = activeRegions(db, 10, thr, 80, 300);
  if (!regions.length) return null;
  return { s: regions[0]!.s, e: regions[regions.length - 1]!.e };
};

const contour = (x: Float32Array): number[] => {
  const tr = pitchTrack(x, 16000, 10, 40);
  const ref = medianPitch(tr.hz, tr.clarity, 0.7) || 150;
  return [...tr.hz].map((h, i) => (h > 0 && tr.clarity[i]! >= 0.7 ? hzToCents(h, ref) : NaN));
};

export function computeFeedback(i: FeedbackInput): CrFeedback {
  const call = voicedSpan(i.call);
  const resp = voicedSpan(i.response);
  // judge loudness on the voiced part only (silence before your entry must not count as "too quiet")
  const voiced = resp ? i.response.subarray(Math.round(resp.s * 16), Math.round(resp.e * 16)) : i.response;
  const lv = levels(voiced);
  lv.clipped = levels(i.response).clipped;
  lv.clippedPct = (lv.clipped / Math.max(1, i.response.length)) * 100;
  const judged = judgeInput(lv, i.noiseFloorDb);
  if (!resp || !call || judged.verdict === 'too-quiet') {
    return { heard: false, input: judged.verdict, inputMessage: judged.message, entryMs: null, entry: 'not heard', durRatio: null, length: 'not heard', melodyCents: null, melody: 'not measured', confidence: 'low', score: 0 };
  }
  const entryMs = Math.round(i.responseStartMs + resp.s - i.latencyMs);
  const entry = Math.abs(entryMs) <= 200 ? 'on time' : entryMs < 0 ? 'early' : 'late';
  const durRatio = (resp.e - resp.s) / Math.max(1, call.e - call.s);
  const length = durRatio < 0.75 ? 'too short' : durRatio > 1.3 ? 'too long' : 'good length';
  const a = centre(contour(i.call.subarray(Math.round(call.s * 16), Math.round(call.e * 16))));
  const b = centre(contour(i.response.subarray(Math.round(resp.s * 16), Math.round(resp.e * 16))));
  const voicedA = a.filter(Number.isFinite).length;
  const voicedB = b.filter(Number.isFinite).length;
  const d = voicedA >= 10 && voicedB >= 10 ? dtw(a, b) : null;
  const melodyCents = d ? Math.round(d.meanCents) : null;
  const melody = melodyCents === null ? 'not measured' : melodyCents <= 60 ? 'close' : melodyCents <= 140 ? 'fair' : 'different';
  const confidence: Confidence = judged.verdict !== 'ok' ? 'low' : voicedB >= 40 && judged.snrDb > 25 ? 'high' : 'medium';
  const tScore = Math.max(0, 1 - Math.max(0, Math.abs(entryMs) - 150) / 600) * 30;
  const lScore = Math.max(0, 1 - Math.abs(Math.log(durRatio)) / Math.log(2)) * 30;
  const mScore = melodyCents === null ? 0 : Math.max(0, 1 - melodyCents / 240) * 40;
  return {
    heard: true,
    input: judged.verdict,
    inputMessage: judged.message,
    entryMs,
    entry,
    durRatio: +durRatio.toFixed(2),
    length,
    melodyCents,
    melody,
    confidence,
    score: Math.round(tScore + lScore + mScore),
  };
}
