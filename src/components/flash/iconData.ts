/* Adesivos de tatuagem (viewBox 100×100), portados do mockup flash sheet. */
function starPath(cx: number, cy: number, n: number, R: number, r: number, rot = -90): string {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const a = (rot + i * 180 / n) * Math.PI / 180, rad = i % 2 ? r : R;
    d += (i ? 'L' : 'M') + (cx + rad * Math.cos(a)).toFixed(1) + ' ' + (cy + rad * Math.sin(a)).toFixed(1);
  }
  return d + 'Z';
}
export const ICONS: Record<string, string> = {
  rose: `<path class="t" d="M48 66 C28 62 14 72 10 90 C30 92 44 84 48 66Z"/><path class="t" d="M52 66 C72 62 86 72 90 90 C70 92 56 84 52 66Z"/><path class="n" d="M50 64 V96"/>
    <circle class="r" cx="50" cy="38" r="30"/><path class="n" d="M50 38 m-5 0 a5 5 0 1 1 5 5 a10 10 0 1 1 -10 -10 a15 15 0 1 1 15 15 a20 20 0 1 1 -20 -20"/><path class="hl" d="M30 26 C34 18 40 14 47 13"/>`,
  dagger: `<path class="w" d="M50 4 L59 54 L50 61 L41 54Z"/><path class="n" d="M50 12 V54"/><path class="y" d="M26 60 Q50 50 74 60 Q50 70 26 60Z"/><path class="k" d="M45 64 H55 L54 82 H46Z"/><circle class="y" cx="50" cy="89" r="7"/><circle class="r" cx="50" cy="89" r="2.5" style="stroke:none"/>`,
  anchor: `<circle class="o" cx="50" cy="16" r="9"/><path class="n" d="M32 32 H68"/><path class="n" d="M50 25 V84"/><path class="n" d="M16 56 C18 78 36 88 50 88 C64 88 82 78 84 56"/><path class="n" d="M16 56 L8 66 M16 56 L26 64 M84 56 L74 64 M84 56 L92 66"/>`,
  heart: `<path class="r" d="M50 88 C12 62 10 32 28 22 C40 16 49 24 50 32 C51 24 60 16 72 22 C90 32 88 62 50 88Z"/><path class="hl" d="M24 38 C26 30 32 27 38 28"/><path class="w" d="M20 54 L80 54 L74 68 L26 68Z" style="display:none"/>`,
  star: `<path class="y" d="${starPath(50, 50, 4, 46, 10)}"/><path class="o" d="${starPath(50, 50, 4, 26, 8, -45)}"/><circle class="k" cx="50" cy="50" r="5"/>`,
  moon: `<path class="y" d="M64 8 C34 10 16 34 22 60 C28 86 58 96 82 82 C58 82 44 62 50 40 C53 28 59 17 64 8Z"/><path class="w" d="${starPath(76, 30, 4, 10, 3)}"/>`,
  coin: `<circle class="y" cx="50" cy="50" r="38"/><circle class="n" cx="50" cy="50" r="27"/><text x="50" y="65" text-anchor="middle" font-size="40">$</text>`,
  bolt: `<path class="y" d="M58 4 L20 56 H44 L36 96 L80 40 H54Z"/><path class="hl" d="M52 14 L32 44"/>`,
  eye: `<path class="w" d="M4 52 C22 24 78 24 96 52 C78 80 22 80 4 52Z"/><circle class="t" cx="50" cy="52" r="17"/><circle class="k" cx="50" cy="52" r="7"/><path class="n" d="M50 8 V18 M22 16 L28 24 M78 16 L72 24 M6 32 L15 36 M94 32 L85 36"/>`,
  machine: `<path class="n" d="M18 36 C6 30 6 14 20 10"/><rect class="t" x="22" y="32" width="46" height="18" rx="4"/><ellipse class="o" cx="35" cy="26" rx="9" ry="7"/><ellipse class="o" cx="56" cy="26" rx="9" ry="7"/><path class="k" d="M30 50 V60 H44 V50Z"/><path class="w" d="M66 38 L92 62 L85 69 L60 45Z"/><path class="n" d="M88 66 L97 80"/>`,
  bottle: `<rect class="k" x="38" y="6" width="24" height="14" rx="3"/><path class="w" d="M40 20 V30 C22 34 20 48 20 60 V80 Q20 92 32 92 H68 Q80 92 80 80 V60 C80 48 78 34 60 30 V20Z"/><path class="k" d="M22 62 H78 V80 Q78 90 68 90 H32 Q22 90 22 80Z"/><rect class="y" x="33" y="42" width="34" height="20" rx="3"/><path class="r" d="M50 46 C45 53 44 57 50 59 C56 57 55 53 50 46Z" style="stroke-width:2"/>`,
  scales: `<path class="n" d="M50 12 V86 M30 88 H70 M14 28 H86"/><circle class="y" cx="50" cy="12" r="6"/><path class="o" d="M14 28 L3 56 H35Z"/><path class="t" d="M86 28 L65 56 H97Z"/>`,
  dice: `<rect class="w" x="12" y="22" width="56" height="56" rx="9" transform="rotate(-12 40 50)"/><g class="k" transform="rotate(-12 40 50)"><circle cx="28" cy="38" r="5"/><circle cx="52" cy="38" r="5"/><circle cx="40" cy="50" r="5"/><circle cx="28" cy="62" r="5"/><circle cx="52" cy="62" r="5"/></g><rect class="r" x="56" y="50" width="34" height="34" rx="7" transform="rotate(14 73 67)"/><g class="w" transform="rotate(14 73 67)"><circle cx="66" cy="60" r="3.4" style="stroke:none"/><circle cx="80" cy="74" r="3.4" style="stroke:none"/></g>`,
  wave: `<path class="t" d="M4 52 Q16 34 28 52 T52 52 T76 52 T100 52 V88 H4Z"/><path class="n" d="M4 70 Q16 54 28 70 T52 70 T76 70 T100 70" style="stroke:var(--white)"/><path class="n" d="M4 36 Q16 20 28 36 T52 36 T76 36 T100 36" opacity=".6"/>`,
  lighthouse: `<path class="y" d="M50 4 L61 16 H39Z"/><rect class="k" x="41" y="16" width="18" height="14"/><path class="w" d="M36 92 L43 30 H57 L64 92Z"/><path class="r" d="M40 62 H60 L62 76 H38Z"/><path class="y" d="M41 22 L8 12 V34Z" style="opacity:.9"/><path class="y" d="M59 22 L92 12 V34Z" style="opacity:.9"/>`,
  scroll: `<path class="w" d="M20 22 H80 V76 H20Z"/><ellipse class="y" cx="20" cy="49" rx="9" ry="27"/><ellipse class="y" cx="80" cy="49" rx="9" ry="27"/><path class="n" d="M32 36 H68 M32 48 H68 M32 60 H56"/>`,
  crown: `<path class="y" d="M12 76 L8 28 L32 50 L50 18 L68 50 L92 28 L88 76Z"/><path class="n" d="M12 76 H88"/><circle class="r" cx="50" cy="60" r="6"/><circle class="t" cx="28" cy="62" r="4"/><circle class="t" cx="72" cy="62" r="4"/>`,
  skull: `<path class="w" d="M20 50 C16 24 34 8 50 8 C66 8 84 24 80 50 C80 60 72 64 68 66 V80 H32 V66 C28 64 20 60 20 50Z"/><circle class="k" cx="36" cy="48" r="9"/><circle class="k" cx="64" cy="48" r="9"/><path class="k" d="M50 56 L44 68 H56Z"/><path class="n" d="M40 80 V70 M50 80 V70 M60 80 V70"/><path class="n" d="M30 20 L38 28" opacity=".5"/>`,
  swallow: `<path class="k" d="M6 38 C26 26 40 40 50 48 C60 36 78 22 96 26 C86 38 72 48 62 56 C70 66 82 76 94 82 C74 84 62 76 52 64 C44 72 32 76 18 70 C26 62 32 56 36 52 C24 50 14 46 6 38Z"/><circle class="w" cx="22" cy="40" r="2.6" style="stroke:none"/><path class="r" d="M40 54 C44 60 48 62 52 62" style="stroke-width:5"/>`,
};

export type IconName = keyof typeof ICONS
