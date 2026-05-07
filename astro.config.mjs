// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  site: "https://renaa.github.io",
  base: "/meeting-booking",
  integrations: [react()],
});