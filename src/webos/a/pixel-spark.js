// Nexl Link B: compact center, four independent bands and16-unit hand-off gaps.
// Only free ends retreat; center skeleton and16…240 outer bounds remain fixed.
// No external paths, images, fonts, textures or gradients.
// Keep this SVG string byte-identical to nexlos-mark.svg.
export const PIXEL_SPARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="Nexl Link compact B" data-nexlos-mark="pixel-spark" data-nexl-mark="open-link" data-nexl-variant="B-clipped" data-nexl-density="compact-12" data-handoff-gap="16" shape-rendering="crispEdges">
  <!-- Compact B: four separated bands,16-unit hand-offs; same clipped corners and16…240 bounds. -->
  <path data-link-band="red" fill="#EF4B23" d="M33.92,16 105.6,16 105.6,33.92 123.52,33.92 123.52,51.84 141.44,51.84 141.44,87.68 105.6,87.68 105.6,69.76 87.68,69.76 87.68,51.84 51.84,51.84 51.84,98.56 16,98.56 16,33.92 33.92,33.92Z"/>
  <path data-link-band="green" fill="#73B534" d="M240,33.92 240,105.6 222.08,105.6 222.08,123.52 204.16,123.52 204.16,141.44 168.32,141.44 168.32,105.6 186.24,105.6 186.24,87.68 204.16,87.68 204.16,51.84 157.44,51.84 157.44,16 222.08,16 222.08,33.92Z"/>
  <path data-link-band="yellow" fill="#F4D632" d="M222.08,240 150.4,240 150.4,222.08 132.48,222.08 132.48,204.16 114.56,204.16 114.56,168.32 150.4,168.32 150.4,186.24 168.32,186.24 168.32,204.16 204.16,204.16 204.16,157.44 240,157.44 240,222.08 222.08,222.08Z"/>
  <path data-link-band="blue" fill="#438FD2" d="M16,222.08 16,150.4 33.92,150.4 33.92,132.48 51.84,132.48 51.84,114.56 87.68,114.56 87.68,150.4 69.76,150.4 69.76,168.32 51.84,168.32 51.84,204.16 98.56,204.16 98.56,240 33.92,240 33.92,222.08Z"/>
</svg>
`;

// Existing classic-icon API; same geometry at twice the16px logical coordinates.
export const PIXEL_SPARK_16 = `<g data-nexlos-mark="pixel-spark-16" data-nexl-mark="open-link" data-nexl-variant="B-clipped" data-nexl-density="compact-12" data-handoff-gap="16" shape-rendering="crispEdges"><path fill="#EF4B23" d="M4.24,2 13.2,2 13.2,4.24 15.44,4.24 15.44,6.48 17.68,6.48 17.68,10.96 13.2,10.96 13.2,8.72 10.96,8.72 10.96,6.48 6.48,6.48 6.48,12.32 2,12.32 2,4.24 4.24,4.24Z"/><path fill="#73B534" d="M30,4.24 30,13.2 27.76,13.2 27.76,15.44 25.52,15.44 25.52,17.68 21.04,17.68 21.04,13.2 23.28,13.2 23.28,10.96 25.52,10.96 25.52,6.48 19.68,6.48 19.68,2 27.76,2 27.76,4.24Z"/><path fill="#F4D632" d="M27.76,30 18.8,30 18.8,27.76 16.56,27.76 16.56,25.52 14.32,25.52 14.32,21.04 18.8,21.04 18.8,23.28 21.04,23.28 21.04,25.52 25.52,25.52 25.52,19.68 30,19.68 30,27.76 27.76,27.76Z"/><path fill="#438FD2" d="M2,27.76 2,18.8 4.24,18.8 4.24,16.56 6.48,16.56 6.48,14.32 10.96,14.32 10.96,18.8 8.72,18.8 8.72,21.04 6.48,21.04 6.48,25.52 12.32,25.52 12.32,30 4.24,30 4.24,27.76Z"/></g>`;
