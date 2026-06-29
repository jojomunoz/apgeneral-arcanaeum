# Arcanaeum · A&P General — Skyrim Study Edition 🐉

Herramienta de estudio para el examen **A&P General** (Airframe & Powerplant) con
**flashcards + repetición espaciada (SRS)** y temática Elder Scrolls / Skyrim.
100% web estático, sin backend. Pensado para un solo usuario (sin login).

## Qué hace
- **664 flashcards** en 12 mazos por tema (Electricidad, Planos, Peso y balance, NDT,
  Matemáticas, Regulaciones, etc.). Contenido en inglés (el material real del examen).
- **Dorso con explicación detallada** + figura cuando aplica (73 imágenes incluidas).
- **Dos modos de frente:** ver opciones (como el examen) o recall puro.
- **Repetición espaciada (SM-2 simplificado):** lo que fallás vuelve hoy; lo que dominás
  se espacia (1→3→7→17… días). Auto-calificación: *No lo sé / Casi / ¡Lo sé!*.
- **Progreso y motivación:** nivel "Dovahkiin" + XP, racha de días, maestría por mazo,
  y un **medidor de "¿Listo para el examen?"** (listo con ≥85% global y cada mazo ≥70%).
- **Guardado automático** en el navegador + **exportar/importar** un archivo de respaldo.
- Audio nórdico sintetizado (sin copyright), con botón de mute.

## Archivos
| Archivo | Rol |
|---|---|
| `index.html` | Estructura y pantallas (menú / estudio / resumen) |
| `styles.css` | Estética Skyrim (aurora, pergamino, runas) |
| `data/cards.js` | 664 cartas + clave de respuestas + metadatos de mazos |
| `srs.js` | Repetición espaciada + persistencia (localStorage) |
| `audio.js` | Sonidos sintetizados (Web Audio) |
| `app.js` | Lógica de UI |
| `img/` | 73 figuras de referencia |

## Fuente
Preguntas, explicaciones y figuras del banco público "A&P General" en daypo
(secciones p-general 12–23). Clave de respuestas derivada de las explicaciones y
verificada con un proceso automatizado. Material de práctica/estudio.

## Correr local
```bash
python3 -m http.server 8770
# abrir http://localhost:8770/
```
