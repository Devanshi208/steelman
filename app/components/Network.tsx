"use client";

import { useEffect, useRef } from "react";

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export default function Network() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const cx = cv.getContext("2d");
    if (!cx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let nodes: Node[] = [];
    const mouse = { x: -999, y: -999 };
    let frame = 0;

    const size = () => {
      cx.setTransform(1, 0, 0, 1, 0, 0);
      cv.width = innerWidth * devicePixelRatio;
      cv.height = innerHeight * devicePixelRatio;
      cv.style.width = innerWidth + "px";
      cv.style.height = innerHeight + "px";
      cx.scale(devicePixelRatio, devicePixelRatio);
    };

    const build = () => {
      const n = Math.min(78, Math.round((innerWidth * innerHeight) / 16000));
      nodes = Array.from({ length: n }, () => ({
        x: Math.random() * innerWidth,
        y: Math.random() * innerHeight,
        vx: (Math.random() - 0.5) * 0.16,
        vy: (Math.random() - 0.5) * 0.16,
        r: Math.random() * 1.5 + 0.7,
      }));
    };

    const onResize = () => {
      size();
      build();
    };
    const onMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    const onLeave = () => {
      mouse.x = mouse.y = -999;
    };

    size();
    build();
    addEventListener("resize", onResize);
    addEventListener("mousemove", onMove);
    addEventListener("mouseleave", onLeave);

    const draw = () => {
      cx.clearRect(0, 0, innerWidth, innerHeight);

      for (const p of nodes) {
        if (!reduce) {
          p.x += p.vx;
          p.y += p.vy;
        }
        if (p.x < 0 || p.x > innerWidth) p.vx *= -1;
        if (p.y < 0 || p.y > innerHeight) p.vy *= -1;
      }

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 138) {
            const near = Math.min(
              Math.hypot(a.x - mouse.x, a.y - mouse.y),
              Math.hypot(b.x - mouse.x, b.y - mouse.y)
            );
            const lift = near < 190 ? (1 - near / 190) * 0.5 : 0;
            cx.strokeStyle = `rgba(176,141,87,${(1 - d / 138) * 0.16 + lift * 0.28})`;
            cx.lineWidth = 0.6;
            cx.beginPath();
            cx.moveTo(a.x, a.y);
            cx.lineTo(b.x, b.y);
            cx.stroke();
          }
        }
      }

      for (const p of nodes) {
        const near = Math.hypot(p.x - mouse.x, p.y - mouse.y);
        const lift = near < 190 ? 1 - near / 190 : 0;
        cx.fillStyle = `rgba(236,231,220,${0.2 + lift * 0.55})`;
        cx.beginPath();
        cx.arc(p.x, p.y, p.r + lift * 1.4, 0, 7);
        cx.fill();
      }

      frame = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("resize", onResize);
      removeEventListener("mousemove", onMove);
      removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return <canvas id="net" ref={ref} aria-hidden="true" />;
}
