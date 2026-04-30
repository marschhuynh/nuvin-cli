import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Text, Box } from 'ink';
import chalk from 'chalk';

const BRIGHTNESS_BOOST_FACTOR = 0.5;
const PULSE_SIGMA_DIVISOR = 3;
const MIN_SIGMA = 1.2;
const DEFAULT_FALLBACK_COLOR = '#ffffff';

type Props = {
  text: string;
  speedMs?: number;
  span?: number;
  stops?: string[];
  disabled?: boolean;
};

export const GradientRunText: React.FC<Props> = ({
  text,
  speedMs = 160,
  span = 2,
  stops = ['#FF5F6D', '#f28715', '#FFC371'],
  disabled = false,
}) => {
  const chars = useMemo(() => [...text], [text]);
  const [tick, setTick] = useState(0);

  const palette = useMemo(() => makeGradient(stops, chars.length), [stops, chars.length]);

  useEffect(() => {
    if (disabled) return;
    const startTime = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setTick((elapsed / speedMs) % chars.length);
    }, 16); // ~60fps updates
    return () => clearInterval(id);
  }, [chars.length, speedMs, disabled]);

  const styledChars = useMemo(() => {
    return chars.map((ch, i) => {
      if (disabled) {
        return { char: ch, style: chalk.hex(palette[i])(ch) };
      }

      const dist = wrappedDistance(i, tick, chars.length);
      const intensity = smoothPulse(dist, span);
      const baseHex = palette[i];
      const colorHex = liftBrightness(baseHex, intensity * BRIGHTNESS_BOOST_FACTOR);
      const style = chalk.hex(colorHex);
      const styledChar = intensity > 0.6 ? style.bold(ch) : style(ch);

      return { char: ch, style: styledChar };
    });
  }, [chars, tick, palette, span, disabled]);

  return (
    <Box flexDirection="row">
      {styledChars.map((item, i) => (
        <Text key={`${item.char}-${i}`}>{item.style}</Text>
      ))}
    </Box>
  );
};

function makeGradient(stops: string[], n: number): string[] {
  if (stops.length === 0) return Array(Math.max(1, n)).fill(DEFAULT_FALLBACK_COLOR);
  if (n <= 1) return [stops[stops.length - 1] ?? DEFAULT_FALLBACK_COLOR];

  const segments = stops.length - 1;
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const seg = Math.min(segments - 1, Math.floor(t * segments));
    const localT = (t - seg / segments) * segments;
    return mixHex(stops[seg], stops[seg + 1], clamp01(localT));
  });
}

function mixHex(a: string, b: string, t: number): string {
  const safeA = a || DEFAULT_FALLBACK_COLOR;
  const safeB = b || DEFAULT_FALLBACK_COLOR;
  const [ar, ag, ab] = hexToRgb(safeA);
  const [br, bg, bb] = hexToRgb(safeB);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const blueValue = Math.round(ab + (bb - ab) * t);
  return rgbToHex(r, g, blueValue);
}

function liftBrightness(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const R = Math.round(r + (255 - r) * amount);
  const G = Math.round(g + (255 - g) * amount);
  const B = Math.round(b + (255 - b) * amount);
  return rgbToHex(R, G, B);
}

function hexToRgb(h: string): [number, number, number] {
  if (!h || typeof h !== 'string') {
    console.warn(`Invalid hex color: ${h}, falling back to white`);
    return [255, 255, 255];
  }
  const cleaned = h.replace('#', '');
  if (cleaned.length !== 6) {
    console.warn(`Invalid hex color: ${h}, falling back to white`);
    return [255, 255, 255];
  }
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);

  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    console.warn(`Invalid hex color: ${h}, falling back to white`);
    return [255, 255, 255];
  }

  return [r, g, b];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.min(255, Math.max(0, v)).toString(16).padStart(2, '0')).join('')}`;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function wrappedDistance(i: number, head: number, n: number): number {
  const d = Math.abs(i - head);
  return Math.min(d, n - d);
}

function smoothPulse(d: number, span: number): number {
  const sigma = Math.max(MIN_SIGMA, span / PULSE_SIGMA_DIVISOR);
  return Math.exp(-(d * d) / (2 * sigma * sigma));
}
