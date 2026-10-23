"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const LIT = ".card, .card-raised, .ai-draft, .theme-feature";
const BUTTONS = ".btn, .btn-primary, .btn-secondary, .btn-ghost, .btn-accent, .btn-danger";
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/** Big standalone figures count up from zero when a page opens. The text node ends exactly as React rendered it. */
function countUp(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>("span, div, p, b, strong, dd").forEach((el) => {
    const node = el.firstChild;
    if (!node || el.childNodes.length !== 1 || node.nodeType !== Node.TEXT_NODE) return;
    const text = node.nodeValue ?? "";
    if (!/^\d{1,5}$/.test(text.trim()) || Number(text) < 2 || parseFloat(getComputedStyle(el).fontSize) < 20) return;
    const target = Number(text);
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 900);
      node.nodeValue = p < 1 ? String(Math.round(ease(p) * target)) : text;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

/**
 * The motion layer: page entrances, pointer light on cards, tilting feature cards, magnetic primary buttons,
 * press ripples, reading progress and a background that follows the pointer. Purely decorative; it changes no
 * content or behaviour, and does nothing for people who prefer reduced motion.
 */
export function Motion() {
  const path = usePathname();

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const main = document.getElementById("main");
    if (!main) return;
    main.classList.remove("af-enter");
    void main.offsetWidth; // restart the cascade on every navigation
    main.classList.add("af-enter");
    countUp(main);
  }, [path]);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const make = (cls: string) => { const el = document.createElement("div"); el.className = cls; el.setAttribute("aria-hidden", "true"); document.body.appendChild(el); return el; };
    const progress = make("af-progress");
    const aurora = make("af-aurora");
    const halo = make("af-halo");

    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - innerHeight;
        progress.style.setProperty("--af-p", String(max > 0 ? scrollY / max : 0));
      });
    };

    // The page halo trails the pointer slightly, which reads as weight rather than lag.
    let hx = innerWidth / 2, hy = innerHeight / 3, tx = hx, ty = hy, haloFrame = 0;
    const glide = () => {
      hx += (tx - hx) * 0.12; hy += (ty - hy) * 0.12;
      halo.style.transform = `translate3d(${hx}px, ${hy}px, 0)`;
      haloFrame = Math.abs(tx - hx) + Math.abs(ty - hy) > 0.5 ? requestAnimationFrame(glide) : 0;
    };

    let lit: HTMLElement | null = null;
    let magnet: HTMLElement | null = null;
    const release = () => {
      if (lit) { lit.classList.remove("af-lit"); lit.style.removeProperty("--af-rx"); lit.style.removeProperty("--af-ry"); lit = null; }
      if (magnet) { magnet.style.removeProperty("--af-tx"); magnet.style.removeProperty("--af-ty"); magnet = null; }
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      tx = e.clientX; ty = e.clientY;
      halo.classList.add("on");
      if (!haloFrame) haloFrame = requestAnimationFrame(glide);

      const t = e.target as Element;
      const card = t.closest<HTMLElement>(LIT);
      if (card !== lit) { release(); lit = card; card?.classList.add("af-lit"); }
      if (card) {
        const r = card.getBoundingClientRect();
        const x = e.clientX - r.left, y = e.clientY - r.top;
        card.style.setProperty("--mx", `${x}px`);
        card.style.setProperty("--my", `${y}px`);
        if (card.classList.contains("theme-feature")) {
          card.style.setProperty("--af-rx", `${((r.height / 2 - y) / r.height) * 7}deg`);
          card.style.setProperty("--af-ry", `${((x - r.width / 2) / r.width) * 9}deg`);
        }
      }
      const btn = t.closest<HTMLElement>(".btn-primary");
      if (btn !== magnet) { magnet?.style.removeProperty("--af-tx"); magnet?.style.removeProperty("--af-ty"); magnet = btn; }
      if (btn && !(btn as HTMLButtonElement).disabled) {
        const r = btn.getBoundingClientRect();
        btn.style.setProperty("--af-tx", `${((e.clientX - r.left) / r.width - 0.5) * 6}px`);
        btn.style.setProperty("--af-ty", `${((e.clientY - r.top) / r.height - 0.5) * 5}px`);
      }
    };
    const onLeave = () => { release(); halo.classList.remove("on"); };
    const onDown = (e: PointerEvent) => {
      const btn = (e.target as Element).closest<HTMLElement>(BUTTONS);
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      btn.style.setProperty("--rx", `${e.clientX - r.left}px`);
      btn.style.setProperty("--ry", `${e.clientY - r.top}px`);
      btn.classList.remove("af-ripple");
      void btn.offsetWidth;
      btn.classList.add("af-ripple");
      btn.addEventListener("animationend", () => btn.classList.remove("af-ripple"), { once: true });
    };

    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll, { passive: true });
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerdown", onDown, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    onScroll();
    return () => {
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerdown", onDown);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(frame); cancelAnimationFrame(haloFrame);
      release();
      progress.remove(); aurora.remove(); halo.remove();
    };
  }, []);

  return null;
}
