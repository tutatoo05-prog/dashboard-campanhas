/** Textura de papel: ruído gerado em SVG e publicado como --grain (usado em flash.css). */
export function installPaperGrain(): void {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" seed="4"/>' +
    '<feColorMatrix values="0 0 0 0 .35  0 0 0 0 .28  0 0 0 0 .18  0 0 0 .55 0"/></filter><rect width="300" height="300" filter="url(#n)"/></svg>'
  document.documentElement.style.setProperty('--grain', `url("data:image/svg+xml,${encodeURIComponent(svg)}")`)
}
