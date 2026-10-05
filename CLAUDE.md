# Project instructies voor Claude Code

## Git workflow

Dit project werkt met **GitHub Flow**. Vercel deployt automatisch vanuit `main`.
Nooit rechtstreeks committen of pushen naar `main`.

### Dagelijkse werkwijze

1. Begin altijd met de laatste versie van main:
   ```bash
   git checkout main
   git pull
   ```

2. Maak een nieuwe branch aan per taak:
   ```bash
   git checkout -b feature/naam-van-taak
   ```

3. Commit regelmatig zodra iets werkend is:
   ```bash
   git add .
   git commit -m "Korte beschrijving van wat je deed"
   ```

4. Push naar GitHub:
   ```bash
   git push -u origin feature/naam-van-taak
   # Daarna gewoon: git push
   ```

5. Open een Pull Request op GitHub. Een reviewer is optioneel — je mag zelf mergen als je zeker bent van de wijzigingen.

6. Merge naar main → Vercel deployt automatisch.

7. Ruim de branch op na merge:
   ```bash
   git checkout main
   git pull
   git branch -d feature/naam-van-taak
   ```

### Branch naamgeving

| Prefix | Wanneer |
|---|---|
| `feature/` | Nieuwe functionaliteit bouwen |
| `fix/` | Bug oplossen |
| `style/` | Visuele aanpassingen zonder logica |

Voorbeelden: `feature/login`, `fix/navbar-bug`, `style/homepage`

### Commit messages

Schrijf korte, beschrijvende messages in de gebiedende wijs of tegenwoordige tijd:

- Goed: `Voeg loginpagina toe`, `Herstel validatie op contactformulier`
- Slecht: `fix`, `changes`, `wip`

### Conflicten oplossen

Als GitHub een conflict meldt bij je PR:
```bash
git checkout feature/jouw-branch
git pull origin main        # haal de laatste main binnen
# los conflicten op in je editor
git add .
git commit -m "Los merge conflict op"
git push
```

---

## Richtlijnen voor Claude Code

- Herinner me eraan een nieuwe branch aan te maken als ik wijzigingen maak zonder actieve feature branch
- Stel voor te committen wanneer een afgeronde stap klaar lijkt
- Waarschuw me als ik op `main` sta en iets wil aanpassen
- Gebruik duidelijke commit messages op basis van wat er net gedaan is
- Vraag bevestiging voor je pusht naar `main`

## Verbruik in de gaten houden

Dit project draait op de gratis plannen van Supabase en Vercel. In oktober
2026 liepen drie vaten over, allemaal door hetzelfde soort oorzaak: werk dat
zich herhaalt of per byte door onze eigen servers gaat.

Wat het veroorzaakte, als waarschuwing voor volgende keer:

- een pagina die elke 20 seconden de hele maand ophaalde — 217 kB per keer,
  39 MB per uur per openstaand tabblad
- uploads die door een eigen route liepen in plaats van rechtstreeks naar
  Drive — elke geuploade byte telde mee
- video die via een eigen function streamde in plaats van vanaf Google

Vuistregel bij een wijziging: alles wat op een timer staat, alles wat per rij
of per tegel een verzoek doet, en alles waar bestandsbytes doorheen gaan is
waar het verbruik ontstaat. De rest valt in het niet.

Om te zien of iets ontspoort:

```bash
npm run usage-audit
```

Dat toont elke terugkerende timer in `src/`, hoe zwaar de grote queries zijn,
en hoe hard de tabellen groeien. De dashboards van Supabase en Vercel blijven
de waarheid — dit script wijst de oorzaak aan, niet het gevolg.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
