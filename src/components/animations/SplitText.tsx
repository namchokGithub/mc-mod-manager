import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ElementType } from "react";
import { gsap } from "gsap";
type TweenVars = gsap.TweenVars;
type TimelineVars = gsap.TimelineVars;
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText as GSAPSplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, GSAPSplitText, useGSAP);

type Effect = "rise" | "fade" | "blur" | "flip" | "pop" | "skew" | "wave";
type Trigger = "view" | "load" | "hover" | "click";
type HoverEffect = "none" | "lift" | "wave";
type SplitType = "chars" | "words" | "lines" | "words, chars";
type StaggerFrom = "start" | "center" | "end" | "edges" | "random";
type Tag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span";

export interface SplitTextProps {
  text: string;
  tag?: Tag;
  className?: string;
  effect?: Effect;
  trigger?: Trigger;
  splitType?: SplitType;
  delay?: number; // milliseconds per character
  duration?: number; // seconds
  ease?: string | ((progress: number) => number);
  staggerFrom?: StaggerFrom;
  mask?: boolean;
  loop?: boolean;
  loopDelay?: number;
  hoverEffect?: HoverEffect;
  color?: string;
  accentColor?: string;
  from?: TweenVars;
  to?: TweenVars;
  threshold?: number;
  rootMargin?: string;
  textAlign?: CSSProperties["textAlign"];
  onLetterAnimationComplete?: () => void;
}

const DEFAULT_FROM: TweenVars = { opacity: 0, y: 40 };
const DEFAULT_TO: TweenVars = { opacity: 1, y: 0 };
const STIFFNESS = 180;
const DAMPING = 19;
const KICK = 0.024;
const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;
const fontsAreLoaded = () =>
  typeof document !== "undefined" &&
  (!document.fonts || document.fonts.status === "loaded");
const waveEase = (t: number) =>
  1 - Math.cos(t * Math.PI * 1.5) * Math.pow(1 - t, 1.2);

function getEffect(
  effect: Effect,
  em: number,
): {
  from: TweenVars;
  to: TweenVars;
  ease: string | ((t: number) => number);
} {
  switch (effect) {
    case "fade":
      return { from: { opacity: 0 }, to: { opacity: 1 }, ease: "power2.inOut" };
    case "blur":
      return {
        from: { opacity: 0, filter: `blur(${Math.round(em * 1.4) / 10}px)` },
        to: { opacity: 1, filter: "blur(0px)" },
        ease: "power2.out",
      };
    case "flip": {
      const setup = {
        transformPerspective: em * 6,
        transformOrigin: "50% 100%",
      };
      return {
        from: { ...setup, opacity: 0, rotationX: -90 },
        to: { ...setup, opacity: 1, rotationX: 0 },
        ease: "power3.out",
      };
    }
    case "pop":
      return {
        from: { opacity: 0, scale: 0 },
        to: { opacity: 1, scale: 1 },
        ease: "back.out(1.6)",
      };
    case "skew":
      return {
        from: {
          transformOrigin: "50% 100%",
          opacity: 0,
          x: -em * 0.4,
          skewX: -24,
        },
        to: { transformOrigin: "50% 100%", opacity: 1, x: 0, skewX: 0 },
        ease: "expo.out",
      };
    case "wave":
      return {
        from: { opacity: 0, y: em * 0.45 },
        to: { opacity: 1, y: 0 },
        ease: waveEase,
      };
    case "rise":
    default:
      return {
        from: { ...DEFAULT_FROM },
        to: { ...DEFAULT_TO },
        ease: "power3.out",
      };
  }
}

type Center = { x: number; y: number };
type Spring = { y: number; v: number };
type Kick = { index: number; velocity: number; at: number };

export default function SplitText({
  text,
  className = "",
  delay = 50,
  duration = 1.25,
  ease,
  splitType = "chars",
  from,
  to,
  threshold = 0.1,
  rootMargin = "-100px",
  textAlign = "left",
  tag = "p",
  staggerFrom = "start",
  mask = false,
  effect = "rise",
  trigger = "view",
  loop = false,
  loopDelay = 1.5,
  hoverEffect = "none",
  color,
  accentColor,
  onLetterAnimationComplete,
}: SplitTextProps) {
  const ref = useRef<HTMLElement | null>(null);
  const completedTextRef = useRef<string | null>(null);
  const onCompleteRef = useRef(onLetterAnimationComplete);
  const liveRef = useRef({ trigger, hoverEffect, accentColor });
  const [fontsLoaded, setFontsLoaded] = useState(fontsAreLoaded);
  const [ready, setReady] = useState(false);

  useIsoLayoutEffect(() => {
    onCompleteRef.current = onLetterAnimationComplete;
    liveRef.current = { trigger, hoverEffect, accentColor };
  });

  useEffect(() => {
    if (fontsLoaded) return;
    let active = true;
    void document.fonts.ready.then(() => {
      if (active) setFontsLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [fontsLoaded]);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || !text || !fontsLoaded) return;
      el.getBoundingClientRect();
      if (!fontsAreLoaded()) {
        setFontsLoaded(false);
        return;
      }

      const finish = () => {
        if (completedTextRef.current === text) return;
        completedTextRef.current = text;
        onCompleteRef.current?.();
      };

      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        setReady(true);
        finish();
        return;
      }

      const startPct = (1 - threshold) * 100;
      const marginMatch = /^(-?\d+(?:\.\d+)?)(px|em|rem|%)?$/.exec(rootMargin);
      const marginValue = parseFloat(marginMatch?.[1] ?? "0");
      const marginUnit = marginMatch?.[2] || "px";
      const sign =
        marginValue === 0
          ? ""
          : marginValue < 0
            ? `-=${Math.abs(marginValue)}${marginUnit}`
            : `+=${marginValue}${marginUnit}`;
      const start = `top ${startPct}%${sign}`;
      const unit: "chars" | "words" | "lines" = splitType.includes("chars")
        ? "chars"
        : splitType.includes("words")
          ? "words"
          : "lines";

      const em = parseFloat(getComputedStyle(el).fontSize) || 16;
      const custom = from !== undefined || to !== undefined;
      const look = getEffect(effect, em);
      const fromVars: TweenVars = custom
        ? { ...(from || DEFAULT_FROM) }
        : look.from;
      const toVars: TweenVars = custom ? { ...(to || DEFAULT_TO) } : look.to;
      const easing = ease || (custom ? "power3.out" : look.ease);
      const settle = custom ? "willChange" : "transform,filter,willChange";
      const exit = Math.max(0.35, duration * 0.55);

      let pieces: HTMLElement[] = [];
      let movers: HTMLElement[] = [];
      let order = gsap.utils.distribute({
        each: delay / 1000,
        from: staggerFrom,
      });
      let revealed = completedTextRef.current === text;
      let intro: gsap.core.Timeline | null = null;
      let busy: gsap.core.Timeline | null = null;
      let queued: gsap.core.Tween | null = null;
      let raf = 0;
      let last = 0;
      let centers: Center[] | null = null;
      const lift = em * 0.2;
      const springs: Spring[] = [];
      const kicks: Kick[] = [];
      const pointer = { x: 0, y: 0, inside: false };

      const reveal = (initial: boolean, vars?: TimelineVars) => {
        const accent = liveRef.current.accentColor;
        const tl = gsap.timeline(vars);
        tl.fromTo(
          pieces,
          { ...fromVars, willChange: "transform, opacity" },
          {
            ...toVars,
            duration,
            ease: easing,
            stagger: order,
            immediateRender: initial,
          },
          0,
        );
        if (accent) {
          tl.fromTo(
            pieces,
            { color: accent },
            {
              color: getComputedStyle(el).color,
              duration: duration * 0.7,
              ease: "power1.inOut",
              stagger: order,
              immediateRender: initial,
            },
            duration * 0.3,
          );
        }
        tl.set(pieces, { clearProps: accent ? `${settle},color` : settle });
        return tl;
      };

      const conceal = () => {
        const accent = liveRef.current.accentColor;
        const tl = gsap.timeline();
        tl.fromTo(
          pieces,
          { ...toVars, willChange: "transform, opacity" },
          {
            ...fromVars,
            duration: exit,
            ease: "power2.in",
            stagger: order,
            immediateRender: false,
          },
          0,
        );
        if (accent) {
          tl.to(
            pieces,
            {
              color: accent,
              duration: exit,
              ease: "power1.in",
              stagger: order,
            },
            0,
          );
        }
        return tl;
      };

      const queue = () => {
        queued?.kill();
        queued = loop ? gsap.delayedCall(loopDelay, cycle) : null;
      };

      const cycle = () => {
        if (busy || !revealed || pieces.length === 0) return;
        queued?.kill();
        queued = null;
        busy = gsap
          .timeline({
            onComplete: () => {
              busy = null;
              queue();
            },
          })
          .add(conceal(), 0)
          .add(reveal(false), exit);
      };

      const measure = () => {
        const box = el.getBoundingClientRect();
        centers = movers.map((node, i) => {
          const rect = node.getBoundingClientRect();
          return {
            x: rect.left + rect.width / 2 - box.left,
            y: rect.top + rect.height / 2 - box.top - (springs[i]?.y || 0),
          };
        });
      };

      const tick = (now: number) => {
        raf = 0;
        const dt = Math.min(0.032, Math.max(0.001, (now - last) / 1000));
        last = now;
        const spots =
          liveRef.current.hoverEffect === "lift" && pointer.inside && revealed
            ? centers
            : null;
        const radius = em * 1.15;
        let moving = false;
        for (let k = kicks.length - 1; k >= 0; k--) {
          const kick = kicks[k];
          if (!kick || now < kick.at) continue;
          const spring = springs[kick.index];
          if (spring) spring.v -= kick.velocity;
          kicks.splice(k, 1);
        }
        movers.forEach((node, i) => {
          const spring = springs[i] || (springs[i] = { y: 0, v: 0 });
          const spot = spots?.[i];
          let target = 0;
          if (spot) {
            const dx = (spot.x - pointer.x) / radius;
            const dy = (spot.y - pointer.y) / (radius * 1.4);
            target = -lift * Math.exp(-(dx * dx + dy * dy) * 0.5);
          }
          spring.v +=
            (STIFFNESS * (target - spring.y) - DAMPING * spring.v) * dt;
          spring.y += spring.v * dt;
          if (Math.abs(target - spring.y) < 0.02 && Math.abs(spring.v) < 0.05) {
            spring.y = target;
            spring.v = 0;
          } else {
            moving = true;
          }
          node.style.translate =
            Math.abs(spring.y) > 0.01 ? `0 ${spring.y.toFixed(2)}px` : "";
        });
        if (moving || kicks.length) raf = requestAnimationFrame(tick);
      };

      const wake = () => {
        if (raf) return;
        last = performance.now();
        raf = requestAnimationFrame(tick);
      };

      const locate = (event: PointerEvent) => {
        const box = el.getBoundingClientRect();
        pointer.x = event.clientX - box.left;
        pointer.y = event.clientY - box.top;
      };

      const onEnter = (event: PointerEvent) => {
        locate(event);
        pointer.inside = true;
        if (!revealed) return;
        const live = liveRef.current;
        if (live.trigger === "hover") cycle();
        if (live.hoverEffect === "none") return;
        measure();
        if (live.hoverEffect === "wave" && centers) {
          const now = performance.now();
          const speed = em * 9;
          const velocity = (em * 0.16) / KICK;
          centers.forEach((center, index) => {
            kicks.push({
              index,
              velocity,
              at: now + (Math.abs(center.x - pointer.x) / speed) * 1000,
            });
          });
        }
        wake();
      };

      const onMove = (event: PointerEvent) => {
        locate(event);
        pointer.inside = true;
        if (!revealed || liveRef.current.hoverEffect !== "lift") return;
        if (!centers) measure();
        wake();
      };

      const onLeave = () => {
        pointer.inside = false;
        wake();
      };

      const onClick = () => {
        if (liveRef.current.trigger === "click") cycle();
      };

      const splitInstance = new GSAPSplitText(el, {
        type: splitType,
        smartWrap: true,
        autoSplit: splitType === "lines",
        mask: mask ? unit : undefined,
        linesClass: "split-line",
        wordsClass: "split-word",
        charsClass: "split-char",
        reduceWhiteSpace: false,
        onSplit: (self) => {
          pieces = ([self[unit], self.chars, self.words, self.lines].find(
            (list) => list.length,
          ) || []) as HTMLElement[];
          const masks = self.masks as HTMLElement[] | undefined;
          movers = mask && masks?.length === pieces.length ? masks : pieces;
          order = gsap.utils.distribute({
            each: delay / 1000,
            from: staggerFrom,
          });
          centers = null;
          springs.length = 0;
          kicks.length = 0;
          if (busy && busy !== intro) {
            busy.kill();
            busy = null;
          }
          if (revealed) return;
          intro = reveal(true, {
            scrollTrigger:
              trigger === "load"
                ? undefined
                : {
                    trigger: el,
                    start,
                    once: true,
                    fastScrollEnd: true,
                    anticipatePin: 0.4,
                  },
            onComplete: () => {
              revealed = true;
              intro = null;
              busy = null;
              finish();
              queue();
            },
          });
          busy = intro;
          return intro;
        },
      });

      setReady(true);
      if (revealed) queue();
      el.addEventListener("pointerenter", onEnter);
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerleave", onLeave);
      el.addEventListener("click", onClick);

      return () => {
        cancelAnimationFrame(raf);
        queued?.kill();
        busy?.kill();
        el.removeEventListener("pointerenter", onEnter);
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerleave", onLeave);
        el.removeEventListener("click", onClick);
        movers.forEach((node) => {
          node.style.translate = "";
        });
        ScrollTrigger.getAll().forEach((st) => {
          if (st.trigger === el) st.kill();
        });
        splitInstance.revert();
      };
    },
    {
      dependencies: [
        text,
        delay,
        duration,
        ease,
        splitType,
        JSON.stringify(from),
        JSON.stringify(to),
        threshold,
        rootMargin,
        staggerFrom,
        mask,
        effect,
        trigger,
        loop,
        loopDelay,
        fontsLoaded,
      ],
      scope: ref,
      revertOnUpdate: true,
    },
  );

  const TagComponent = tag as ElementType;
  const clip =
    hoverEffect === "none" &&
    (from !== undefined ||
      to !== undefined ||
      effect === "rise" ||
      effect === "fade");

  return (
    <TagComponent
      key={text}
      ref={ref}
      className={`split-parent ${className}`}
      style={{
        textAlign,
        overflow: clip ? "hidden" : "visible",
        display: "inline-block",
        whiteSpace: "normal",
        wordWrap: "break-word",
        color,
        cursor: trigger === "click" ? "pointer" : undefined,
        visibility: ready ? undefined : "hidden",
      }}>
      {text}
    </TagComponent>
  );
}
