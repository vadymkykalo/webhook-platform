import { useEffect, useRef } from 'react';

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

interface Particle {
  from: number;
  to: number;
  t: number;
  speed: number;
}

interface Ripple {
  x: number;
  y: number;
  r: number;
  maxR: number;
  alpha: number;
}

export default function NetworkBackground({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let animId = 0;
    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.offsetWidth;
      h = canvas.offsetHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    // --- Palette (violet-500 family) ---
    const COL = '139,92,246';
    const COL_LIGHT = '196,181,253';

    // --- Nodes ---
    const MAX_DIST = 180;
    const MAX_PARTICLES = 25;
    const nodeCount = Math.max(30, Math.min(60, Math.floor((w * h) / 18000)));

    const nodes: Node[] = Array.from({ length: nodeCount }, () => ({
      x: Math.random() * (w || 1200),
      y: Math.random() * (h || 700),
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 1.5 + 0.5,
    }));

    const particles: Particle[] = [];
    const ripples: Ripple[] = [];

    // --- Main loop ---
    const draw = () => {
      ctx.clearRect(0, 0, w, h);

      // Move nodes (wrap around edges)
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < -30) n.x += w + 60;
        if (n.x > w + 30) n.x -= w + 60;
        if (n.y < -30) n.y += h + 60;
        if (n.y > h + 30) n.y -= h + 60;
      }

      // Collect edges
      const edges: [number, number, number][] = [];
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < MAX_DIST) edges.push([i, j, d]);
        }
      }

      // Draw edges (thin subtle lines)
      for (const [i, j, d] of edges) {
        const a = (1 - d / MAX_DIST) * 0.12;
        ctx.strokeStyle = `rgba(${COL},${a})`;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(nodes[i].x, nodes[i].y);
        ctx.lineTo(nodes[j].x, nodes[j].y);
        ctx.stroke();
      }

      // Spawn flowing particles on random edges
      if (edges.length > 0 && particles.length < MAX_PARTICLES && Math.random() < 0.07) {
        const [a, b] = edges[Math.floor(Math.random() * edges.length)];
        const flip = Math.random() > 0.5;
        particles.push({
          from: flip ? a : b,
          to: flip ? b : a,
          t: 0,
          speed: 0.005 + Math.random() * 0.012,
        });
      }

      // Draw & update particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.t += p.speed;

        if (p.t >= 1) {
          // Ripple burst at destination
          ripples.push({
            x: nodes[p.to].x,
            y: nodes[p.to].y,
            r: 0,
            maxR: 10 + Math.random() * 8,
            alpha: 0.45,
          });
          particles.splice(i, 1);
          continue;
        }

        const src = nodes[p.from];
        const dst = nodes[p.to];
        const x = src.x + (dst.x - src.x) * p.t;
        const y = src.y + (dst.y - src.y) * p.t;

        // Bright line segment behind particle (energy trail)
        const segStart = Math.max(0, p.t - 0.1);
        const sx = src.x + (dst.x - src.x) * segStart;
        const sy = src.y + (dst.y - src.y) * segStart;
        const trailGrad = ctx.createLinearGradient(sx, sy, x, y);
        trailGrad.addColorStop(0, `rgba(${COL},0)`);
        trailGrad.addColorStop(1, `rgba(${COL},0.2)`);
        ctx.strokeStyle = trailGrad;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(x, y);
        ctx.stroke();

        // Outer glow
        const grd = ctx.createRadialGradient(x, y, 0, x, y, 8);
        grd.addColorStop(0, `rgba(${COL},0.55)`);
        grd.addColorStop(0.5, `rgba(${COL},0.1)`);
        grd.addColorStop(1, `rgba(${COL},0)`);
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fill();

        // Bright core
        ctx.fillStyle = `rgba(${COL_LIGHT},0.9)`;
        ctx.beginPath();
        ctx.arc(x, y, 1.8, 0, Math.PI * 2);
        ctx.fill();

        // Dot trail
        for (let k = 1; k <= 3; k++) {
          const tp = p.t - k * p.speed * 2.5;
          if (tp < 0) continue;
          const tx = src.x + (dst.x - src.x) * tp;
          const ty = src.y + (dst.y - src.y) * tp;
          ctx.fillStyle = `rgba(${COL_LIGHT},${0.35 - k * 0.1})`;
          ctx.beginPath();
          ctx.arc(tx, ty, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Ripples (pulse rings at delivery points)
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rip = ripples[i];
        rip.r += 0.6;
        rip.alpha *= 0.95;
        if (rip.r >= rip.maxR || rip.alpha < 0.01) {
          ripples.splice(i, 1);
          continue;
        }
        ctx.strokeStyle = `rgba(${COL},${rip.alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(rip.x, rip.y, rip.r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Draw node dots
      for (const n of nodes) {
        ctx.fillStyle = `rgba(${COL},0.2)`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
    />
  );
}
