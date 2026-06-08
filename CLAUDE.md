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
