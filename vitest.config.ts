import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// Alleen de pure logica uit src/lib. Geen jsdom, geen React-renderer: wat hier
// getest wordt zijn functies zonder scherm eromheen, en die draaien in node.
// Zie src/lib/__tests__ voor wat er wél en niet onder valt.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
})
