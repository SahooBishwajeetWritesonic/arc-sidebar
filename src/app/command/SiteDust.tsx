import { useEffect, useRef, type RefObject } from 'react';
import { hexToRgb, mix, rgbToHex } from '@/app/theme/color';
import styles from './command.module.css';

interface Speck {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  life: number;
  age: number;
  color: string;
}

/** Specks start this far inside the card, so they come out from behind it. */
const INSET = 6;
const SPACING = 5;
const MAX = 280;
/** Velocity kept per second: they drift out and slow. */
const DRAG = 0.04;

const random = (from: number, to: number) => from + Math.random() * (to - from);

function speck(left: number, top: number, width: number, height: number, color: string): Speck {
  const along = Math.random() * 2 * (width + height);
  let x: number;
  let y: number;
  let nx = 0;
  let ny = 0;
  if (along < width) [x, y, ny] = [left + along, top + INSET, -1];
  else if (along < width + height) [x, y, nx] = [left + width - INSET, top + along - width, 1];
  else if (along < 2 * width + height)
    [x, y, ny] = [left + width - (along - width - height), top + height - INSET, 1];
  else [x, y, nx] = [left + INSET, top + height - (along - 2 * width - height), -1];
  const speed = random(70, 190);
  const drift = random(-35, 35);
  const white = mix(hexToRgb(color), [255, 255, 255], random(0, 0.3));
  return {
    x,
    y,
    vx: nx * speed + (ny ? drift : 0),
    vy: ny * speed + (nx ? drift : 0),
    radius: random(1, 2.6),
    life: random(0.55, 1),
    age: 0,
    color: rgbToHex(white),
  };
}

/** Arc's Site Search burst: dust from behind the card's whole edge; each `burst` sets one off. */
export function SiteDust({
  burst,
  color,
  card,
}: {
  burst: number;
  color: string | undefined;
  card: RefObject<HTMLElement | null>;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    const box = card.current;
    if (!burst || !color || !element || !box) return;
    const area = element.getBoundingClientRect();
    const rect = box.getBoundingClientRect();
    const scale = devicePixelRatio || 1;
    element.width = area.width * scale;
    element.height = area.height * scale;
    const context = element.getContext('2d')!;
    context.scale(scale, scale);
    const [left, top] = [rect.left - area.left, rect.top - area.top];
    const count = Math.min(MAX, Math.round((2 * (rect.width + rect.height)) / SPACING));
    const specks = Array.from({ length: count }, () =>
      speck(left, top, rect.width, rect.height, color),
    );

    let last = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const elapsed = Math.min(0.05, (now - last) / 1000);
      last = now;
      context.clearRect(0, 0, area.width, area.height);
      const slow = DRAG ** elapsed;
      let alive = 0;
      for (const each of specks) {
        each.age += elapsed;
        if (each.age >= each.life) continue;
        alive++;
        each.vx *= slow;
        each.vy *= slow;
        each.x += each.vx * elapsed;
        each.y += each.vy * elapsed;
        const done = each.age / each.life;
        context.globalAlpha = (1 - done) ** 2;
        context.fillStyle = each.color;
        context.beginPath();
        context.arc(each.x, each.y, each.radius * (1 - done * 0.4), 0, Math.PI * 2);
        context.fill();
      }
      if (alive) frame = requestAnimationFrame(step);
    });
    return () => {
      cancelAnimationFrame(frame);
      context.clearRect(0, 0, area.width, area.height);
    };
  }, [burst, color, card]);
  return <canvas ref={canvas} className={styles.dust} aria-hidden />;
}
