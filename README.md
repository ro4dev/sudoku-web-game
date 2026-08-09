# Sudoku Web Game

App de sudoku lista para jugar: generador con solución única, 3 niveles de dificultad, modo notas, pistas, deshacer, temporizador y límite de 3 errores.

## Jugar

Disponible en GitHub Pages: https://ro4dev.github.io/sudoku-web-game/

## Funcionalidades

- **Generador/validador**: cada puzzle se genera con backtracking y se verifica que tenga solución única.
- **Niveles**: Fácil (42 pistas), Medio (34), Difícil (27), Imposible (~24).
- **Modo notas**: rellena candidatos por celda (tecla `N` o checkbox).
- **Pistas**: `H` o botón Pista rellena la celda seleccionada.
- **Deshacer**: `Ctrl/Cmd+Z` o botón.
- **Temporizador** y contador de errores (máximo 3).
- **Atajos de teclado**: `1-9` números, `Supr/Backspace` borrar, flechas para navegar.

## Desarrollo local

Abre `index.html` en el navegador o sirve la carpeta:

```sh
python3 -m http.server 8000
```

## Deploy

El push a `main` dispara el workflow `.github/workflows/deploy.yml` y publica en GitHub Pages.
