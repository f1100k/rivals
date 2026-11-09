import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { queueAlerts, type QueueAlert, type QueueAlertState } from "@/lib/queue-alerts";
import type { GkState } from "@/lib/inhouse.functions";

const messages: Record<QueueAlert, string> = {
  searching: "Você entrou na fila!",
  "player-joined": "Mais um jogador entrou na fila!",
  matched: "10 jogadores reunidos! Os goleiros vão escolher os times.",
  "draft-complete": "Times completos! A sala da partida está liberada.",
};

function playPing(ctx: AudioContext, frequency: number, start: number, volume = 0.12) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + 0.36);
}

function playAlertSound(ctx: AudioContext, alert: QueueAlert) {
  const now = ctx.currentTime;
  if (alert === "player-joined") {
    // Single soft ping, slightly higher than the full chime.
    playPing(ctx, 987.77, now, 0.09);
    return;
  }
  if (alert === "matched") {
    // Tenth player: loud, bright chime so everyone notices the queue is full.
    [659.25, 830.61, 987.77, 1318.51].forEach((frequency, index) =>
      playPing(ctx, frequency, now + index * 0.11, 0.3),
    );
    return;
  }
  [523.25, 659.25, 783.99].forEach((frequency, index) => playPing(ctx, frequency, now + index * 0.13));
}

export function useQueueAlerts(state: GkState | undefined) {
  const previous = useRef<QueueAlertState | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);

  useEffect(() => {
    const unlock = () => {
      try {
        if (!audio.current) audio.current = new AudioContext();
        void audio.current.resume().catch(() => {});
      } catch { /* Sound may be unavailable on this browser. */ }
    };
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
      void audio.current?.close().catch(() => {});
      audio.current = null;
    };
  }, []);

  useEffect(() => {
    if (!state) return;
    const queueCount = state.counts.total;
    const current: QueueAlertState = {
      queued: Boolean(state.queue),
      matchId: state.match?.id ?? null,
      status: state.match?.status ?? null,
      queueCount,
    };
    const alerts = queueAlerts(previous.current, current);
    previous.current = current;
    alerts.forEach((alert) => toast.success(messages[alert], { duration: 7000 }));
    const ctx = audio.current;
    if (!alerts.length || !soundEnabled || !ctx || ctx.state !== "running") return;
    alerts.forEach((alert) => playAlertSound(ctx, alert));
  }, [state, soundEnabled]);

  return { soundEnabled, toggleSound: () => setSoundEnabled((value) => !value) };
}
