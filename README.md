# Calculadoras matemáticas paso a paso

Sitio de una página con dos calculadoras que muestran **el procedimiento completo**, no solo el resultado. Tres archivos, sin dependencias.

   **Demo:** https://calculadoraalicia35.github.io/calculadora-alicia/
Proyecto de [Calculadora Alicia](https://calculadoraaliciaai.es/), herramientas gratuitas de matemáticas para estudiantes de primaria y secundaria, padres y profesores.

```
index.html    página completa con los dos widgets
style.css     estilos de la página + estilos de los widgets
script.js     los dos motores de cálculo
```

---

## Qué incluye

### Operaciones combinadas

- Resuelve una operación por paso y **nombra la regla aplicada** en cada una
- Paréntesis `( )`, corchetes `[ ]` y llaves `{ }` anidados
- Potencias, raíces cuadradas, números negativos y ley de signos
- Fracciones exactas: `1/2 + 3/4 × 2/3 = 1`, no `0,999999`
- Resuelve bien los casos que suelen fallar: `−3² = −9` frente a `(−3)² = 9`, y `12 ÷ 3 × 2 = 8`
- Modo de práctica con ejercicios generados y tabla de reglas

### Regla de tres

- **Simple**: proporción directa e inversa, con verificación automática del resultado
- **Compuesta**: de dos a cuatro magnitudes, cada una directa o inversa, también mixtas
- **Porcentajes**: porcentaje de un número, qué porcentaje representa una parte y hallar el total
- Formato español: acepta `1.234,56` y `1234.56`, devuelve `19,2` y `1.440`

---

## Uso

Abre `index.html` en el navegador. No hace falta servidor ni compilación.

### Usar un solo widget en otra página

Copia el bloque HTML del widget (busca `class="aoc-root"` para operaciones combinadas o `class="art-root"` para regla de tres) y enlaza los dos archivos:

```html
<link rel="stylesheet" href="style.css">
<script src="script.js"></script>
```

El script inicializa todos los widgets que encuentre, así que puedes poner varios en la misma página.

---

## Detalles técnicos

- JavaScript sin dependencias: no usa jQuery ni ningún framework
- Las reglas CSS de cada widget están limitadas a su clase raíz (`.aoc-root`, `.art-root`), así que no afectan al resto de la página
- Responsive, con foco de teclado visible y `prefers-reduced-motion` respetado
- Marcado accesible con roles ARIA

### Cómo resuelve las operaciones combinadas

1. Tokeniza la expresión y normaliza el signo menos unario y la multiplicación implícita
2. Localiza el grupo más interno y lo resuelve primero
3. Dentro de cada grupo aplica el orden: raíces → potencias (de derecha a izquierda) → signo negativo → multiplicación y división (de izquierda a derecha) → suma y resta (de izquierda a derecha)
4. Reescribe la expresión completa después de cada operación, de modo que cada paso se entiende por sí solo
5. Los valores se manejan como fracciones exactas siempre que es posible

---

## Guías relacionadas

- [Jerarquía de operaciones paso a paso](https://calculadoraaliciaai.es/jerarquia-de-operaciones/)
- [Fracciones: guía completa](https://calculadoraaliciaai.es/fracciones/)
- [División larga: el método de cuatro pasos](https://calculadoraaliciaai.es/division-larga/)
- [Números primos y factorización](https://calculadoraaliciaai.es/numeros-primos/)

## Contribuir

Si una expresión se resuelve mal, abre un issue con la expresión exacta, el resultado obtenido y el correcto.

## Licencia

GPL-2.0-or-later
